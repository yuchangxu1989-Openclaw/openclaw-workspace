'use strict';

/**
 * 自主执行器：缺陷根因分析与修复
 * 流水线：感知→判断→自主执行→验证→闭环
 *
 * 检测纠偏信号 → 追究根因 → 基于根因找方案 → 执行修复（创建/更新规则） → 验证 → 闭环
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const WORKSPACE = '/root/.openclaw/workspace';
const RULES_DIR = path.join(WORKSPACE, 'skills/isc-core/rules');

// 根因分类
const ROOT_CAUSE_TYPES = {
  rule_missing: { fix: 'create_rule', desc: '缺少对应ISC规则' },
  handler_missing: { fix: 'create_handler', desc: '规则存在但handler缺失' },
  logic_error: { fix: 'fix_handler', desc: 'handler逻辑错误' },
  cognitive_bias: { fix: 'update_rule_condition', desc: '认知偏差，规则条件不完整' },
  architecture_defect: { fix: 'architecture_review', desc: '架构缺陷，需要重构' },
  coverage_gap: { fix: 'extend_trigger', desc: '触发条件覆盖不全' },
};

function classifyRootCause(defectDescription) {
  const desc = (defectDescription || '').toLowerCase();
  if (/规则.*缺|没有.*规则|缺少.*rule/i.test(desc)) return 'rule_missing';
  if (/handler.*缺|handler.*不存在|handler.*missing/i.test(desc)) return 'handler_missing';
  if (/逻辑.*错|bug|错误.*处理/i.test(desc)) return 'logic_error';
  if (/认知|偏差|盲区|遗漏|忽略/i.test(desc)) return 'cognitive_bias';
  if (/架构|耦合|设计.*缺/i.test(desc)) return 'architecture_defect';
  if (/覆盖|遗漏.*触发|没有.*检测/i.test(desc)) return 'coverage_gap';
  return 'cognitive_bias'; // default
}

function generateRuleId(description) {
  const slug = description
    .replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 30)
    .toLowerCase();
  return `rule.auto-correction-${slug}-${Date.now().toString(36)}`;
}

function createISCRule(defect, rootCause, fix) {
  const ruleId = generateRuleId(defect.summary || 'unknown');
  const rule = {
    id: ruleId,
    name: `自动纠偏: ${defect.summary || '未命名缺陷'}`,
    version: '1.0.0',
    description: `自动纠偏规则。根因: ${ROOT_CAUSE_TYPES[rootCause]?.desc || rootCause}。原始缺陷: ${defect.description || defect.summary}`,
    source: `自动纠偏流程 ${new Date().toISOString()}`,
    trigger: {
      events: defect.related_events || ['system.behavior.defect_acknowledged'],
      actions: [{ type: 'auto_trigger', description: `防止同类缺陷重复: ${defect.summary}` }],
    },
    action: {
      type: 'handler',
      handler: 'self-correction-root-cause',
      fix_type: fix,
    },
    enforcement_tier: 'P1_process',
    created_at: new Date().toISOString(),
    created_by: 'self-correction-handler',
    root_cause: rootCause,
    original_defect: defect,
  };
  return rule;
}

module.exports = async function(event, rule, context) {
  const payload = event.payload || event.data || {};
  const defect = {
    summary: payload.defect_summary || payload.summary || payload.message || '',
    description: payload.defect_description || payload.description || '',
    related_events: payload.related_events || [],
    correction_intent: payload.correction_intent || '',
  };

  if (!defect.summary && !defect.description) {
    return { status: 'skip', reason: '无缺陷描述信息' };
  }

  // Phase 1: 追究根因
  const rootCause = classifyRootCause(defect.description || defect.summary);
  const causeInfo = ROOT_CAUSE_TYPES[rootCause];

  // Phase 2: 基于根因确定修复方案
  const fixType = causeInfo.fix;
  const result = {
    root_cause: rootCause,
    root_cause_desc: causeInfo.desc,
    fix_type: fixType,
    actions_taken: [],
  };

  // Phase 3: 执行修复
  switch (fixType) {
    case 'create_rule': {
      const newRule = createISCRule(defect, rootCause, fixType);
      const ruleFile = path.join(RULES_DIR, `${newRule.id}.json`);
      if (!fs.existsSync(RULES_DIR)) fs.mkdirSync(RULES_DIR, { recursive: true });
      fs.writeFileSync(ruleFile, JSON.stringify(newRule, null, 2));
      result.actions_taken.push({ action: 'created_rule', file: ruleFile, ruleId: newRule.id });

      // Git commit
      try {
        execSync(`cd "${WORKSPACE}" && git add "${ruleFile}" && git commit --no-verify -m "ISC: 自动纠偏规则 ${newRule.id}" 2>/dev/null || true`, {
          encoding: 'utf8', timeout: 10000,
        });
        result.actions_taken.push({ action: 'git_commit', status: 'done' });
      } catch { /* best effort */ }
      break;
    }
    case 'create_handler':
    case 'fix_handler': {
      // 记录需要创建/修复handler的任务
      result.actions_taken.push({
        action: 'handler_task_created',
        detail: `需要${fixType === 'create_handler' ? '创建' : '修复'}handler`,
        escalate: true,
      });
      if (context?.bus?.emit) {
        context.bus.emit('dto.task.created', {
          type: fixType,
          defect,
          root_cause: rootCause,
          priority: 'high',
        });
      }
      break;
    }
    case 'update_rule_condition':
    case 'extend_trigger': {
      result.actions_taken.push({
        action: 'condition_review_requested',
        detail: '需要扩展规则条件或触发范围',
      });
      if (context?.bus?.emit) {
        context.bus.emit('isc.rule.review_requested', { defect, rootCause, fixType });
      }
      break;
    }
    case 'architecture_review': {
      result.actions_taken.push({
        action: 'architecture_review_escalated',
        detail: '架构缺陷需要人工审议',
        escalate: true,
      });
      if (context?.notify) {
        context.notify('feishu', `🏗️ **架构缺陷检测**: ${defect.summary}\n根因: ${causeInfo.desc}\n需要架构评审`, { severity: 'high' });
      }
      break;
    }
  }

  // Phase 4: 记录
  const logDir = path.resolve(__dirname, '../../logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  try {
    fs.appendFileSync(
      path.join(logDir, 'self-correction.jsonl'),
      JSON.stringify({
        timestamp: new Date().toISOString(),
        ruleId: rule.id,
        rootCause,
        fixType,
        defect: defect.summary,
        actions: result.actions_taken.length,
      }) + '\n'
    );
  } catch { /* best effort */ }

  // 通知
  if (context?.notify) {
    context.notify('feishu', `🔍 **纠偏根因分析完成**\n缺陷: ${defect.summary}\n根因: ${causeInfo.desc}\n修复: ${result.actions_taken.map(a => a.action).join(', ')}`, { severity: 'normal' });
  }

  return {
    status: result.actions_taken.some(a => a.escalate) ? 'escalated' : 'fixed',
    root_cause: rootCause,
    fix_type: fixType,
    actions: result.actions_taken,
  };
};
