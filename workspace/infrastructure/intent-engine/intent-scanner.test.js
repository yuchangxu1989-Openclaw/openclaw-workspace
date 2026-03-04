/**
 * IntentScanner Tests
 * 
 * 覆盖：
 * 1. Feature flag off → skip
 * 2. Empty input → skip
 * 3. Regex fallback path (mock LLM failure)
 * 4. LLM response parsing
 * 5. Event emission
 * 6. Decision log structure
 * 7. Log persistence
 * 8. Registry fallback
 * 
 * Run: node intent-scanner.test.js
 */

'use strict';

const path = require('path');
const fs = require('fs');

let passed = 0;
let failed = 0;
const results = [];

function assert(condition, name) {
  if (condition) {
    passed++;
    results.push(`  ✅ ${name}`);
  } else {
    failed++;
    results.push(`  ❌ ${name}`);
  }
}

function section(name) {
  results.push(`\n📋 ${name}`);
}

// ============================================================================
// Test Helpers
// ============================================================================

function freshRequire() {
  delete require.cache[require.resolve('./intent-scanner')];
  return require('./intent-scanner').IntentScanner;
}

function createScanner(overrides = {}) {
  const IntentScanner = freshRequire();
  return new IntentScanner({
    registryPath: path.join(__dirname, 'intent-registry.json'),
    logDir: path.join(__dirname, 'logs-test'),
    zhipuKey: 'test-key',
    zhipuUrl: 'https://localhost:1/fake',
    timeout: 1000,
    ...overrides
  });
}

const sampleConversation = [
  { role: 'user', content: '太烦了，这个bug又出现了', timestamp: '2026-03-05T00:00:00Z' },
  { role: 'assistant', content: '我来看看什么情况', timestamp: '2026-03-05T00:00:05Z' },
  { role: 'user', content: 'ISC规则里应该加一条，禁止重复提交', timestamp: '2026-03-05T00:01:00Z' }
];

// ============================================================================
// Tests
// ============================================================================

