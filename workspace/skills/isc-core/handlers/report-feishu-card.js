'use strict';

/**
 * report-feishu-card.js
 * Handler for rule.detection-report-feishu-card-001
 *
 * 报告输出格式标准 - 验证检测报告使用飞书卡片格式输出。
 */

const fs = require('fs');
const path = require('path');
const { scanFiles, writeReport, gateResult } = require('../lib/handler-utils');

const FEISHU_CARD_SIGNALS = [
  /feishu.?card|飞书卡片|interactive.*card|msg_type.*interactive/gi,
  /card_link|template_id|header.*template/gi,
];

const RAW_TEXT_REPORT_SIGNALS = [
  /console\.log\s*\(\s*['"`]={3,}|console\.log\s*\(\s*['"`]-{3,}/g,
  /plain.?text.*report|纯文本.*报告/gi,
];

/**
 * @param {object} context - ISC 运行时上下文
 * @param {string} context.repoRoot - 仓库根目录
 * @returns {object} gate result
 */
async function handler(context = {}) {
  const repoRoot = context.repoRoot || process.cwd();
  const checks = [];
  let cardUsageCount = 0;
  const rawTextReports = [];

  const scanDirs = [
    path.join(repoRoot, 'skills'),
    path.join(repoRoot, 'scripts'),
  ];

  for (const dir of scanDirs) {
    scanFiles(dir, /\.(js|ts)$/, (filePath) => {
      let content;
      try {
        content = fs.readFileSync(filePath, 'utf8');
      } catch {
        return;
      }

      // Skip if not report-related
      if (!/report|报告|notify|通知/i.test(content)) return;

      // Check feishu card usage
      for (const pat of FEISHU_CARD_SIGNALS) {
        pat.lastIndex = 0;
        if (pat.test(content)) {
          cardUsageCount++;
          break;
        }
      }

      // Check raw text report output
      for (const pat of RAW_TEXT_REPORT_SIGNALS) {
        pat.lastIndex = 0;
        if (pat.test(content)) {
          rawTextReports.push(path.relative(repoRoot, filePath));
          break;
        }
      }
    }, { maxDepth: 4, skip: ['node_modules', '.git', '.entropy-archive'] });
  }

  checks.push({
    name: 'feishu-card-adoption',
    ok: cardUsageCount > 0,
    message: cardUsageCount > 0
      ? `检测到 ${cardUsageCount} 处飞书卡片格式输出`
      : '未检测到飞书卡片格式的报告输出',
  });

  checks.push({
    name: 'no-raw-text-reports',
    ok: rawTextReports.length === 0,
    message: rawTextReports.length === 0
      ? '未发现纯文本格式的报告输出'
      : `${rawTextReports.length} 个文件使用纯文本报告，应改用飞书卡片`,
  });

  const result = gateResult('detection-report-feishu-card-001', checks, { failClosed: false });

  writeReport(path.join(repoRoot, 'reports', 'report-feishu-card.json'), {
    rule: 'rule.detection-report-feishu-card-001',
    timestamp: new Date().toISOString(),
    summary: { status: result.status, cardUsageCount, rawTextReportCount: rawTextReports.length },
    rawTextReports: rawTextReports.slice(0, 30),
  });

  return result;
}

module.exports = handler;
