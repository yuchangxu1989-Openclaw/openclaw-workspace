'use strict';

/**
 * cron-task-model-requirement.js
 * Handler for rule.cron-task-model-requirement-001
 *
 * 验证定时任务必须指定模型字段，未指定则拒绝创建。
 * 缺少model字段时可跟随openclaw.json主配置模型。
 */

const fs = require('fs');
const path = require('path');
const { scanFiles, writeReport, gateResult, readRuleJson, checkFileExists } = require('../lib/handler-utils');

/**
 * @param {object} context - ISC 运行时上下文
 * @param {string} context.repoRoot - 仓库根目录
 * @returns {object} gate result
 */
async function handler(context = {}) {
  const repoRoot = context.repoRoot || process.cwd();
  const checks = [];
  const violations = [];

  // Read openclaw.json for default model
  const openclawPath = path.join(repoRoot, 'openclaw.json');
  let defaultModel = null;
  if (checkFileExists(openclawPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(openclawPath, 'utf8'));
      defaultModel = cfg.model || cfg.default_model || null;
    } catch { /* ignore */ }
  }

  // Scan for cron task definitions
  const cronDirs = [
    path.join(repoRoot, 'skills'),
    path.join(repoRoot, 'scripts'),
  ];

  for (const dir of cronDirs) {
    scanFiles(dir, /\.(json)$/, (filePath) => {
      const data = readRuleJson(filePath);
      if (!data) return;

      // Detect cron-like task definitions
      const isCron = data.schedule || data.cron || data.type === 'cron' ||
        (data.trigger && data.trigger.type === 'cron');
      if (!isCron) return;

      const hasModel = !!(data.model || (data.action && data.action.model) ||
        (data.config && data.config.model));

      if (!hasModel) {
        violations.push({
          file: path.relative(repoRoot, filePath),
          id: data.id || path.basename(filePath),
          hasDefaultFallback: !!defaultModel,
        });
      }
    }, { maxDepth: 4, skip: ['node_modules', '.git', '.entropy-archive'] });
  }

  checks.push({
    name: 'cron-tasks-have-model',
    ok: violations.length === 0,
    message: violations.length === 0
      ? '所有定时任务均已指定模型'
      : `${violations.length} 个定时任务缺少model字段`,
  });

  checks.push({
    name: 'default-model-configured',
    ok: !!defaultModel,
    message: defaultModel
      ? `openclaw.json 默认模型: ${defaultModel}`
      : 'openclaw.json 未配置默认模型，缺少model的cron任务无法兜底',
  });

  const result = gateResult('cron-task-model-requirement-001', checks, { failClosed: true });

  writeReport(path.join(repoRoot, 'reports', 'cron-task-model-requirement.json'), {
    rule: 'rule.cron-task-model-requirement-001',
    timestamp: new Date().toISOString(),
    summary: { status: result.status, defaultModel, violationCount: violations.length },
    violations: violations.slice(0, 50),
  });

  return result;
}

module.exports = handler;
