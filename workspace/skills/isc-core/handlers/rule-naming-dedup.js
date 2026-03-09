/**
 * rule-naming-dedup handler - 规则命名规范与去重技能
 *
 * 触发规则: rule.intent-规则命名规范与去重技能-pop4vq
 * 职责: 检查规则命名是否符合规范，扫描重复规则并报告
 */
'use strict';

const path = require('path');
const { scanFiles, readRuleJson, gateResult, writeReport } = require('../lib/handler-utils');

const RULES_DIR = path.join(__dirname, '..', 'rules');

module.exports = {
  name: 'rule-naming-dedup',

  /**
   * 执行规则命名规范检查与去重扫描
   * @param {Object} context - 规则触发上下文
   * @param {string} [context.rulesDir] - 规则目录（默认使用内置路径）
   */
  async execute(context = {}) {
    const rulesDir = context.rulesDir || RULES_DIR;
    const checks = [];
    const seen = new Map(); // intent/id -> filePath

    scanFiles(rulesDir, /^rule\..*\.json$/, (filePath, fileName) => {
      const rule = readRuleJson(filePath);
      if (!rule) {
        checks.push({ name: `parse:${fileName}`, ok: false, message: '无法解析规则文件' });
        return;
      }

      // 命名规范检查: 必须以 rule. 开头，使用小写和连字符
      const baseName = fileName.replace(/\.json$/, '');
      const validPattern = /^rule\.[a-z0-9\u4e00-\u9fa5][\w\u4e00-\u9fa5-]*$/;
      const nameOk = validPattern.test(baseName);
      checks.push({
        name: `naming:${baseName}`,
        ok: nameOk,
        message: nameOk ? '命名符合规范' : `命名不符合规范: ${baseName}`,
      });

      // 去重检查: 基于 rule.id
      if (rule.id) {
        if (seen.has(rule.id)) {
          checks.push({
            name: `dedup:${rule.id}`,
            ok: false,
            message: `重复规则ID: ${rule.id} (${seen.get(rule.id)} vs ${filePath})`,
          });
        } else {
          seen.set(rule.id, filePath);
        }
      }
    }, { maxDepth: 1 });

    const result = gateResult('rule-naming-dedup', checks, { failClosed: false });

    const reportPath = path.join(__dirname, '..', 'logs', 'rule-naming-dedup-report.json');
    writeReport(reportPath, result);

    console.log(`[rule-naming-dedup] 扫描完成: ${result.passed}/${result.total} 通过`);
    return result;
  },
};
