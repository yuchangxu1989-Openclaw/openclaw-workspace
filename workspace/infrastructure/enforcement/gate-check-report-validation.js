#!/usr/bin/env node
/**
 * Gate Check: report cross-validation
 * 报告生成前检查数字是否有交叉验证，防止"7/10"这种不存在的数据
 * 
 * Usage: node gate-check-report-validation.js <report_file.md|.json>
 * Exit 0 = pass, Exit 1 = blocked
 * 
 * Checks:
 * 1. Fraction patterns (X/Y) must have traceable denominators
 * 2. Percentages must have sample size context
 * 3. Scores must reference methodology
 */
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'enforcement-log.jsonl');

function log(entry) {
  const line = JSON.stringify({ ...entry, timestamp: new Date().toISOString() });
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function checkReport(filePath) {
  const resolved = path.resolve(filePath);
  
  if (!fs.existsSync(resolved)) {
    console.error(`❌ 文件不存在: ${resolved}`);
    log({ rule: 'report-cross-validation', gate: 'report-generate', result: 'BLOCKED', reason: '文件不存在', path: resolved });
    process.exit(1);
  }

  const content = fs.readFileSync(resolved, 'utf-8');
  const violations = [];

  // Pattern 1: Bare fractions like "7/10", "3/5" without context
  const fractionRegex = /(\d+)\/(\d+)/g;
  let match;
  while ((match = fractionRegex.exec(content)) !== null) {
    const num = parseInt(match[1]);
    const den = parseInt(match[2]);
    // Skip dates (MM/DD, YYYY/MM), file paths, URLs
    const before = content.substring(Math.max(0, match.index - 30), match.index);
    const after = content.substring(match.index + match[0].length, Math.min(content.length, match.index + match[0].length + 30));
    if (/\d{4}$/.test(before) || /\/\d/.test(after) || /https?:/.test(before) || /path|dir|file|url/i.test(before)) continue;
    // Flag if denominator is suspiciously round and no validation marker nearby
    const context = content.substring(Math.max(0, match.index - 100), Math.min(content.length, match.index + 100));
    const hasValidation = /验证|validated|cross.?check|来源|source|sample|样本|基于|based on/i.test(context);
    if (!hasValidation && den <= 20 && den > 1) {
      violations.push({
        type: 'unvalidated_fraction',
        value: match[0],
        position: match.index,
        context: content.substring(Math.max(0, match.index - 20), Math.min(content.length, match.index + 20)).trim()
      });
    }
  }

  // Pattern 2: Percentages without sample size
  const pctRegex = /(\d+(?:\.\d+)?)\s*%/g;
  const pctMatches = [];
  while ((match = pctRegex.exec(content)) !== null) {
    const context = content.substring(Math.max(0, match.index - 150), Math.min(content.length, match.index + 80));
    const hasSampleContext = /n\s*=|sample|样本|共\s*\d|总计|total|count|数量|条|个|次|来源|source/i.test(context);
    if (!hasSampleContext) {
      pctMatches.push({ value: match[0], position: match.index });
    }
  }
  // Only flag if >50% of percentages lack context (some reports legitimately use % casually)
  if (pctMatches.length > 3) {
    violations.push({
      type: 'unvalidated_percentages',
      count: pctMatches.length,
      samples: pctMatches.slice(0, 3).map(m => m.value),
      message: `${pctMatches.length}个百分比数字缺少样本量/来源上下文`
    });
  }

  // Pattern 3: JSON reports - check for cross_validation field
  if (resolved.endsWith('.json')) {
    try {
      const data = JSON.parse(content);
      if (data.metrics || data.scores || data.results) {
        if (!data.cross_validation && !data.validation_method && !data.data_source) {
          violations.push({
            type: 'missing_validation_metadata',
            message: 'JSON报告包含metrics/scores但缺少cross_validation或validation_method字段'
          });
        }
      }
    } catch (e) { /* not valid JSON, skip */ }
  }

  if (violations.length > 0) {
    console.error(`🚫 [BLOCKED] 报告交叉验证检查失败\n   规则: report-cross-validation (P0)\n   文件: ${resolved}\n   违规详情:`);
    violations.forEach(v => {
      if (v.type === 'unvalidated_fraction') {
        console.error(`   - 未验证的分数 "${v.value}": ...${v.context}...`);
      } else if (v.type === 'unvalidated_percentages') {
        console.error(`   - ${v.message} (示例: ${v.samples.join(', ')})`);
      } else {
        console.error(`   - ${v.message}`);
      }
    });
    console.error(`\n   修复: 为每个数字添加数据来源标注（如: "7/10 (基于XX样本验证)"）`);
    log({ rule: 'report-cross-validation', gate: 'report-generate', result: 'BLOCKED', violations: violations.length, details: violations, path: resolved });
    process.exit(1);
  }

  console.log(`✅ [PASS] 报告交叉验证检查通过: ${resolved}`);
  log({ rule: 'report-cross-validation', gate: 'report-generate', result: 'PASS', path: resolved });
  process.exit(0);
}

const target = process.argv[2];
if (!target) {
  console.error('Usage: node gate-check-report-validation.js <report_file>');
  process.exit(1);
}
checkReport(target);
