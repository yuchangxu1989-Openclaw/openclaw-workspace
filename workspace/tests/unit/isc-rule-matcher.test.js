'use strict';

/**
 * ISC Rule Matcher — 自带测试
 * 
 * Run: node isc-rule-matcher.test.js
 */

const path = require('path');
const fs = require('fs');
const { ISCRuleMatcher, getDefaultMatcher, _internals } = require('./isc-rule-matcher');
const { classifyPattern, matchPattern, evaluateCondition, normalizePriority, MATCH_TYPES } = _internals;

// ── Test Harness ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, name) {
  if (condition) {
    passed++;
    process.stdout.write('  ✅ ' + name + '\n');
  } else {
    failed++;
    failures.push(name);
    process.stdout.write('  ❌ ' + name + '\n');
  }
}

function assertEqual(actual, expected, name) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    name += ` (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`;
  }
  assert(ok, name);
}

function section(name) {
  process.stdout.write('\n── ' + name + ' ──\n');
}

// ── Test Fixture: Temp Rules Dir ─────────────────────────────────────────────

const FIXTURE_DIR = path.join(__dirname, '.test-rules-fixture');

function setupFixture() {
  if (fs.existsSync(FIXTURE_DIR)) fs.rmSync(FIXTURE_DIR, { recursive: true });
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });

  // Rule 1: exact event, high severity
  fs.writeFileSync(path.join(FIXTURE_DIR, 'rule-exact.json'), JSON.stringify({
    id: 'rule.exact-match-test',
    rule_name: 'Exact Match Test',
    severity: 'high',
    trigger: {
      events: ['skill.created', 'skill.updated'],
      condition: '',
    },
    action: { type: 'notify' },
  }));

  // Rule 2: prefix wildcard
  fs.writeFileSync(path.join(FIXTURE_DIR, 'rule-prefix.json'), JSON.stringify({
    id: 'rule.prefix-test',
    rule_name: 'Prefix Wildcard',
    severity: 'medium',
    trigger: {
      events: ['design.*'],
    },
    action: { type: 'audit' },
  }));

  // Rule 3: suffix wildcard
  fs.writeFileSync(path.join(FIXTURE_DIR, 'rule-suffix.json'), JSON.stringify({
    id: 'rule.suffix-test',
    rule_name: 'Suffix Wildcard',
    severity: 'low',
    trigger: {
      events: ['*.failed'],
    },
    action: { type: 'alert' },
  }));

  // Rule 4: global wildcard
  fs.writeFileSync(path.join(FIXTURE_DIR, 'rule-wildcard.json'), JSON.stringify({
    id: 'rule.wildcard-test',
    rule_name: 'Catch All',
    severity: 'info',
    trigger: {
      events: ['*'],
    },
    action: { type: 'log' },
  }));

  // Rule 5: condition-based
  fs.writeFileSync(path.join(FIXTURE_DIR, 'rule-condition.json'), JSON.stringify({
    id: 'rule.condition-test',
    rule_name: 'Condition Test',
    severity: 'critical',
    trigger: {
      events: ['pipeline.completed'],
      condition: 'error_count > 0 AND severity == \'high\'',
    },
    action: { type: 'escalate' },
  }));

  // Rule 6: OR condition
  fs.writeFileSync(path.join(FIXTURE_DIR, 'rule-or-condition.json'), JSON.stringify({
    id: 'rule.or-condition-test',
    rule_name: 'OR Condition Test',
    severity: 'high',
    trigger: {
      events: ['alert.triggered'],
      condition: 'is_critical OR escalation_required',
    },
    action: { type: 'page' },
  }));

  // Rule 7: no events (should not be indexed)
  fs.writeFileSync(path.join(FIXTURE_DIR, 'rule-no-events.json'), JSON.stringify({
    id: 'rule.no-events',
    rule_name: 'Manual Only',
    severity: 'low',
    trigger: { events: [] },
    action: { type: 'manual' },
  }));

  // Rule 8: governance priority
  fs.writeFileSync(path.join(FIXTURE_DIR, 'rule-gov-priority.json'), JSON.stringify({
    id: 'rule.gov-priority',
    name: 'Gov Priority',
    trigger: { events: ['skill.created'] },
    governance: { priority: 'HIGH' },
    action: { type: 'check' },
  }));
}

