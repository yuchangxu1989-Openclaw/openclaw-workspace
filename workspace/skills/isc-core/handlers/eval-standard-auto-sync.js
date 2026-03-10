/**
 * eval-standard-auto-sync handler
 *
 * 触发规则: rule.eval-standard-auto-sync-001
 * 职责: 评测标准变更时自动刷新评测集，确保与最新标准对齐
 */
'use strict';

const path = require('path');
const { checkFileExists, scanFiles, writeReport, gateResult } = require('../lib/handler-utils');

module.exports = {
  name: 'eval-standard-auto-sync',

  /**
   * @param {Object} context - 规则触发上下文
   * @param {string} [context.standardVersion] - 新标准版本
   * @param {string} [context.standardDocToken] - 标准文档token
   * @param {string} [context.evalsetDir] - 评测集目录
   */
  async execute(context = {}) {
    const {
      standardVersion = 'unknown',
      standardDocToken = 'JxhNdoc7ko7ZLwxJUJHcWyeDnYd',
      evalsetDir
    } = context;
    const checks = [];

    const targetDir = evalsetDir || path.join(__dirname, '..', '..', '..', 'evaluation-sets');

    // 扫描现有评测集文件
    const evalFiles = [];
    if (checkFileExists(targetDir)) {
      scanFiles(targetDir, /\.json$/, (fp) => evalFiles.push(fp), { maxDepth: 2 });
    }

    checks.push({
      name: 'evalset_scan',
      ok: evalFiles.length > 0,
      message: `找到${evalFiles.length}个评测集文件`
    });

    // 标记需要刷新的评测集
    const refreshed = [];
    for (const file of evalFiles) {
      try {
        const content = require(file);
        if (content.standardVersion !== standardVersion) {
          refreshed.push(path.basename(file));
        }
      } catch {
        refreshed.push(path.basename(file) + ' (parse error)');
      }
    }

    checks.push({
      name: 'refresh_needed',
      ok: true,
      message: refreshed.length > 0
        ? `${refreshed.length}个评测集需刷新: ${refreshed.slice(0, 5).join(', ')}`
        : '所有评测集已对齐最新标准'
    });

    // 记录同步日志
    const logPath = path.join(targetDir, '.sync-log.json');
    try {
      writeReport(logPath, {
        timestamp: new Date().toISOString(),
        standardVersion,
        standardDocToken,
        scanned: evalFiles.length,
        needsRefresh: refreshed.length,
        files: refreshed
      });
      checks.push({ name: 'sync_log', ok: true, message: '同步日志已记录' });
    } catch (err) {
      checks.push({ name: 'sync_log', ok: false, message: err.message });
    }

    console.log(`[eval-standard-auto-sync] 标准版本${standardVersion}, ${refreshed.length}个需刷新`);
    return gateResult('eval-standard-auto-sync', checks, { failClosed: false });
  }
};