async function runTests() {
  // ------ Feature Flag ------
  section('Feature Flag');
  
  {
    const origVal = process.env.INTENT_SCANNER_ENABLED;
    process.env.INTENT_SCANNER_ENABLED = 'false';
    const Scanner = freshRequire();
    const scanner = new Scanner();
    const result = await scanner.scan(sampleConversation);
    assert(result.skipped === true, 'skipped when INTENT_SCANNER_ENABLED=false');
    assert(result.reason === 'INTENT_SCANNER_ENABLED=false', 'correct skip reason');
    // Restore
    if (origVal !== undefined) {
      process.env.INTENT_SCANNER_ENABLED = origVal;
    } else {
      delete process.env.INTENT_SCANNER_ENABLED;
    }
  }

  // ------ Empty Input ------
  section('Empty Input');
  
  {
    const scanner = createScanner();
    const r1 = await scanner.scan([]);
    assert(r1.skipped === true, 'skipped on empty array');
    
    const r2 = await scanner.scan(null);
    assert(r2.skipped === true, 'skipped on null');
  }

  // ------ Regex Fallback ------
  section('Regex Fallback (LLM unavailable)');
  
  {
    const scanner = createScanner({ timeout: 500 });
    
    let degradedEvent = null;
    scanner.on('system.capability.degraded', (data) => {
      degradedEvent = data;
    });

    let detectedIntents = [];
    scanner.on('intent.detected', (data) => {
      detectedIntents.push(data);
    });

    const result = await scanner.scan(sampleConversation);
    
    assert(result.method === 'regex_fallback', 'falls back to regex');
    assert(result.skipped === false, 'not skipped');
    assert(result.intents.length > 0, 'found intents via regex');
    
    // Should detect IC1 (emotion: 烦) and IC2 (rule: ISC, 规则)
    const ic1 = result.intents.find(i => i.intent_id === 'IC1');
    const ic2 = result.intents.find(i => i.intent_id === 'IC2');
    assert(ic1 !== undefined, 'detected IC1 (emotion keywords)');
    assert(ic2 !== undefined, 'detected IC2 (rule keywords: ISC/规则)');
    
    // IC1 should have evidence with matched keywords
    if (ic1) {
      assert(ic1.evidence.includes('regex matched'), 'IC1 evidence contains regex match info');
      assert(ic1.confidence > 0 && ic1.confidence <= 1, 'IC1 confidence in valid range');
    }
    
    // IC3-IC5 should NOT appear in intents (unresolved)
    const ic3intent = result.intents.find(i => i.intent_id === 'IC3');
    assert(ic3intent === undefined, 'IC3 not guessed in regex mode');
    
    // Check unresolved in decision logs
    const unresolvedLogs = result.decision_logs.filter(l => l.status === 'unresolved');
    assert(unresolvedLogs.length >= 3, 'IC3-IC5 marked unresolved in logs');
    
    // Degradation event emitted
    assert(degradedEvent !== null, 'emitted system.capability.degraded');
    assert(degradedEvent.component === 'IntentScanner', 'degraded event has correct component');
    assert(degradedEvent.fallback === 'regex', 'degraded event notes regex fallback');
    
    // Intent events emitted
    assert(detectedIntents.length >= 2, 'emitted intent.detected events');
  }

  // ------ Decision Log Structure ------
  section('Decision Log Structure');
  
  {
    const scanner = createScanner({ timeout: 500 });
    const result = await scanner.scan(sampleConversation);
    
    assert(result.decision_logs.length > 0, 'has decision logs');
    const log = result.decision_logs[0];
    assert(typeof log.what === 'string', 'log.what is string');
    assert(typeof log.why === 'string', 'log.why is string');
    assert(typeof log.confidence === 'number', 'log.confidence is number');
    assert(Array.isArray(log.alternatives), 'log.alternatives is array');
    assert(typeof log.method === 'string', 'log.method is string');
    assert(typeof log.timestamp === 'string', 'log.timestamp exists');
  }

  // ------ LLM Response Parsing ------
  section('LLM Response Parsing');

  {
    const scanner = createScanner();
    
    // Valid JSON array
    const r1 = scanner._parseLLMResponse('[{"intent_id":"user.emotion.negative","confidence":0.9,"evidence":"太烦了","alternatives":["user.emotion.frustration"]}]');
    assert(r1.length === 1, 'parses valid JSON array');
    assert(r1[0].intent_id === 'user.emotion.negative', 'correct intent_id');
    assert(r1[0].confidence === 0.9, 'correct confidence');
    assert(r1[0].alternatives[0] === 'user.emotion.frustration', 'correct alternatives');
    
    // JSON wrapped in markdown fences
    const r2 = scanner._parseLLMResponse('```json\n[{"intent_id":"rule.trigger.self_correction","confidence":0.7,"evidence":"x"}]\n```');
    assert(r2.length === 1, 'parses markdown-wrapped JSON');
    assert(r2[0].intent_id === 'rule.trigger.self_correction', 'correct intent from markdown');
    
    // Empty array
    const r3 = scanner._parseLLMResponse('[]');
    assert(r3.length === 0, 'parses empty array');
    
    // Garbage
    const r4 = scanner._parseLLMResponse('not json at all');
    assert(r4.length === 0, 'returns empty on garbage input');
    
    // Null
    const r5 = scanner._parseLLMResponse(null);
    assert(r5.length === 0, 'returns empty on null');
    
    // Confidence clamping
    const r6 = scanner._parseLLMResponse('[{"intent_id":"IC1","confidence":1.5,"evidence":"x"}]');
    assert(r6[0].confidence === 1.0, 'clamps confidence to max 1.0');
    
    const r7 = scanner._parseLLMResponse('[{"intent_id":"IC1","confidence":-0.3,"evidence":"x"}]');
    assert(r7[0].confidence === 0.0, 'clamps confidence to min 0.0');
    
    // Filter invalid entries (missing confidence)
    const r8 = scanner._parseLLMResponse('[{"intent_id":"IC1","confidence":0.5},{"bad":true},{"intent_id":"IC2","confidence":0.3}]');
    assert(r8.length === 2, 'filters out invalid entries');
  }

  // ------ Log Persistence ------
  section('Log Persistence');
  
  {
    const testLogDir = path.join(__dirname, 'logs-test');
    // Clean up first
    try {
      const files = fs.readdirSync(testLogDir);
      for (const f of files) fs.unlinkSync(path.join(testLogDir, f));
      fs.rmdirSync(testLogDir);
    } catch (e) {}

    const scanner = createScanner({ logDir: testLogDir, timeout: 500 });
    await scanner.scan(sampleConversation);
    
    assert(fs.existsSync(testLogDir), 'log directory created');
    const logFiles = fs.readdirSync(testLogDir);
    assert(logFiles.length > 0, 'log file written');
    
    const logContent = fs.readFileSync(path.join(testLogDir, logFiles[0]), 'utf8');
    const firstLine = JSON.parse(logContent.split('\n')[0]);
    assert(firstLine.what !== undefined, 'log entry has what field');
    assert(firstLine.method !== undefined, 'log entry has method field');
    
    // Cleanup
    try {
      for (const f of logFiles) fs.unlinkSync(path.join(testLogDir, f));
      fs.rmdirSync(testLogDir);
    } catch (e) {}
  }

  // ------ Registry Fallback ------
  section('Registry Fallback (missing file)');
  
  {
    const scanner = createScanner({ registryPath: '/nonexistent/path.json', timeout: 500 });
    const result = await scanner.scan([{ role: 'user', content: '太烦了' }]);
    assert(result.method === 'regex_fallback', 'works with fallback registry');
    assert(result.intents.length > 0, 'still detects IC1 with fallback registry');
  }

  // ------ Category ID extraction ------
  section('Category ID Extraction');

  {
    const scanner = createScanner();
    
    // v4 format (map)
    const ids1 = scanner._getCategoryIds({ categories: { IC1: {}, IC2: {}, IC3: {} } });
    assert(ids1.length === 3 && ids1.includes('IC1'), 'extracts from v4 map format');
    
    // Legacy array format
    const ids2 = scanner._getCategoryIds({ categories: [{ id: 'IC1' }, { id: 'IC2' }] });
    assert(ids2.length === 2 && ids2.includes('IC1'), 'extracts from legacy array format');
    
    // Null/undefined
    const ids3 = scanner._getCategoryIds(null);
    assert(ids3.length === 5 && ids3.includes('IC1'), 'defaults to IC1-IC5 on null');
  }

  // ------ Print Results ------
  console.log('\n' + '='.repeat(60));
  console.log('IntentScanner Test Results');
  console.log('='.repeat(60));
  results.forEach(r => console.log(r));
  console.log('\n' + '='.repeat(60));
  console.log(`Total: ${passed + failed} | ✅ Passed: ${passed} | ❌ Failed: ${failed}`);
  console.log('='.repeat(60));
  
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
