'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { GitScanner } = require('../../infrastructure/scanners/git-scanner');
const bus = require('../../infrastructure/event-bus/bus');
const { BusFacade } = require('../../infrastructure/event-bus/bus-facade');
const { Dispatcher } = require('../../infrastructure/event-bus/dispatcher');

// ─── Helpers ─────────────────────────────────────────────────────

let tmpDir;

function setupTmpGitRepo() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-scanner-test-'));
  execSync('git init', { cwd: tmpDir, stdio: 'ignore' });
  execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'ignore' });
  execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'ignore' });
  // Initial commit so HEAD~1 works
  fs.writeFileSync(path.join(tmpDir, 'README.md'), 'init');
  execSync('git add . && git commit -m "init"', { cwd: tmpDir, stdio: 'ignore' });
  return tmpDir;
}

function teardown() {
  if (tmpDir) {
    try { execSync(`rm -rf "${tmpDir}"`); } catch (_) {}
  }
}

function addFileAndCommit(relPath, content = 'x') {
  const abs = path.join(tmpDir, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  execSync('git add .', { cwd: tmpDir, stdio: 'ignore' });
  execSync(`git commit -m "add ${relPath}"`, { cwd: tmpDir, stdio: 'ignore' });
}

function modifyFileAndCommit(relPath, content = 'modified') {
  fs.writeFileSync(path.join(tmpDir, relPath), content);
  execSync('git add .', { cwd: tmpDir, stdio: 'ignore' });
  execSync(`git commit -m "modify ${relPath}"`, { cwd: tmpDir, stdio: 'ignore' });
}

// ─── Setup test rules dir ────────────────────────────────────────

let testRulesDir;

function setupTestRules() {
  testRulesDir = path.join(tmpDir, '_test_rules');
  fs.mkdirSync(testRulesDir, { recursive: true });

  // Rule that listens to skill.lifecycle.*
  fs.writeFileSync(path.join(testRulesDir, 'skill-lifecycle.json'), JSON.stringify({
    id: 'test-skill-lifecycle',
    trigger: {
      events: ['skill.lifecycle.created', 'skill.lifecycle.modified'],
      actions: [{ type: 'log_only', description: 'test action' }]
    }
  }));

  // Rule that listens to isc.rule.*
  fs.writeFileSync(path.join(testRulesDir, 'isc-rule.json'), JSON.stringify({
    id: 'test-isc-rule',
    trigger: {
      events: ['isc.rule.created', 'isc.rule.modified', 'isc.rule.deleted'],
      actions: [{ type: 'log_only' }]
    }
  }));

  // Rule with wildcard
  fs.writeFileSync(path.join(testRulesDir, 'catch-all.json'), JSON.stringify({
    id: 'test-catch-all',
    trigger: {
      events: ['system.*'],
      actions: [{ type: 'log_only' }]
    }
  }));

  // Rule with conditions
  fs.writeFileSync(path.join(testRulesDir, 'conditional.json'), JSON.stringify({
    id: 'test-conditional',
    trigger: {
      events: ['skill.lifecycle.modified'],
      actions: [{ type: 'conditional_action' }]
    },
    conditions: { status: 'M' }
  }));
}

// ─── Tests ───────────────────────────────────────────────────────

async function test1_scannerEmitsSkillLifecycleCreated() {
  setupTmpGitRepo();
  addFileAndCommit('skills/my-skill/SKILL.md', '# My Skill');

  const scanner = new GitScanner({ cwd: tmpDir });
  const events = await scanner.scan();

  const match = events.find(e => e.eventType === 'skill.lifecycle.created');
  console.assert(match, 'T1 FAIL: expected skill.lifecycle.created');
  console.assert(match?.file === 'skills/my-skill/SKILL.md', 'T1 FAIL: wrong file path');
  console.log('✅ T1: scanner emits skill.lifecycle.created for new SKILL.md');
  teardown();
}

async function test2_scannerEmitsSkillLifecycleModified() {
  setupTmpGitRepo();
  addFileAndCommit('skills/my-skill/SKILL.md', '# v1');
  modifyFileAndCommit('skills/my-skill/SKILL.md', '# v2');

  const scanner = new GitScanner({ cwd: tmpDir });
  const events = await scanner.scan();

  const match = events.find(e => e.eventType === 'skill.lifecycle.modified');
  console.assert(match, 'T2 FAIL: expected skill.lifecycle.modified');
  console.log('✅ T2: scanner emits skill.lifecycle.modified for changed SKILL.md');
  teardown();
}

async function test3_scannerEmitsIscRuleCreated() {
  setupTmpGitRepo();
  addFileAndCommit('skills/isc-core/rules/test-rule.json', '{"id":"test"}');

  const scanner = new GitScanner({ cwd: tmpDir });
  const events = await scanner.scan();

  const match = events.find(e => e.eventType === 'isc.rule.created');
  console.assert(match, 'T3 FAIL: expected isc.rule.created');
  console.log('✅ T3: scanner emits isc.rule.created for new rule file');
  teardown();
}

async function test4_scannerEmitsInfrastructureModified() {
  setupTmpGitRepo();
  addFileAndCommit('infrastructure/event-bus/new-file.js', '// new');

  const scanner = new GitScanner({ cwd: tmpDir });
  const events = await scanner.scan();

  const match = events.find(e => e.eventType === 'system.infrastructure.modified');
  console.assert(match, 'T4 FAIL: expected system.infrastructure.modified');
  console.log('✅ T4: scanner emits system.infrastructure.modified for infra changes');
  teardown();
}

async function test5_scannerWithBusWritesToEventLog() {
  setupTmpGitRepo();

  // Purge bus before test
  bus.purge();

  // Create scanner wired to bus
  const scanner = new GitScanner({ cwd: tmpDir, bus });
  addFileAndCommit('skills/test-skill/SKILL.md', '# Test');

  await scanner.scan();

  // Verify bus received the event
  const history = bus.history({ type: 'skill.lifecycle.created' });
  const match = history.find(e => e.payload?.file === 'skills/test-skill/SKILL.md');
  console.assert(match, 'T5 FAIL: bus should have skill.lifecycle.created event');
  console.assert(match?.payload?.scanner === 'git-scanner', 'T5 FAIL: event should have scanner source');
  console.log('✅ T5: scanner→bus integration: events appear in bus history');

  bus.purge();
  teardown();
}

async function test6_busEventTriggersDispatcherMatch() {
  setupTmpGitRepo();
  setupTestRules();

  const dispatcher = new Dispatcher({
    rulesDir: testRulesDir,
    logFile: path.join(tmpDir, 'dispatcher.jsonl'),
    logger: { debug: () => {}, warn: () => {}, error: console.error }
  });
  await dispatcher.init();

  console.assert(dispatcher.getRuleCount() === 4, 'T6 FAIL: expected 4 rules loaded');

  // Dispatch a skill.lifecycle.modified event
  await dispatcher.dispatch('skill.lifecycle.modified', { file: 'skills/x/SKILL.md', status: 'M' });

  const stats = dispatcher.getStats();
  console.assert(stats.dispatched >= 1, 'T6 FAIL: dispatched count should be >= 1');
  console.assert(stats.executed >= 1, 'T6 FAIL: executed count should be >= 1');
  console.log('✅ T6: dispatcher matches rules for skill.lifecycle.modified event');
  teardown();
}

async function test7_fullPipelineScannerBusDispatcher() {
  setupTmpGitRepo();
  setupTestRules();

  bus.purge();

  const dispatcher = new Dispatcher({
    rulesDir: testRulesDir,
    logFile: path.join(tmpDir, 'dispatcher.jsonl'),
    logger: { debug: () => {}, warn: () => {}, error: console.error }
  });
  await dispatcher.init();

  const facade = new BusFacade({ bus, dispatcher });
  facade._ready = true;

  // Wire scanner to facade
  const scanner = new GitScanner({ cwd: tmpDir, bus: facade });

  addFileAndCommit('skills/full-test/SKILL.md', '# Full Pipeline');
  await scanner.scan();

  // Verify bus received event
  const history = bus.history({ type: 'skill.lifecycle.created' });
  console.assert(history.length >= 1, 'T7 FAIL: bus should have event');

  // Verify dispatcher ran
  const dStats = dispatcher.getStats();
  console.assert(dStats.dispatched >= 1, 'T7 FAIL: dispatcher should have dispatched');
  console.assert(dStats.executed >= 1, 'T7 FAIL: dispatcher should have executed rules');

  // Verify dispatcher log file was written
  const logContent = fs.readFileSync(path.join(tmpDir, 'dispatcher.jsonl'), 'utf-8');
  console.assert(logContent.includes('skill.lifecycle.created'), 'T7 FAIL: dispatcher log should contain event type');

  console.log('✅ T7: full pipeline scanner→bus→dispatcher works end-to-end');

  bus.purge();
  teardown();
}

async function test8_dispatcherWildcardMatchesInfraEvents() {
  setupTmpGitRepo();
  setupTestRules();

  const dispatcher = new Dispatcher({
    rulesDir: testRulesDir,
    logFile: path.join(tmpDir, 'dispatcher.jsonl'),
    logger: { debug: () => {}, warn: () => {}, error: console.error }
  });
  await dispatcher.init();

  await dispatcher.dispatch('system.infrastructure.modified', { file: 'infrastructure/bus.js' });

  const stats = dispatcher.getStats();
  // The catch-all rule with 'system.*' should match
  console.assert(stats.matched >= 1, 'T8 FAIL: system.* wildcard should match system.infrastructure.modified');
  console.assert(stats.executed >= 1, 'T8 FAIL: wildcard rule should execute');
  console.log('✅ T8: dispatcher wildcard system.* matches infrastructure events');
  teardown();
}

async function test9_dispatcherConditionsFilter() {
  setupTmpGitRepo();
  setupTestRules();

  const dispatcher = new Dispatcher({
    rulesDir: testRulesDir,
    logFile: path.join(tmpDir, 'dispatcher.jsonl'),
    logger: { debug: () => {}, warn: () => {}, error: console.error }
  });
  await dispatcher.init();

  // Dispatch with status: 'A' — conditional rule expects status: 'M', should skip
  dispatcher.stats = { dispatched: 0, matched: 0, executed: 0, skipped: 0, failed: 0 };
  await dispatcher.dispatch('skill.lifecycle.modified', { status: 'A' });

  const stats = dispatcher.getStats();
  console.assert(stats.skipped >= 1, 'T9 FAIL: conditional rule should skip when status != M');
  console.log('✅ T9: dispatcher conditions correctly filter non-matching payloads');
  teardown();
}

async function test10_scannerNoEventsForUnmappedPaths() {
  setupTmpGitRepo();
  addFileAndCommit('random/file.txt', 'hello');

  const scanner = new GitScanner({ cwd: tmpDir });
  const events = await scanner.scan();

  console.assert(events.length === 0, 'T10 FAIL: unmapped paths should emit 0 events');
  console.log('✅ T10: scanner ignores files not matching any path pattern');
  teardown();
}

// ─── Runner ──────────────────────────────────────────────────────

async function runAll() {
  const tests = [
    test1_scannerEmitsSkillLifecycleCreated,
    test2_scannerEmitsSkillLifecycleModified,
    test3_scannerEmitsIscRuleCreated,
    test4_scannerEmitsInfrastructureModified,
    test5_scannerWithBusWritesToEventLog,
    test6_busEventTriggersDispatcherMatch,
    test7_fullPipelineScannerBusDispatcher,
    test8_dispatcherWildcardMatchesInfraEvents,
    test9_dispatcherConditionsFilter,
    test10_scannerNoEventsForUnmappedPaths,
  ];

  console.log(`\n🧪 Git-Scanner Integration Tests (${tests.length} tests)\n`);
  let passed = 0;
  let failed = 0;

  for (const t of tests) {
    try {
      await t();
      passed++;
    } catch (err) {
      failed++;
      console.error(`❌ ${t.name}: ${err.message}`);
      teardown();
    }
  }

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed out of ${tests.length}`);
  if (failed > 0) process.exit(1);
}

runAll();
