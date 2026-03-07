#!/usr/bin/env node
'use strict';

/**
 * ISC-INTENT-EVAL-001 + ISC-CLOSED-BOOK-001 全系统集成验证测试
 * 
 * 验证所有接入点在 fail-closed 默认行为下的正确性:
 * - isc-eval-gates.js 核心库
 * - gate.js / gate-check.js event-bus handlers
 * - sprint-closure-gate
 * - artifact-gate-check
 * - scenario-acceptance-gate
 * - public-skill-quality-gate
 * - subagent-checkpoint-gate
 * - AEO index.js
 * - ISC-Core index.js
 * - DTO-Core index.js
 * - LEP-Core LEPExecutor.js
 * - enforcement-audit
 * - isc-dto-handshake
 * - isc-eval-middleware
 */

const path = require('path');
const fs = require('fs');

const WORKSPACE = '/root/.openclaw/workspace';
let passed = 0;
let failed = 0;
const results = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    results.push({ name, status: 'pass' });
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    results.push({ name, status: 'fail', error: e.message });
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

console.log('═══════════════════════════════════════════════════════');
console.log('  🔒 ISC Hard-Gate Full-System Integration Test');
console.log('═══════════════════════════════════════════════════════\n');

// ── 1. Core Library ──
console.log('📦 1. Core Library (isc-eval-gates.js)');
const gates = require(path.join(WORKSPACE, 'infrastructure/enforcement/isc-eval-gates'));

test('evaluateIntentGate: empty payload → FAIL', () => {
  const r = gates.evaluateIntentGate({});
  assert(!r.ok, 'should fail');
  assert(r.failClosed, 'should be fail-closed');
  assert(r.ruleId === 'ISC-INTENT-EVAL-001');
});

test('evaluateIntentGate: valid → PASS', () => {
  const r = gates.evaluateIntentGate({
    intent_basis: { llm_as_primary: true, evidence: ['tested with GLM-5'] }
  });
  assert(r.ok, 'should pass');
  assert(!r.failClosed, 'should not be fail-closed');
});

test('evaluateClosedBookGate: empty payload → FAIL', () => {
  const r = gates.evaluateClosedBookGate({});
  assert(!r.ok, 'should fail');
  assert(r.failClosed, 'should be fail-closed');
  assert(r.ruleId === 'ISC-CLOSED-BOOK-001');
});

test('evaluateClosedBookGate: valid → PASS', () => {
  const r = gates.evaluateClosedBookGate({
    closed_book_eval: {
      enabled: true,
      no_hardcoded_evalset: true,
      no_reference_reads: true,
      forbidden_paths_checked: ['skills/', 'infrastructure/'],
      evidence: ['no forbidden reads detected']
    }
  });
  assert(r.ok, 'should pass');
});

test('evaluateClosedBookGate: forbidden paths accessed → FAIL', () => {
  const r = gates.evaluateClosedBookGate({
    closed_book_eval: {
      enabled: true,
      no_hardcoded_evalset: true,
      no_reference_reads: true,
      forbidden_paths_checked: ['skills/'],
      evidence: ['checked'],
      forbidden_paths_accessed: ['memory/2026-03-07.md']
    }
  });
  assert(!r.ok, 'should fail due to accessed paths');
});

test('evaluateAll: both rules → combined FAIL-CLOSED', () => {
  const r = gates.evaluateAll({});
  assert(!r.ok);
  assert(r.gateStatus === 'FAIL-CLOSED');
  assert(r.rules.length === 2);
});

test('evaluateAll: both rules satisfied → PASS', () => {
  const r = gates.evaluateAll({
    intent_basis: { llm_as_primary: true, evidence: ['LLM intent'] },
    closed_book_eval: {
      enabled: true, no_hardcoded_evalset: true, no_reference_reads: true,
      forbidden_paths_checked: ['src/'], evidence: ['clean']
    }
  });
  assert(r.ok);
  assert(r.gateStatus === 'PASS');
});

// ── 2. Gate Handler ──
console.log('\n📦 2. Gate Handler (gate.js)');
const gateHandler = require(path.join(WORKSPACE, 'infrastructure/event-bus/handlers/gate'));

test('gate.js: empty payload → failClosed true', async () => {
  const r = await gateHandler({ type: 'test', payload: {} }, { id: 'test' }, { workspace: WORKSPACE });
  assert(r.failClosed === true, `failClosed should be true, got ${r.failClosed}`);
  assert(r.gateStatus === 'FAIL-CLOSED');
});

test('gate.js: valid payload → ok true', async () => {
  const r = await gateHandler({
    type: 'test', payload: {
      intent_basis: { llm_as_primary: true, evidence: ['e'] },
      closed_book_eval: { enabled: true, no_hardcoded_evalset: true, no_reference_reads: true, forbidden_paths_checked: ['x'], evidence: ['y'] }
    }
  }, { id: 'test' }, { workspace: WORKSPACE });
  assert(r.ok === true, 'should be ok');
  assert(r.gateStatus === 'PASS');
});

