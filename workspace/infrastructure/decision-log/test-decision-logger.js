'use strict';

const fs = require('fs');
const path = require('path');
const { log, query, summarize, rotate, LOG_FILE } = require('./decision-logger');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.error(`  ❌ ${msg}`); }
}

function cleanup() {
  // Remove test artifacts
  const dir = path.dirname(LOG_FILE);
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir);
    for (const f of files) {
      if (f.endsWith('.jsonl')) {
        try { fs.unlinkSync(path.join(dir, f)); } catch (_) {}
      }
    }
  }
}

// ─── Test Suite ───

console.log('\n🧪 Decision Logger Test Suite\n');

// Setup
cleanup();

// --- Test 1: log() basic ---
console.log('📋 log() - basic recording');
{
  const entry = {
    phase: 'sensing',
    component: 'intent-classifier',
    what: 'Classified user intent as task_create',
    why: 'Keyword match on "create" + noun pattern',
    confidence: 0.85,
    alternatives: [
      { option: 'task_query', reason_rejected: 'No question markers detected' },
    ],
    input_summary: 'User said: "Create a new task for review"',
    output_summary: 'intent=task_create, confidence=0.85',
    decision_method: 'llm',
  };
  const result = log(entry);
  assert(result.id && result.id.length > 0, 'Auto-generates id');
  assert(result.timestamp && result.timestamp.includes('T'), 'Auto-generates timestamp');
  assert(result.phase === 'sensing', 'Phase preserved');
  assert(result.confidence === 0.85, 'Confidence preserved');
  assert(fs.existsSync(LOG_FILE), 'Log file created');
}

// --- Test 2: log() validation ---
console.log('\n📋 log() - validation');
{
  let threw = false;
  try {
    log({ phase: 'invalid_phase' });
  } catch (e) {
    threw = true;
    assert(e.message.includes('phase'), 'Rejects invalid phase');
  }
  assert(threw, 'Throws on invalid phase');

  threw = false;
  try {
    log({ confidence: 1.5 });
  } catch (e) {
    threw = true;
    assert(e.message.includes('confidence'), 'Rejects out-of-range confidence');
  }
  assert(threw, 'Throws on invalid confidence');

  threw = false;
  try {
    log({ decision_method: 'magic' });
  } catch (e) {
    threw = true;
  }
  assert(threw, 'Throws on invalid decision_method');
}

// --- Test 3: log() with defaults ---
console.log('\n📋 log() - defaults');
{
  const result = log({ what: 'Minimal entry' });
  assert(result.phase === 'execution', 'Default phase is execution');
  assert(result.component === 'unknown', 'Default component is unknown');
  assert(result.decision_method === 'manual', 'Default method is manual');
}

// --- Test 4: Multiple entries for query tests ---
console.log('\n📋 Preparing multi-entry data...');
cleanup();
{
  const now = Date.now();
  log({
    timestamp: new Date(now - 3600000).toISOString(), // 1hr ago
    phase: 'sensing',
    component: 'router',
    what: 'Route to handler A',
    why: 'Pattern match',
    confidence: 0.9,
    decision_method: 'regex',
  });
  log({
    timestamp: new Date(now - 1800000).toISOString(), // 30min ago
    phase: 'cognition',
    component: 'planner',
    what: 'Choose strategy X',
    why: 'Higher expected value',
    confidence: 0.7,
    decision_method: 'llm',
  });
  log({
    timestamp: new Date(now - 600000).toISOString(), // 10min ago
    phase: 'execution',
    component: 'executor',
    what: 'Execute task via API',
    why: 'API available',
    confidence: 0.95,
    decision_method: 'rule_match',
  });
  log({
    timestamp: new Date(now - 300000).toISOString(), // 5min ago
    phase: 'sensing',
    component: 'router',
    what: 'Route to handler B',
    why: 'Fallback triggered',
    confidence: 0.3, // degradation
    decision_method: 'regex',
  });
  assert(true, '4 entries logged');
}

