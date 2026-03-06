'use strict';

const fs = require('fs');
const path = require('path');
const executor = require('./handler-executor');

describe('handler-executor', () => {
  const handlersDir = path.resolve(__dirname, 'handlers');

  beforeAll(() => {
    fs.mkdirSync(handlersDir, { recursive: true });
  });

  afterEach(() => {
    for (const f of ['qa-test-ok.js', 'qa-test-timeout.js', 'qa-test-throw.js', 'qa-test-handle.js']) {
      const p = path.join(handlersDir, f);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  });

  test('normal execution', async () => {
    fs.writeFileSync(
      path.join(handlersDir, 'qa-test-ok.js'),
      "module.exports = async function(event){ return { ok: true, type: event.type }; };\n"
    );

    const out = await executor.execute('qa-test-ok', { type: 'evt' }, { id: 'r1' }, { timeout: 500 });
    expect(out.success).toBe(true);
    expect(out.result.ok).toBe(true);
    expect(out.result.type).toBe('evt');
  });

  test('timeout', async () => {
    fs.writeFileSync(
      path.join(handlersDir, 'qa-test-timeout.js'),
      "module.exports = async function(){ await new Promise(r=>setTimeout(r,120)); return { late:true }; };\n"
    );

    const out = await executor.execute('qa-test-timeout', { type: 'evt' }, { id: 'r1' }, { timeout: 30 });
    expect(out.success).toBe(false);
    expect(out.error).toContain('timeout');
  });

  test('error isolation', async () => {
    fs.writeFileSync(
      path.join(handlersDir, 'qa-test-throw.js'),
      "module.exports = async function(){ throw new Error('boom'); };\n"
    );

    const out = await executor.execute('qa-test-throw', { type: 'evt' }, { id: 'r1' }, { timeout: 200 });
    expect(out.success).toBe(false);
    expect(out.error).toBe('boom');
  });

  test('handler signature compatibility (module.handle)', async () => {
    fs.writeFileSync(
      path.join(handlersDir, 'qa-test-handle.js'),
      "module.exports = { handle: async function(event, rule){ return { ok:true, rid: rule.id, type: event.type }; } };\n"
    );

    const out = await executor.execute('qa-test-handle', { type: 'evt2' }, { id: 'rule-x' }, { timeout: 500 });
    expect(out.success).toBe(true);
    expect(out.result).toEqual({ ok: true, rid: 'rule-x', type: 'evt2' });
  });
});