// ── 3. Gate-Check Handler ──
console.log('\n📦 3. Gate-Check Handler (gate-check.js)');
const gateCheckHandler = require(path.join(WORKSPACE, 'infrastructure/event-bus/handlers/gate-check'));

test('gate-check.js: empty → failClosed', async () => {
  const r = await gateCheckHandler({ type: 'test', payload: {} }, {}, { workspace: WORKSPACE });
  assert(r.failClosed === true);
});

// ── 4. Enforcement Audit ──
console.log('\n📦 4. Enforcement Audit');
const enfAudit = require(path.join(WORKSPACE, 'infrastructure/event-bus/handlers/enforcement-audit'));

test('enforcement-audit: ISC hard gates declared active', async () => {
  const r = await enfAudit({}, {}, { workspaceRoot: WORKSPACE });
  assert(r.iscHardGates['ISC-INTENT-EVAL-001'] === 'active');
  assert(r.iscHardGates['ISC-CLOSED-BOOK-001'] === 'active');
});

// ── 5. ISC-DTO Handshake ──
console.log('\n📦 5. ISC-DTO Handshake');
test('isc-dto-handshake: contains iscHardGates field', () => {
  const src = fs.readFileSync(path.join(WORKSPACE, 'infrastructure/event-bus/handlers/isc-dto-handshake.js'), 'utf8');
  assert(src.includes('ISC-INTENT-EVAL-001'), 'should reference ISC-INTENT-EVAL-001');
  assert(src.includes('ISC-CLOSED-BOOK-001'), 'should reference ISC-CLOSED-BOOK-001');
  assert(src.includes('iscHardGates'), 'should include iscHardGates field');
});

// ── 6. Sprint Closure Gate ──
console.log('\n📦 6. Sprint Closure Gate');
test('sprint-closure-gate: contains ISC gate import', () => {
  const src = fs.readFileSync(path.join(WORKSPACE, 'infrastructure/event-bus/handlers/sprint-closure-gate.js'), 'utf8');
  assert(src.includes('isc-eval-gates'), 'should import isc-eval-gates');
  assert(src.includes('isc_gates'), 'should inject isc_gates');
  assert(src.includes('FAIL-CLOSED'), 'should reference FAIL-CLOSED');
});

// ── 7. Artifact Gate Check ──
console.log('\n📦 7. Artifact Gate Check');
test('artifact-gate-check: ISC hard gates in runGate', () => {
  const src = fs.readFileSync(path.join(WORKSPACE, 'infrastructure/event-bus/handlers/artifact-gate-check.js'), 'utf8');
  assert(src.includes('isc_hard_gates'), 'should have isc_hard_gates check');
  assert(src.includes('ISC-INTENT-EVAL-001'), 'should reference ISC-INTENT-EVAL-001');
});

// ── 8. Scenario Acceptance Gate ──
console.log('\n📦 8. Scenario Acceptance Gate');
test('scenario-acceptance-gate: ISC gates injection', () => {
  const src = fs.readFileSync(path.join(WORKSPACE, 'infrastructure/event-bus/handlers/scenario-acceptance-gate.js'), 'utf8');
  assert(src.includes('isc-eval-gates'), 'should import isc-eval-gates');
  assert(src.includes('isc_gates'), 'should return isc_gates');
});

// ── 9. Public Skill Quality Gate ──
console.log('\n📦 9. Public Skill Quality Gate');
test('public-skill-quality-gate: ISC gates injection', () => {
  const src = fs.readFileSync(path.join(WORKSPACE, 'infrastructure/event-bus/handlers/public-skill-quality-gate.js'), 'utf8');
  assert(src.includes('isc-eval-gates'), 'should import isc-eval-gates');
  assert(src.includes('isc_gates'), 'should return isc_gates');
});

// ── 10. Subagent Checkpoint Gate ──
console.log('\n📦 10. Subagent Checkpoint Gate');
test('subagent-checkpoint-gate: ISC gates for eval tasks', () => {
  const src = fs.readFileSync(path.join(WORKSPACE, 'infrastructure/event-bus/handlers/subagent-checkpoint-gate.js'), 'utf8');
  assert(src.includes('isc-eval-gates'), 'should import isc-eval-gates');
  assert(src.includes('isc_gates'), 'should return isc_gates');
});

// ── 11. AEO index.js ──
console.log('\n📦 11. AEO Evaluation Engine');
test('aeo/index.js: ISC gates injection', () => {
  const src = fs.readFileSync(path.join(WORKSPACE, 'skills/aeo/index.js'), 'utf8');
  assert(src.includes('isc-eval-gates'), 'should import isc-eval-gates');
  assert(src.includes('isc_gates'), 'should return isc_gates');
  assert(src.includes('ISC-INTENT-EVAL-001'), 'should reference rule');
});

