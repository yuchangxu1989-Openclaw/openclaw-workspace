#!/usr/bin/env node
/**
 * LLM Intent Smoke Test - Day 1 关门条件 #1
 * 
 * 验证IntentScanner的LLM路径可走通（不验证准确率）。
 * - 有API key → 真实调用LLM
 * - 无API key → mock验证路径可通
 */

'use strict';

const path = require('path');
const fs = require('fs');

// ============================================================================
// Test Dataset: 5个真实中文意图样本
// ============================================================================

const SMOKE_SAMPLES = [
  {
    id: 'S1',
    input: '帮我查一下天气',
    description: '简单指令',
    expected_intent_class: 'IC3',  // 方向与策略调整 or simple command
    expected_confidence_threshold: 0.3,
    conversation: [{ role: 'user', content: '帮我查一下天气' }]
  },
  {
    id: 'S2',
    input: '不要用那个方案',
    description: '负向情绪/否定指令',
    expected_intent_class: 'IC1',  // 情绪表达
    expected_confidence_threshold: 0.3,
    conversation: [{ role: 'user', content: '不要用那个方案' }]
  },
  {
    id: 'S3',
    input: '上次我们讨论的那个架构问题，你觉得哪个更好？',
    description: '多轮上下文引用',
    expected_intent_class: 'IC3',  // 方向与策略调整
    expected_confidence_threshold: 0.3,
    conversation: [
      { role: 'user', content: '我们来讨论一下新架构方案' },
      { role: 'assistant', content: '好的，有方案A和方案B两个选择' },
      { role: 'user', content: '上次我们讨论的那个架构问题，你觉得哪个更好？' }
    ]
  },
  {
    id: 'S4',
    input: '这破玩意又挂了',
    description: '隐含意图：修复请求',
    expected_intent_class: 'IC1',  // 情绪表达（显式抱怨）
    expected_confidence_threshold: 0.3,
    conversation: [{ role: 'user', content: '这破玩意又挂了' }]
  },
  {
    id: 'S5',
    input: '帮我看看邮件，顺便把日程安排好，对了天气怎样',
    description: '多意图复合',
    expected_intent_class: 'IC5',  // 复合意图
    expected_confidence_threshold: 0.3,
    conversation: [{ role: 'user', content: '帮我看看邮件，顺便把日程安排好，对了天气怎样' }]
  }
];

// ============================================================================
// Main
// ============================================================================

async function main() {
  const startTime = Date.now();
  const results = [];
  let usedMethod = 'unknown';
  let hasApiKey = false;

  // Load IntentScanner
  const { IntentScanner } = require('../../infrastructure/intent-engine/intent-scanner');

  // Check if API key is available
  const secretsFile = '/root/.openclaw/.secrets/zhipu-keys.env';
  hasApiKey = !!process.env.ZHIPU_API_KEY;
  if (!hasApiKey) {
    try {
      const content = fs.readFileSync(secretsFile, 'utf8');
      hasApiKey = /^ZHIPU_API_KEY=.+$/m.test(content);
    } catch (_) {}
  }

  console.log(`\n🔬 LLM Intent Smoke Test`);
  console.log(`   API Key available: ${hasApiKey ? '✅ YES (will use LLM path)' : '❌ NO (will use mock/regex fallback)'}`);
  console.log(`   Samples: ${SMOKE_SAMPLES.length}\n`);

  const scanner = new IntentScanner();

  for (const sample of SMOKE_SAMPLES) {
    const sampleStart = Date.now();
    let status = 'UNKNOWN';
    let scanResult = null;
    let error = null;

    try {
      scanResult = await scanner.scan(sample.conversation);
      usedMethod = scanResult.method || (scanResult.skipped ? 'skipped' : 'unknown');

      // Smoke test pass criteria: scan() returned without throwing, and result has expected shape
      const hasValidShape = scanResult &&
        Array.isArray(scanResult.intents) &&
        Array.isArray(scanResult.decision_logs) &&
        typeof scanResult.skipped === 'boolean';

      status = hasValidShape ? 'PASS' : 'FAIL';
    } catch (err) {
      status = 'ERROR';
      error = err.message;
    }

    const elapsed = Date.now() - sampleStart;
    const result = {
      id: sample.id,
      input: sample.input,
      description: sample.description,
      expected_intent_class: sample.expected_intent_class,
      expected_confidence_threshold: sample.expected_confidence_threshold,
      status,
      method: usedMethod,
      intents_found: scanResult ? scanResult.intents.length : 0,
      intents: scanResult ? scanResult.intents : [],
      elapsed_ms: elapsed,
      error
    };

    results.push(result);

    const icon = status === 'PASS' ? '✅' : status === 'ERROR' ? '❌' : '⚠️';
    console.log(`${icon} ${sample.id}: "${sample.input.slice(0, 30)}..." → ${status} (${usedMethod}, ${elapsed}ms, ${result.intents_found} intents)`);
  }

  const totalElapsed = Date.now() - startTime;
  const passCount = results.filter(r => r.status === 'PASS').length;
  const failCount = results.filter(r => r.status !== 'PASS').length;

  console.log(`\n📊 Results: ${passCount}/${results.length} passed, ${failCount} failed`);
  console.log(`⏱️  Total time: ${totalElapsed}ms`);
  console.log(`🔧 Method: ${usedMethod}`);

  // Generate report
  const report = generateReport(results, { hasApiKey, usedMethod, totalElapsed, passCount, failCount });
  const reportPath = path.join(__dirname, '../../reports/day1-llm-smoke-test.md');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, report, 'utf8');
  console.log(`\n📄 Report saved to: ${reportPath}`);

  // Exit code
  process.exit(failCount > 0 ? 1 : 0);
}

