#!/usr/bin/env node
'use strict';

/**
 * Condition 1: IntentScanner LLM Path Smoke Test
 * 5 real natural language samples → LLM intent classification
 */

const path = require('path');

// Mock dependencies that IntentScanner needs
const mockModules = {};
const originalRequire = module.constructor.prototype.require;

// Pre-create logs dir
const fs = require('fs');
const logDir = path.join(__dirname, '../infrastructure/intent-engine/logs');
fs.mkdirSync(logDir, { recursive: true });

// Patch require for missing optional deps
const Module = require('module');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, ...rest) {
  try {
    return origResolve.call(this, request, parent, ...rest);
  } catch (e) {
    if (request.includes('observability/metrics') || request.includes('observability/alerts')) {
      return request; // will return null from require
    }
    throw e;
  }
};

const { IntentScanner } = require('../infrastructure/intent-engine/intent-scanner');

const SAMPLES = [
  { content: "帮我分析一下这篇论文的方法论有没有漏洞", role: "user" },
  { content: "这个bug为什么反复出现", role: "user" },
  { content: "cursor和我们的技能编排有什么区别", role: "user" },
  { content: "最近心情不太好", role: "user" },
  { content: "帮我创建一个天气查询技能", role: "user" },
];

async function main() {
  const scanner = new IntentScanner();
  const results = [];

  console.log('═══ IntentScanner LLM Smoke Test ═══\n');
  console.log(`API Key: ${scanner._zhipuKey ? scanner._zhipuKey.slice(0, 8) + '...' : 'MISSING'}`);
  console.log(`Model: ${scanner._zhipuModel}`);
  console.log(`URL: ${scanner._zhipuUrl}\n`);

  for (let i = 0; i < SAMPLES.length; i++) {
    const sample = SAMPLES[i];
    const t0 = Date.now();
    let result;
    let error = null;

    try {
      result = await scanner.scan([sample]);
    } catch (err) {
      error = err.message;
      result = { intents: [], method: 'error' };
    }

    const elapsed = Date.now() - t0;
    const entry = {
      index: i + 1,
      input: sample.content,
      method: result.method || 'unknown',
      intents: result.intents || [],
      elapsed_ms: elapsed,
      error: error,
    };
    results.push(entry);

    const status = error ? '❌' : (result.method === 'llm' ? '✅' : '⚠️');
    console.log(`${status} Sample ${i + 1}: "${sample.content}"`);
    console.log(`   Method: ${entry.method} | Intents: ${entry.intents.length} | Time: ${elapsed}ms`);
    if (entry.intents.length > 0) {
      for (const intent of entry.intents) {
        console.log(`   → ${intent.intent_id} (confidence: ${intent.confidence}, evidence: "${(intent.evidence || '').slice(0, 60)}")`);
      }
    }
    if (error) console.log(`   Error: ${error}`);
    console.log();
  }

  // Summary
  const llmCount = results.filter(r => r.method === 'llm').length;
  const regexCount = results.filter(r => r.method === 'pending_replacement').length;
  const errorCount = results.filter(r => r.error).length;

  console.log('═══ Summary ═══');
  console.log(`LLM path: ${llmCount}/5`);
  console.log(`Regex fallback: ${regexCount}/5`);
  console.log(`Errors: ${errorCount}/5`);
  console.log(`Avg latency: ${Math.round(results.reduce((s, r) => s + r.elapsed_ms, 0) / results.length)}ms`);

  // Output JSON for report
  const outputPath = path.join(__dirname, '../reports/llm-smoke-test-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to ${outputPath}`);

  return results;
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