// --- Test 5: query() ---
console.log('\n📋 query() - filtering');
{
  const all = query();
  assert(all.length === 4, `All records returned (got ${all.length})`);
  assert(new Date(all[0].timestamp) >= new Date(all[1].timestamp), 'Newest first ordering');

  const sensing = query({ phase: 'sensing' });
  assert(sensing.length === 2, `Phase filter: sensing=${sensing.length}`);

  const router = query({ component: 'router' });
  assert(router.length === 2, `Component filter: router=${router.length}`);

  const limited = query({ limit: 2 });
  assert(limited.length === 2, `Limit works: got ${limited.length}`);

  const thirtyMinAgo = new Date(Date.now() - 1800000).toISOString();
  const recent = query({ since: thirtyMinAgo });
  assert(recent.length >= 2, `Since filter: ${recent.length} records in last 30min`);

  const combined = query({ phase: 'sensing', component: 'router' });
  assert(combined.length === 2, `Combined filter: ${combined.length}`);
}

// --- Test 6: summarize() ---
console.log('\n📋 summarize() - statistics');
{
  const summary = summarize();
  assert(summary.total === 4, `Total: ${summary.total}`);
  assert(summary.by_phase.sensing && summary.by_phase.sensing.count === 2, 'Phase sensing count');
  assert(summary.by_phase.cognition && summary.by_phase.cognition.count === 1, 'Phase cognition count');
  assert(summary.by_phase.execution && summary.by_phase.execution.count === 1, 'Phase execution count');
  assert(summary.avg_confidence !== null && summary.avg_confidence > 0, `Avg confidence: ${summary.avg_confidence}`);
  assert(summary.degradation_count === 1, `Degradation count: ${summary.degradation_count}`);
  assert(summary.by_method.regex === 2, 'Method stats: regex=2');
  assert(summary.by_method.llm === 1, 'Method stats: llm=1');
  assert(summary.by_component.router === 2, 'Component stats: router=2');
}

// --- Test 7: summarize() with time range ---
console.log('\n📋 summarize() - time range filter');
{
  const twentyMinAgo = new Date(Date.now() - 1200000).toISOString();
  const summary = summarize({ since: twentyMinAgo });
  assert(summary.total === 2, `Time-filtered total: ${summary.total}`);
}

// --- Test 8: summarize() on empty ---
console.log('\n📋 summarize() - empty state');
{
  cleanup();
  const summary = summarize();
  assert(summary.total === 0, 'Empty summary total=0');
  assert(summary.avg_confidence === null, 'Empty summary null confidence');
}

// --- Test 9: rotate() ---
console.log('\n📋 rotate() - log rotation');
{
  cleanup();
  // Write enough data to test rotation
  for (let i = 0; i < 100; i++) {
    log({ phase: 'execution', component: 'test', what: `Decision ${i}`, confidence: 0.5 });
  }
  assert(fs.existsSync(LOG_FILE), 'Log file exists before rotate');

  rotate();
  assert(!fs.existsSync(LOG_FILE), 'Active log file renamed after rotate');

  const dir = path.dirname(LOG_FILE);
  const rotated = fs.readdirSync(dir).filter(f => f.startsWith('decisions.') && f !== 'decisions.jsonl');
  assert(rotated.length >= 1, `Rotated file created: ${rotated[0]}`);
}

// --- Test 10: auto-rotate on size ---
console.log('\n📋 rotate() - auto-rotate on size');
{
  cleanup();
  // Create a file just over 10MB to trigger auto-rotate
  const bigLine = JSON.stringify({
    id: 'x', timestamp: new Date().toISOString(), phase: 'execution',
    component: 'test', what: 'x'.repeat(10000), why: '', confidence: 0.5,
    alternatives: [], input_summary: '', output_summary: '', decision_method: 'manual',
  }) + '\n';
  const needed = Math.ceil((10 * 1024 * 1024) / bigLine.length) + 1;
  fs.writeFileSync(LOG_FILE, bigLine.repeat(needed), 'utf8');

  const sizeBefore = fs.statSync(LOG_FILE).size;
  assert(sizeBefore >= 10 * 1024 * 1024, `File is ${(sizeBefore / 1024 / 1024).toFixed(1)}MB (>= 10MB)`);

  // Next log() should trigger auto-rotate
  log({ phase: 'sensing', component: 'test', what: 'Trigger auto-rotate' });

  // The old big file should be rotated, new file should be small
  const sizeAfter = fs.statSync(LOG_FILE).size;
  assert(sizeAfter < 1024 * 1024, `New file is small: ${sizeAfter} bytes`);
}

// --- Cleanup ---
cleanup();

// --- Results ---
console.log(`\n${'─'.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('❌ SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('✅ ALL TESTS PASSED');
}
