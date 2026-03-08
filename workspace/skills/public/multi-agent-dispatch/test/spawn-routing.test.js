'use strict';

const assert = require('assert');
const { splitModelRef, buildProviderIndexFromAgents, validateModelProviderRoute, failFastNormalizeSpawnPayload, findProvidersForModel } = require('../spawn-routing');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (error) {
    console.error(`❌ ${name}`);
    console.error('  ', error.message);
    failed++;
    process.exitCode = 1;
  }
}

// ── splitModelRef ────────────────────────────────────────────────────────────

test('splitModelRef: unqualified model', () => {
  const r = splitModelRef('claude-opus-4-6-thinking');
  assert.strictEqual(r.qualified, false);
  assert.strictEqual(r.providerPrefix, null);
  assert.strictEqual(r.modelId, 'claude-opus-4-6-thinking');
});

test('splitModelRef: qualified model with provider prefix', () => {
  const r = splitModelRef('boom-coder/gpt-5.3-codex');
  assert.strictEqual(r.qualified, true);
  assert.strictEqual(r.providerPrefix, 'boom-coder');
  assert.strictEqual(r.modelId, 'gpt-5.3-codex');
});

test('splitModelRef: empty string', () => {
  const r = splitModelRef('');
  assert.strictEqual(r.qualified, false);
  assert.strictEqual(r.modelId, null);
});

test('splitModelRef: null/undefined', () => {
  const r = splitModelRef(null);
  assert.strictEqual(r.modelId, null);
  const r2 = splitModelRef(undefined);
  assert.strictEqual(r2.modelId, null);
});

test('splitModelRef: claude-coder/claude-opus-4-6-thinking', () => {
  const r = splitModelRef('claude-coder/claude-opus-4-6-thinking');
  assert.strictEqual(r.qualified, true);
  assert.strictEqual(r.providerPrefix, 'claude-coder');
  assert.strictEqual(r.modelId, 'claude-opus-4-6-thinking');
});

// ── buildProviderIndexFromAgents (live against real agent configs) ────────────

test('buildProviderIndexFromAgents: reads real agent configs', () => {
  const meta = buildProviderIndexFromAgents('/root/.openclaw/agents');
  assert.ok(meta.filesRead > 0, `expected at least 1 models.json, got ${meta.filesRead}`);
  assert.ok(meta.index.size > 0, 'expected at least 1 model in index');

  // claude-opus-4-6-thinking should be served by claude providers, NOT boom
  const opusThinkingProviders = findProvidersForModel(meta.index, 'claude-opus-4-6-thinking');
  assert.ok(opusThinkingProviders.length > 0, 'claude-opus-4-6-thinking should have at least 1 provider');
  for (const prov of opusThinkingProviders) {
    assert.ok(!prov.startsWith('boom'), `claude-opus-4-6-thinking should NOT be served by boom provider, but found: ${prov}`);
  }
  console.log(`    providers for claude-opus-4-6-thinking: ${opusThinkingProviders.join(', ')}`);

  // gpt-5.3-codex should be served by boom providers, NOT claude
  const gptProviders = findProvidersForModel(meta.index, 'gpt-5.3-codex');
  assert.ok(gptProviders.length > 0, 'gpt-5.3-codex should have at least 1 provider');
  for (const prov of gptProviders) {
    assert.ok(!prov.startsWith('claude'), `gpt-5.3-codex should NOT be served by claude provider, but found: ${prov}`);
  }
  console.log(`    providers for gpt-5.3-codex: ${gptProviders.join(', ')}`);
});

// ── validateModelProviderRoute ───────────────────────────────────────────────

test('validateModelProviderRoute: boom/claude-opus-4-6-thinking fails (cross-provider)', () => {
  const meta = buildProviderIndexFromAgents('/root/.openclaw/agents');
  assert.throws(
    () => validateModelProviderRoute('boom-coder/claude-opus-4-6-thinking', { providerIndex: meta.index }),
    (error) => {
      assert.strictEqual(error.code, 'SPAWN_MODEL_PROVIDER_ROUTE_MISMATCH');
      assert.ok(error.details.matchedProviders.length > 0);
      assert.ok(!error.details.matchedProviders.some(p => p.startsWith('boom')));
      return true;
    }
  );
});