function teardownFixture() {
  if (fs.existsSync(FIXTURE_DIR)) fs.rmSync(FIXTURE_DIR, { recursive: true });
}

// ── Tests ────────────────────────────────────────────────────────────────────

section('Pattern Classification');
{
  assertEqual(classifyPattern('skill.created').type, MATCH_TYPES.EXACT, 'exact pattern');
  assertEqual(classifyPattern('design.*').type, MATCH_TYPES.PREFIX, 'prefix wildcard');
  assertEqual(classifyPattern('*.failed').type, MATCH_TYPES.SUFFIX, 'suffix wildcard');
  assertEqual(classifyPattern('*').type, MATCH_TYPES.WILDCARD, 'global wildcard');
}

section('Pattern Matching');
{
  assertEqual(matchPattern('skill.created', 'skill.created'), 'exact', 'exact match');
  assertEqual(matchPattern('skill.updated', 'skill.created'), null, 'exact no match');
  assertEqual(matchPattern('design.document.created', 'design.*'), 'prefix', 'prefix match');
  assertEqual(matchPattern('skill.created', 'design.*'), null, 'prefix no match');
  assertEqual(matchPattern('pipeline.failed', '*.failed'), 'suffix', 'suffix match');
  assertEqual(matchPattern('pipeline.completed', '*.failed'), null, 'suffix no match');
  assertEqual(matchPattern('anything.at.all', '*'), 'wildcard', 'wildcard match');
}

section('Priority Normalization');
{
  assertEqual(normalizePriority({ severity: 'critical' }), 100, 'severity critical → 100');
  assertEqual(normalizePriority({ severity: 'high' }), 80, 'severity high → 80');
  assertEqual(normalizePriority({ priority: 10 }), 10, 'numeric priority 10');
  assertEqual(normalizePriority({ governance: { priority: 'HIGH' } }), 80, 'governance HIGH → 80');
  assertEqual(normalizePriority({}), 50, 'default → 50');
  assertEqual(normalizePriority({ severity: 'HIGH' }), 80, 'case insensitive');
}

section('Condition Evaluation');
{
  const evt = { type: 'test', payload: { error_count: 3, severity: 'high', is_critical: true } };

  let r = evaluateCondition('', evt);
  assert(r.shouldFire, 'empty condition → fire');

  r = evaluateCondition(null, evt);
  assert(r.shouldFire, 'null condition → fire');

  r = evaluateCondition('error_count > 0', evt);
  assert(r.shouldFire, 'simple comparison true');

  r = evaluateCondition('error_count > 10', evt);
  assert(!r.shouldFire, 'simple comparison false');

  r = evaluateCondition("error_count > 0 AND severity == 'high'", evt);
  assert(r.shouldFire, 'AND both true');

  r = evaluateCondition("error_count > 10 AND severity == 'high'", evt);
  assert(!r.shouldFire, 'AND first false');

  r = evaluateCondition('is_critical OR escalation_required', evt);
  assert(r.shouldFire, 'OR first true');

  r = evaluateCondition('missing_field OR also_missing', evt);
  assert(!r.shouldFire, 'OR both falsy');

  r = evaluateCondition('is_critical', evt);
  assert(r.shouldFire, 'boolean truthiness');
}

section('Rule Loading (Fixture)');
setupFixture();
{
  const matcher = new ISCRuleMatcher({ rulesDir: FIXTURE_DIR, hotReload: false });
  const result = matcher.loadRules();

  assertEqual(result.total, 8, 'loaded 8 rules');
  assertEqual(result.errors.length, 0, 'no parse errors');
  assert(matcher.exactIndex.size > 0, 'has exact index entries');
  assert(matcher.prefixPatterns.length === 1, 'has 1 prefix pattern');
  assert(matcher.suffixPatterns.length === 1, 'has 1 suffix pattern');
  assert(matcher.wildcardRules.length === 1, 'has 1 wildcard rule');

  const stats = matcher.stats();
  assertEqual(stats.totalRules, 8, 'stats totalRules');
  assertEqual(stats.rulesWithNoEvents, 1, 'stats rulesWithNoEvents (rule-no-events)');
}