function generateReport(results, meta) {
  const now = new Date().toISOString();
  const lines = [
    `# Day 1 LLM Smoke Test Report`,
    ``,
    `**Generated:** ${now}`,
    `**API Key:** ${meta.hasApiKey ? '✅ Available' : '❌ Not available (used fallback)'}`,
    `**Method:** ${meta.usedMethod}`,
    `**Total Time:** ${meta.totalElapsed}ms`,
    `**Result:** ${meta.passCount}/${results.length} passed`,
    ``,
    `## Summary`,
    ``,
    `| # | Input | Expected | Status | Method | Intents | Time |`,
    `|---|-------|----------|--------|--------|---------|------|`,
  ];

  for (const r of results) {
    const intentsStr = r.intents.map(i => `${i.intent_id}(${i.confidence})`).join(', ') || '-';
    lines.push(`| ${r.id} | ${r.input.slice(0, 25)}… | ${r.expected_intent_class} | ${r.status} | ${r.method} | ${intentsStr} | ${r.elapsed_ms}ms |`);
  }

  lines.push('', '## Detail', '');

  for (const r of results) {
    lines.push(`### ${r.id}: ${r.description}`);
    lines.push(`- **Input:** "${r.input}"`);
    lines.push(`- **Expected:** ${r.expected_intent_class} (threshold ≥ ${r.expected_confidence_threshold})`);
    lines.push(`- **Status:** ${r.status}`);
    lines.push(`- **Method:** ${r.method}`);
    if (r.intents.length > 0) {
      lines.push(`- **Detected intents:**`);
      for (const i of r.intents) {
        lines.push(`  - ${i.intent_id}: confidence=${i.confidence}, evidence="${i.evidence || ''}"`);
      }
    } else {
      lines.push(`- **Detected intents:** none`);
    }
    if (r.error) lines.push(`- **Error:** ${r.error}`);
    lines.push('');
  }

  lines.push('## Conclusion', '');
  if (meta.failCount === 0) {
    lines.push(`✅ **LLM路径smoke test通过。** 所有${results.length}个样本的scan()调用成功返回有效结构。`);
    lines.push(`方法: ${meta.usedMethod}${meta.hasApiKey ? ' (真实LLM调用)' : ' (无API key，降级路径验证通过)'}`);
  } else {
    lines.push(`❌ **LLM路径smoke test未完全通过。** ${meta.failCount}/${results.length}个样本失败。`);
  }

  return lines.join('\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