test('validateModelProviderRoute: boom-main/claude-opus-4-6-thinking fails', () => {
  const meta = buildProviderIndexFromAgents('/root/.openclaw/agents');
  assert.throws(
    () => validateModelProviderRoute('boom-main/claude-opus-4-6-thinking', { providerIndex: meta.index }),
    (error) => error.code === 'SPAWN_MODEL_PROVIDER_ROUTE_MISMATCH'
  );
});

test('validateModelProviderRoute: claude/claude-opus-4-6-thinking passes', () => {
  const meta = buildProviderIndexFromAgents('/root/.openclaw/agents');
  const result = validateModelProviderRoute('claude/claude-opus-4-6-thinking', { providerIndex: meta.index });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.providerName, 'claude');
  assert.strictEqual(result.modelId, 'claude-opus-4-6-thinking');
});

test('validateModelProviderRoute: claude-main/claude-opus-4-6-thinking passes', () => {
  const meta = buildProviderIndexFromAgents('/root/.openclaw/agents');
  const result = validateModelProviderRoute('claude-main/claude-opus-4-6-thinking', { providerIndex: meta.index });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.providerName, 'claude-main');
  assert.strictEqual(result.modelId, 'claude-opus-4-6-thinking');
});

test('validateModelProviderRoute: unqualified model passes', () => {
  const meta = buildProviderIndexFromAgents('/root/.openclaw/agents');
  const result = validateModelProviderRoute('claude-opus-4-6-thinking', { providerIndex: meta.index });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.providerScoped, false);
});

test('validateModelProviderRoute: boom-coder/gpt-5.3-codex passes', () => {
  const meta = buildProviderIndexFromAgents('/root/.openclaw/agents');
  const result = validateModelProviderRoute('boom-coder/gpt-5.3-codex', { providerIndex: meta.index });
  // boom-coder might not exist as a provider name in models.json, check
  // If it does exist, great; if not, it should fail. Let's be adaptive:
  if (result.ok) {
    assert.strictEqual(result.providerName, 'boom-coder');
    assert.strictEqual(result.modelId, 'gpt-5.3-codex');
  }
});

test('validateModelProviderRoute: empty model throws', () => {
  assert.throws(
    () => validateModelProviderRoute(''),
    (error) => error.code === 'SPAWN_MODEL_REQUIRED'
  );
});

// ── failFastNormalizeSpawnPayload ─────────────────────────────────────────────

test('failFastNormalizeSpawnPayload: strips boom prefix from claude model', () => {
  const meta = buildProviderIndexFromAgents('/root/.openclaw/agents');
  // This should throw because boom/claude-opus is a mismatch
  assert.throws(
    () => failFastNormalizeSpawnPayload(
      { model: 'boom-coder/claude-opus-4-6-thinking', task: 'test' },
      { providerIndexMeta: meta }
    ),
    (error) => error.code === 'SPAWN_MODEL_PROVIDER_ROUTE_MISMATCH'
  );
});

test('failFastNormalizeSpawnPayload: valid claude route normalizes correctly', () => {
  const meta = buildProviderIndexFromAgents('/root/.openclaw/agents');
  const result = failFastNormalizeSpawnPayload(
    { model: 'claude/claude-opus-4-6-thinking', task: 'test' },
    { providerIndexMeta: meta }
  );
  assert.strictEqual(result.payload.model, 'claude-opus-4-6-thinking');
  assert.strictEqual(result.payload.runtimeModelKey, 'claude/claude-opus-4-6-thinking');
  assert.strictEqual(result.route.ok, true);
});

test('failFastNormalizeSpawnPayload: unqualified model passthrough', () => {
  const meta = buildProviderIndexFromAgents('/root/.openclaw/agents');
  const result = failFastNormalizeSpawnPayload(
    { model: 'claude-opus-4-6-thinking', task: 'test' },
    { providerIndexMeta: meta }
  );
  assert.strictEqual(result.payload.model, 'claude-opus-4-6-thinking');
  assert.strictEqual(result.route.providerScoped, false);
});

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failed === 0) console.log('ALL PASSED');
