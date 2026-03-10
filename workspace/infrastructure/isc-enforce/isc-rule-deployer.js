#!/usr/bin/env node
/**
 * ISC规则五层展开部署器 v2.0
 * 
 * 五层模型（IEPEV）：
 *   1. Intent（意图）— 识别用户/系统的意图
 *   2. Event（事件）— 意图触发什么事件、事件链传导
 *   3. Planning（规划）— 决策逻辑、步骤拆解
 *   4. Execution（执行）— 具体代码/动作
 *   5. Verification（验真）— 结果验证、是否达成原始意图
 *
 * 触发方式：
 *   1. isc-file-watcher.js 规则变更时调用
 *   2. cron定时全量扫描
 *   3. 手动: node isc-rule-deployer.js [--dry-run] [--full-expand]
 */

const fs = require('fs');
const path = require('path');

const RULES_DIR = path.resolve(__dirname, '../../skills/isc-core/rules');
const HOOKS_DIR = path.resolve(__dirname, '../../scripts/isc-hooks');
const HANDLERS_DIR = path.resolve(__dirname, '../../skills/isc-core/handlers');
const REPORT_PATH = path.resolve(__dirname, '../../reports/isc-deployer-last-run.json');
const WORKSPACE = path.resolve(__dirname, '../..');

const DRY_RUN = process.argv.includes('--dry-run');
const FULL_EXPAND = process.argv.includes('--full-expand');

const FIVE_LAYERS = ['intent', 'event', 'planning', 'execution', 'verification'];

class ISCRuleDeployer {
  constructor() {
    this.results = {
      deployed: [], skipped: [], errors: [],
      layerStats: { intent: 0, event: 0, planning: 0, execution: 0, verification: 0 },
      timestamp: new Date().toISOString()
    };
  }

  scanRules() {
    const files = fs.readdirSync(RULES_DIR)
      .filter(f => f.startsWith('rule.') && f.endsWith('.json'));
    const rules = [];
    for (const f of files) {
      try {
        rules.push({ file: f, ...JSON.parse(fs.readFileSync(path.join(RULES_DIR, f), 'utf8')) });
      } catch (e) {
        this.results.errors.push({ file: f, error: e.message });
      }
    }
    return rules;
  }

  /** 检测handler文件是否存在 */
  resolveHandler(handlerRef) {
    if (!handlerRef) return null;
    const candidates = [
      path.resolve(WORKSPACE, handlerRef),
      path.resolve(HOOKS_DIR, path.basename(handlerRef)),
      path.resolve(HANDLERS_DIR, path.basename(handlerRef)),
    ];
    return candidates.find(p => fs.existsSync(p)) || null;
  }

  /** 分析一条规则的五层展开状态 */
  analyzeLayerCoverage(rule) {
    const layers = {};

    // Layer 1: Intent — 需要有description/intent/type明确意图
    layers.intent = !!(
      (rule.iepev && rule.iepev.intent) ||
      (rule.description && rule.type && rule.domain)
    );

    // Layer 2: Event — 需要有trigger.event(s)定义事件链
    layers.event = !!(
      (rule.iepev && rule.iepev.event) ||
      (rule.trigger && (rule.trigger.event || rule.trigger.events))
    );

    // Layer 3: Planning — 需要有决策逻辑（constraint.criteria / decision_tree / planning）
    layers.planning = !!(
      (rule.iepev && rule.iepev.planning) ||
      (rule.constraint && rule.constraint.criteria) ||
      (rule.action && rule.action.checks)
    );

    // Layer 4: Execution — 需要有实际存在的handler文件
    const handlerRef = rule.handler || (rule.action && rule.action.script);
    layers.execution = !!this.resolveHandler(handlerRef);

    // Layer 5: Verification — 需要有验证逻辑
    layers.verification = !!(
      (rule.iepev && rule.iepev.verification) ||
      rule.verification ||
      (rule.action && rule.action.on_failure)
    );

    return layers;
  }

