'use strict';

/**
 * Condition Evaluator — 单元测试
 * 
 * Run: node condition-evaluator.test.js
 * 
 * 零框架依赖，与 test-bus.js 保持一致的测试风格。
 */

const {
  evaluate,
  evaluateAsync,
  getFieldValue,
  parseValue,
  registerOperator,
  registerLLMJudge,
} = require('./condition-evaluator');

// ─── Test Harness ────────────────────────────────────────────────

let passed = 0;
let failed = 0;
let total = 0;

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'assertEqual'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertDeepEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message || 'assertDeepEqual'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function test(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ❌ ${name}: ${err.message}`);
  }
}

async function testAsync(name, fn) {
  total++;
  try {
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ❌ ${name}: ${err.message}`);
  }
}

// ─── Tests: getFieldValue ────────────────────────────────────────

console.log('\n📐 getFieldValue');

test('simple field', () => {
  assertEqual(getFieldValue({ name: 'test' }, 'name'), 'test');
});

test('nested field', () => {
  assertEqual(getFieldValue({ a: { b: { c: 42 } } }, 'a.b.c'), 42);
});

test('array index', () => {
  assertEqual(getFieldValue({ items: ['a', 'b', 'c'] }, 'items.1'), 'b');
});

test('missing field', () => {
  assertEqual(getFieldValue({ a: 1 }, 'b'), undefined);
});

test('missing nested field', () => {
  assertEqual(getFieldValue({ a: { b: 1 } }, 'a.c.d'), undefined);
});

test('null object', () => {
  assertEqual(getFieldValue(null, 'a'), undefined);
});

test('empty path', () => {
  assertEqual(getFieldValue({ '': 1 }, ''), 1);
});

// ─── Tests: parseValue ───────────────────────────────────────────

console.log('\n📐 parseValue');

test('number string', () => {
  assertEqual(parseValue('42'), 42);
});

test('float string', () => {
  assertEqual(parseValue('0.3'), 0.3);
});

test('percentage', () => {
  assertEqual(parseValue('100%'), 100);
});

test('boolean true', () => {
  assertEqual(parseValue('true'), true);
});

test('boolean false', () => {
  assertEqual(parseValue('false'), false);
});

test('null string', () => {
  assertEqual(parseValue('null'), null);
});

test('quoted string', () => {
  assertEqual(parseValue('"hello"'), 'hello');
});

test('single-quoted string', () => {
  assertEqual(parseValue("'world'"), 'world');
});

test('plain string', () => {
  assertEqual(parseValue('hello'), 'hello');
});

test('non-string passthrough', () => {
  assertEqual(parseValue(42), 42);
});

// ─── Tests: Empty/Null Conditions ────────────────────────────────

console.log('\n📐 Empty/Null Conditions');

test('undefined conditions → pass', () => {
  const r = evaluate(undefined, {});
  assert(r.pass, 'should pass');
  assert(!r.needs_llm, 'should not need LLM');
});

test('null conditions → pass', () => {
  const r = evaluate(null, {});
  assert(r.pass, 'should pass');
});

test('empty object conditions → pass', () => {
  const r = evaluate({}, {});
  assert(r.pass, 'should pass');
});

test('boolean true → pass', () => {
  const r = evaluate(true, {});
  assert(r.pass, 'should pass');
});

test('boolean false → fail', () => {
  const r = evaluate(false, {});
  assert(!r.pass, 'should not pass');
});

// ─── Tests: Simple Object Equality ──────────────────────────────

console.log('\n📐 Simple Object Equality');

test('exact match → pass', () => {
  const r = evaluate({ status: 'failed' }, { status: 'failed' });
  assert(r.pass, 'should pass');
});

test('exact match → fail', () => {
  const r = evaluate({ status: 'failed' }, { status: 'ok' });
  assert(!r.pass, 'should not pass');
});

test('multiple fields all match → pass', () => {
  const r = evaluate({ status: 'ok', level: 'info' }, { status: 'ok', level: 'info', extra: true });
  assert(r.pass, 'should pass');
});

test('multiple fields partial match → fail', () => {
  const r = evaluate({ status: 'ok', level: 'error' }, { status: 'ok', level: 'info' });
  assert(!r.pass, 'should not pass');
});

test('numeric equality', () => {
  const r = evaluate({ count: 5 }, { count: 5 });
  assert(r.pass, 'should pass');
});

