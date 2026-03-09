#!/usr/bin/env node
// complexity-gate.test.js
const { assessComplexity, canDispatch } = require('./complexity-gate');
const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ ${msg}`); }
}

console.log('assessComplexity tests:');

// Simple task
const r1 = assessComplexity('创建 config.json');
assert(r1.estimated_files >= 1, 'simple task: at least 1 file');
assert(r1.complexity === 'low', 'simple task: low complexity');
assert(!r1.should_split, 'simple task: no split');

// Medium task with multiple files
const r2 = assessComplexity('修改 /src/a.js, 创建 /src/b.js, 读取 /src/c.ts, 更新 /src/d.ts, 编辑 /src/e.js');
assert(r2.estimated_files >= 5, `medium: >=5 files (got ${r2.estimated_files})`);
assert(r2.complexity === 'medium' || r2.complexity === 'high', 'medium: not low');

// Large task that should split
const bigTask = Array.from({length: 12}, (_, i) => `创建 /app/file${i}.ts`).join('\n');
const r3 = assessComplexity(bigTask);
assert(r3.estimated_files >= 10, `large: >=10 files (got ${r3.estimated_files})`);
assert(r3.should_split === true, 'large: should_split=true');
assert(r3.split_suggestion !== null, 'large: has split suggestion');
assert(r3.complexity === 'high', 'large: high complexity');

// Timeout bounds
assert(r1.recommended_timeout >= 60, 'timeout >= 60');
assert(r3.recommended_timeout <= 600, 'timeout <= 600');

// Empty input
const r4 = assessComplexity('');
assert(r4.estimated_files === 1, 'empty: defaults to 1');
assert(r4.complexity === 'low', 'empty: low');

console.log('\ncanDispatch tests:');
assert(canDispatch(10, 19) === 9, 'canDispatch(10,19)=9');
assert(canDispatch(19, 19) === 0, 'canDispatch(19,19)=0');
assert(canDispatch(0) === 19, 'canDispatch(0)=19');
assert(canDispatch(25, 19) === 0, 'canDispatch over max=0');

// canDispatch with task-board.json
const boardPath = path.join(__dirname, 'task-board.json');
const hadBoard = fs.existsSync(boardPath);
fs.writeFileSync(boardPath, JSON.stringify([{status:'running'},{status:'running'},{status:'done'}]));
assert(canDispatch(null, 19) === 17, 'canDispatch from board=17');
if (!hadBoard) fs.unlinkSync(boardPath);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