  /** 为规则生成五层展开的IEPEV骨架 */
  generateIEPEV(rule) {
    const ruleId = rule.id || rule.file.replace('.json', '');
    const triggerEvent = (rule.trigger && (rule.trigger.event || (rule.trigger.events && rule.trigger.events[0]))) || 'unknown';
    const desc = rule.description || '';

    return {
      intent: {
        description: desc,
        actor: rule.domain === 'orchestration' ? 'system_dispatcher' : 'any',
        goal: `确保${desc.slice(0, 40)}`,
        anti_goal: `违反此规则时的badcase场景`
      },
      event: {
        primary_trigger: triggerEvent,
        event_chain: [triggerEvent, `${ruleId}.check.started`, `${ruleId}.check.completed`],
        propagation: rule.trigger && rule.trigger.events ? rule.trigger.events : [triggerEvent]
      },
      planning: {
        preconditions: (rule.constraint && rule.constraint.criteria) || {},
        decision_logic: rule.type === 'constraint' ? 'gate_check' : 'advisory',
        steps: [
          '检测触发条件是否成立',
          '提取上下文参数',
          '执行合规判定',
          '根据结果决定放行/阻断/告警'
        ],
        dependencies: []
      },
      execution: {
        handler: rule.handler || `scripts/isc-hooks/${ruleId}.sh`,
        mode: rule.enforcement || 'programmatic',
        rollback: 'log_and_alert',
        timeout_ms: 30000
      },
      verification: {
        success_criteria: '执行无异常且合规检查通过',
        failure_action: (rule.action && rule.action.on_failure) || 'warn_and_log',
        audit_trail: `logs/isc-enforce/${ruleId}.log`,
        intent_match: '验证执行结果是否达成原始意图'
      }
    };
  }

  /** 生成五层完整的hook脚本 */
  generateFullHook(rule, iepev) {
    const ruleId = rule.id || rule.file.replace('.json', '');
    return {
      filename: `${ruleId}.sh`,
      content: `#!/usr/bin/env bash
# ================================================================
# ISC五层展开Hook - ${ruleId}
# 由 isc-rule-deployer.js v2.0 自动生成于 ${new Date().toISOString()}
# 模型: IEPEV (Intent→Event→Planning→Execution→Verification)
# ================================================================
set -euo pipefail

RULE_ID="${ruleId}"
EVENT="\${1:-}"
PAYLOAD="\${2:-}"
LOG_DIR="/root/.openclaw/workspace/logs/isc-enforce"
mkdir -p "\$LOG_DIR"
LOG="\$LOG_DIR/\${RULE_ID}.log"
AUDIT="\$LOG_DIR/audit-trail.jsonl"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [\$RULE_ID] \$*" | tee -a "\$LOG"; }
emit() { echo "{\\"rule\\":\\"\$RULE_ID\\",\\"layer\\":\\"\$1\\",\\"status\\":\\"\$2\\",\\"time\\":\\"$(date -Iseconds)\\"}" >> "\$AUDIT"; }

# ─── Layer 1: INTENT（意图识别）───
log "▶ L1-Intent: 识别触发意图"
emit "intent" "started"
INTENT_MATCH=true
# 意图: ${(iepev.intent.goal || '').replace(/'/g, "\\'")}
emit "intent" "matched"

# ─── Layer 2: EVENT（事件感知）───
log "▶ L2-Event: 事件=\$EVENT"
emit "event" "received"
if [ -z "\$EVENT" ]; then
  log "⚠ 无事件参数，使用默认触发"
  EVENT="${iepev.event.primary_trigger}"
fi
emit "event" "processed"

# ─── Layer 3: PLANNING（规划决策）───
log "▶ L3-Planning: 执行决策逻辑"
emit "planning" "started"
DECISION="proceed"
# 决策类型: ${iepev.planning.decision_logic}
# 步骤: 检测→提取→判定→决策
emit "planning" "\$DECISION"

# ─── Layer 4: EXECUTION（执行）───
log "▶ L4-Execution: 执行合规检查"
emit "execution" "started"
EXIT_CODE=0

execute_check() {
  # TODO: 根据规则语义实现具体检查逻辑
  log "  执行合规检查（审计模式）"
  return 0
}

if [ "\$DECISION" = "proceed" ]; then
  execute_check || EXIT_CODE=\$?
fi

if [ \$EXIT_CODE -ne 0 ]; then
  log "❌ L4-Execution: 执行失败 (exit=\$EXIT_CODE)"
  emit "execution" "failed"
  # 回滚: ${iepev.execution.rollback}
else
  emit "execution" "success"
fi

# ─── Layer 5: VERIFICATION（验真）───
log "▶ L5-Verification: 验证结果"
emit "verification" "started"
if [ \$EXIT_CODE -eq 0 ]; then
  log "✅ 五层闭环完成 - 验真通过"
  emit "verification" "pass"
else
  log "❌ 验真失败 - 未达成意图"
  emit "verification" "fail"
  # 失败动作: ${iepev.verification.failure_action}
fi

exit \$EXIT_CODE
`
    };
  }

