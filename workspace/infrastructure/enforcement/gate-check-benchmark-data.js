#!/usr/bin/env node
/**
 * Gate Check: scenario-acceptance-gate-001 (data source validation)
 * Benchmark提交前检查数据源是否标注为真实数据
 * 
 * Usage: node gate-check-benchmark-data.js <benchmark_file.json>
 * Exit 0 = pass, Exit 1 = blocked
 * 
 * Expected benchmark format:
 * { "scenarios": [{ "source": "real|synthetic|...", "data_origin": "...", ... }] }
 * or { "data_source": "real_production|real_user|...", ... }
 */
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'enforcement-log.jsonl');
const VALID_REAL_SOURCES = ['real_production', 'real_user', 'real_log', 'real', 'production', 'field_collected', 'real-conversation', 'real_conversation'];

function log(entry) {
  const line = JSON.stringify({ ...entry, timestamp: new Date().toISOString() });
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function check(filePath) {
  const resolved = path.resolve(filePath);
  
  if (!fs.existsSync(resolved)) {
    console.error(`❌ 文件不存在: ${resolved}`);
    log({ rule: 'rule.scenario-acceptance-gate-001', gate: 'benchmark-submit', result: 'BLOCKED', reason: '文件不存在', path: resolved });
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
  } catch (e) {
    console.error(`❌ JSON解析失败: ${e.message}`);
    log({ rule: 'rule.scenario-acceptance-gate-001', gate: 'benchmark-submit', result: 'BLOCKED', reason: 'JSON解析失败', path: resolved });
    process.exit(1);
  }

  const violations = [];

  // Check top-level data_source
  if (data.data_source) {
    if (!VALID_REAL_SOURCES.includes(data.data_source.toLowerCase())) {
      violations.push(`顶层data_source="${data.data_source}" 非真实数据源`);
    }
  } else if (!data.scenarios && !data.test_cases && !data.samples) {
    violations.push('缺少data_source字段，无法验证数据来源');
  }

  // Check scenarios/test_cases/samples
  const items = data.scenarios || data.test_cases || data.samples || [];
  items.forEach((item, i) => {
    const src = (item.source || item.data_source || item.origin || '').toLowerCase();
    if (!src) {
      violations.push(`场景[${i}]: 缺少source/data_source标注`);
    } else if (src === 'synthetic' || src === 'generated' || src === 'mock' || src === 'simulated' || src === 'fake') {
      violations.push(`场景[${i}]: source="${src}" 为合成数据，禁止提交`);
    } else if (!VALID_REAL_SOURCES.includes(src)) {
      violations.push(`场景[${i}]: source="${src}" 未标注为真实数据`);
    }
  });

  if (violations.length > 0) {
    console.error(`🚫 [BLOCKED] Benchmark数据源验证失败\n   规则: rule.scenario-acceptance-gate-001 (P0)\n   文件: ${resolved}\n   违规详情:`);
    violations.forEach(v => console.error(`   - ${v}`));
    log({ rule: 'rule.scenario-acceptance-gate-001', gate: 'benchmark-submit', result: 'BLOCKED', violations, path: resolved });
    process.exit(1);
  }

  console.log(`✅ [PASS] Benchmark数据源验证通过: ${resolved}`);
  log({ rule: 'rule.scenario-acceptance-gate-001', gate: 'benchmark-submit', result: 'PASS', path: resolved, scenarioCount: items.length });
  process.exit(0);
}

const target = process.argv[2];
if (!target) {
  console.error('Usage: node gate-check-benchmark-data.js <benchmark_file.json>');
  process.exit(1);
}
check(target);