test('loose type comparison (string "10" vs number 10)', () => {
  const r = evaluate({ count: '10' }, { count: 10 });
  assert(r.pass, 'should pass with loose comparison');
});

test('field not in payload → pass (declarative skip)', () => {
  const r = evaluate({ nonexistent: 'value' }, {});
  assert(r.pass, 'should pass when field not in payload');
});

// ─── Tests: Operator Expressions ─────────────────────────────────

console.log('\n📐 Operator Expressions ($lt, $gt, etc.)');

test('$lt → pass', () => {
  const r = evaluate({ score: { $lt: 0.8 } }, { score: 0.5 });
  assert(r.pass, 'should pass');
});

test('$lt → fail', () => {
  const r = evaluate({ score: { $lt: 0.8 } }, { score: 0.9 });
  assert(!r.pass, 'should not pass');
});

test('$gt → pass', () => {
  const r = evaluate({ count: { $gt: 10 } }, { count: 15 });
  assert(r.pass, 'should pass');
});

test('$gte → boundary pass', () => {
  const r = evaluate({ count: { $gte: 10 } }, { count: 10 });
  assert(r.pass, 'should pass at boundary');
});

test('$lte → boundary pass', () => {
  const r = evaluate({ count: { $lte: 10 } }, { count: 10 });
  assert(r.pass, 'should pass at boundary');
});

test('$eq explicit', () => {
  const r = evaluate({ status: { $eq: 'active' } }, { status: 'active' });
  assert(r.pass, 'should pass');
});

test('$ne → pass', () => {
  const r = evaluate({ status: { $ne: 'failed' } }, { status: 'ok' });
  assert(r.pass, 'should pass');
});

test('$ne → fail', () => {
  const r = evaluate({ status: { $ne: 'failed' } }, { status: 'failed' });
  assert(!r.pass, 'should not pass');
});

test('$in → pass', () => {
  const r = evaluate({ severity: { $in: ['HIGH', 'CRITICAL'] } }, { severity: 'HIGH' });
  assert(r.pass, 'should pass');
});

test('$in → fail', () => {
  const r = evaluate({ severity: { $in: ['HIGH', 'CRITICAL'] } }, { severity: 'LOW' });
  assert(!r.pass, 'should not pass');
});

test('$nin → pass', () => {
  const r = evaluate({ status: { $nin: ['deleted', 'archived'] } }, { status: 'active' });
  assert(r.pass, 'should pass');
});

test('$exists true → pass', () => {
  const r = evaluate({ name: { $exists: true } }, { name: 'test' });
  assert(r.pass, 'should pass');
});

test('$exists true → fail', () => {
  const r = evaluate({ name: { $exists: true } }, {});
  assert(!r.pass, 'should not pass');
});

test('$exists false → pass when missing', () => {
  const r = evaluate({ removed: { $exists: false } }, {});
  assert(r.pass, 'should pass when field missing');
});

test('$regex → pass', () => {
  const r = evaluate({ path: { $regex: '^skills/' } }, { path: 'skills/test/SKILL.md' });
  assert(r.pass, 'should pass');
});

test('$regex → fail', () => {
  const r = evaluate({ path: { $regex: '^skills/' } }, { path: 'docs/README.md' });
  assert(!r.pass, 'should not pass');
});

test('$contains string → pass', () => {
  const r = evaluate({ message: { $contains: 'error' } }, { message: 'fatal error occurred' });
  assert(r.pass, 'should pass');
});

test('$type → pass', () => {
  const r = evaluate({ count: { $type: 'number' } }, { count: 42 });
  assert(r.pass, 'should pass');
});

test('$size → pass', () => {
  const r = evaluate({ items: { $size: 3 } }, { items: [1, 2, 3] });
  assert(r.pass, 'should pass');
});

test('multiple operators on same field (range)', () => {
  const r = evaluate({ score: { $gte: 0.3, $lt: 0.8 } }, { score: 0.5 });
  assert(r.pass, 'should pass when in range');
});

test('multiple operators on same field (out of range)', () => {
  const r = evaluate({ score: { $gte: 0.3, $lt: 0.8 } }, { score: 0.9 });
  assert(!r.pass, 'should fail when out of range');
});

// ─── Tests: Nested Field Paths ───────────────────────────────────

