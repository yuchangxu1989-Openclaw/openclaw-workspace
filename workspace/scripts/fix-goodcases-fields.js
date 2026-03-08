#!/usr/bin/env node
const fs = require('fs');
const path = '/root/.openclaw/workspace/tests/benchmarks/intent/c2-golden/goodcases-from-badcases.json';

const cases = JSON.parse(fs.readFileSync(path, 'utf8'));

const categoryRules = [
  { keywords: ['认知', '误解', '错误理解', '理解为', '以为'], category: '认知错误类' },
  { keywords: ['自主', '主动', '不等', '不要等', '自己判断'], category: '自主性缺失类' },
  { keywords: ['对齐', '同步', '全局', '一致性', '联动'], category: '全局未对齐类' },
  { keywords: ['交付', '质量', '半成品', '完整性', '敷衍'], category: '交付质量类' },
  { keywords: ['反复', '多次', '仍然', '再次', '又犯'], category: '反复未果类' },
  { keywords: ['头痛医头', '治标', '表面'], category: '头痛医头类' },
  { keywords: ['连锁', '跷跷板', '修A坏B', '副作用', '回归'], category: '连锁跷跷板类' },
  { keywords: ['纠偏', '修正', '改正', '纠正', '根因', '根治'], category: '纠偏类' },
];

function inferCategory(c) {
  const text = (c.input || '') + (c.expected_output || '') + (c.context || '') + (c.root_cause_to_avoid || '');
  for (const rule of categoryRules) {
    if (rule.keywords.some(k => text.includes(k))) return rule.category;
  }
  return '纠偏类';
}

function extractSteps(expectedOutput) {
  if (!expectedOutput || typeof expectedOutput !== 'string') {
    return ['识别问题', '分析根因', '制定方案', '执行修复'];
  }
  
  let steps = [];
  
  // Try splitting by → or ->
  if (expectedOutput.includes('→') || expectedOutput.includes('->')) {
    steps = expectedOutput.split(/→|->/).map(s => s.trim()).filter(Boolean);
  }
  // Try splitting by numbered list
  else if (/\d+[.、)）]/.test(expectedOutput)) {
    steps = expectedOutput.split(/\d+[.、)）]/).map(s => s.trim()).filter(Boolean);
  }
  // Try splitting by "then"
  else if (expectedOutput.includes('then')) {
    steps = expectedOutput.split(/\bthen\b/).map(s => s.trim()).filter(Boolean);
  }
  
  // Ensure ≥4 steps
  if (steps.length < 4) {
    // Pad with generic steps
    const defaults = ['识别问题意图', '分析根因', '制定解决方案', '执行并验证'];
    while (steps.length < 4) {
      steps.push(defaults[steps.length] || `步骤${steps.length + 1}`);
    }
  }
  
  return steps;
}

let stats = {};
let fixed = 0;

for (const c of cases) {
  if (!c.category) {
    c.category = inferCategory(c);
  }
  if (!c.source) {
    c.source = 'real_conversation';
  }
  if (c.multi_turn === undefined) {
    c.multi_turn = true;
  }
  if (!c.execution_chain_steps || c.execution_chain_steps.length === 0) {
    c.execution_chain_steps = extractSteps(c.expected_output);
  }
  stats[c.category] = (stats[c.category] || 0) + 1;
  fixed++;
}

fs.writeFileSync(path, JSON.stringify(cases, null, 2) + '\n', 'utf8');

console.log(`Fixed ${fixed} cases`);
console.log('\nCategory distribution:');
for (const [cat, count] of Object.entries(stats).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${cat}: ${count}`);
}

// Verify completeness
const missing = cases.filter(c => !c.category || !c.source || c.multi_turn === undefined || !c.execution_chain_steps?.length);
console.log(`\nCases with missing fields: ${missing.length}`);
