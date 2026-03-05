#!/usr/bin/env node
'use strict';

/**
 * 统一测试 Runner — 聚合所有测试套件
 * 
 * 按类别分组执行，输出统一格式，某个套件失败不影响其他套件继续。
 * 
 * 用法:
 *   node infrastructure/tests/run-all-tests.js              运行所有测试
 *   node infrastructure/tests/run-all-tests.js --skip=bench  跳过benchmark
 *   node infrastructure/tests/run-all-tests.js --only=resilience,integration  只运行指定类别
 * 
 * 退出码: 0=全通过, 1=有失败
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// ─── 配置 ──────────────────────────────────────────────────────────

const WORKSPACE = path.resolve(__dirname, '..', '..');
const TESTS_DIR = path.resolve(__dirname);

/**
 * 测试套件注册表
 * 每个套件: { name, category, script, parseResult }
 * parseResult: (stdout) => { passed, failed, total, details? }
 */
const SUITES = [
  {
    id: 'resilience',
    name: '韧性层测试 (Resilience)',
    category: 'unit',
    script: path.join(TESTS_DIR, 'resilience', 'run-all.js'),
    parseResult(stdout) {
      // 匹配: 📊 TOTAL: 64 passed, 0 failed, 64 tests
      const m = stdout.match(/TOTAL:\s*(\d+)\s*passed,\s*(\d+)\s*failed,\s*(\d+)\s*tests/);
      if (m) return { passed: +m[1], failed: +m[2], total: +m[3] };
      // fallback: 统计 ✅ 和 ❌
      return countChecks(stdout);
    },
  },
  {
    id: 'integration',
    name: '接口契约测试 (Integration)',
    category: 'integration',
    script: path.join(TESTS_DIR, 'integration', 'skill-integration.test.js'),
    parseResult(stdout) {
      // 匹配: ✅ 通过: 47 / ❌ 失败: 0 / 📊 总计: 47
      const mp = stdout.match(/通过:\s*(\d+)/);
      const mf = stdout.match(/失败:\s*(\d+)/);
      const mt = stdout.match(/总计:\s*(\d+)/);
      if (mp && mf && mt) return { passed: +mp[1], failed: +mf[1], total: +mt[1] };
      return countChecks(stdout);
    },
  },
  {
    id: 'e2e',
    name: 'E2E 闭环测试 (End-to-End)',
    category: 'e2e',
    script: path.join(TESTS_DIR, 'l3-e2e-test.js'),
    parseResult(stdout) {
      // 匹配: PASSED: 38 / FAILED: 0 / TOTAL: 38
      const mp = stdout.match(/PASSED:\s*(\d+)/);
      const mf = stdout.match(/FAILED:\s*(\d+)/);
      const mt = stdout.match(/TOTAL:\s*(\d+)/);
      if (mp && mf && mt) return { passed: +mp[1], failed: +mf[1], total: +mt[1] };
      return countChecks(stdout);
    },
  },
  {
    id: 'bench-intent',
    name: 'Intent Benchmark (Regex)',
    category: 'benchmark',
    script: path.join(TESTS_DIR, 'benchmarks', 'run-intent-benchmark.js'),
    parseResult(stdout) {
      // 匹配: Benchmark complete: 19/80 correct (23.8%)
      const m = stdout.match(/(\d+)\/(\d+)\s*correct\s*\(([0-9.]+)%\)/);
      if (m) return { passed: +m[1], failed: +m[2] - +m[1], total: +m[2], accuracy: m[3] + '%' };
      return { passed: 0, failed: 0, total: 0, note: 'Could not parse output' };
    },
  },
  {
    id: 'bench-pipeline',
    name: 'Pipeline Benchmark (E2E)',
    category: 'benchmark',
    script: path.join(TESTS_DIR, 'benchmarks', 'run-pipeline-benchmark.js'),
    parseResult(stdout) {
      // 匹配: 端到端正确率: 20/25 (80.0%)
      const m = stdout.match(/端到端正确率:\s*(\d+)\/(\d+)/);
      if (m) return { passed: +m[1], failed: +m[2] - +m[1], total: +m[2] };
      return countChecks(stdout);
    },
  },
];

