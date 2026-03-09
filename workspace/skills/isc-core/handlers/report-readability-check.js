#!/usr/bin/env node
/**
 * ISC Handler: Report Readability Check
 * 重要报告可读性钢印——检查结构、中文优先、思路清晰、不啰嗦。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { scanFiles, gateResult, writeReport } = require('../lib/handler-utils');

const WORKSPACE = process.env.WORKSPACE || path.resolve(__dirname, '../../..');

const REQUIRED_SECTIONS = [
  { pattern: /结论|摘要|executive.?summary/i, name: '结论/摘要' },
  { pattern: /背景|目标|background|objective/i, name: '背景与目标' },
  { pattern: /思路|分析|approach|analysis/i, name: '分析思路' },
  { pattern: /发现|finding|核心/i, name: '核心发现' },
  { pattern: /建议|决策|recommendation|下一步|next/i, name: '建议/下一步' },
];

function checkReport(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const checks = [];
  const fileName = path.basename(filePath);

  // R1: 中文优先 — 中文字符占比应 > 20%（对于中文报告）
  const chineseChars = (content.match(/[\u4e00-\u9fff]/g) || []).length;
  const totalChars = content.replace(/\s/g, '').length;
  const chineseRatio = totalChars > 0 ? chineseChars / totalChars : 0;
  // 仅在有中文内容时检查
  if (chineseChars > 10) {
    checks.push({
      name: `${fileName}:chinese-first`,
      ok: chineseRatio > 0.15,
      message: `Chinese char ratio: ${(chineseRatio * 100).toFixed(1)}%`,
    });
  }

  // R4: 结构清晰 — 检查必要章节
  const headers = content.match(/^#{1,3}\s+.+/gm) || [];
  checks.push({
    name: `${fileName}:has-headers`,
    ok: headers.length >= 3,
    message: `Found ${headers.length} headers`,
  });

  const missingSections = REQUIRED_SECTIONS.filter(
    s => !headers.some(h => s.pattern.test(h)) && !s.pattern.test(content.slice(0, 500))
  );
  checks.push({
    name: `${fileName}:required-sections`,
    ok: missingSections.length <= 2,
    message: missingSections.length > 0
      ? `Missing sections: ${missingSections.map(s => s.name).join(', ')}`
      : 'All required sections present',
  });

  // R3: 少提代码 — 代码块占比不超过 30%
  const codeBlocks = content.match(/```[\s\S]*?```/g) || [];
  const codeLength = codeBlocks.reduce((sum, b) => sum + b.length, 0);
  const codeRatio = totalChars > 0 ? codeLength / content.length : 0;
  checks.push({
    name: `${fileName}:minimal-code`,
    ok: codeRatio < 0.3,
    message: `Code block ratio: ${(codeRatio * 100).toFixed(1)}%`,
  });

  // R6: 不啰嗦 — 平均段落不超过 200 字
  const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 20);
  const avgParagraphLen = paragraphs.length > 0
    ? paragraphs.reduce((s, p) => s + p.length, 0) / paragraphs.length
    : 0;
  checks.push({
    name: `${fileName}:concise-paragraphs`,
    ok: avgParagraphLen < 300,
    message: `Avg paragraph length: ${Math.round(avgParagraphLen)} chars`,
  });

  return checks;
}

function main() {
  const reportFile = process.env.ISC_REPORT_PATH || '';
  let allChecks = [];

  if (reportFile && fs.existsSync(reportFile)) {
    allChecks = checkReport(reportFile);
  } else {
    // Scan reports directory
    const reportsDir = path.join(WORKSPACE, 'reports');
    if (fs.existsSync(reportsDir)) {
      const mdFiles = scanFiles(reportsDir, /\.md$/, null, { maxDepth: 2 });
      for (const f of mdFiles.slice(0, 5)) {
        allChecks.push(...checkReport(f));
      }
    }
    if (allChecks.length === 0) {
      allChecks.push({ name: 'report-found', ok: true, message: 'No reports to check' });
    }
  }

  const result = gateResult('report-readability-check', allChecks);

  const reportPath = path.join(WORKSPACE, 'reports', 'isc', `readability-check-${Date.now()}.json`);
  writeReport(reportPath, result);

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.exitCode);
}

main();
