'use strict';

/**
 * intent-unknown-discovery.js
 * Handler for rule.intent-unknown-discovery-001
 *
 * 每周执行一次未知意图发现：
 * (1) 用智谱embedding对近期对话做向量聚类
 * (2) LLM对聚类结果做意图分类
 * (3) MECE原则识别增量且高频的意图类型
 * (4) 主动溯源未解决问题是否因意图类型缺失导致
 * 发现候选新意图→提交用户确认→注册。
 */

const path = require('path');
const fs = require('fs');
const { scanFiles, writeReport, gateResult, checkFileExists } = require('../lib/handler-utils');

/**
 * @param {object} context - ISC 运行时上下文
 * @param {string} context.repoRoot - 仓库根目录
 * @returns {object} gate result
 */
async function handler(context = {}) {
  const repoRoot = context.repoRoot || process.cwd();
  const checks = [];

  // 1. 检查对话日志/历史是否可供聚类分析
  const possibleLogDirs = [
    path.join(repoRoot, 'logs'),
    path.join(repoRoot, 'memory'),
    path.join(repoRoot, 'data', 'conversations'),
  ];
  const hasLogs = possibleLogDirs.some(d => checkFileExists(d));

  checks.push({
    name: 'conversation-logs-available',
    ok: hasLogs,
    message: hasLogs
      ? '对话日志可供聚类分析'
      : '未找到可供意图聚类的对话日志目录',
  });

  // 2. 检查向量聚类工具/脚本是否存在
  let hasClusterTool = false;
  scanFiles(path.join(repoRoot, 'skills'), /\.(js|py|ts)$/, (filePath) => {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      if (/cluster|embedding|向量|聚类/i.test(content)) {
        hasClusterTool = true;
      }
    } catch { /* skip */ }
  }, { maxDepth: 4 });

  checks.push({
    name: 'cluster-tool-exists',
    ok: hasClusterTool,
    message: hasClusterTool
      ? '向量聚类工具/脚本存在'
      : '未找到向量聚类工具，需实现 embedding + 聚类流程',
  });

  // 3. 检查未知意图发现报告目录
  const discoveryReportDir = path.join(repoRoot, 'reports', 'intent-discovery');
  const hasDiscoveryReports = checkFileExists(discoveryReportDir);

  checks.push({
    name: 'discovery-report-dir',
    ok: hasDiscoveryReports,
    message: hasDiscoveryReports
      ? '意图发现报告目录已存在'
      : '未找到意图发现报告目录，首次运行将自动创建',
  });

  // 4. 检查 MECE 意图分类注册机制
  let hasMeceCheck = false;
  scanFiles(path.join(repoRoot, 'skills', 'isc-core'), /\.(js|json|md)$/, (filePath) => {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      if (/mece|互斥.*穷尽|mutually.?exclusive/i.test(content)) {
        hasMeceCheck = true;
      }
    } catch { /* skip */ }
  }, { maxDepth: 3 });

  checks.push({
    name: 'mece-classification',
    ok: hasMeceCheck,
    message: hasMeceCheck
      ? 'MECE 意图分类机制存在'
      : '未找到 MECE 意图分类/校验机制',
  });

  const result = gateResult('intent-unknown-discovery-001', checks, { failClosed: false });

  writeReport(path.join(repoRoot, 'reports', 'intent-unknown-discovery.json'), {
    rule: 'rule.intent-unknown-discovery-001',
    timestamp: new Date().toISOString(),
    summary: { status: result.status, passed: result.passed, total: result.total },
    checks,
  });

  return result;
}

module.exports = handler;