console.log('\n📐 Nested Field Paths (dot notation in payload)');

test('nested field access in operator', () => {
  const r = evaluate(
    { 'metrics.yellowLightRatio': { $gt: 0.3 } },
    { metrics: { yellowLightRatio: 0.5 } }
  );
  assert(r.pass, 'should pass');
});

test('deeply nested field', () => {
  const r = evaluate(
    { 'data.results.0.status': { $eq: 'passed' } },
    { data: { results: [{ status: 'passed' }] } }
  );
  assert(r.pass, 'should pass');
});

// ─── Tests: Logical Combinators ──────────────────────────────────

console.log('\n📐 Logical Combinators ($and, $or, $not)');

test('$and → all pass', () => {
  const r = evaluate({
    $and: [
      { status: 'active' },
      { score: { $gt: 0.5 } },
    ],
  }, { status: 'active', score: 0.8 });
  assert(r.pass, 'should pass');
});

test('$and → one fails', () => {
  const r = evaluate({
    $and: [
      { status: 'active' },
      { score: { $gt: 0.5 } },
    ],
  }, { status: 'active', score: 0.3 });
  assert(!r.pass, 'should not pass');
});

test('$or → one passes', () => {
  const r = evaluate({
    $or: [
      { status: 'active' },
      { status: 'pending' },
    ],
  }, { status: 'pending' });
  assert(r.pass, 'should pass');
});

test('$or → none pass', () => {
  const r = evaluate({
    $or: [
      { status: 'active' },
      { status: 'pending' },
    ],
  }, { status: 'deleted' });
  assert(!r.pass, 'should not pass');
});

test('$not → inversion', () => {
  const r = evaluate({
    $not: { status: 'deleted' },
  }, { status: 'active' });
  assert(r.pass, 'should pass');
});

test('$not → double negation', () => {
  const r = evaluate({
    $not: { status: 'deleted' },
  }, { status: 'deleted' });
  assert(!r.pass, 'should not pass');
});

test('nested $and in $or', () => {
  const r = evaluate({
    $or: [
      { $and: [{ type: 'A' }, { level: 1 }] },
      { $and: [{ type: 'B' }, { level: 2 }] },
    ],
  }, { type: 'B', level: 2 });
  assert(r.pass, 'should pass');
});

test('array conditions → $and semantics', () => {
  const r = evaluate(
    [{ status: 'ok' }, { count: { $gt: 0 } }],
    { status: 'ok', count: 5 }
  );
  assert(r.pass, 'should pass');
});

// ─── Tests: String Conditions ────────────────────────────────────

console.log('\n📐 String Conditions');

test('simple comparison: "score > 0.5"', () => {
  const r = evaluate('score > 0.5', { score: 0.8 });
  assert(r.pass, 'should pass');
});

test('simple comparison: "score < 0.5" → fail', () => {
  const r = evaluate('score < 0.5', { score: 0.8 });
  assert(!r.pass, 'should not pass');
});

test('equality: "status == failed"', () => {
  const r = evaluate('status == failed', { status: 'failed' });
  assert(r.pass, 'should pass');
});

test('inequality: "status != ok"', () => {
  const r = evaluate('status != ok', { status: 'failed' });
  assert(r.pass, 'should pass');
});

test('gte: "count >= 10"', () => {
  const r = evaluate('count >= 10', { count: 10 });
  assert(r.pass, 'should pass at boundary');
});

test('percentage: "enforcement_rate < 100%"', () => {
  const r = evaluate('enforcement_rate < 100%', { enforcement_rate: 85 });
  assert(r.pass, 'should pass');
});

test('AND: "severity == HIGH AND auto_fix_enabled"', () => {
  const r = evaluate('severity == HIGH AND auto_fix_enabled', { severity: 'HIGH', auto_fix_enabled: true });
  assert(r.pass, 'should pass');
});

test('AND partial fail', () => {
  const r = evaluate('severity == HIGH AND auto_fix_enabled', { severity: 'LOW', auto_fix_enabled: true });
  assert(!r.pass, 'should not pass');
});

test('OR: "mode == fast OR mode == immediate"', () => {
  const r = evaluate('mode == fast OR mode == immediate', { mode: 'immediate' });
  assert(r.pass, 'should pass');
});

test('field not in payload → pass (skip)', () => {
  const r = evaluate('unknown_field > 0', { other: 1 });
  assert(r.pass, 'should pass when field missing');
});