// ─── 工具函数 ──────────────────────────────────────────────────────

/** fallback: 通过计数 ✅ / ❌ 来推断结果 */
function countChecks(stdout) {
  const passMatches = stdout.match(/✅/g);
  const failMatches = stdout.match(/❌/g);
  const passed = passMatches ? passMatches.length : 0;
  const failed = failMatches ? failMatches.length : 0;
  return { passed, failed, total: passed + failed };
}

/** 格式化持续时间 */
function fmtDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** 解析命令行参数 */
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { skip: new Set(), only: null };
  for (const arg of args) {
    const skipMatch = arg.match(/^--skip=(.+)$/);
    if (skipMatch) {
      skipMatch[1].split(',').forEach(s => opts.skip.add(s.trim()));
    }
    const onlyMatch = arg.match(/^--only=(.+)$/);
    if (onlyMatch) {
      opts.only = new Set(onlyMatch[1].split(',').map(s => s.trim()));
    }
  }
  return opts;
}

// ─── 运行引擎 ──────────────────────────────────────────────────────

async function runSuite(suite) {
  const result = {
    id: suite.id,
    name: suite.name,
    category: suite.category,
    passed: 0,
    failed: 0,
    total: 0,
    duration_ms: 0,
    status: 'unknown', // 'pass' | 'fail' | 'error' | 'skip'
    error: null,
    stdout: '',
    extra: {},
  };

  // 检查脚本是否存在
  if (!fs.existsSync(suite.script)) {
    result.status = 'error';
    result.error = `Script not found: ${suite.script}`;
    return result;
  }

  const t0 = Date.now();
  try {
    const stdout = execSync(`node "${suite.script}"`, {
      cwd: WORKSPACE,
      timeout: 120_000, // 2分钟超时
      env: { ...process.env, FORCE_COLOR: '0' },
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    result.stdout = stdout;
    result.duration_ms = Date.now() - t0;

    const parsed = suite.parseResult(stdout);
    Object.assign(result, parsed);
    result.status = result.failed > 0 ? 'fail' : 'pass';
    // 保留额外字段 (如 accuracy)
    for (const key of Object.keys(parsed)) {
      if (!['passed', 'failed', 'total'].includes(key)) {
        result.extra[key] = parsed[key];
      }
    }
  } catch (err) {
    result.duration_ms = Date.now() - t0;
    // execSync 在非零退出码时抛异常，但 stdout 仍可用
    const stdout = (err.stdout || '').toString();
    const stderr = (err.stderr || '').toString();
    result.stdout = stdout;

    if (stdout) {
      // 尝试从输出解析结果
      const parsed = suite.parseResult(stdout);
      Object.assign(result, parsed);
      result.extra = {};
      for (const key of Object.keys(parsed)) {
        if (!['passed', 'failed', 'total'].includes(key)) {
          result.extra[key] = parsed[key];
        }
      }
      result.status = 'fail';
    } else {
      result.status = 'error';
      result.error = err.message.split('\n')[0];
      if (stderr) {
        // 提取有用的错误信息
        const errLines = stderr.split('\n').filter(l => l.trim()).slice(0, 3);
        result.error = errLines.join(' | ') || result.error;
      }
    }
  }

  return result;
}

// ─── 主流程 ────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();
  const opts = parseArgs();

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║            统一测试 Runner (Unified Test Runner)         ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  时间: ${new Date().toISOString()}`);
  console.log(`  Node: ${process.version}`);
  console.log('');

  // 筛选要运行的套件
  const suitesToRun = SUITES.filter(s => {
    if (opts.only && !opts.only.has(s.id) && !opts.only.has(s.category)) return false;
    if (opts.skip.has(s.id) || opts.skip.has(s.category)) return false;
    return true;
  });

  const skippedSuites = SUITES.filter(s => !suitesToRun.includes(s));

  // 按类别分组输出
  const categories = ['unit', 'integration', 'e2e', 'benchmark'];
  const categoryLabels = {
    unit: '🛡️  单元测试',
    integration: '🔗 集成测试',
    e2e: '🔄 端到端测试',
    benchmark: '📊 性能基准',
  };

  const results = [];

  for (const cat of categories) {
    const catSuites = suitesToRun.filter(s => s.category === cat);
    if (catSuites.length === 0) continue;

    console.log(`\n${'─'.repeat(58)}`);
    console.log(`  ${categoryLabels[cat] || cat}`);
    console.log(`${'─'.repeat(58)}`);

    for (const suite of catSuites) {
      process.stdout.write(`  ⏳ ${suite.name} ... `);
      const result = await runSuite(suite);
      results.push(result);

      if (result.status === 'pass') {
        console.log(`✅ ${result.passed}/${result.total} passed (${fmtDuration(result.duration_ms)})`);
      } else if (result.status === 'fail') {
        console.log(`❌ ${result.passed}/${result.total} passed, ${result.failed} failed (${fmtDuration(result.duration_ms)})`);
      } else if (result.status === 'error') {
        console.log(`💥 ERROR: ${result.error}`);
      }

      // 显示额外信息 (如 accuracy)
      if (result.extra.accuracy) {
        console.log(`         准确率: ${result.extra.accuracy}`);
      }
    }
  }

  // 跳过的套件
  if (skippedSuites.length > 0) {
    console.log(`\n  ⏭️  跳过: ${skippedSuites.map(s => s.id).join(', ')}`);
  }

  // ─── 总汇总 ──────────────────────────────────────────────────

  const totalPassed = results.reduce((s, r) => s + r.passed, 0);
  const totalFailed = results.reduce((s, r) => s + r.failed, 0);
  const totalTests = results.reduce((s, r) => s + r.total, 0);
  const totalDuration = Date.now() - startTime;
  const hasFailures = results.some(r => r.status === 'fail' || r.status === 'error');

  console.log(`\n${'═'.repeat(58)}`);
  console.log(`  📊 总汇总 (Summary)`);
  console.log(`${'═'.repeat(58)}`);
  console.log('');
  console.log('  套件                                通过    失败    状态');
  console.log(`  ${'─'.repeat(54)}`);

  for (const r of results) {
    const nameCol = r.name.padEnd(36);
    const passCol = String(r.passed).padStart(4);
    const failCol = String(r.failed).padStart(4);
    const icon = r.status === 'pass' ? '✅' : r.status === 'fail' ? '❌' : '💥';
    console.log(`  ${nameCol} ${passCol}   ${failCol}    ${icon}`);
  }

  console.log(`  ${'─'.repeat(54)}`);
  const totalLabel = 'TOTAL'.padEnd(36);
  console.log(`  ${totalLabel} ${String(totalPassed).padStart(4)}   ${String(totalFailed).padStart(4)}    ${hasFailures ? '❌' : '✅'}`);
  console.log('');
  console.log(`  总耗时: ${fmtDuration(totalDuration)}`);
  console.log(`  结果: ${hasFailures ? '⚠️  有测试失败' : '🎉 全部通过!'}`);
  console.log(`${'═'.repeat(58)}\n`);

  // 返回结构化结果 (供程序化调用)
  return {
    timestamp: new Date().toISOString(),
    duration_ms: totalDuration,
    summary: { passed: totalPassed, failed: totalFailed, total: totalTests },
    suites: results.map(r => ({
      id: r.id, name: r.name, category: r.category,
      passed: r.passed, failed: r.failed, total: r.total,
      duration_ms: r.duration_ms, status: r.status,
      error: r.error, extra: r.extra,
    })),
    exit_code: hasFailures ? 1 : 0,
  };
}

// ─── 入口 ──────────────────────────────────────────────────────────

if (require.main === module) {
  main()
    .then(result => {
      process.exit(result.exit_code);
    })
    .catch(err => {
      console.error(`\n💥 Runner crashed: ${err.message}`);
      console.error(err.stack);
      process.exit(2);
    });
}

module.exports = { main, SUITES };