section('Matching - Exact');
{
  const matcher = new ISCRuleMatcher({ rulesDir: FIXTURE_DIR, hotReload: false });
  matcher.loadRules();

  const matches = matcher.match({ type: 'skill.created', payload: {} });
  // Should match: exact (rule-exact + rule-gov-priority), wildcard
  const exactMatches = matches.filter(m => m.match_type === 'exact');
  assert(exactMatches.length === 2, `exact matches for skill.created: ${exactMatches.length}`);
  assert(matches.some(m => m.match_type === 'wildcard'), 'also gets wildcard');
  // Exact should come before wildcard
  assert(matches[0].match_type === 'exact', 'exact sorted first');
}

section('Matching - Prefix');
{
  const matcher = new ISCRuleMatcher({ rulesDir: FIXTURE_DIR, hotReload: false });
  matcher.loadRules();

  const matches = matcher.match({ type: 'design.document.created', payload: {} });
  assert(matches.some(m => m.match_type === 'prefix'), 'prefix match found');
  assert(matches.some(m => m.match_type === 'wildcard'), 'wildcard also matches');
  // No exact for this event
  assert(!matches.some(m => m.match_type === 'exact'), 'no exact match');
}

section('Matching - Suffix');
{
  const matcher = new ISCRuleMatcher({ rulesDir: FIXTURE_DIR, hotReload: false });
  matcher.loadRules();

  const matches = matcher.match({ type: 'pipeline.failed', payload: {} });
  assert(matches.some(m => m.match_type === 'suffix'), 'suffix match found');
  assert(matches.some(m => m.match_type === 'wildcard'), 'wildcard also matches');
}

section('Matching - Wildcard Only');
{
  const matcher = new ISCRuleMatcher({ rulesDir: FIXTURE_DIR, hotReload: false });
  matcher.loadRules();

  const matches = matcher.match({ type: 'unknown.random.event', payload: {} });
  assertEqual(matches.length, 1, 'only wildcard matches');
  assertEqual(matches[0].match_type, 'wildcard', 'is wildcard type');
}

section('Matching - Empty/Invalid Event');
{
  const matcher = new ISCRuleMatcher({ rulesDir: FIXTURE_DIR, hotReload: false });
  matcher.loadRules();

  assertEqual(matcher.match(null).length, 0, 'null event → empty');
  assertEqual(matcher.match({}).length, 0, 'no type → empty');
  assertEqual(matcher.match({ type: '' }).length, 0, 'empty type → empty');
}

section('Evaluate - With Condition');
{
  const matcher = new ISCRuleMatcher({ rulesDir: FIXTURE_DIR, hotReload: false });
  matcher.loadRules();

  const condRule = matcher.rules.find(r => r.id === 'rule.condition-test');
  assert(!!condRule, 'found condition rule');

  const event1 = { type: 'pipeline.completed', payload: { error_count: 5, severity: 'high' } };
  const r1 = matcher.evaluate(condRule, event1);
  assert(r1.shouldFire, 'condition met → shouldFire');

  const event2 = { type: 'pipeline.completed', payload: { error_count: 0, severity: 'low' } };
  const r2 = matcher.evaluate(condRule, event2);
  assert(!r2.shouldFire, 'condition not met → no fire');
}

section('Evaluate - No Condition');
{
  const matcher = new ISCRuleMatcher({ rulesDir: FIXTURE_DIR, hotReload: false });
  matcher.loadRules();

  const rule = matcher.rules.find(r => r.id === 'rule.exact-match-test');
  const result = matcher.evaluate(rule, { type: 'skill.created', payload: {} });
  assert(result.shouldFire, 'no condition → always fire');
}

section('Process (Match + Evaluate)');
{
  const matcher = new ISCRuleMatcher({ rulesDir: FIXTURE_DIR, hotReload: false });
  matcher.loadRules();

  // pipeline.completed with error_count=0 → condition-test should be excluded
  const results = matcher.process({ type: 'pipeline.completed', payload: { error_count: 0 } });
  assert(!results.some(r => r.rule.id === 'rule.condition-test'), 'condition-test excluded when condition fails');
  // Wildcard should still be there
  assert(results.some(r => r.match_type === 'wildcard'), 'wildcard still fires');

  // pipeline.completed with error_count=5, severity=high → condition-test should fire
  const results2 = matcher.process({ type: 'pipeline.completed', payload: { error_count: 5, severity: 'high' } });
  assert(results2.some(r => r.rule.id === 'rule.condition-test'), 'condition-test fires when condition met');
}

