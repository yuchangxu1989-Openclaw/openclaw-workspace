/**
 * memory-loss-recovery - 记忆丢失自主恢复处理器
 *
 * 规则: rule.n036-memory-loss-recovery
 * 职责: 当MEMORY.md丢失或损坏时，从文件系统自动重建规则清单和系统状态
 */
const fs = require('fs');
const path = require('path');
const { writeReport, emitEvent, scanFiles, readRuleJson, checkFileExists } = require('../lib/handler-utils');

const WORKSPACE = '/root/.openclaw/workspace';
const MEMORY_PATH = path.join(WORKSPACE, 'MEMORY.md');
const REGISTRY_PATH = path.join(WORKSPACE, '.rule-registry.json');
const RULES_DIR = path.join(WORKSPACE, 'skills/isc-core/rules');
const STANDARDS_DIR = path.join(WORKSPACE, 'skills/isc-core/standards');
const LOG_DIR = path.join(__dirname, '..', 'logs');

module.exports = {
  name: 'memory-loss-recovery',
  ruleId: 'rule.n036-memory-loss-recovery',

  /**
   * @param {Object} context
   * @param {boolean} [context.force] - 强制执行恢复
   * @param {Object} [context.bus] - 事件总线
   */
  async execute(context = {}) {
    const { force = false, bus } = context;

    // Phase 0: 检测是否需要恢复
    const memoryExists = checkFileExists(MEMORY_PATH);
    const registryExists = checkFileExists(REGISTRY_PATH);
    let memoryCorrupted = false;

    if (memoryExists) {
      try {
        const content = fs.readFileSync(MEMORY_PATH, 'utf8');
        memoryCorrupted = content.length < 100;
      } catch { memoryCorrupted = true; }
    }

    const needsRecovery = force || !memoryExists || memoryCorrupted || !registryExists;
    if (!needsRecovery) {
      console.log('[memory-recovery] 系统正常，无需恢复');
      return { ok: true, action: 'skipped', reason: 'no recovery needed' };
    }

    console.log('[memory-recovery] 🔄 启动记忆恢复流程');
    await emitEvent(bus, 'system.memory.recovery_started', { timestamp: new Date().toISOString() });

    // Phase 1: 规则发现
    const rules = [];
    const categories = {};

    for (const dir of [RULES_DIR, STANDARDS_DIR]) {
      scanFiles(dir, /\.json$/, (filePath) => {
        const rule = readRuleJson(filePath);
        if (!rule) return;
        const id = rule.id || rule.name || path.basename(filePath, '.json');
        const domain = rule.domain || 'uncategorized';
        rules.push({ id, name: rule.name, domain, priority: rule.priority, file: filePath });
        if (!categories[domain]) categories[domain] = [];
        categories[domain].push(id);
      });
    }

    // Phase 2: 重建注册表
    const registry = {
      rebuilt_at: new Date().toISOString(),
      rule_count: rules.length,
      category_count: Object.keys(categories).length,
      rules,
      categories,
    };
    writeReport(REGISTRY_PATH, registry);

    // Phase 3: 验证
    const checks = [
      { name: 'rules_discovered', ok: rules.length > 0, message: `${rules.length} rules found` },
      { name: 'categories_built', ok: Object.keys(categories).length > 0, message: `${Object.keys(categories).length} categories` },
      { name: 'registry_written', ok: checkFileExists(REGISTRY_PATH), message: 'registry file created' },
    ];

    const result = {
      ok: checks.every(c => c.ok),
      recovered_rules: rules.length,
      recovered_categories: Object.keys(categories).length,
      checks,
      timestamp: new Date().toISOString(),
    };

    writeReport(path.join(LOG_DIR, 'memory-recovery-last.json'), result);
    await emitEvent(bus, `system.memory.recovery_${result.ok ? 'completed' : 'failed'}`, result);

    console.log(`[memory-recovery] ${result.ok ? '✅' : '❌'} 恢复${rules.length}条规则, ${Object.keys(categories).length}个分类`);
    return result;
  },
};