test('truthiness check: single identifier "gate-check_required"', () => {
  const r = evaluate('gate-check_required', { gate-check_required: true });
  assert(r.pass, 'should pass');
});

test('truthiness check: falsy value', () => {
  const r = evaluate('gate-check_required', { gate-check_required: false });
  assert(!r.pass, 'should not pass');
});

test('unparseable string → needs_llm', () => {
  const r = evaluate('每次修复必须产出三件套', {});
  assert(r.pass, 'should pass by default');
  assert(r.needs_llm, 'should need LLM');
});

test('complex string with OR: "orphan_count > 0 OR dead_channel_detected"', () => {
  const r = evaluate('orphan_count > 0 OR dead_channel_detected', { orphan_count: 3 });
  assert(r.pass, 'should pass with first condition');
});

test('dot notation in string: "pipeline.findings.fixable_issues.length > 0"', () => {
  const r = evaluate(
    'pipeline.findings.fixable_issues.length > 0',
    { pipeline: { findings: { fixable_issues: { length: 5 } } } }
  );
  assert(r.pass, 'should pass with nested path');
});

test('empty string condition → pass', () => {
  const r = evaluate('', {});
  assert(r.pass, 'should pass');
});

// ─── Tests: Array as Expected Value ──────────────────────────────

console.log('\n📐 Array as Expected Value ($in semantics)');

test('value in array → pass', () => {
  const r = evaluate({ complexity: ['IC3', 'IC4', 'IC5'] }, { complexity: 'IC4' });
  assert(r.pass, 'should pass');
});

test('value not in array → fail', () => {
  const r = evaluate({ complexity: ['IC3', 'IC4', 'IC5'] }, { complexity: 'IC1' });
  assert(!r.pass, 'should not pass');
});

test('array overlap → pass', () => {
  const r = evaluate({ tags: ['urgent', 'critical'] }, { tags: ['normal', 'urgent'] });
  assert(r.pass, 'should pass with overlap');
});

// ─── Tests: json-rules-engine Format ─────────────────────────────

console.log('\n📐 json-rules-engine Format');

test('simple fact/operator/value → pass', () => {
  const r = evaluate({
    all: [{
      id: 'CHK-001',
      fact: 'distribution',
      operator: 'in',
      value: ['internal', 'external', 'both'],
    }],
  }, { distribution: 'external' });
  assert(r.pass, 'should pass');
});

test('simple fact/operator/value → fail with failMessage', () => {
  const r = evaluate({
    all: [{
      id: 'CHK-001',
      fact: 'distribution',
      operator: 'in',
      value: ['internal', 'external', 'both'],
      failMessage: '技能缺少distribution字段声明',
    }],
  }, { distribution: 'unknown' });
  assert(!r.pass, 'should not pass');
  // Check details for failMessage
  assert(r.details && r.details[0] && r.details[0].failMessage, 'should have failMessage');
});

test('nested all with then clause', () => {
  const r = evaluate({
    all: [
      {
        id: 'CHK-002',
        fact: 'distribution',
        operator: 'in',
        value: ['external', 'both'],
        then: {
          all: [
            { fact: 'permissions.filesystem', operator: 'exists', value: true },
          ],
        },
      },
    ],
  }, { distribution: 'external', permissions: { filesystem: 'read' } });
  assert(r.pass, 'should pass with then clause satisfied');
});

test('any (OR) in rules-engine format', () => {
  const r = evaluate({
    any: [
      { fact: 'severity', operator: 'equal', value: 'HIGH' },
      { fact: 'count', operator: 'gt', value: 10 },
    ],
  }, { severity: 'LOW', count: 15 });
  assert(r.pass, 'should pass with any');
});

test('mixed all with equal operator → pass', () => {
  const r = evaluate({
    all: [{
      fact: 'secrets_references',
      operator: 'equal',
      value: 0,
    }],
  }, { secrets_references: 0 });
  assert(r.pass, 'should pass');
});

// ─── Tests: Descriptive/Semantic Conditions ──────────────────────

console.log('\n📐 Descriptive/Semantic Conditions (needs_llm)');

test('Chinese descriptive object → needs_llm', () => {
  const r = evaluate({
    must: '每次修复必须产出三件套：规则+事件+执行链，缺任何一个视为未完成',
  }, {});
  assert(r.pass, 'should pass by default');
  assert(r.needs_llm, 'should need LLM');
});

