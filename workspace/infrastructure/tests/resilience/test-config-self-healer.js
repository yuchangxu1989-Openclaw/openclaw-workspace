'use strict';

/**
 * Config Self-Healer Tests — Rule/flags/routes corruption recovery
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const selfHealer = require('../../resilience/config-self-healer');

let passed = 0;
let failed = 0;

function test(name, fn) {
  return fn().then(() => {
    passed++;
    console.log(`  ✅ ${name}`);
  }).catch(e => {
    failed++;
    console.log(`  ❌ ${name}: ${e.message}`);
  });
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'selfheal-test-'));
}

async function run() {
  console.log('\n🧪 Config Self-Healer Tests\n');

  // ═══════════════════════════════════════════════════
  // 1. Rule Files Self-Healing
  // ═══════════════════════════════════════════════════

  await test('loadRulesSafe: valid rules loaded successfully', async () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'rule1.json'), JSON.stringify({ id: 'R001', name: 'test' }));
    fs.writeFileSync(path.join(dir, 'rule2.json'), JSON.stringify({ id: 'R002', name: 'test2' }));

    const { rules, errors, loaded, skipped } = selfHealer.loadRulesSafe(dir);
    assert.strictEqual(rules.length, 2);
    assert.strictEqual(errors.length, 0);
    assert.strictEqual(loaded, 2);
    assert.strictEqual(skipped, 0);

    fs.rmSync(dir, { recursive: true });
  });

  await test('loadRulesSafe: corrupted rule skipped, others loaded', async () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'good.json'), JSON.stringify({ id: 'GOOD' }));
    fs.writeFileSync(path.join(dir, 'bad.json'), '{{{{INVALID JSON');
    fs.writeFileSync(path.join(dir, 'also-good.json'), JSON.stringify({ id: 'ALSO_GOOD' }));

    const { rules, errors, healed, loaded, skipped } = selfHealer.loadRulesSafe(dir);
    assert.strictEqual(loaded, 2, 'should load 2 valid rules');
    assert.strictEqual(skipped, 1, 'should skip 1 corrupted rule');
    assert.strictEqual(healed, true, 'should report healing');
    assert.ok(errors[0].file === 'bad.json');

    fs.rmSync(dir, { recursive: true });
  });

  await test('loadRulesSafe: nonexistent directory → empty + error', async () => {
    const { rules, errors, healed } = selfHealer.loadRulesSafe('/nonexistent/rules/dir');
    assert.strictEqual(rules.length, 0);
    assert.strictEqual(errors.length, 1);
    assert.strictEqual(healed, true);
  });

  await test('loadRulesSafe: empty directory → empty rules, no errors', async () => {
    const dir = tmpDir();
    const { rules, errors } = selfHealer.loadRulesSafe(dir);
    assert.strictEqual(rules.length, 0);
    assert.strictEqual(errors.length, 0);
    fs.rmSync(dir, { recursive: true });
  });

  // ═══════════════════════════════════════════════════
  // 2. Feature Flags Self-Healing
  // ═══════════════════════════════════════════════════

  await test('loadFlagsSafe: valid file → loaded from file', async () => {
    const dir = tmpDir();
    const file = path.join(dir, 'flags.json');
    fs.writeFileSync(file, JSON.stringify({ L3_PIPELINE_ENABLED: true, CUSTOM_FLAG: 42 }));

    const { flags, source } = selfHealer.loadFlagsSafe(file);
    assert.strictEqual(source, 'file');
    assert.strictEqual(flags.L3_PIPELINE_ENABLED, true);
    assert.strictEqual(flags.CUSTOM_FLAG, 42);
    // Defaults should be merged
    assert.strictEqual(flags.L3_EVENTBUS_ENABLED, true);

    fs.rmSync(dir, { recursive: true });
  });

  await test('loadFlagsSafe: corrupted file → defaults', async () => {
    const dir = tmpDir();
    const file = path.join(dir, 'flags.json');
    fs.writeFileSync(file, 'NOT JSON AT ALL!!!');

    const { flags, source, error } = selfHealer.loadFlagsSafe(file);
    assert.strictEqual(source, 'defaults_fallback');
    assert.ok(error, 'should report error');
    assert.strictEqual(flags.L3_PIPELINE_ENABLED, selfHealer.DEFAULT_FLAGS.L3_PIPELINE_ENABLED);
    assert.strictEqual(flags.L3_EVENTBUS_ENABLED, selfHealer.DEFAULT_FLAGS.L3_EVENTBUS_ENABLED);

    fs.rmSync(dir, { recursive: true });
  });

  await test('loadFlagsSafe: missing file → defaults', async () => {
    const { flags, source } = selfHealer.loadFlagsSafe('/nonexistent/flags.json');
    assert.strictEqual(source, 'defaults');
    assert.deepStrictEqual(flags, selfHealer.DEFAULT_FLAGS);
  });

  // ═══════════════════════════════════════════════════
  // 3. Routes Self-Healing
  // ═══════════════════════════════════════════════════

  await test('loadRoutesSafe: valid file → loaded', async () => {
    const dir = tmpDir();
    const file = path.join(dir, 'routes.json');
    const routes = { 'test.event': { handler: 'test-handler' } };
    fs.writeFileSync(file, JSON.stringify(routes));

    const { routes: loaded, source } = selfHealer.loadRoutesSafe(file);
    assert.strictEqual(source, 'file');
    assert.deepStrictEqual(loaded, routes);

    fs.rmSync(dir, { recursive: true });
  });

  await test('loadRoutesSafe: corrupted → built-in defaults', async () => {
    const dir = tmpDir();
    const file = path.join(dir, 'routes.json');
    fs.writeFileSync(file, '!!!CORRUPTED!!!');

    const { routes, source, error } = selfHealer.loadRoutesSafe(file);
    assert.strictEqual(source, 'defaults_fallback');
    assert.ok(error, 'should report error');
    // Should have built-in defaults
    assert.ok(routes['user.message'], 'should have user.message route');
    assert.ok(routes['system.error'], 'should have system.error route');

    fs.rmSync(dir, { recursive: true });
  });

  await test('loadRoutesSafe: missing → built-in defaults', async () => {
    const { routes, source } = selfHealer.loadRoutesSafe('/nonexistent/routes.json');
    assert.strictEqual(source, 'defaults');
    assert.deepStrictEqual(routes, selfHealer.DEFAULT_ROUTES);
  });

  // ═══════════════════════════════════════════════════
  // 4. Generic Safe JSON Load
  // ═══════════════════════════════════════════════════

  await test('loadJsonSafe: valid file → parsed', async () => {
    const dir = tmpDir();
    const file = path.join(dir, 'data.json');
    fs.writeFileSync(file, JSON.stringify({ key: 'value' }));

    const { data, source } = selfHealer.loadJsonSafe(file, {});
    assert.deepStrictEqual(data, { key: 'value' });
    assert.strictEqual(source, 'file');

    fs.rmSync(dir, { recursive: true });
  });

  await test('loadJsonSafe: corrupted → fallback', async () => {
    const dir = tmpDir();
    const file = path.join(dir, 'data.json');
    fs.writeFileSync(file, 'NOT JSON');

    const fallback = { default: true };
    const { data, source, error } = selfHealer.loadJsonSafe(file, fallback);
    assert.deepStrictEqual(data, fallback);
    assert.strictEqual(source, 'fallback');
    assert.ok(error);

    fs.rmSync(dir, { recursive: true });
  });

  await test('loadJsonSafe: repair mode writes fallback to file', async () => {
    const dir = tmpDir();
    const file = path.join(dir, 'data.json');
    fs.writeFileSync(file, 'CORRUPTED');

    const fallback = { repaired: true };
    selfHealer.loadJsonSafe(file, fallback, { repair: true });

    // File should now contain the fallback
    const content = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.deepStrictEqual(content, fallback);

    fs.rmSync(dir, { recursive: true });
  });

  // ═══════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════

  console.log(`\n📊 Config Self-Healer: ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

module.exports = { run };

if (require.main === module) {
  run().then(({ failed }) => process.exit(failed > 0 ? 1 : 0));
}
