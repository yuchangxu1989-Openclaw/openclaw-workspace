#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const REQUIRED_FIELDS = ['id', 'input', 'expected_output', 'category', 'difficulty', 'source', 'multi_turn', 'context', 'execution_chain_steps'];
const ALLOWED_DIFFICULTY = ['C1', 'C2'];
const ALLOWED_SOURCE = ['real_conversation', 'web_search'];
const ALLOWED_CATEGORY = ['纠偏类', '反复未果类', '头痛医头类', '连锁跷跷板类', '自主性缺失类', '全局未对齐类', '交付质量类', '认知错误类'];

function checkRecord(rec) {
  const flags = [];
  const missing = [];

  // 1. Required fields
  for (const f of REQUIRED_FIELDS) {
    if (rec[f] === undefined || rec[f] === null) missing.push(f);
  }

  // 2. difficulty
  if (rec.difficulty !== undefined && !ALLOWED_DIFFICULTY.includes(rec.difficulty)) {
    flags.push(`difficulty="${rec.difficulty}"不合规,只允许C1/C2`);
  }

  // 3. source
  if (rec.source !== undefined && !ALLOWED_SOURCE.includes(rec.source)) {
    flags.push(`source="${rec.source}"不合规`);
  }

  // 4. category
  if (rec.category !== undefined && !ALLOWED_CATEGORY.includes(rec.category)) {
    flags.push(`category="${rec.category}"不在允许列表`);
  }

  // 5. C2 checks
  if (rec.difficulty === 'C2') {
    if (rec.multi_turn !== true) flags.push('C2要求multi_turn=true');
    const steps = rec.execution_chain_steps;
    const stepsOk = Array.isArray(steps) ? steps.length >= 4 : (typeof steps === 'number' && steps >= 4);
    if (!stepsOk) {
      flags.push('C2要求execution_chain_steps数组长度≥4或数值≥4');
    }
  }

  return { flags, missing };
}

function main() {
  const filePath = process.argv[2];
  if (!filePath) { console.error('用法: node v3-eval-clean.js <json文件路径>'); process.exit(1); }

  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) { console.error(`文件不存在: ${abs}`); process.exit(1); }

  // Backup
  const bakPath = abs + '.bak';
  fs.copyFileSync(abs, bakPath);

  const raw = fs.readFileSync(abs, 'utf-8');
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) { console.error('文件内容不是JSON数组'); process.exit(1); }

  const originalCount = data.length;
  let flagged = 0, missingCount = 0, clean = 0;

  for (const rec of data) {
    const { flags, missing } = checkRecord(rec);
    // Only append, never modify existing
    if (flags.length > 0) { rec._flag = flags.join('; '); flagged++; }
    if (missing.length > 0) { rec._missing = missing; missingCount++; }
    if (flags.length === 0 && missing.length === 0) clean++;
  }

  // Write back
  const output = JSON.stringify(data, null, 2);
  fs.writeFileSync(abs, output, 'utf-8');

  // Verify count
  const verify = JSON.parse(fs.readFileSync(abs, 'utf-8'));
  if (verify.length !== originalCount) {
    console.error(`条数不一致! 原${originalCount} 现${verify.length}, 回滚!`);
    fs.copyFileSync(bakPath, abs);
    process.exit(1);
  }

  console.log(`总数: ${originalCount} | 合格: ${clean} | 不合格(flag): ${flagged} | 缺字段(missing): ${missingCount}`);
}

main();
