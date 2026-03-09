/**
 * isc-change-alignment handler - ISC变更自动触发对齐
 *
 * 触发规则: rule.isc-change-auto-trigger-alignment-001
 * 职责: 当ISC规则或分类发生变更时，自动检查并触发相关对齐操作
 */
'use strict';

const path = require('path');
const { scanFiles, readRuleJson, gateResult, writeReport, emitEvent } = require('../lib/handler-utils');

const RULES_DIR = path.join(__dirname, '..', 'rules');

module.exports = {
  name: 'isc-change-alignment',

  /**
   * 执行ISC变更对齐检查
   * @param {Object} context - 规则触发上下文
   * @param {string} [context.changedRuleId] - 变更的规则ID
   * @param {string} [context.changeType] - 变更类型 (created|modified|deleted)
   * @param {Object} [context.bus] - 事件总线
   */
  async execute(context = {}) {
    const { changedRuleId, changeType = 'modified', bus } = context;
    const checks = [];

    // Step 1: 验证变更目标存在
    checks.push({
      name: 'change-target',
      ok: !!changedRuleId,
      message: changedRuleId ? `变更规则: ${changedRuleId} (${changeType})` : '未提供变更规则ID',
    });

    if (!changedRuleId) {
      return gateResult('isc-change-alignment', checks, { failClosed: false });
    }

    // Step 2: 扫描所有规则，查找依赖关系
    const dependents = [];
    scanFiles(RULES_DIR, /^rule\..*\.json$/, (filePath) => {
      const rule = readRuleJson(filePath);
      if (!rule) return;
      const content = JSON.stringify(rule);
      if (content.includes(changedRuleId) && rule.id !== changedRuleId) {
        dependents.push(rule.id);
      }
    }, { maxDepth: 1 });

    checks.push({
      name: 'dependency-scan',
      ok: true,
      message: `找到 ${dependents.length} 条依赖规则需要对齐`,
    });

    // Step 3: 通知依赖方需要对齐
    for (const depId of dependents) {
      await emitEvent(bus, 'isc.alignment.needed', {
        source: changedRuleId,
        dependent: depId,
        changeType,
      });
    }

    checks.push({
      name: 'alignment-notification',
      ok: true,
      message: `已发送 ${dependents.length} 条对齐通知`,
    });

    const result = gateResult('isc-change-alignment', checks, { failClosed: false });

    const reportPath = path.join(__dirname, '..', 'logs', 'isc-change-alignment-report.json');
    writeReport(reportPath, { ...result, dependents });

    console.log(`[isc-change-alignment] 对齐检查完成: ${dependents.length} 条依赖`);
    return result;
  },
};