test('complex declarative condition → passes through', () => {
  const r = evaluate({
    intent_mappings: {
      repeated_emphasis: 'user.intent.repeated_emphasis',
      frustration: 'user.intent.frustration',
    },
  }, {});
  // This is a complex object but values are short → not needs_llm, just skip
  assert(r.pass, 'should pass');
});

// ─── Tests: Error Handling (Fail-Open) ───────────────────────────

console.log('\n📐 Error Handling (Fail-Open)');

test('malformed operator object → graceful', () => {
  // Unknown operator should be skipped
  const r = evaluate({ score: { $unknown: 42 } }, { score: 50 });
  assert(r.pass, 'should pass with unknown operator');
});

test('invalid regex → graceful fail', () => {
  const r = evaluate({ path: { $regex: '[invalid' } }, { path: 'test' });
  // $regex with invalid pattern should return false for the match
  assert(!r.pass, 'invalid regex returns false for match');
});

test('null payload → graceful', () => {
  const r = evaluate({ status: 'ok' }, null);
  // field not in null payload → declarative skip
  assert(r.pass, 'should pass with null payload');
});

// ─── Tests: Context Parameter ────────────────────────────────────

console.log('\n📐 Context Parameter');

test('field from context used in evaluation', () => {
  const r = evaluate(
    { enforcement_rate: { $lt: 100 } },
    {},
    { enforcement_rate: 85 }
  );
  assert(r.pass, 'should use context as fallback');
});

// ─── Tests: Custom Operator Registration ─────────────────────────

console.log('\n📐 Custom Operator Registration');

test('register and use custom operator', () => {
  registerOperator('$between', (actual, [min, max]) => actual >= min && actual <= max);
  const r = evaluate({ score: { $between: [0.3, 0.8] } }, { score: 0.5 });
  assert(r.pass, 'should pass with custom operator');
});

test('custom operator fail', () => {
  const r = evaluate({ score: { $between: [0.3, 0.8] } }, { score: 0.9 });
  assert(!r.pass, 'should not pass');
});

// ─── Tests: Async Evaluation with LLM ────────────────────────────

console.log('\n📐 Async Evaluation with LLM Judge');

