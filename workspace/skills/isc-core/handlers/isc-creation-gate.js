/**
 * isc-creation-gate handler - ISC规则创建门禁
 *
 * 触发规则: rule.isc-creation-gate-001
 * 职责: 在创建新ISC规则时执行质量门禁检查，确保规则符合标准
 */
'use strict';

const path = require('path');
const { readRuleJson, gateResult, writeReport, checkFileExists } = require('../lib/handler-utils');

module.exports = {
  name: 'isc-creation-gate',

  /**
   * 执行ISC规则创建门禁
   * @param {Object} context - 规则触发上下文
   * @param {string} context.rulePath - 新规则文件路径
   * @param {Object} [context.rule] - 已解析的规则对象
   */
  async execute(context = {}) {
    const { rulePath, rule: providedRule } = context;
    const checks = [];

    // Step 1: 规则文件存在性
    const fileExists = rulePath ? checkFileExists(rulePath) : !!providedRule;
    checks.push({
      name: 'file-exists',
      ok: fileExists,
      message: fileExists ? '规则文件存在' : '规则文件不存在',
    });

    const rule = providedRule || (rulePath ? readRuleJson(rulePath) : null);
    if (!rule) {
      checks.push({ name: 'parse', ok: false, message: '无法解析规则文件' });
      return gateResult('isc-creation-gate', checks);
    }

    // Step 2: 必填字段检查
    const requiredFields = ['id', 'trigger', 'action'];
    for (const field of requiredFields) {
      const has = !!rule[field];
      checks.push({
        name: `required:${field}`,
        ok: has,
        message: has ? `${field} 已填写` : `缺少必填字段: ${field}`,
      });
    }

    // Step 3: trigger.events 必须存在且非空
    const hasEvents = Array.isArray(rule.trigger?.events) && rule.trigger.events.length > 0;
    checks.push({
      name: 'trigger-events',
      ok: hasEvents,
      message: hasEvents ? `触发事件: ${rule.trigger.events.join(', ')}` : '缺少触发事件定义',
    });

    // Step 4: action.handler 或 action.script 必须存在
    const hasHandler = !!(rule.action?.handler || rule.action?.script);
    checks.push({
      name: 'action-handler',
      ok: hasHandler,
      message: hasHandler ? '处理器已定义' : '缺少 handler 或 script 定义',
    });

    // Step 5: ID格式检查
    const idValid = typeof rule.id === 'string' && rule.id.startsWith('rule.');
    checks.push({
      name: 'id-format',
      ok: idValid,
      message: idValid ? `ID格式正确: ${rule.id}` : `ID格式不正确: ${rule.id}`,
    });

    const result = gateResult('isc-creation-gate', checks);

    const reportPath = path.join(__dirname, '..', 'logs', 'isc-creation-gate-report.json');
    writeReport(reportPath, result);

    console.log(`[isc-creation-gate] 门禁检查: ${result.status} (${result.passed}/${result.total})`);
    return result;
  },
};