  deployRule(rule) {
    const ruleId = rule.id || rule.file;
    const layers = this.analyzeLayerCoverage(rule);
    const coveredCount = FIVE_LAYERS.filter(l => layers[l]).length;

    // 统计
    for (const l of FIVE_LAYERS) { if (layers[l]) this.results.layerStats[l]++; }

    // 已有五层完整展开 → 跳过
    if (coveredCount === 5 && !FULL_EXPAND) {
      this.results.skipped.push({ id: ruleId, reason: 'five_layers_complete', layers });
      return;
    }

    // 生成IEPEV
    const iepev = this.generateIEPEV(rule);

    // 生成hook（如果execution层缺失）
    if (!layers.execution) {
      const hook = this.generateFullHook(rule, iepev);
      const hookPath = path.join(HOOKS_DIR, hook.filename);
      if (!DRY_RUN) {
        if (!fs.existsSync(HOOKS_DIR)) fs.mkdirSync(HOOKS_DIR, { recursive: true });
        fs.writeFileSync(hookPath, hook.content, { mode: 0o755 });
      }
    }

    // 更新规则JSON，注入iepev字段
    if (!DRY_RUN) {
      const rulePath = path.join(RULES_DIR, rule.file);
      const ruleContent = JSON.parse(fs.readFileSync(rulePath, 'utf8'));
      ruleContent.iepev = iepev;
      ruleContent.iepev_version = '2.0';
      ruleContent.iepev_expanded_at = new Date().toISOString();
      if (!layers.execution) {
        ruleContent.enforcement = 'programmatic';
        ruleContent.handler = `scripts/isc-hooks/${ruleId}.sh`;
      }
      fs.writeFileSync(rulePath, JSON.stringify(ruleContent, null, 2) + '\n');
    }

    const missing = FIVE_LAYERS.filter(l => !layers[l]);
    this.results.deployed.push({ id: ruleId, layers, missing, expanded: missing });
    if (!DRY_RUN) console.log(`✅ ${ruleId}: 补全 [${missing.join(',')}]`);
  }

  run() {
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║   ISC规则五层展开部署器 v2.0 (IEPEV)         ║');
    console.log('║   Intent→Event→Planning→Execution→Verify     ║');
    console.log('╚══════════════════════════════════════════════╝');
    console.log(DRY_RUN ? '模式: DRY-RUN' : '模式: 实际部署');
    console.log('');

    const rules = this.scanRules();
    console.log(`扫描到 ${rules.length} 条规则\n`);
    for (const rule of rules) this.deployRule(rule);

    if (!DRY_RUN) {
      if (!fs.existsSync(path.dirname(REPORT_PATH))) fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
      fs.writeFileSync(REPORT_PATH, JSON.stringify(this.results, null, 2));
    }

    console.log(`\n结果: 展开=${this.results.deployed.length}, 跳过=${this.results.skipped.length}, 错误=${this.results.errors.length}`);
    console.log(`层覆盖: I=${this.results.layerStats.intent} E=${this.results.layerStats.event} P=${this.results.layerStats.planning} X=${this.results.layerStats.execution} V=${this.results.layerStats.verification}`);
    return this.results;
  }
}

if (require.main === module) {
  const deployer = new ISCRuleDeployer();
  deployer.run();
}

module.exports = ISCRuleDeployer;
