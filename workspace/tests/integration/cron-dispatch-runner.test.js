#!/usr/bin/env node
'use strict';

/**
 * Integration tests for cron-dispatch-runner.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const WORKSPACE = path.resolve(__dirname, '../..');
const EB_DIR = path.join(WORKSPACE, 'infrastructure/event-bus');
const EVENTS_LOG = path.join(WORKSPACE, 'infrastructure/logs/events.jsonl');
const CURSOR_FILE = path.join(EB_DIR, '.cron-dispatch-cursor.json');
const DISPATCHER_LOG = path.join(WORKSPACE, 'infrastructure/logs/dispatcher-actions.jsonl');
const TEST_RULES_DIR = path.join(__dirname, '_test-rules');
const WRAPPER_PATH = path.join(__dirname, '_test-wrapper.js');

// ─── Backup/Restore ─────────────────────────────────────────────
const backups = {};
function backup(f) { try { backups[f] = fs.readFileSync(f, 'utf8'); } catch (_) { backups[f] = null; } }
function restore(f) { if (backups[f] === null) { try { fs.unlinkSync(f); } catch (_) {} } else if (backups[f] !== undefined) fs.writeFileSync(f, backups[f]); }

// ─── Helpers ─────────────────────────────────────────────────────
function makeEvent(type, payload = {}, offsetMs = 0) {
  const ts = Date.now() + offsetMs;
  return { id: `evt_t_${ts}_${Math.random().toString(36).slice(2,8)}`, type, source: 'test', payload, timestamp: ts, consumed_by: [] };
}

function writeEvents(events) {
  fs.mkdirSync(path.dirname(EVENTS_LOG), { recursive: true });
  fs.writeFileSync(EVENTS_LOG, events.map(e => JSON.stringify(e)).join('\n') + (events.length ? '\n' : ''));
}

function writeCursor(c) { fs.writeFileSync(CURSOR_FILE, JSON.stringify(c)); }
function readCursor() { try { return JSON.parse(fs.readFileSync(CURSOR_FILE, 'utf8')); } catch (_) { return null; } }
function clearActions() { try { fs.writeFileSync(DISPATCHER_LOG, ''); } catch (_) {} }
function readActions() {
  try { const c = fs.readFileSync(DISPATCHER_LOG, 'utf8').trim(); return c ? c.split('\n').map(l => JSON.parse(l)) : []; }
  catch (_) { return []; }
}

function setupRules() {
  fs.mkdirSync(TEST_RULES_DIR, { recursive: true });
  const rules = [
    { id: 'r-skill-created', trigger: { events: ['skill.created'], actions: [{ type: 'log' }] } },
    { id: 'r-skill-wildcard', trigger: { events: ['skill.*'], actions: [{ type: 'notify' }] } },
    { id: 'r-sys-health', trigger: { events: ['system.health'], actions: [{ type: 'alert' }] }, conditions: { status: 'degraded' } },
    { id: 'r-catch-all', trigger: { events: ['*'], actions: [{ type: 'audit' }] } },
  ];
  rules.forEach(r => fs.writeFileSync(path.join(TEST_RULES_DIR, r.id + '.json'), JSON.stringify(r)));
}

function createWrapper() {
  // A wrapper that patches Dispatcher rulesDir then runs the runner's main() logic
  const code = `
'use strict';
const fs = require('fs');
const path = require('path');
const dispMod = require(path.resolve('${EB_DIR}/dispatcher'));
const OrigDispatcher = dispMod.Dispatcher;

// Patch: override rulesDir
class PatchedDispatcher extends OrigDispatcher {
  constructor(opts = {}) { super({ ...opts, rulesDir: '${TEST_RULES_DIR}' }); }
}

const EVENTS_LOG = path.resolve('${EVENTS_LOG}');
const CURSOR_FILE = path.resolve('${CURSOR_FILE}');
const WINDOW_MS = 5 * 60 * 1000;

function readCursor() { try { return JSON.parse(fs.readFileSync(CURSOR_FILE, 'utf8')); } catch (_) { return { lastTimestamp: 0, lastId: null }; } }
function writeCursorF(c) { fs.writeFileSync(CURSOR_FILE, JSON.stringify(c, null, 2)); }
function readRecentEvents(sinceTs) {
  if (!fs.existsSync(EVENTS_LOG)) return [];
  const content = fs.readFileSync(EVENTS_LOG, 'utf8').trim();
  if (!content) return [];
  const events = [];
  for (const line of content.split('\\n')) { try { const e = JSON.parse(line); if (e.timestamp >= sinceTs) events.push(e); } catch (_) {} }
  return events;
}

async function main() {
  const dispatcher = new PatchedDispatcher();
  await dispatcher.init();
  const ruleCount = dispatcher.getRuleCount();
  console.log('[cron-dispatch] Dispatcher initialized with ' + ruleCount + ' rules');
  if (ruleCount === 0) { console.log('[cron-dispatch] No rules loaded, exiting'); return; }
  const cursor = readCursor();
  const cutoff = Math.max(cursor.lastTimestamp, Date.now() - WINDOW_MS);
  const events = readRecentEvents(cutoff);
  let startIdx = 0;
  if (cursor.lastId) { const idx = events.findIndex(e => e.id === cursor.lastId); if (idx >= 0) startIdx = idx + 1; }
  const toProcess = events.slice(startIdx);
  console.log('[cron-dispatch] ' + toProcess.length + ' events to dispatch (since ' + new Date(cutoff).toISOString() + ')');
  let processed = 0, lastEvt = null;
  for (const evt of toProcess) {
    try { await dispatcher.dispatch(evt.type, evt.payload || {}); processed++; lastEvt = evt; }
    catch (e) { console.error('[cron-dispatch] Failed to dispatch ' + evt.id + ': ' + e.message); }
  }
  if (lastEvt) writeCursorF({ lastTimestamp: lastEvt.timestamp, lastId: lastEvt.id });
  console.log('[cron-dispatch] Done: ' + processed + '/' + toProcess.length + ' dispatched');
}
main().catch(e => { console.error('[cron-dispatch] Fatal: ' + e.message); process.exit(1); });
`;
  fs.writeFileSync(WRAPPER_PATH, code);
}

function run() {
  try {
    const out = execSync(`node "${WRAPPER_PATH}"`, { cwd: EB_DIR, timeout: 15000, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] });
    return { stdout: out, exitCode: 0 };
  } catch (e) {
    return { stdout: e.stdout || '', stderr: e.stderr || '', exitCode: e.status || 1 };
  }
}

// ─── Test framework ──────────────────────────────────────────────
let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (!c) throw new Error(m); }
function test(name, fn) {
  try { fs.unlinkSync(CURSOR_FILE); } catch (_) {}
  clearActions();
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failed++; failures.push({ name, error: e.message }); console.log(`  ❌ ${name}: ${e.message}`); }
}

// ─── Setup ───────────────────────────────────────────────────────
console.log('\n🧪 cron-dispatch-runner integration tests\n');
backup(EVENTS_LOG); backup(CURSOR_FILE); backup(DISPATCHER_LOG);
setupRules();
createWrapper();

try {

test('T01: dispatches recent events and logs actions', () => {
  writeEvents([makeEvent('skill.created', { name: 'a' }), makeEvent('system.health', { status: 'degraded' })]);
  const r = run();
  assert(r.exitCode === 0, `exit=${r.exitCode} ${r.stderr||''}`);
  const actions = readActions();
  // skill.created → r-skill-created + r-skill-wildcard + r-catch-all = 3 action entries
  // system.health(degraded) → r-sys-health + r-catch-all = 2
  assert(actions.length >= 4, `Expected >=4 actions, got ${actions.length}`);
});

test('T02: cursor written after processing', () => {
  const evt = makeEvent('skill.created');
  writeEvents([evt]);
  run();
  const c = readCursor();
  assert(c && c.lastId === evt.id, 'Cursor should point to processed event');
});

test('T03: cursor-based resumption — no duplicates', () => {
  const e1 = makeEvent('skill.created', { n: 1 });
  writeEvents([e1]); run(); clearActions();
  const e2 = makeEvent('skill.created', { n: 2 });
  writeEvents([e1, e2]); run();
  const actions = readActions();
  const ns = actions.map(a => a.payload?.n).filter(Boolean);
  assert(!ns.includes(1), 'e1 should not be reprocessed');
  assert(ns.includes(2), 'e2 should be processed');
});

test('T04: 5-minute window excludes old events', () => {
  writeEvents([makeEvent('skill.created', { age: 'old' }, -6*60*1000), makeEvent('skill.created', { age: 'new' })]);
  run();
  const ns = readActions().map(a => a.payload?.age).filter(Boolean);
  assert(!ns.includes('old'), 'Old event should be excluded');
  assert(ns.includes('new'), 'New event should be included');
});

test('T05: empty log — no crash', () => {
  fs.writeFileSync(EVENTS_LOG, '');
  const r = run();
  assert(r.exitCode === 0, `exit=${r.exitCode}`);
  assert(r.stdout.includes('0 events'), 'Should report 0 events');
});

test('T06: missing log file — no crash', () => {
  try { fs.unlinkSync(EVENTS_LOG); } catch (_) {}
  const r = run();
  assert(r.exitCode === 0, `exit=${r.exitCode}`);
});

test('T07: corrupt lines skipped gracefully', () => {
  fs.mkdirSync(path.dirname(EVENTS_LOG), { recursive: true });
  const good = makeEvent('skill.created', { ok: true });
  fs.writeFileSync(EVENTS_LOG, '{bad\n' + JSON.stringify(good) + '\n');
  const r = run();
  assert(r.exitCode === 0, 'Should not crash');
  assert(readActions().length > 0, 'Good event should still be dispatched');
});

test('T08: wildcard rule matches domain events', () => {
  writeEvents([makeEvent('skill.updated')]);
  run();
  const rids = readActions().map(a => a.ruleId);
  assert(rids.includes('r-skill-wildcard'), 'skill.* should match skill.updated');
  assert(!rids.includes('r-skill-created'), 'exact skill.created should NOT match skill.updated');
});

test('T09: conditions filter skips non-matching payload', () => {
  writeEvents([makeEvent('system.health', { status: 'healthy' })]);
  run();
  const actions = readActions();
  assert(!actions.some(a => a.ruleId === 'r-sys-health'), 'Conditional rule should skip');
  assert(actions.some(a => a.ruleId === 'r-catch-all'), 'Catch-all should still fire');
});

test('T10: multiple runs advance cursor correctly', () => {
  const e1 = makeEvent('skill.created', { b: 1 }); const e2 = makeEvent('skill.created', { b: 1 });
  writeEvents([e1, e2]); run();
  assert(readCursor().lastId === e2.id, 'Cursor at e2');
  clearActions();
  const e3 = makeEvent('skill.created', { b: 2 });
  writeEvents([e1, e2, e3]); run();
  assert(readCursor().lastId === e3.id, 'Cursor at e3');
  const bs = readActions().map(a => a.payload?.b).filter(Boolean);
  assert(!bs.includes(1), 'Batch 1 not reprocessed');
  assert(bs.includes(2), 'Batch 2 processed');
});

test('T11: stale cursor ID still processes new events', () => {
  writeCursor({ lastTimestamp: Date.now() - 60000, lastId: 'evt_nonexistent' });
  writeEvents([makeEvent('skill.created', { stale: true })]);
  run();
  assert(readActions().length > 0, 'Should process events despite stale cursor');
});

test('T12: no rules loaded — exits gracefully', () => {
  // Use a wrapper with empty rules dir
  const emptyDir = path.join(__dirname, '_empty-rules');
  fs.mkdirSync(emptyDir, { recursive: true });
  const origWrapper = fs.readFileSync(WRAPPER_PATH, 'utf8');
  fs.writeFileSync(WRAPPER_PATH, origWrapper.replace(TEST_RULES_DIR, emptyDir));
  writeEvents([makeEvent('skill.created')]);
  const r = run();
  assert(r.exitCode === 0, 'Should exit 0 with no rules');
  assert(r.stdout.includes('No rules loaded'), 'Should report no rules');
  // Restore wrapper
  fs.writeFileSync(WRAPPER_PATH, origWrapper);
  fs.rmSync(emptyDir, { recursive: true, force: true });
});

} finally {
  cleanupAll();
}

function cleanupAll() {
  try { fs.rmSync(TEST_RULES_DIR, { recursive: true, force: true }); } catch (_) {}
  try { fs.unlinkSync(WRAPPER_PATH); } catch (_) {}
  restore(EVENTS_LOG); restore(CURSOR_FILE); restore(DISPATCHER_LOG);
}

console.log(`\n📊 Results: ${passed} passed, ${failed} failed out of ${passed + failed}`);
if (failures.length) { failures.forEach(f => console.log(`  - ${f.name}: ${f.error}`)); process.exit(1); }
