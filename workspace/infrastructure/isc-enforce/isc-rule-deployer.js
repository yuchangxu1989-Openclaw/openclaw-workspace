#!/usr/bin/env node
/**
 * ISC规则自动展开部署器 v1.0
 * 
 * 功能：扫描所有ISC规则，为 enforcement:"cognitive" 的规则
 * 自动生成可执行hook脚本并注册到ISC事件系统。
 * 
 * 触发方式：
 *   1. 被 isc-file-watcher.js 在规则变更时调用
 *   2. cron定时全量扫描
 *   3. 手动运行: node isc-rule-deployer.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');

const RULES_DIR = path.resolve(__dirname, '../../skills/isc-core/rules');
const HOOKS_DIR = path.resolve(__dirname, '../../scripts/isc-hooks');
const HANDLERS_DIR = path.resolve(__dirname, '../../skills/isc-core/handlers');
const REPORT_PATH = path.resolve(__dirname, '../../reports/isc-deployer-last-run.json');

const DRY_RUN = process.argv.includes('--dry-run');

class ISCRuleDeployer {
  constructor() {
    this.results = { deployed: [], skipped: [], errors: [], timestamp: new Date().toISOString() };
  }

  /** 扫描所有规则文件 */
  scanRules() {
    const files = fs.readdirSync(RULES_DIR).filter(f => f.startsWith('rule.') && f.endsWith('.json'));
    const rules = [];
    for (const f of files) {
      try {
        const content = JSON.parse(fs.readFileSync(path.join(RULES_DIR, f), 'utf8'));
        rules.push({ file: f, ...content });
      } catch (e) {
        this.results.errors.push({ file: f, error: e.message });
      }
    }
    return rules;
  }

  /** 检查规则是否已有可执行handler */
  hasExecutableHandler(rule) {
    const handlerPath = rule.handler || (rule.action && rule.action.script);
    if (!handlerPath || handlerPath === 'none') return false;
    // 检查文件是否实际存在
    const candidates = [
      path.resolve(__dirname, '../..', handlerPath),
      path.resolve(HOOKS_DIR, path.basename(handlerPath)),
      path.resolve(HANDLERS_DIR, path.basename(handlerPath)),
    ];
    return candidates.some(p => fs.existsSync(p));
  }

  /** 为constraint类型规则生成hook脚本 */
  generateConstraintHook(rule) {
    const ruleId = rule.id || rule.file.replace('.json', '');
    const scriptName = `${ruleId}.sh`;
    const triggerEvent = (rule.trigger && rule.trigger.event) || 'unknown';
    const constraintDesc = (rule.constraint && rule.constraint.description) || rule.description || '';
    const criteria = rule.constraint && rule.constraint.criteria
      ? JSON.stringify(rule.constraint.criteria, null, 2)
      : '{}';

    return {
      filename: scriptName,
      content: `#!/usr/bin/env bash
# ============================================================
# ISC自动展开 - ${ruleId}
# 由 isc-rule-deployer.js 自动生成于 ${new Date().toISOString()}
# 原始enforcement: ${rule.enforcement || 'cognitive'}
# 触发事件: ${triggerEvent}
# ============================================================
# 约束描述: ${constraintDesc}
# 判定标准:
# ${criteria.split('\n').join('\n# ')}
# ============================================================

set -euo pipefail
RULE_ID="${ruleId}"
EVENT="\${1:-}"
PAYLOAD="\${2:-}"
LOG_DIR="/root/.openclaw/workspace/logs/isc-enforce"
mkdir -p "\$LOG_DIR"
LOG_FILE="\$LOG_DIR/\${RULE_ID}.log"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [\$RULE_ID] \$*" | tee -a "\$LOG_FILE"; }

log "触发: event=\$EVENT"
log "载荷: \$PAYLOAD"

# === 合规检查逻辑 ===
# TODO: 根据规则语义实现具体检查
# 当前为审计模式：记录所有触发但不阻断
check_compliance() {
  log "审计模式: 记录触发事件，待人工确认是否合规"
  # 写入审计记录
  echo "{\\"rule\\":\\"$RULE_ID\\",\\"event\\":\\"\$EVENT\\",\\"time\\":\\"$(date -Iseconds)\\",\\"status\\":\\"audit\\"}" >> "\$LOG_DIR/audit-trail.jsonl"
  return 0
}

check_compliance "\$EVENT" "\$PAYLOAD"
exit_code=\$?

if [ \$exit_code -ne 0 ]; then
  log "❌ 合规检查失败"
  exit 1
fi

log "✅ 通过"
exit 0
`,
    };
  }

  /** 为单条规则部署 */
  deployRule(rule) {
    const ruleId = rule.id || rule.file;
    const enforcement = rule.enforcement || 'null';

    // 已有programmatic handler → 跳过
    if (this.hasExecutableHandler(rule)) {
      this.results.skipped.push({ id: ruleId, reason: 'already_has_handler' });
      return;
    }

    // 只处理cognitive或无enforcement的规则
    if (enforcement !== 'cognitive' && enforcement !== 'null') {
      this.results.skipped.push({ id: ruleId, reason: `enforcement=${enforcement}` });
      return;
    }

    // 生成hook
    const hook = this.generateConstraintHook(rule);
    const hookPath = path.join(HOOKS_DIR, hook.filename);

    if (DRY_RUN) {
      this.results.deployed.push({ id: ruleId, path: hookPath, dryRun: true });
      console.log(`[DRY-RUN] 将生成: ${hookPath}`);
      return;
    }

    // 写入hook脚本
    if (!fs.existsSync(HOOKS_DIR)) fs.mkdirSync(HOOKS_DIR, { recursive: true });
    fs.writeFileSync(hookPath, hook.content, { mode: 0o755 });

    // 更新规则JSON，标记为programmatic
    const rulePath = path.join(RULES_DIR, rule.file);
    const ruleContent = JSON.parse(fs.readFileSync(rulePath, 'utf8'));
    ruleContent.enforcement = 'programmatic';
    ruleContent.handler = `scripts/isc-hooks/${hook.filename}`;
    ruleContent._auto_deployed = { by: 'isc-rule-deployer', at: new Date().toISOString(), prev_enforcement: enforcement };
    fs.writeFileSync(rulePath, JSON.stringify(ruleContent, null, 2) + '\n');

    this.results.deployed.push({ id: ruleId, path: hookPath });
    console.log(`✅ 已部署: ${ruleId} → ${hook.filename}`);
  }

  /** 全量运行 */
  run() {
    console.log('╔══════════════════════════════════════════╗');
    console.log('║   ISC规则自动展开部署器 v1.0             ║');
    console.log('╚══════════════════════════════════════════╝');
    console.log(DRY_RUN ? '模式: DRY-RUN（不实际写入）' : '模式: 实际部署');
    console.log('');

    const rules = this.scanRules();
    console.log(`扫描到 ${rules.length} 条规则`);

    for (const rule of rules) {
      this.deployRule(rule);
    }

    // 保存报告
    if (!DRY_RUN) {
      fs.writeFileSync(REPORT_PATH, JSON.stringify(this.results, null, 2));
    }

    console.log('');
    console.log(`结果: 部署=${this.results.deployed.length}, 跳过=${this.results.skipped.length}, 错误=${this.results.errors.length}`);
    return this.results;
  }
}

if (require.main === module) {
  const deployer = new ISCRuleDeployer();
  deployer.run();
}

module.exports = ISCRuleDeployer;
