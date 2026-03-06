'use strict';
const assert = require('assert');
const cb = require('./circuit-breaker');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  ✅ ${name}`); }
  catch(e) { fail++; console.log(`  ❌ ${name}: ${e.message}`); }
}

console.log('circuit-breaker tests:');

test('exports check/configure/reset/getState', () => {
  assert.ok(typeof cb.check === 'function');
  assert.ok(typeof cb.configure === 'function');
  assert.ok(typeof cb.reset === 'function');
  assert.ok(typeof cb.getState === 'function');
});

test('check returns object with allowed', () => {
  cb.reset();
  const r = cb.check('test.event', {});
  assert.ok(typeof r === 'object');
  assert.ok('allowed' in r);
});

test('allows normal events', () => {
  cb.reset();
  const r = cb.check('normal.event', {});
  assert.strictEqual(r.allowed, true);
});

test('per-type rate limit blocks burst', () => {
  cb.reset();
  cb.configure({ perTypePerMinute: 3 });
  let blocked = false;
  for (let i = 0; i < 10; i++) {
    const r = cb.check('burst.event', {});
    if (!r.allowed) { blocked = true; break; }
  }
  assert.ok(blocked, 'should block after exceeding per-type limit');
  cb.configure(cb.DEFAULT_LIMITS);
});

test('chain depth limit', () => {
  cb.reset();
  cb.configure({ maxChainDepth: 3 });
  const r = cb.check('deep.event', { chain_depth: 10 });
  assert.strictEqual(r.allowed, false);
  cb.configure(cb.DEFAULT_LIMITS);
});

test('getState returns consistent state', () => {
  cb.reset();
  const s = cb.getState();
  assert.ok('tripped' in s);
  assert.strictEqual(s.tripped, false);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
