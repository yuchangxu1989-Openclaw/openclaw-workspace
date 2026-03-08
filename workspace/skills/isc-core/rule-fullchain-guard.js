#!/usr/bin/env node
/**
 * ISC 规则全链路展开守卫
 * 
 * 用途：检查规则JSON是否完成了全链路展开（意图注册/事件注册/感知探针/执行绑定）
 * 
 * 使用方式：
 *   1. git pre-commit hook 自动调用（检查新增/修改的规则文件）
 *   2. 手动调用：node rule-fullchain-guard.js [rule-file.json]
 *   3. 被其他技能 require 后调用 validateRule(ruleId)
 */

const fs = require('fs');
const path = require('path');

const WORKSPACE = process.env.WORKSPACE || path.resolve(__dirname, '../..');
const INTENT_REGISTRY = path.join(WORKSPACE, 'infrastructure/intent-engine/intent-registry.json');
const EVENT_LOG = path.join(WORKSPACE, 'infrastructure/event-bus/events.jsonl');
const RULES_DIR = path.join(WORKSPACE, 'skills/isc-core/rules');

/**
 * 从意图库查找是否有对应注册
 */
function checkIntentRegistered(ruleId) {
  try {
    const registry = JSON.parse(fs.readFileSync(INTENT_REGISTRY, 'utf8'));
    const intents = registry.intents || [];
    // 检查是否有意图的 source 或 id 关联此规则
    const found = intents.find(i =>
      (i.source && i.source.includes(ruleId)) ||
      (i.id && i.id.includes(ruleId.replace('rule.', '').replace(/-/g, '_')))
    );
    return { pass: !!found, detail: found ? `意图已注册: ${found.id}` : `意图库未找到与 ${ruleId} 关联的意图` };
  } catch (e) {
    return { pass: false, detail: `意图库读取失败: ${e.message}` };
  }
}

/**
 * 从事件库查找是否有对应注册
 */
function checkEventRegistered(ruleId) {
  try {
    const lines = fs.readFileSync(EVENT_LOG, 'utf8').trim().split('\n');
    const events = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    const found = events.find(e =>
      (e.data && e.data.registered_by && e.data.registered_by.includes(ruleId)) ||
      (e.meta && e.meta.event_type_registration && e.data && e.data.registered_by && e.data.registered_by.includes(ruleId))
    );
    return { pass: !!found, detail: found ? `事件已注册: ${found.type}` : `事件库未找到与 ${ruleId} 关联的事件` };
  } catch (e) {
    return { pass: false, detail: `事件库读取失败: ${e.message}` };
  }
}

/**
 * 检查规则JSON本身是否声明了感知层和执行层
 */
function checkSenseAndExec(rule) {
  const hasTrigger = !!(rule.trigger && (rule.trigger.event || rule.trigger.condition || rule.trigger.hook));
  const hasAction = !!(rule.action && (rule.action.type || rule.action.method || rule.action.skill));
  return {
    sense: { pass: hasTrigger, detail: hasTrigger ? `感知层: ${rule.trigger.event || rule.trigger.hook || 'condition定义'}` : '规则JSON缺少trigger（感知层未定义）' },
    exec: { pass: hasAction, detail: hasAction ? `执行层: ${rule.action.type || rule.action.skill || rule.action.method}` : '规则JSON缺少action（执行层未定义）' }
  };
}

/**
 * 完整验证一条规则的全链路展开状态
 * @returns {{ ruleId, checks: {intent, event, sense, exec}, allPass, summary }}
 */
function validateRule(ruleFilePath) {
  const raw = fs.readFileSync(ruleFilePath, 'utf8');
  const rule = JSON.parse(raw);
  const ruleId = rule.id || path.basename(ruleFilePath, '.json');

  const intentCheck = checkIntentRegistered(ruleId);
  const eventCheck = checkEventRegistered(ruleId);
  const { sense, exec } = checkSenseAndExec(rule);

  const checks = { intent: intentCheck, event: eventCheck, sense, exec };
  const allPass = Object.values(checks).every(c => c.pass);

  return {
    ruleId,
    checks,
    allPass,
    summary: allPass
      ? `✅ ${ruleId}: 全链路展开完整`
      : `❌ ${ruleId}: 全链路未完成\n` + Object.entries(checks)
          .map(([k, v]) => `   ${v.pass ? '✅' : '❌'} ${k}: ${v.detail}`)
          .join('\n')
  };
}

/**
 * 批量检查所有规则
 */
function validateAllRules() {
  if (!fs.existsSync(RULES_DIR)) {
    console.log('⚠️  规则目录不存在:', RULES_DIR);
    return [];
  }
  const files = fs.readdirSync(RULES_DIR).filter(f => f.endsWith('.json'));
  const results = [];
  for (const f of files) {
    try {
      results.push(validateRule(path.join(RULES_DIR, f)));
    } catch (e) {
      results.push({ ruleId: f, allPass: false, summary: `❌ ${f}: 解析失败 - ${e.message}` });
    }
  }
  return results;
}

// CLI 模式
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    // 检查所有规则
    console.log('🔍 ISC 规则全链路展开检查\n');
    const results = validateAllRules();
    let passCount = 0, failCount = 0;
    for (const r of results) {
      console.log(r.summary);
      if (r.allPass) passCount++; else failCount++;
    }
    console.log(`\n📊 总计: ${results.length} 条规则 | ✅ ${passCount} 全链路完整 | ❌ ${failCount} 未完成`);

    if (failCount > 0) {
      console.log('\n⚠️  未完成全链路展开的规则不允许报"规则已建"');
      console.log('   请补齐：意图注册 → 事件注册 → 感知探针 → 执行绑定');
      process.exit(1);
    }
  } else {
    // 检查指定文件
    for (const f of args) {
      try {
        const result = validateRule(f);
        console.log(result.summary);
        if (!result.allPass) process.exit(1);
      } catch (e) {
        console.error(`❌ ${f}: ${e.message}`);
        process.exit(1);
      }
    }
  }
}

module.exports = { validateRule, validateAllRules, checkIntentRegistered, checkEventRegistered };
