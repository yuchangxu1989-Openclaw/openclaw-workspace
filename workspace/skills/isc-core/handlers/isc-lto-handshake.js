/**
 * isc-lto-handshake handler - ISC长期对象握手协议
 *
 * 触发规则: rule.isc-lto-handshake-001
 * 职责: 管理ISC规则与长期对象(LTO)之间的握手确认流程
 */
'use strict';

const path = require('path');
const { readRuleJson, gateResult, writeReport, emitEvent, checkFileExists } = require('../lib/handler-utils');

module.exports = {
  name: 'isc-lto-handshake',

  /**
   * 执行LTO握手协议
   * @param {Object} context - 规则触发上下文
   * @param {string} context.ruleId - 发起握手的规则ID
   * @param {string} context.ltoTarget - LTO目标标识
   * @param {Object} [context.bus] - 事件总线
   * @param {string} [context.rulesDir] - 规则目录
   */
  async execute(context = {}) {
    const { ruleId, ltoTarget, bus, rulesDir } = context;
    const checks = [];

    // Step 1: 验证握手参数
    checks.push({
      name: 'handshake-params',
      ok: !!(ruleId && ltoTarget),
      message: ruleId && ltoTarget
        ? `握手: ${ruleId} → ${ltoTarget}`
        : '缺少握手参数 (ruleId 或 ltoTarget)',
    });

    if (!ruleId || !ltoTarget) {
      return gateResult('isc-lto-handshake', checks, { failClosed: false });
    }

    // Step 2: 验证发起方规则存在
    const defaultRulesDir = rulesDir || path.join(__dirname, '..', 'rules');
    const ruleFile = path.join(defaultRulesDir, `${ruleId}.json`);
    const ruleExists = checkFileExists(ruleFile);
    checks.push({
      name: 'source-rule-exists',
      ok: ruleExists,
      message: ruleExists ? `发起方规则存在: ${ruleId}` : `发起方规则不存在: ${ruleId}`,
    });

    // Step 3: 验证LTO目标可达
    const ltoFile = path.join(defaultRulesDir, `${ltoTarget}.json`);
    const ltoExists = checkFileExists(ltoFile);
    checks.push({
      name: 'lto-target-reachable',
      ok: ltoExists,
      message: ltoExists ? `LTO目标可达: ${ltoTarget}` : `LTO目标不可达: ${ltoTarget}`,
    });

    // Step 4: 读取双方规则验证兼容性
    if (ruleExists && ltoExists) {
      const sourceRule = readRuleJson(ruleFile);
      const targetRule = readRuleJson(ltoFile);
      const compatible = !!(sourceRule && targetRule);
      checks.push({
        name: 'compatibility',
        ok: compatible,
        message: compatible ? '双方规则可解析，兼容性通过' : '规则解析失败，无法验证兼容性',
      });
    }

    // Step 5: 发射握手完成事件
    const handshakeOk = checks.every(c => c.ok);
    await emitEvent(bus, 'isc.lto.handshake.complete', {
      ruleId,
      ltoTarget,
      success: handshakeOk,
    });

    checks.push({
      name: 'handshake-event',
      ok: true,
      message: `握手事件已发射: ${handshakeOk ? '成功' : '失败'}`,
    });

    const result = gateResult('isc-lto-handshake', checks, { failClosed: false });

    const reportPath = path.join(__dirname, '..', 'logs', 'isc-lto-handshake-report.json');
    writeReport(reportPath, result);

    console.log(`[isc-lto-handshake] 握手${handshakeOk ? '成功' : '失败'}: ${ruleId} → ${ltoTarget}`);
    return result;
  },
};
