/**
 * meta-enforcement-gate - ISC元规则：规则必须有强制执行机制
 *
 * 规则: rule.meta-enforcement-gate-001
 * 职责: 扫描所有ISC规则，标记无执行机制的为unenforced，裁决殿评审前检查准入条件
 */
const fs = require('fs');
const path = require('path');
const { writeReport, emitEvent, scanFiles, readRuleJson, gateResult } = require('../lib/handler-utils');

const RULES_DIR = path.join(__dirname, '..', 'rules');
const LOG_DIR = path.join(__dirname, '..', 'logs');
const GRACE_PERIOD_HOURS = 48;

module.exports = {
  name: 'meta-enforcement-gate',
  ruleId: 'rule.meta-enforcement-gate-001',

  /**
   * @param {Object} context
   * @param {string} [context.mode] - 'audit' | 'gate'
   * @param {Object} [context.bus] - 事件总线
   */
  async execute(context = {}) {
    const { mode = 'audit', bus } = context;
    const checks = [];
    const unenforced = [];
    const now = Date.now();

    // 扫描所有规则文件
    const ruleFiles = scanFiles(RULES_DIR, /^rule\..*\.json$/, null);

    for (const filePath of ruleFiles) {
      const rule = readRuleJson(filePath);
      if (!rule) continue;

      const ruleId = rule.id || path.basename(filePath, '.json');
      const hasEnforcer = !!(
        rule.enforcement === 'programmatic' ||
        rule.action?.script ||
        rule.action?.handler ||
        rule.trigger?.actions?.some(a => a.type === 'gate' || a.type === 'audit')
      );

      // 检查宽限期
      const createdAt = rule.created_at || rule.created;
      let inGrace = false;
      if (createdAt && !hasEnforcer) {
        const created = new Date(createdAt).getTime();
        inGrace = (now - created) < GRACE_PERIOD_HOURS * 3600000;
      }

      if (!hasEnforcer && !inGrace) {
        unenforced.push(ruleId);
      }

      checks.push({
        name: ruleId,
        ok: hasEnforcer || inGrace,
        message: hasEnforcer ? 'has enforcer' : inGrace ? 'in grace period' : 'UNENFORCED',
      });
    }

    const result = gateResult('meta-enforcement-gate', checks);
    result.mode = mode;
    result.unenforced = unenforced;
    result.totalRules = ruleFiles.length;
    result.timestamp = new Date().toISOString();

    writeReport(path.join(LOG_DIR, 'meta-enforcement-last.json'), result);
    await emitEvent(bus, `isc.meta-enforcement.${result.ok ? 'passed' : 'blocked'}`, result);

    console.log(`[meta-enforcement] ${result.status}: ${unenforced.length} unenforced out of ${ruleFiles.length} rules`);
    return result;
  },
};
