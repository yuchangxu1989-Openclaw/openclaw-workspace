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
  const dir = path.dirname(LOG_FILE);
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith('decisions.') && f.endsWith('.jsonl')) {
      fs.unlinkSync(path.join(dir, f));
    }
  }
  if (fs.existsSync(LOG_FILE)) fs.unlinkSync(LOG_FILE);
}

// ─── Test 1: Basic log and query ───
console.log('Test 1: Basic log and query');
cleanup();
const r1 = log({ what: 'test1', phase: 'sensing', confidence: 0.9 });
assert(r1.id && r1.timestamp, 'log returns record with id and timestamp');
const results = query({ limit: 1 });
assert(results.length === 1 && results[0].what === 'test1', 'query returns logged entry');

// ─── Test 2: Validation ───
console.log('Test 2: Validation');
let threw = false;
try { log({ phase: 'invalid_phase' }); } catch (e) { threw = true; }
assert(threw, 'invalid phase throws');

// ─── Test 3: Rotate basic ───
console.log('Test 3: Rotate basic');
cleanup();
log({ what: 'before-rotate' });
assert(fs.existsSync(LOG_FILE), 'log file exists before rotate');
rotate();
assert(!fs.existsSync(LOG_FILE) || fs.readFileSync(LOG_FILE, 'utf8').trim() === '', 'log file rotated away or empty');
const rotated = fs.readdirSync(path.dirname(LOG_FILE)).filter(f => f.startsWith('decisions.') && f !== 'decisions.jsonl');
assert(rotated.length >= 1, 'rotated file created');

// ─── Test 4: Concurrent write during rotate (atomic rotate fix) ───
console.log('Test 4: Concurrent write + rotate (no data loss)');
cleanup();

// Write some initial entries
for (let i = 0; i < 5; i++) {
  log({ what: `pre-rotate-${i}`, phase: 'execution', confidence: 0.8 });
}

// Simulate: during rotate, we also call log() 
// Since Node.js is single-threaded, we test the buffer mechanism directly
// by accessing the internal state through the module's exported rotate + log

// The fix ensures log() during _rotating=true buffers entries.
// We test by: calling rotate which sets _rotating, then immediately after
// renameSync but before flush, entries written via log() go to buffer.
// In single-threaded JS, the actual interleaving happens when auto-rotate 
// triggers inside log(). Let's test the mechanism works:

// Step 1: Write entries, then rotate, then write more, query all
rotate(); // rotate the 5 pre-entries away

// Write post-rotate entries  
for (let i = 0; i < 3; i++) {
  log({ what: `post-rotate-${i}`, phase: 'sensing', confidence: 0.7 });
}

const postResults = query({});
assert(postResults.length === 3, `post-rotate query returns 3 entries (got ${postResults.length})`);

// Step 2: Verify the buffer mechanism works by monkey-patching
// We'll override renameSync temporarily to simulate log() calls during rotate
const origRename = fs.renameSync;
const logsDuringRotate = [];

cleanup();
// Write enough to have something to rotate
log({ what: 'will-rotate', phase: 'execution' });

// Patch renameSync to also call log() during the rename (simulating concurrent access)
fs.renameSync = function(...args) {
  origRename.apply(fs, args);
  // Simulate a "concurrent" log call happening during rotate
  // This would previously fail or lose data
  const r = log({ what: 'during-rotate', phase: 'execution', confidence: 0.5 });
  logsDuringRotate.push(r);
};

rotate();
fs.renameSync = origRename; // restore

// The "during-rotate" entry should be in the new log file (buffered and flushed)
const allAfter = query({});
const duringEntry = allAfter.find(r => r.what === 'during-rotate');
assert(duringEntry !== undefined, 'entry written during rotate was NOT lost (buffered + flushed)');

// ─── Test 5: Summarize ───
console.log('Test 5: Summarize');
cleanup();
log({ what: 'a', phase: 'sensing', confidence: 0.9, decision_method: 'llm', component: 'test' });
log({ what: 'b', phase: 'execution', confidence: 0.3, decision_method: 'rule_match', component: 'test' });
const summary = summarize();
assert(summary.total === 2, 'summarize total = 2');
assert(summary.degradation_count === 1, 'degradation count = 1 (confidence < 0.5)');

// ─── Results ───
console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
cleanup();
process.exit(failed > 0 ? 1 : 0);
