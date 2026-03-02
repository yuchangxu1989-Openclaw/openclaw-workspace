#!/usr/bin/env node
/**
 * AEO检查脚本 - 命令行入口
 * Usage: node check.js <skill-path>
 */

const AEO = require('./aeo.cjs');
const path = require('path');

const skillPath = process.argv[2];

if (!skillPath) {
  console.log('Usage: node check.js <skill-path>');
  console.log('Example: node check.js ../my-skill');
  process.exit(1);
}

const aeo = new AEO();
const results = aeo.check(path.resolve(skillPath));

console.log('\n=== AEO 准入检查结果 ===\n');
console.log(`时间: ${results.timestamp}`);
console.log(`结果: ${results.passed ? '✅ 通过' : '❌ 未通过'}\n`);

console.log('检查项:');
results.checks.forEach(c => {
  const icon = c.passed ? '✅' : '❌';
  console.log(`  ${icon} ${c.name}`);
  if (c.error) console.log(`     错误: ${c.error}`);
});

console.log('\n========================\n');

process.exit(results.passed ? 0 : 1);