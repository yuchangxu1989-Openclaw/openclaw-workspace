#!/usr/bin/env node
/**
 * ISC Handler: N016 Decision Auto-Repair Loop (Post-Pipeline)
 * 流水线后自动修复循环 — 发现可修复问题后迭代修复直至稳定。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { gitExec, writeReport, gateResult, scanFiles, readRuleJson } = require('../lib/handler-utils');

const WORKSPACE = process.env.WORKSPACE || path.resolve(__dirname, '../../..');
const MAX_ITERATIONS = parseInt(process.env.ISC_MAX_FIX_ITERATIONS || '3', 10);

/**
 * 扫描流水线产出的 findings 报告，提取可修复问题
 */
function collectFixableIssues(reportsDir) {
  const issues = [];
  if (!fs.existsSync(reportsDir)) return issues;

  const files = scanFiles(reportsDir, /\.(json|jsonl)$/, null, { maxDepth: 2 });
  for (const f of files) {
    try {
      const data = JSON.parse(fs.readFileSync(f, 'utf8'));
      const findings = data.findings || data.issues || [];
      for (const item of findings) {
        if (item.fixable || item.auto_fixable || item.severity === 'low') {
          issues.push({
            id: item.id || path.basename(f, '.json'),
            file: item.file || '',
            description: item.description || item.message || '',
            source: f,
          });
        }
      }
    } catch { /* skip malformed */ }
  }
  return issues;
}

/**
 * 尝试修复单个问题（示例：移除 trailing whitespace、修复 JSON 格式）
 */
function attemptFix(issue) {
  if (!issue.file || !fs.existsSync(issue.file)) {
    return { success: false, reason: 'file not found' };
  }
  try {
    let content = fs.readFileSync(issue.file, 'utf8');
    const original = content;

    // 基础修复：trailing whitespace
    content = content.replace(/[ \t]+$/gm, '');
    // 基础修复：确保文件以换行结尾
    if (content.length > 0 && !content.endsWith('\n')) {
      content += '\n';
    }

    if (content !== original) {
      fs.writeFileSync(issue.file, content, 'utf8');
      return { success: true, action: 'whitespace-cleanup' };
    }
    return { success: false, reason: 'no auto-fixable pattern matched' };
  } catch (err) {
    return { success: false, reason: err.message };
  }
}

function main() {
  const checks = [];
  const pipelineReportsDir = path.join(WORKSPACE, 'reports', 'pipeline');
  const issues = collectFixableIssues(pipelineReportsDir);

  checks.push({
    name: 'fixable-issues-scan',
    ok: true,
    message: `Found ${issues.length} fixable issue(s)`,
  });

  if (issues.length === 0) {
    checks.push({ name: 'no-issues', ok: true, message: 'Pipeline clean, no repair needed' });
  } else {
    let iteration = 0;
    let remaining = issues;

    while (remaining.length > 0 && iteration < MAX_ITERATIONS) {
      iteration++;
      const nextRound = [];
      for (const issue of remaining) {
        const result = attemptFix(issue);
        if (!result.success) {
          nextRound.push(issue);
        }
      }
      checks.push({
        name: `iteration-${iteration}`,
        ok: nextRound.length < remaining.length,
        message: `Iter ${iteration}: fixed ${remaining.length - nextRound.length}, remaining ${nextRound.length}`,
      });
      remaining = nextRound;
    }

    checks.push({
      name: 'repair-loop-complete',
      ok: remaining.length === 0,
      message: remaining.length === 0
        ? `All issues resolved in ${iteration} iteration(s)`
        : `${remaining.length} issue(s) still unresolved after ${iteration} iteration(s)`,
    });
  }

  const result = gateResult('n016-decision-auto-repair-loop', checks, { failClosed: false });
  const reportPath = path.join(WORKSPACE, 'reports', 'isc', `n016-repair-loop-${Date.now()}.json`);
  writeReport(reportPath, result);

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.exitCode);
}

main();
