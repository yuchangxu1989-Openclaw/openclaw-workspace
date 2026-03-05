/**
 * Dispatcher v2 Tests — Phase 0
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { Dispatcher } = require('../../infrastructure/event-bus/dispatcher');

function tmpDir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatcher-test-'));
  return d;
}

function writeRule(dir, filename, rule) {
  fs.writeFileSync(path.join(dir, filename), JSON.stringify(rule));
}

function makeRule(id, events, opts = {}) {
  return {
    id,
    trigger: { events, actions: opts.actions || [{ type: 'test_action' }] },
    ...(opts.conditions ? { conditions: opts.conditions } : {}),
  };
}

const silentLogger = { log() {}, warn() {}, error() {}, debug() {} };

describe('Dispatcher', () => {
  let rulesDir, logFile;

  beforeEach(() => {
    rulesDir = tmpDir();
    logFile = path.join(tmpDir(), 'actions.jsonl');
  });

  // === Rule Loading ===

  test('1. loads rules from directory', async () => {
    writeRule(rulesDir, 'r1.json', makeRule('R1', ['evt.a']));
    writeRule(rulesDir, 'r2.json', makeRule('R2', ['evt.b']));
    const d = new Dispatcher({ rulesDir, logFile, logger: silentLogger });
    await d.init();
    expect(d.getRuleCount()).toBe(2);
  });

  test('2. handles empty directory', async () => {
    const d = new Dispatcher({ rulesDir, logFile, logger: silentLogger });
    await d.init();
    expect(d.getRuleCount()).toBe(0);
  });

  test('3. skips corrupted JSON files', async () => {
    fs.writeFileSync(path.join(rulesDir, 'bad.json'), '{not valid json!!!');
    writeRule(rulesDir, 'good.json', makeRule('G1', ['x']));
    const d = new Dispatcher({ rulesDir, logFile, logger: silentLogger });
    await d.init();
    expect(d.getRuleCount()).toBe(1);
  });

  test('4. handles non-existent rules directory', async () => {
    const d = new Dispatcher({ rulesDir: '/tmp/nonexistent-xyz-999', logFile, logger: silentLogger });
    await d.init();
    expect(d.getRuleCount()).toBe(0);
  });

  test('5. assigns filename as id if rule has no id', async () => {
    writeRule(rulesDir, 'auto-id.json', { trigger: { events: ['x'] } });
    const d = new Dispatcher({ rulesDir, logFile, logger: silentLogger });
    await d.init();
    const idx = d.getEventIndex();
    expect(idx['x']).toContain('auto-id');
  });

  // === Event Matching ===

  test('6. exact match dispatches correctly', async () => {
    writeRule(rulesDir, 'r1.json', makeRule('R1', ['user.login']));
    const d = new Dispatcher({ rulesDir, logFile, logger: silentLogger });
    await d.init();
    await d.dispatch('user.login');
    expect(d.getStats().executed).toBe(1);
  });

  test('7. no match yields zero executions', async () => {
    writeRule(rulesDir, 'r1.json', makeRule('R1', ['user.login']));
    const d = new Dispatcher({ rulesDir, logFile, logger: silentLogger });
    await d.init();
    await d.dispatch('user.logout');
    expect(d.getStats().executed).toBe(0);
    expect(d.getStats().matched).toBe(0);
  });

  test('8. wildcard * matches all events', async () => {
    writeRule(rulesDir, 'r1.json', makeRule('R1', ['*']));
    const d = new Dispatcher({ rulesDir, logFile, logger: silentLogger });
    await d.init();
    await d.dispatch('anything.here');
    expect(d.getStats().executed).toBe(1);
  });

  test('9. domain wildcard skill.* matches skill.created', async () => {
    writeRule(rulesDir, 'r1.json', makeRule('R1', ['skill.*']));
    const d = new Dispatcher({ rulesDir, logFile, logger: silentLogger });
    await d.init();
    await d.dispatch('skill.created');
    expect(d.getStats().executed).toBe(1);
  });

  test('10. domain wildcard does not match other domains', async () => {
    writeRule(rulesDir, 'r1.json', makeRule('R1', ['skill.*']));
    const d = new Dispatcher({ rulesDir, logFile, logger: silentLogger });
    await d.init();
    await d.dispatch('user.created');
    expect(d.getStats().executed).toBe(0);
  });

  test('11. multiple rules match same event', async () => {
    writeRule(rulesDir, 'r1.json', makeRule('R1', ['evt']));
    writeRule(rulesDir, 'r2.json', makeRule('R2', ['evt']));
    const d = new Dispatcher({ rulesDir, logFile, logger: silentLogger });
    await d.init();
    await d.dispatch('evt');
    expect(d.getStats().executed).toBe(2);
  });

  test('12. object-format events are flattened', async () => {
    const rule = { id: 'R1', trigger: { events: { group1: ['a', 'b'], group2: ['c'] }, actions: [{ type: 'x' }] } };
    writeRule(rulesDir, 'r1.json', rule);
    const d = new Dispatcher({ rulesDir, logFile, logger: silentLogger });
    await d.init();
    await d.dispatch('b');
    expect(d.getStats().executed).toBe(1);
  });

  // === Condition Evaluation ===

  test('13. conditions satisfied → execute', async () => {
    writeRule(rulesDir, 'r1.json', makeRule('R1', ['evt'], { conditions: { status: 'active' } }));
    const d = new Dispatcher({ rulesDir, logFile, logger: silentLogger });
    await d.init();
    await d.dispatch('evt', { status: 'active' });
    expect(d.getStats().executed).toBe(1);
  });

  test('14. conditions not satisfied → skip', async () => {
    writeRule(rulesDir, 'r1.json', makeRule('R1', ['evt'], { conditions: { status: 'active' } }));
    const d = new Dispatcher({ rulesDir, logFile, logger: silentLogger });
    await d.init();
    await d.dispatch('evt', { status: 'inactive' });
    expect(d.getStats().skipped).toBe(1);
    expect(d.getStats().executed).toBe(0);
  });

  test('15. no conditions → always execute', async () => {
    writeRule(rulesDir, 'r1.json', makeRule('R1', ['evt']));
    const d = new Dispatcher({ rulesDir, logFile, logger: silentLogger });
    await d.init();
    await d.dispatch('evt', {});
    expect(d.getStats().executed).toBe(1);
  });

  test('16. multiple condition fields all must match', async () => {
    writeRule(rulesDir, 'r1.json', makeRule('R1', ['evt'], { conditions: { a: '1', b: '2' } }));
    const d = new Dispatcher({ rulesDir, logFile, logger: silentLogger });
    await d.init();
    await d.dispatch('evt', { a: '1', b: 'wrong' });
    expect(d.getStats().skipped).toBe(1);
  });

  // === Fault Isolation ===

  test('17. one rule failure does not block others', async () => {
    // Create a rule that will throw during action extraction
    const badRule = { id: 'BAD', trigger: { events: ['evt'], get actions() { throw new Error('boom'); } } };
    const goodRule = makeRule('GOOD', ['evt']);
    writeRule(rulesDir, 'bad.json', makeRule('BAD', ['evt']));
    writeRule(rulesDir, 'good.json', makeRule('GOOD', ['evt']));

    // Monkey-patch to simulate failure
    const d = new Dispatcher({ rulesDir, logFile, logger: silentLogger });
    await d.init();
    const origExtract = d._extractActions.bind(d);
    let callCount = 0;
    d._extractActions = (rule) => {
      callCount++;
      if (callCount === 1) throw new Error('simulated failure');
      return origExtract(rule);
    };
    await d.dispatch('evt');
    expect(d.getStats().failed).toBe(1);
    expect(d.getStats().executed).toBe(1);
  });

  // === Chain Depth Protection ===

  test('18. respects max depth limit', async () => {
    writeRule(rulesDir, 'r1.json', makeRule('R1', ['evt']));
    const d = new Dispatcher({ rulesDir, logFile, maxDepth: 3, logger: silentLogger });
    await d.init();
    // Simulate depth at limit
    await d.dispatch('evt', {}, 3);
    expect(d.getStats().dispatched).toBe(1);
    expect(d.getStats().executed).toBe(0); // should bail early
  });

  test('19. depth below limit executes normally', async () => {
    writeRule(rulesDir, 'r1.json', makeRule('R1', ['evt']));
    const d = new Dispatcher({ rulesDir, logFile, maxDepth: 5, logger: silentLogger });
    await d.init();
    await d.dispatch('evt', {}, 4);
    expect(d.getStats().executed).toBe(1);
  });

  // === Stats ===

  test('20. stats accumulate across dispatches', async () => {
    writeRule(rulesDir, 'r1.json', makeRule('R1', ['a']));
    writeRule(rulesDir, 'r2.json', makeRule('R2', ['b']));
    const d = new Dispatcher({ rulesDir, logFile, logger: silentLogger });
    await d.init();
    await d.dispatch('a');
    await d.dispatch('b');
    await d.dispatch('c'); // no match
    const s = d.getStats();
    expect(s.dispatched).toBe(3);
    expect(s.executed).toBe(2);
  });

  test('21. getEventIndex returns correct mapping', async () => {
    writeRule(rulesDir, 'r1.json', makeRule('R1', ['x', 'y']));
    const d = new Dispatcher({ rulesDir, logFile, logger: silentLogger });
    await d.init();
    const idx = d.getEventIndex();
    expect(idx['x']).toContain('R1');
    expect(idx['y']).toContain('R1');
  });

  // === Action Logging ===

  test('22. actions are written to log file', async () => {
    writeRule(rulesDir, 'r1.json', makeRule('R1', ['evt']));
    const d = new Dispatcher({ rulesDir, logFile, logger: silentLogger });
    await d.init();
    await d.dispatch('evt', { foo: 'bar' });
    const lines = fs.readFileSync(logFile, 'utf-8').trim().split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(1);
    const record = JSON.parse(lines[0]);
    expect(record.eventType).toBe('evt');
    expect(record.ruleId).toBe('R1');
    expect(record.timestamp).toBeDefined();
  });

  test('23. re-init clears rules and rebuilds index', async () => {
    writeRule(rulesDir, 'r1.json', makeRule('R1', ['a']));
    const d = new Dispatcher({ rulesDir, logFile, logger: silentLogger });
    await d.init();
    expect(d.getRuleCount()).toBe(1);
    // Add another rule and re-init
    writeRule(rulesDir, 'r2.json', makeRule('R2', ['b']));
    await d.init();
    expect(d.getRuleCount()).toBe(2);
  });
});
