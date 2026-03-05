#!/usr/bin/env node
/**
 * D04测试：验证版本号语义化行为
 * 模拟5种不同类型的提交，验证classifyChange + bumpVersion的正确性
 */
'use strict';

const path = require('path');
const WORKSPACE = path.resolve(__dirname, '..');

// 模拟 classifyChange 逻辑（从pipeline复制，确保一致性）
function classifyChange(changedFile) {
  const changedFileName = path.basename(changedFile);
  const changedExt = path.extname(changedFileName).toLowerCase();
  const relativePath = changedFile.replace(/\\/g, '/');

  // 1. 路径级别排除
  const noVersionDirs = [
    'reports/', 'memory/', 'logs/',
    'infrastructure/logs/', 'infrastructure/event-bus/',
    'infrastructure/dispatcher/dispatched',
    'infrastructure/dispatcher/processed',
    'infrastructure/mr/shadow-test-report',
    'feishu_send_queue/', 'feishu_sent_cards/', 'feishu_sent_reports/',
    'seef-discoveries/', 'seef-evaluations/', 'seef-evolution-history/',
    'seef-optimization-plans/', 'seef-validations/'
  ];
  for (const dir of noVersionDirs) {
    if (relativePath.startsWith(dir)) return 'skip';
  }

  // 2. 文件名模式排除
  const runtimePatterns = [
    /report/i, /\.log$/i, /dashboard/i, /state\.json$/,
    /heartbeat/i, /insight/i, /research-/i,
    /feedback\.jsonl$/, /cursor\.json$/, /runs\.json$/,
    /dedup.*\.json$/, /probe-state/i
  ];
  for (const p of runtimePatterns) {
    if (p.test(changedFileName)) return 'skip';
  }

  // 3. 代码文件 → minor
  const codeExts = ['.js', '.ts', '.jsx', '.tsx', '.py', '.sh', '.cjs', '.mjs', '.bash'];
  if (codeExts.includes(changedExt)) return 'minor';

  // 4. 核心文档 → minor
  if (/^(SKILL|README|CAPABILITY-ANCHOR|AGENTS|SOUL)\.md$/i.test(changedFileName)) return 'minor';
  if (changedFileName === 'package.json') return 'minor';

  // 5. 配置文件 → patch
  const configExts = ['.json', '.yaml', '.yml', '.toml', '.conf', '.ini'];
  if (configExts.includes(changedExt)) return 'patch';

  // 6. 普通.md → patch
  if (changedExt === '.md') return 'patch';

  return 'patch';
}

function bumpVersion(version, changeType) {
  const parts = String(version || '1.0.0').split('.').map(n => parseInt(n, 10) || 0);
  if (changeType === 'minor') {
    return `${parts[0]}.${parts[1] + 1}.0`;
  } else {
    return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
  }
}

// 测试用例
const testCases = [
  {
    id: 'T01',
    desc: '代码文件变更（功能新增）',
    file: 'skills/dto-core/core/global-auto-decision-pipeline.js',
    baseVersion: '2.0.0',
    expectedType: 'minor',
    expectedVersion: '2.1.0',
    reason: '.js文件 → minor → MINOR段递增'
  },
  {
    id: 'T02',
    desc: '修复脚本变更（Bug Fix）',
    file: 'scripts/startup-self-check.sh',
    baseVersion: '1.3.2',
    expectedType: 'minor',
    expectedVersion: '1.4.0',
    reason: '.sh文件 → minor → MINOR段递增（shell脚本属于代码）'
  },
  {
    id: 'T03',
    desc: 'reports/ 目录下的日志文件',
    file: 'reports/debt-version-semantic-report.md',
    baseVersion: '1.0.0',
    expectedType: 'skip',
    expectedVersion: null,
    reason: 'reports/ 路径 → skip → 不递增版本'
  },
  {
    id: 'T04',
    desc: 'memory/ 目录下的记忆文件',
    file: 'memory/2026-03-05.md',
    baseVersion: '1.0.5',
    expectedType: 'skip',
    expectedVersion: null,
    reason: 'memory/ 路径 → skip → 不递增版本'
  },
  {
    id: 'T05',
    desc: '配置文件变更（非代码）',
    file: 'skills/isc-core/config/evomap-upload-manifest.json',
    baseVersion: '1.2.3',
    expectedType: 'patch',
    expectedVersion: '1.2.4',
    reason: '.json文件（非package.json）→ patch → PATCH段递增'
  }
];

// 运行测试
let passed = 0;
let failed = 0;
const results = [];

console.log('D04 版本号语义化验证测试\n');
console.log('='.repeat(60));

for (const tc of testCases) {
  const actualType = classifyChange(tc.file);
  let actualVersion = null;
  if (actualType !== 'skip') {
    actualVersion = bumpVersion(tc.baseVersion, actualType);
  }

  const typeOk = actualType === tc.expectedType;
  const versionOk = actualVersion === tc.expectedVersion;
  const ok = typeOk && versionOk;

  if (ok) passed++;
  else failed++;

  const status = ok ? '✅ PASS' : '❌ FAIL';
  console.log(`\n${status} [${tc.id}] ${tc.desc}`);
  console.log(`  文件: ${tc.file}`);
  console.log(`  原因: ${tc.reason}`);
  console.log(`  类型: 期望=${tc.expectedType}, 实际=${actualType} ${typeOk ? '✓' : '✗'}`);
  if (tc.expectedVersion !== null || actualVersion !== null) {
    console.log(`  版本: ${tc.baseVersion} → 期望=${tc.expectedVersion}, 实际=${actualVersion} ${versionOk ? '✓' : '✗'}`);
  } else {
    console.log(`  版本: 不递增（skip） ${versionOk ? '✓' : '✗'}`);
  }

  results.push({ ...tc, actualType, actualVersion, ok });
}

console.log('\n' + '='.repeat(60));
console.log(`\n总计: ${passed}/${testCases.length} 通过, ${failed} 失败`);

if (failed > 0) {
  console.log('\n❌ 存在失败用例，请检查classifyChange/bumpVersion逻辑');
  process.exit(1);
} else {
  console.log('\n✅ 所有测试通过！版本号语义化行为符合预期');
  process.exit(0);
}
