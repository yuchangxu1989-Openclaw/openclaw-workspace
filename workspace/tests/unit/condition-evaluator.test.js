'use strict';
const { ConditionEvaluator } = require('../../infrastructure/condition-evaluator/index.js');

const ev = new ConditionEvaluator();

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

console.log('ConditionEvaluator Tests\n');

// 空条件
test('empty conditions → match', () => {
  const r = ev.evaluate({}, { a: 1 });
  assert(r.match === true);
});
test('null conditions → match', () => {
  assert(ev.evaluate(null, { a: 1 }).match === true);
});
test('undefined conditions → match', () => {
  assert(ev.evaluate(undefined, { a: 1 }).match === true);
});

// null/undefined payload
test('null payload → no match', () => {
  assert(ev.evaluate({ a: 1 }, null).match === false);
});
test('undefined payload → no match', () => {
  assert(ev.evaluate({ a: 1 }, undefined).match === false);
});

// 简单相等
test('simple equal match', () => {
  assert(ev.evaluate({ status: 'ok' }, { status: 'ok' }).match === true);
});
test('simple equal no match', () => {
  assert(ev.evaluate({ status: 'ok' }, { status: 'fail' }).match === false);
});
test('simple equal number', () => {
  assert(ev.evaluate({ code: 200 }, { code: 200 }).match === true);
});

// 数值比较
test('$gt match', () => {
  assert(ev.evaluate({ age: { $gt: 18 } }, { age: 25 }).match === true);
});
test('$gt no match', () => {
  assert(ev.evaluate({ age: { $gt: 18 } }, { age: 10 }).match === false);
});
test('$lt match', () => {
  assert(ev.evaluate({ age: { $lt: 30 } }, { age: 25 }).match === true);
});
test('$lt no match', () => {
  assert(ev.evaluate({ age: { $lt: 20 } }, { age: 25 }).match === false);
});
test('$gte match boundary', () => {
  assert(ev.evaluate({ age: { $gte: 18 } }, { age: 18 }).match === true);
});
test('$lte match boundary', () => {
  assert(ev.evaluate({ age: { $lte: 18 } }, { age: 18 }).match === true);
});
test('$gt + $lt combined range', () => {
  assert(ev.evaluate({ score: { $gt: 10, $lt: 100 } }, { score: 50 }).match === true);
});
test('$gt + $lt out of range', () => {
  assert(ev.evaluate({ score: { $gt: 10, $lt: 100 } }, { score: 200 }).match === false);
});

// 存在性
test('$exists true match', () => {
  assert(ev.evaluate({ name: { $exists: true } }, { name: 'x' }).match === true);
});
test('$exists true no match', () => {
  assert(ev.evaluate({ name: { $exists: true } }, { age: 1 }).match === false);
});
test('$exists false match', () => {
  assert(ev.evaluate({ ghost: { $exists: false } }, { name: 'x' }).match === true);
});
test('$exists false no match', () => {
  assert(ev.evaluate({ name: { $exists: false } }, { name: 'x' }).match === false);
});

// 正则
test('$regex match', () => {
  assert(ev.evaluate({ email: { $regex: '@example\\.com$' } }, { email: 'a@example.com' }).match === true);
});
test('$regex no match', () => {
  assert(ev.evaluate({ email: { $regex: '@example\\.com$' } }, { email: 'a@other.com' }).match === false);
});

// 数组包含
test('$in match', () => {
  assert(ev.evaluate({ role: { $in: ['admin', 'mod'] } }, { role: 'admin' }).match === true);
});
test('$in no match', () => {
  assert(ev.evaluate({ role: { $in: ['admin', 'mod'] } }, { role: 'user' }).match === false);
});
test('$nin match', () => {
  assert(ev.evaluate({ role: { $nin: ['banned'] } }, { role: 'user' }).match === true);
});
test('$nin no match', () => {
  assert(ev.evaluate({ role: { $nin: ['banned'] } }, { role: 'banned' }).match === false);
});

// 嵌套路径
test('nested path match', () => {
  assert(ev.evaluate({ 'user.intent.class': 'buy' }, { user: { intent: { class: 'buy' } } }).match === true);
});
test('nested path no match', () => {
  assert(ev.evaluate({ 'user.intent.class': 'buy' }, { user: { intent: { class: 'sell' } } }).match === false);
});
test('nested path missing intermediate', () => {
  assert(ev.evaluate({ 'a.b.c': 1 }, { a: null }).match === false);
});

// AND
test('$and all match', () => {
  assert(ev.evaluate({ $and: [{ a: 1 }, { b: 2 }] }, { a: 1, b: 2 }).match === true);
});
test('$and partial fail', () => {
  assert(ev.evaluate({ $and: [{ a: 1 }, { b: 2 }] }, { a: 1, b: 9 }).match === false);
});

// OR
test('$or one match', () => {
  assert(ev.evaluate({ $or: [{ a: 1 }, { b: 2 }] }, { a: 9, b: 2 }).match === true);
});
test('$or none match', () => {
  assert(ev.evaluate({ $or: [{ a: 1 }, { b: 2 }] }, { a: 9, b: 9 }).match === false);
});

// Multiple fields (implicit AND)
test('multiple fields implicit AND', () => {
  assert(ev.evaluate({ a: 1, b: 2 }, { a: 1, b: 2, c: 3 }).match === true);
});

console.log(`\n${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