section('Decision Log');
{
  const matcher = new ISCRuleMatcher({ rulesDir: FIXTURE_DIR, hotReload: false });
  matcher.loadRules();

  matcher.match({ type: 'skill.created', payload: {} });
  matcher.match({ type: 'design.something', payload: {} });

  const log = matcher.getDecisionLog();
  assert(log.length >= 2, `decision log has ${log.length} entries`);
  assert(log[0].event_type === 'skill.created', 'log entry has event_type');
  assert(typeof log[0].candidates_count === 'number', 'log entry has candidates_count');

  matcher.clearDecisionLog();
  assertEqual(matcher.getDecisionLog().length, 0, 'log cleared');
}

section('Decision Log Rotation');
{
  const matcher = new ISCRuleMatcher({ rulesDir: FIXTURE_DIR, hotReload: false, maxDecisionLog: 10 });
  matcher.loadRules();

  for (let i = 0; i < 20; i++) {
    matcher.match({ type: `test.event.${i}`, payload: {} });
  }
  assert(matcher.decisionLog.length <= 10, `log rotated: ${matcher.decisionLog.length} <= 10`);
}

section('Hot Reload');
{
  const matcher = new ISCRuleMatcher({ rulesDir: FIXTURE_DIR, hotReload: false });
  matcher.loadRules();

  const countBefore = matcher.rules.length;

  // Add a new rule file
  fs.writeFileSync(path.join(FIXTURE_DIR, 'rule-hot-new.json'), JSON.stringify({
    id: 'rule.hot-new',
    rule_name: 'Hot New Rule',
    severity: 'medium',
    trigger: { events: ['hot.reload.test'] },
    action: { type: 'test' },
  }));

  // Force reload
  const result = matcher.reload();
  assert(result.total === countBefore + 1, `hot reload added rule: ${result.total}`);

  // Verify new rule is matchable
  const matches = matcher.match({ type: 'hot.reload.test', payload: {} });
  assert(matches.some(m => m.rule.id === 'rule.hot-new'), 'hot-reloaded rule matches');
}

section('Explain (Debugging Helper)');
{
  const matcher = new ISCRuleMatcher({ rulesDir: FIXTURE_DIR, hotReload: false });
  matcher.loadRules();

  const explanation = matcher.explain('skill.created');
  assert(explanation.length > 0, 'explain returns matches');
  assert(explanation[0].match_type === 'exact', 'explain shows match type');
}

section('Real Rules Integration');
{
  // Test against actual ISC rules directory
  const realDir = path.resolve(__dirname, '../../skills/isc-core/rules');
  if (fs.existsSync(realDir)) {
    const matcher = new ISCRuleMatcher({ rulesDir: realDir, hotReload: false });
    const result = matcher.loadRules();
    assert(result.total > 0, `loaded ${result.total} real rules`);
    assert(result.errors.length === 0, `no parse errors in real rules (${result.errors.length})`);

    const stats = matcher.stats();
    process.stdout.write(`  ℹ️  Stats: ${JSON.stringify(stats, null, 0)}\n`);

    // Test matching a common event
    const matches = matcher.match({ type: 'skill.created', payload: {} });
    assert(matches.length > 0, `skill.created matches ${matches.length} real rules`);

    // List event types
    const eventTypes = matcher.listEventTypes();
    process.stdout.write(`  ℹ️  ${eventTypes.length} distinct event types registered\n`);
  } else {
    process.stdout.write('  ⏭  Skipped (real rules dir not found)\n');
  }
}

section('Singleton');
{
  // getDefaultMatcher uses the real rules dir
  const m1 = getDefaultMatcher({ hotReload: false });
  const m2 = getDefaultMatcher();
  assert(m1 === m2, 'getDefaultMatcher returns same instance');
  assert(m1.rules.length > 0, 'default matcher has rules loaded');
  m1.destroy();
}

// ── Cleanup & Report ─────────────────────────────────────────────────────────

teardownFixture();

process.stdout.write('\n════════════════════════════════════════\n');
process.stdout.write(`  Tests: ${passed} passed, ${failed} failed\n`);
if (failures.length > 0) {
  process.stdout.write('  Failures:\n');
  for (const f of failures) process.stdout.write('    ❌ ' + f + '\n');
}
process.stdout.write('════════════════════════════════════════\n');

process.exit(failed > 0 ? 1 : 0);
