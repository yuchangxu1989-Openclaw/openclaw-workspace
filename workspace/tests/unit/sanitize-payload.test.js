'use strict';

const { sanitizePayload } = require('../../infrastructure/event-bus/sanitize-payload');

describe('sanitizePayload', () => {
  test('passes through normal payload', () => {
    const { cleaned, report } = sanitizePayload({ name: 'test', value: 42 });
    expect(cleaned.name).toBe('test');
    expect(cleaned.value).toBe(42);
    expect(report.removedFields.length).toBe(0);
  });

  test('removes field containing "key"', () => {
    const { cleaned, report } = sanitizePayload({ apiKey: '123', name: 'ok' });
    expect(cleaned.apiKey).toBeUndefined();
    expect(cleaned.name).toBe('ok');
    expect(report.removedFields).toContain('apiKey');
  });

  test('removes field containing "secret"', () => {
    const { cleaned } = sanitizePayload({ clientSecret: 'abc' });
    expect(cleaned.clientSecret).toBeUndefined();
  });

  test('removes field containing "token"', () => {
    const { cleaned } = sanitizePayload({ accessToken: 'xyz' });
    expect(cleaned.accessToken).toBeUndefined();
  });

  test('removes field containing "password"', () => {
    const { cleaned } = sanitizePayload({ password: 'hunter2', user: 'bob' });
    expect(cleaned.password).toBeUndefined();
    expect(cleaned.user).toBe('bob');
  });

  test('truncates oversized payload', () => {
    const big = { data: 'x'.repeat(20000) };
    const { report } = sanitizePayload(big);
    expect(report.truncated).toBe(true);
  });

  test('stops recursion at depth 5', () => {
    const deep = { a: { b: { c: { d: { e: { f: 'too deep' } } } } } };
    const { cleaned, report } = sanitizePayload(deep);
    expect(report.truncated).toBe(true);
    expect(cleaned.a.b.c.d.e).toBe('[depth limit exceeded]');
  });

  test('handles null payload', () => {
    const { cleaned } = sanitizePayload(null);
    expect(cleaned).toBeNull();
  });

  test('handles undefined payload', () => {
    const { cleaned } = sanitizePayload(undefined);
    expect(cleaned).toBeUndefined();
  });

  test('handles nested sensitive fields', () => {
    const { cleaned, report } = sanitizePayload({ config: { dbPassword: '123', host: 'localhost' } });
    expect(cleaned.config.dbPassword).toBeUndefined();
    expect(cleaned.config.host).toBe('localhost');
    expect(report.removedFields).toContain('dbPassword');
  });

  test('handles arrays in payload', () => {
    const { cleaned } = sanitizePayload({ items: [1, 2, 3], apiKey: 'x' });
    expect(cleaned.items).toEqual([1, 2, 3]);
    expect(cleaned.apiKey).toBeUndefined();
  });

  test('report includes originalSize', () => {
    const { report } = sanitizePayload({ a: 1 });
    expect(typeof report.originalSize).toBe('number');
    expect(report.originalSize).toBeGreaterThan(0);
  });
});
