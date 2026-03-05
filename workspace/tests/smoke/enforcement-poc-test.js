'use strict';

/**
 * Smoke test: Runtime Enforcement PoC
 * Verifies gate_check handler is invoked by dispatcher and returns blocked/passed results.
 */

const path = require('path');

// Direct-require dispatcher and handler
const dispatcher = require('../../infrastructure/dispatcher/dispatcher.js');
const gateCheck = require('../../infrastructure/dispatcher/handlers/gate-check.js');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.log(`  ❌ ${msg}`);
    failed++;
  }
}

async function runTests() {
  console.log('=== Runtime Enforcement PoC — Smoke Tests ===\n');

  // ── Test 1: gate-check handler loads and is callable ──
  console.log('Test 1: gate-check handler is loadable');
  assert(typeof gateCheck === 'function', 'gate-check exports a function');
  assert(typeof gateCheck.loadGateRules === 'function', 'loadGateRules is exported');

  // ── Test 2: P0 gate rules are discoverable ──
  console.log('\nTest 2: P0 gate rules loaded');
  const gateRules = gateCheck.loadGateRules();
  assert(gateRules.length > 0, `Found ${gateRules.length} P0 gate rule(s)`);
  const archRule = gateRules.find(r => r.id === 'arch.gate-before-action-001');
  assert(!!archRule, 'arch.gate-before-action-001 (P0) found');

  // ── Test 3: Event without gateApproved is BLOCKED ──
  console.log('\nTest 3: skill.lifecycle.created without gateApproved → blocked');
  const blockedEvent = {
    id: 'test-001',
    type: 'skill.lifecycle.created',
    payload: { skillId: 'test-skill' },
  };
  const blockedResult = gateCheck(blockedEvent, {});
  assert(blockedResult.blocked === true, `blocked=${blockedResult.blocked}`);
  assert(typeof blockedResult.reason === 'string' && blockedResult.reason.length > 0, `reason: ${blockedResult.reason}`);
  assert(blockedResult.checkedRules.includes('arch.gate-before-action-001'), 'Rule was checked');

  // ── Test 4: Event with gateApproved passes ──
  console.log('\nTest 4: skill.lifecycle.created with gateApproved → passed');
  const passedEvent = {
    id: 'test-002',
    type: 'skill.lifecycle.created',
    payload: { skillId: 'test-skill' },
    gateApproved: true,
  };
  const passedResult = gateCheck(passedEvent, {});
  assert(passedResult.passed === true, `passed=${passedResult.passed}`);
  assert(!passedResult.blocked, 'Not blocked');

  // ── Test 5: skill.lifecycle.created via dispatcher (full dispatch path) — BLOCKED ──
  console.log('\nTest 5: Full dispatch path — skill.lifecycle.created (blocked)');
  dispatcher.reloadRoutes();
  const dispatchResult = await dispatcher.dispatch(
    { action: 'skill.lifecycle.created' },
    {
      id: 'test-003',
      type: 'skill.lifecycle.created',
      payload: { skillId: 'test-skill' },
    },
    { timeoutMs: 5000 }
  );
  assert(dispatchResult.success === true, `dispatch success=${dispatchResult.success}`);
  assert(dispatchResult.handler === 'gate-check', `handler=${dispatchResult.handler}`);
  assert(dispatchResult.result && dispatchResult.result.blocked === true, `result.blocked=${dispatchResult.result && dispatchResult.result.blocked}`);

  // ── Test 6: skill.lifecycle.created with approval passes through dispatcher ──
  console.log('\nTest 6: Full dispatch path — approved event passes');
  const passDispatch = await dispatcher.dispatch(
    { action: 'skill.lifecycle.created' },
    {
      id: 'test-004',
      type: 'skill.lifecycle.created',
      payload: { skillId: 'test-skill' },
      gateApproved: true,
    },
    { timeoutMs: 5000 }
  );
  assert(passDispatch.success === true, `dispatch success=${passDispatch.success}`);
  assert(passDispatch.result && passDispatch.result.passed === true, `result.passed=${passDispatch.result && passDispatch.result.passed}`);

  // ── Summary ──
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} assertions`);
  console.log(`${'='.repeat(50)}`);

  return { passed, failed, total: passed + failed };
}

runTests().then(results => {
  process.exit(results.failed > 0 ? 1 : 0);
}).catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