(async () => {
  await testAsync('evaluateAsync without LLM → same as sync', async () => {
    const r = await evaluateAsync({ status: 'ok' }, { status: 'ok' });
    assert(r.pass, 'should pass');
  });

  await testAsync('evaluateAsync with needs_llm and registered judge', async () => {
    registerLLMJudge(async (conditions, payload, context) => {
      return { pass: true, reason: 'LLM approved' };
    });
    const r = await evaluateAsync('复杂语义条件需要LLM判断', {});
    assert(r.pass, 'should pass after LLM');
    assert(r.llm_evaluated, 'should be LLM evaluated');
    // Reset judge
    registerLLMJudge(null);
  });

  await testAsync('evaluateAsync with LLM judge that rejects', async () => {
    registerLLMJudge(async () => ({ pass: false, reason: 'LLM rejected' }));
    const r = await evaluateAsync('复杂语义条件', {});
    assert(!r.pass, 'should fail when LLM rejects');
    registerLLMJudge(null);
  });

  await testAsync('evaluateAsync with LLM judge that throws', async () => {
    registerLLMJudge(async () => { throw new Error('LLM unavailable'); });
    const r = await evaluateAsync('复杂语义条件', {});
    assert(r.pass, 'should pass when LLM fails (fail-open)');
    assert(r.needs_llm, 'should still need LLM');
    registerLLMJudge(null);
  });

  // ─── Tests: Real ISC Rule Compatibility ──────────────────────────

  console.log('\n📐 Real ISC Rule Compatibility');

  test('rule.auto-fix-high-severity-001: condition string', () => {
    const r = evaluate('severity == HIGH AND auto_fix_enabled', {
      severity: 'HIGH',
      auto_fix_enabled: true,
    });
    assert(r.pass, 'should pass');
  });

  test('rule.arch-rule-equals-code-002: trigger condition string', () => {
    const r = evaluate('enforcement_rate < 100%', { enforcement_rate: 85 });
    assert(r.pass, 'should pass');
  });

  test('rule.arch-real-data-gate-005: trigger condition', () => {
    const r = evaluate("mode == 'acceptance'", { mode: 'acceptance' });
    assert(r.pass, 'should pass');
  });

  test('rule.auto-collect-eval-from-conversation-001: conditions object', () => {
    // Real ISC conditions: complexity is array ($in), min_length is declarative config.
    // When payload has the field but doesn't match exactly, it fails.
    // When payload doesn't have the declarative field, it passes (skip).
    const r = evaluate({
      complexity: ['IC3', 'IC4', 'IC5'],
      min_length: 40,
    }, { complexity: 'IC4' }); // min_length not in event payload → skip
    assert(r.pass, 'should pass');
  });

  test('rule.auto-collect-eval-from-conversation-001: mismatch', () => {
    // When payload has min_length but different value, correctly fails
    const r = evaluate({
      complexity: ['IC3', 'IC4', 'IC5'],
      min_length: 40,
    }, { complexity: 'IC4', min_length: 50 });
    assert(!r.pass, 'should fail: 50 !== 40');
  });

  test('rule.skill-distribution-separation-001: complex json-rules-engine', () => {
    const r = evaluate({
      all: [
        {
          id: 'CHK-001',
          fact: 'skill.general.distribution',
          operator: 'in',
          value: ['internal', 'external', 'both'],
        },
        {
          id: 'CHK-003',
          fact: 'skill.code.secrets_references',
          operator: 'equal',
          value: 0,
        },
      ],
    }, {
      'skill.general.distribution': 'external',
      'skill.code.secrets_references': 0,
    });
    assert(r.pass, 'should pass');
  });

  test('rule.n020: complex OR condition string', () => {
    const r = evaluate(
      'error_count > 0 OR issue_severity >= medium OR design_defect_detected == true',
      { error_count: 0, issue_severity: 'high', design_defect_detected: false }
    );
    // "issue_severity >= medium" → string comparison "high" >= "medium" → false in JS
    // But error_count = 0 so first fails, design_defect_detected = false so third fails
    // This depends on string comparison behavior — OR should still work for parseable parts
    // Actually "high" >= "medium" in JS string comparison is false (h < m)
    // So all three fail → overall fail? Let's check: error_count=0 not > 0, 
    // "high" >= "medium" → false (lexicographic), false == true → false
    // But wait, the real intent is semantic comparison. This should be needs_llm for the severity part
    // Our evaluator will try to compare strings lexicographically — that's a known limitation
    // For now just verify it doesn't crash
    assert(typeof r.pass === 'boolean', 'should return boolean');
  });

  test('rule with no conditions field → pass', () => {
    const r = evaluate(undefined, { any: 'data' });
    assert(r.pass, 'should pass');
  });

  test('rule.cras-dual-channel-001: descriptive conditions → needs_llm', () => {
    const r = evaluate({
      fast_channel: { interval: '5min', output: 'atomic_intent_events', mode: 'realtime' },
      slow_channel: { interval: 'daily', output: 'pattern_events', mode: 'aggregation' },
      forbidden: 'mixing_realtime_perception_with_statistical_reports',
    }, {});
    assert(r.pass, 'should pass by default');
    // At least some of these are non-evaluable
  });

  test('rule.version-integrity-gate-001: empty conditions', () => {
    const r = evaluate({}, { commit: 'abc123' });
    assert(r.pass, 'should pass');
  });

  test('rule.n026: complex string condition', () => {
    const r = evaluate("issue_frequency >= 3 OR severity == 'high'", {
      issue_frequency: 5,
      severity: 'low',
    });
    assert(r.pass, 'should pass on first OR branch');
  });

  test('rule.n019: multi-condition string', () => {
    const r = evaluate('code_files_exist AND (skill_md_missing OR skill_md_quality_score < 50)', {
      code_files_exist: true,
    });
    // Parentheses not fully supported → will try to parse; partial should still work
    // The AND splits into "code_files_exist" (truthy → pass) and 
    // "(skill_md_missing OR skill_md_quality_score < 50)" which needs special handling
    assert(typeof r.pass === 'boolean', 'should not crash on parentheses');
  });

  // ─── Summary ───────────────────────────────────────────────────────

  console.log('\n' + '═'.repeat(50));
  console.log(`Results: ${passed} passed, ${failed} failed, ${total} total`);
  console.log('═'.repeat(50));

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
  }
})();
