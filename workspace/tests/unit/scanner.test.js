'use strict';

const { BaseScanner } = require('../../infrastructure/scanners/base-scanner');
const { GitScanner } = require('../../infrastructure/scanners/git-scanner');

function makeBus() {
  const events = [];
  return { emit: (type, payload) => events.push({ type, payload }), events };
}

describe('BaseScanner', () => {
  test('constructor requires name', () => {
    expect(() => new BaseScanner()).toThrow('Scanner name is required');
  });

  test('constructor sets name', () => {
    const s = new BaseScanner('test');
    expect(s.name).toBe('test');
  });

  test('scan() throws if not implemented', async () => {
    const s = new BaseScanner('test');
    await expect(s.scan()).rejects.toThrow('must be implemented');
  });

  test('emit increments eventsEmitted', () => {
    const bus = makeBus();
    const s = new BaseScanner('test', { bus });
    s.emit('test.event', { data: 1 });
    expect(s.getStats().eventsEmitted).toBe(1);
  });

  test('emit sends to bus', () => {
    const bus = makeBus();
    const s = new BaseScanner('test', { bus });
    s.emit('test.event', { data: 1 });
    expect(bus.events[0].type).toBe('test.event');
  });

  test('getLastScanTime initially null', () => {
    const s = new BaseScanner('test');
    expect(s.getLastScanTime()).toBeNull();
  });

  test('_recordScan updates lastScanTime', () => {
    const s = new BaseScanner('test');
    s._recordScan();
    expect(s.getLastScanTime()).not.toBeNull();
  });

  test('getStats returns scan count', () => {
    const s = new BaseScanner('test');
    s._recordScan();
    s._recordScan();
    expect(s.getStats().scans).toBe(2);
  });

  test('emit works without bus', () => {
    const s = new BaseScanner('test');
    expect(() => s.emit('e', {})).not.toThrow();
  });
});

describe('GitScanner', () => {
  test('extends BaseScanner', () => {
    const gs = new GitScanner({ cwd: '/tmp' });
    expect(gs).toBeInstanceOf(BaseScanner);
  });

  test('has name git-scanner', () => {
    const gs = new GitScanner();
    expect(gs.name).toBe('git-scanner');
  });

  test('scan returns array', async () => {
    const bus = makeBus();
    const gs = new GitScanner({ bus, cwd: '/root/.openclaw/workspace' });
    const result = await gs.scan();
    expect(Array.isArray(result)).toBe(true);
  });

  test('scan updates lastScanTime', async () => {
    const gs = new GitScanner({ cwd: '/root/.openclaw/workspace' });
    await gs.scan();
    expect(gs.getLastScanTime()).not.toBeNull();
  });

  test('scan increments scan count', async () => {
    const gs = new GitScanner({ cwd: '/root/.openclaw/workspace' });
    await gs.scan();
    expect(gs.getStats().scans).toBe(1);
  });

  test('getStats includes name', () => {
    const gs = new GitScanner();
    expect(gs.getStats().name).toBe('git-scanner');
  });
});
