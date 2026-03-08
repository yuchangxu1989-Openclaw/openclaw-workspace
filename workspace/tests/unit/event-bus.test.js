'use strict';

/**
 * Unit Tests for Event Bus
 * 
 * Run: node test-bus.js
 * 
 * Pure Node.js — zero test framework dependency.
 */

const fs = require('fs');
const path = require('path');

// We need to test in an isolated directory to avoid polluting the real bus
const TEST_DIR = path.join(__dirname, '.test-sandbox');
const ORIG_BUS_PATH = path.join(__dirname, 'bus.js');

// ─── Test Harness ────────────────────────────────────────────────

let passed = 0;
let failed = 0;
let total = 0;

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertDeepEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}:\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  }
}

async function test(name, fn) {
  total++;
  try {
    // Clean sandbox before each test
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true });
    }
    fs.mkdirSync(TEST_DIR, { recursive: true });

    // Create a patched bus that uses the test directory
    const busCode = fs.readFileSync(ORIG_BUS_PATH, 'utf8');
    const patchedCode = busCode.replace(
      "const BASE_DIR = __dirname;",
      `const BASE_DIR = ${JSON.stringify(TEST_DIR)};`
    );
    const patchedPath = path.join(TEST_DIR, 'bus-test.js');
    fs.writeFileSync(patchedPath, patchedCode);

    // Clear require cache
    delete require.cache[patchedPath];
    const bus = require(patchedPath);

    await fn(bus);
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ❌ ${name}`);
    console.log(`     ${err.message}`);
  }
}

// ─── Tests ───────────────────────────────────────────────────────

async function runTests() {
  console.log('\n🧪 Event Bus Unit Tests\n');

  // ─── emit tests ──────────────────────────────────────────────

  await test('emit: creates event with correct structure', (bus) => {
    const evt = bus.emit('isc.rule.created', { rule_id: 'N001' }, 'isc-core');
    
    assert(evt.id.startsWith('evt_'), 'ID should start with evt_');
    assertEqual(evt.type, 'isc.rule.created', 'type');
    assertEqual(evt.source, 'isc-core', 'source');
    assertEqual(evt.payload.rule_id, 'N001', 'payload.rule_id');
    assert(typeof evt.timestamp === 'number', 'timestamp should be a number');
    assertDeepEqual(evt.consumed_by, [], 'consumed_by should be empty');
  });

  await test('emit: persists event to JSONL file', (bus) => {
    bus.emit('test.event', { key: 'value' }, 'test');
    
    const content = fs.readFileSync(bus._EVENTS_FILE, 'utf8').trim();
    const parsed = JSON.parse(content);
    assertEqual(parsed.type, 'test.event', 'persisted type');
    assertEqual(parsed.payload.key, 'value', 'persisted payload');
  });

  await test('emit: appends multiple events', (bus) => {
    bus.emit('event.one', {}, 'src1');
    bus.emit('event.two', {}, 'src2');
    bus.emit('event.three', {}, 'src3');
    
    const lines = fs.readFileSync(bus._EVENTS_FILE, 'utf8').trim().split('\n');
    assertEqual(lines.length, 3, 'should have 3 lines');
  });

  await test('emit: throws on missing type', (bus) => {
    try {
      bus.emit(null, {}, 'src');
      assert(false, 'should have thrown');
    } catch (err) {
      assert(err.message.includes('type is required'), 'error message');
    }
  });

  await test('emit: defaults source to "unknown"', (bus) => {
    const evt = bus.emit('test.default', { x: 1 });
    assertEqual(evt.source, 'unknown', 'default source');
  });

  // ─── consume tests ──────────────────────────────────────────

  await test('consume: returns all unconsumed events', (bus) => {
    bus.emit('a.one', {}, 'src');
    bus.emit('a.two', {}, 'src');
    bus.emit('a.three', {}, 'src');
    
    const events = bus.consume('consumer-1');
    assertEqual(events.length, 3, 'should return 3 events');
  });

  await test('consume: filters by type pattern', (bus) => {
    bus.emit('isc.rule.created', {}, 'isc');
    bus.emit('isc.rule.updated', {}, 'isc');
    bus.emit('dto.sync.requested', {}, 'dto');
    bus.emit('seef.skill.evaluated', {}, 'seef');
    
    const iscEvents = bus.consume('c1', { types: ['isc.rule.*'] });
    assertEqual(iscEvents.length, 2, 'should match 2 ISC events');
    
    const dtoEvents = bus.consume('c2', { types: ['dto.sync.*'] });
    assertEqual(dtoEvents.length, 1, 'should match 1 本地任务编排 event');
  });

  await test('consume: respects limit', (bus) => {
    for (let i = 0; i < 10; i++) {
      bus.emit('test.event', { i }, 'src');
    }
    
    const events = bus.consume('c1', { limit: 3 });
    assertEqual(events.length, 3, 'should return only 3');
  });

  await test('consume: returns empty after all acked', (bus) => {
    const e1 = bus.emit('test.one', {}, 'src');
    const e2 = bus.emit('test.two', {}, 'src');
    
    bus.ack('c1', e1.id);
    bus.ack('c1', e2.id);
    
    const events = bus.consume('c1');
    assertEqual(events.length, 0, 'should be empty after ack');
  });

  await test('consume: different consumers see same events', (bus) => {
    bus.emit('shared.event', {}, 'src');
    
    const evtsC1 = bus.consume('consumer-A');
    const evtsC2 = bus.consume('consumer-B');
    
    assertEqual(evtsC1.length, 1, 'consumer-A sees 1');
    assertEqual(evtsC2.length, 1, 'consumer-B sees 1');
    assertEqual(evtsC1[0].id, evtsC2[0].id, 'same event');
  });

  await test('consume: throws on missing consumerId', (bus) => {
    try {
      bus.consume();
      assert(false, 'should have thrown');
    } catch (err) {
      assert(err.message.includes('consumerId is required'), 'error message');
    }
  });

  // ─── ack tests ──────────────────────────────────────────────

  await test('ack: marks event as consumed', (bus) => {
    const evt = bus.emit('test.ack', {}, 'src');
    bus.ack('c1', evt.id);
    
    // Read the file and check consumed_by
    const content = fs.readFileSync(bus._EVENTS_FILE, 'utf8').trim();
    const parsed = JSON.parse(content);
    assert(parsed.consumed_by.includes('c1'), 'should include c1 in consumed_by');
  });

  await test('ack: idempotent - double ack is safe', (bus) => {
    const evt = bus.emit('test.ack', {}, 'src');
    bus.ack('c1', evt.id);
    bus.ack('c1', evt.id);
    
    const content = fs.readFileSync(bus._EVENTS_FILE, 'utf8').trim();
    const parsed = JSON.parse(content);
    const count = parsed.consumed_by.filter(c => c === 'c1').length;
    assertEqual(count, 1, 'should only appear once');
  });

  await test('ack: different consumers tracked separately', (bus) => {
    const evt = bus.emit('test.multi', {}, 'src');
    bus.ack('consumer-A', evt.id);
    
    const evtsA = bus.consume('consumer-A');
    const evtsB = bus.consume('consumer-B');
    
    assertEqual(evtsA.length, 0, 'consumer-A sees nothing');
    assertEqual(evtsB.length, 1, 'consumer-B still sees 1');
  });

  await test('ack: throws on missing params', (bus) => {
    try {
      bus.ack();
      assert(false, 'should have thrown');
    } catch (err) {
      assert(err.message.includes('required'), 'error message');
    }
  });

  // ─── history tests ──────────────────────────────────────────

  await test('history: returns all events', (bus) => {
    bus.emit('h.one', {}, 'src');
    bus.emit('h.two', {}, 'src');
    
    const all = bus.history();
    assertEqual(all.length, 2, 'should return 2');
  });

  await test('history: filters by type pattern', (bus) => {
    bus.emit('isc.rule.created', {}, 'isc');
    bus.emit('dto.sync.requested', {}, 'dto');
    
    const filtered = bus.history({ type: 'isc.rule.*' });
    assertEqual(filtered.length, 1, 'should match 1');
    assertEqual(filtered[0].type, 'isc.rule.created', 'correct type');
  });

  await test('history: filters by since timestamp', (bus) => {
    bus.emit('old.event', {}, 'src');
    // Wait long enough to guarantee a different timestamp
    const waitUntil = Date.now() + 50;
    while (Date.now() < waitUntil) {}
    const midpoint = Date.now();
    bus.emit('new.event', {}, 'src');
    
    const filtered = bus.history({ since: midpoint });
    assertEqual(filtered.length, 1, 'should return 1 recent event');
    assertEqual(filtered[0].type, 'new.event', 'correct event');
  });

  await test('history: filters by source', (bus) => {
    bus.emit('test.a', {}, 'alpha');
    bus.emit('test.b', {}, 'beta');
    
    const filtered = bus.history({ source: 'alpha' });
    assertEqual(filtered.length, 1, 'should match 1');
  });

  // ─── matchType tests ──────────────────────────────────────────

  await test('matchType: exact match', (bus) => {
    assert(bus._matchType('isc.rule.created', 'isc.rule.created'), 'exact match');
    assert(!bus._matchType('isc.rule.updated', 'isc.rule.created'), 'no match');
  });

  await test('matchType: wildcard match', (bus) => {
    assert(bus._matchType('isc.rule.created', 'isc.rule.*'), 'wildcard match');
    assert(bus._matchType('isc.rule.updated', 'isc.rule.*'), 'wildcard match 2');
    assert(!bus._matchType('dto.sync.requested', 'isc.rule.*'), 'no cross-match');
  });

  await test('matchType: star matches everything', (bus) => {
    assert(bus._matchType('anything.here', '*'), 'star matches all');
  });

  // ─── stats tests ──────────────────────────────────────────────

  await test('stats: returns correct counts', (bus) => {
    bus.emit('type.a', {}, 'src');
    bus.emit('type.a', {}, 'src');
    bus.emit('type.b', {}, 'src');
    bus.consume('c1');
    
    const stats = bus.stats();
    assertEqual(stats.totalEvents, 3, 'total');
    assertEqual(stats.consumers, 1, 'consumers');
    assertEqual(stats.eventsByType['type.a'], 2, 'type.a count');
    assertEqual(stats.eventsByType['type.b'], 1, 'type.b count');
  });

  // ─── purge tests ──────────────────────────────────────────────

  await test('purge: clears all events and cursors', (bus) => {
    bus.emit('test.purge', {}, 'src');
    bus.consume('c1');
    bus.purge();
    
    const events = bus.history();
    assertEqual(events.length, 0, 'should be empty');
    
    const stats = bus.stats();
    assertEqual(stats.consumers, 0, 'no consumers');
  });

  // ─── Integration: full lifecycle ──────────────────────────────

  await test('integration: full emit → consume → ack lifecycle', (bus) => {
    // Producer emits events
    const e1 = bus.emit('isc.rule.created', { rule_id: 'N001' }, 'isc-core');
    const e2 = bus.emit('isc.rule.updated', { rule_id: 'N002' }, 'isc-core');
    const e3 = bus.emit('dto.sync.requested', { target: 'weather' }, 'dto-core');
    
    // Consumer A wants ISC events
    const iscEvents = bus.consume('dto-sync', { types: ['isc.rule.*'] });
    assertEqual(iscEvents.length, 2, 'dto-sync gets 2 ISC events');
    
    // Consumer B wants 本地任务编排 events
    const dtoEvents = bus.consume('orchestrator', { types: ['dto.sync.*'] });
    assertEqual(dtoEvents.length, 1, 'orchestrator gets 1 本地任务编排 event');
    
    // Ack one event for consumer A
    bus.ack('dto-sync', e1.id);
    
    // Consumer A should now only see 1 event
    const remaining = bus.consume('dto-sync', { types: ['isc.rule.*'] });
    assertEqual(remaining.length, 1, 'dto-sync sees 1 remaining');
    assertEqual(remaining[0].id, e2.id, 'correct remaining event');
    
    // Consumer B still sees their event
    const stillThere = bus.consume('orchestrator', { types: ['dto.sync.*'] });
    assertEqual(stillThere.length, 1, 'orchestrator still sees 1');
    
    // History shows all events regardless of consumption
    const history = bus.history();
    assertEqual(history.length, 3, 'history shows all 3');
  });

  // ─── Summary ──────────────────────────────────────────────────

  console.log(`\n📊 Results: ${passed}/${total} passed, ${failed} failed\n`);

  // Cleanup
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true });
  }

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