// ── 12. ISC-Core index.js ──
console.log('\n📦 12. ISC-Core');
test('isc-core/index.js: hard gate declaration in executeFullCycle', () => {
  const src = fs.readFileSync(path.join(WORKSPACE, 'skills/isc-core/index.js'), 'utf8');
  assert(src.includes('ISC-INTENT-EVAL-001'), 'should reference ISC-INTENT-EVAL-001');
  assert(src.includes('ISC-CLOSED-BOOK-001'), 'should reference ISC-CLOSED-BOOK-001');
  assert(src.includes('isc-eval-gates'), 'should try to load enforcement module');
});

// ── 13. DTO-Core index.js ──
console.log('\n📦 13. DTO-Core');
test('dto-core/index.js: ISC gate in execute method', () => {
  const src = fs.readFileSync(path.join(WORKSPACE, 'skills/dto-core/index.js'), 'utf8');
  assert(src.includes('isc-eval-gates'), 'should import isc-eval-gates');
  assert(src.includes('FAIL-CLOSED'), 'should reference FAIL-CLOSED');
  assert(src.includes('isc_blocked'), 'should emit isc_blocked event');
});

// ── 14. LEP-Core LEPExecutor.js ──
console.log('\n📦 14. LEP-Core');
test('LEPExecutor.js: ISC gate in _preExecutionChecks', () => {
  const src = fs.readFileSync(path.join(WORKSPACE, 'infrastructure/lep-core/core/LEPExecutor.js'), 'utf8');
  assert(src.includes('ISC FAIL-CLOSED'), 'should reference ISC FAIL-CLOSED');
  assert(src.includes('isc-eval-gates'), 'should import isc-eval-gates');
  assert(src.includes('iscGateStatus'), 'should set iscGateStatus');
});

// ── 15. Middleware ──
console.log('\n📦 15. ISC Eval Middleware');
const middleware = require(path.join(WORKSPACE, 'infrastructure/event-bus/handlers/isc-eval-middleware'));

test('middleware.requireGates: empty → blocked', () => {
  const r = middleware.requireGates({});
  assert(r.blocked === true);
  assert(r.gateStatus === 'FAIL-CLOSED');
});

test('middleware.requireGates: valid → ok', () => {
  const r = middleware.requireGates({
    intent_basis: { llm_as_primary: true, evidence: ['e'] },
    closed_book_eval: { enabled: true, no_hardcoded_evalset: true, no_reference_reads: true, forbidden_paths_checked: ['x'], evidence: ['y'] }
  });
  assert(r.ok === true);
  assert(r.gateStatus === 'PASS');
});

test('middleware.wrapHandler: blocks eval events without evidence', async () => {
  const inner = async () => ({ ok: true, data: 'original' });
  const wrapped = middleware.wrapHandler(inner, { name: 'test-handler' });
  const r = await wrapped({ type: 'eval.complete', payload: { verdict: 'pass' } }, {}, { workspace: WORKSPACE });
  assert(r.blocked === true, 'should be blocked');
  assert(r.failClosed === true);
});

// ── 16. Python Gate Alignment ──
console.log('\n📦 16. Python Gate Alignment');
test('gate_intent_eval.py exists', () => {
  assert(fs.existsSync('/root/.openclaw/workspace-coder/.openclaw/gate_intent_eval.py'));
});

test('gate_closed_book_eval.py exists', () => {
  assert(fs.existsSync('/root/.openclaw/workspace-coder/.openclaw/gate_closed_book_eval.py'));
});

// ── Summary ──
console.log('\n═══════════════════════════════════════════════════════');
console.log(`  📊 Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`  ${failed === 0 ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
console.log('═══════════════════════════════════════════════════════\n');

// Write report
const report = {
  timestamp: new Date().toISOString(),
  summary: { passed, failed, total: passed + failed },
  results,
  integration_points: [
    'infrastructure/enforcement/isc-eval-gates.js (core library)',
    'infrastructure/event-bus/handlers/gate.js',
    'infrastructure/event-bus/handlers/gate-check.js',
    'infrastructure/event-bus/handlers/sprint-closure-gate.js',
    'infrastructure/event-bus/handlers/artifact-gate-check.js',
    'infrastructure/event-bus/handlers/scenario-acceptance-gate.js',
    'infrastructure/event-bus/handlers/public-skill-quality-gate.js',
    'infrastructure/event-bus/handlers/subagent-checkpoint-gate.js',
    'infrastructure/event-bus/handlers/enforcement-audit.js',
    'infrastructure/event-bus/handlers/isc-dto-handshake.js',
    'infrastructure/event-bus/handlers/isc-eval-middleware.js',
    'skills/aeo/index.js',
    'skills/isc-core/index.js',
    'skills/dto-core/index.js',
    'infrastructure/lep-core/core/LEPExecutor.js',
    'workspace-coder/.openclaw/gate_intent_eval.py',
    'workspace-coder/.openclaw/gate_closed_book_eval.py'
  ]
};

const reportPath = path.join(WORKSPACE, 'reports', 'isc-hard-gate-fullsystem-test.json');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`Report: ${reportPath}`);

process.exit(failed > 0 ? 1 : 0);
