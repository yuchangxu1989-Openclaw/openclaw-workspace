'use strict';

/**
 * CHANGE 3: Model preflight check tests.
 *
 * Before any spawn, validates the requested model exists in openclaw.json.
 * If model not found, blocks spawn with error listing available models.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { DispatchEngine } = require('../dispatch-engine');
const {
  readOpenClawConfig,
  extractAvailableModels,
  modelsForAgentRole,
  parseModelRef,
  preflightModelCheck,
} = require('../model-preflight');

function tmpEngine(opts = {}) {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-preflight-'));
  return new DispatchEngine({ baseDir, maxSlots: opts.maxSlots ?? 19, ...opts });
}

// Write a test config to a temp file
function writeTempConfig(config) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-config-'));
  const configPath = path.join(tmpDir, 'openclaw.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  return configPath;
}

const TEST_CONFIG = {
  models: {
    providers: {
      'boom-coder': {
        models: [
          { id: 'gpt-5.3-codex', name: 'GPT 5.4' },
          { id: 'gpt-5.3-codex', name: 'GPT 5.3 Codex' },
        ],
      },
      'claude-coder': {
        models: [
          { id: 'claude-opus-4-6-thinking', name: 'Claude Opus 4-6 Thinking' },
          { id: 'claude-opus-4-6', name: 'Claude Sonnet 4-6' },
        ],
      },
      'boom-main': {
        models: [
          { id: 'gpt-5.3-codex', name: 'GPT 5.4' },
          { id: 'gpt-5.3-codex', name: 'GPT 5.3 Codex' },
        ],
      },
      'claude-main': {
        models: [
          { id: 'claude-opus-4-6-thinking', name: 'Claude Opus 4-6 Thinking' },
          { id: 'claude-opus-4-6', name: 'Claude Opus 4-6' },
        ],
      },
    },
  },
};

describe('CHANGE 3: Model preflight check', () => {

  describe('parseModelRef', () => {
    test('parses unqualified model', () => {
      const ref = parseModelRef('gpt-5.3-codex');
      expect(ref.provider).toBeNull();
      expect(ref.modelId).toBe('gpt-5.3-codex');
    });

    test('parses qualified model', () => {
      const ref = parseModelRef('boom-coder/gpt-5.3-codex');
      expect(ref.provider).toBe('boom-coder');
      expect(ref.modelId).toBe('gpt-5.3-codex');
    });

    test('handles null/empty', () => {
      const ref = parseModelRef(null);
      expect(ref.modelId).toBeNull();
    });
  });

  describe('extractAvailableModels', () => {
    test('extracts all model IDs from config', () => {
      const { providerModels, allModelIds } = extractAvailableModels(TEST_CONFIG);

      expect(providerModels['boom-coder']).toContain('gpt-5.3-codex');
      expect(providerModels['boom-coder']).toContain('gpt-5.3-codex');
      expect(providerModels['claude-coder']).toContain('claude-opus-4-6-thinking');

      expect(allModelIds.has('gpt-5.3-codex')).toBe(true);
      expect(allModelIds.has('boom-coder/gpt-5.3-codex')).toBe(true);
      expect(allModelIds.has('claude-opus-4-6-thinking')).toBe(true);
    });

    test('returns empty for null config', () => {
      const { providerModels, allModelIds } = extractAvailableModels(null);
      expect(Object.keys(providerModels)).toHaveLength(0);
      expect(allModelIds.size).toBe(0);
    });
  });

  describe('modelsForAgentRole', () => {
    test('returns models for coder role', () => {
      const models = modelsForAgentRole(TEST_CONFIG, 'coder');
      expect(models).toContain('boom-coder/gpt-5.3-codex');
      expect(models).toContain('boom-coder/gpt-5.3-codex');
      expect(models).toContain('claude-coder/claude-opus-4-6-thinking');
      expect(models).toContain('claude-coder/claude-opus-4-6');
    });

    test('returns empty for unknown role', () => {
      const models = modelsForAgentRole(TEST_CONFIG, 'nonexistent');
      expect(models).toHaveLength(0);
    });
  });

  describe('preflightModelCheck', () => {
    let configPath;

    beforeAll(() => {
      configPath = writeTempConfig(TEST_CONFIG);
    });

    test('passes for valid qualified model', () => {
      const result = preflightModelCheck('boom-coder/gpt-5.3-codex', 'coder', { configPath });
      expect(result.ok).toBe(true);
      expect(result.provider).toBe('boom-coder');
    });

    test('passes for valid unqualified model', () => {
      const result = preflightModelCheck('gpt-5.3-codex', 'coder', { configPath });
      expect(result.ok).toBe(true);
    });

    test('fails for nonexistent model', () => {
      expect(() => {
        preflightModelCheck('gpt-99.9', 'coder', { configPath });
      }).toThrow(/Model preflight failed/);

      try {
        preflightModelCheck('gpt-99.9', 'coder', { configPath });
      } catch (e) {
        expect(e.code).toBe('MODEL_PREFLIGHT_FAILED');
        expect(e.details.modelId).toBe('gpt-99.9');
        expect(e.details.availableModels.length).toBeGreaterThan(0);
      }
    });

    test('fails for valid model in wrong provider', () => {
      expect(() => {
        preflightModelCheck('boom-coder/claude-opus-4-6-thinking', null, { configPath });
      }).toThrow(/Model preflight failed/);

      try {
        preflightModelCheck('boom-coder/claude-opus-4-6-thinking', null, { configPath });
      } catch (e) {
        expect(e.code).toBe('MODEL_PREFLIGHT_FAILED');
        expect(e.details.provider).toBe('boom-coder');
        expect(e.details.availableModelsForProvider.length).toBeGreaterThan(0);
      }
    });

    test('fails for nonexistent provider', () => {
      expect(() => {
        preflightModelCheck('nonexistent-provider/gpt-5.3-codex', null, { configPath });
      }).toThrow(/provider "nonexistent-provider" not found/);

      try {
        preflightModelCheck('nonexistent-provider/gpt-5.3-codex', null, { configPath });
      } catch (e) {
        expect(e.code).toBe('MODEL_PREFLIGHT_FAILED');
        expect(e.details.availableProviders).toContain('boom-coder');
      }
    });

    test('error includes role-specific available models', () => {
      try {
        preflightModelCheck('gpt-99.9', 'coder', { configPath });
      } catch (e) {
        expect(e.code).toBe('MODEL_PREFLIGHT_FAILED');
        expect(e.details.agentRole).toBe('coder');
        expect(e.details.availableModels).toContain('boom-coder/gpt-5.3-codex');
        expect(e.details.availableModels).toContain('claude-coder/claude-opus-4-6-thinking');
      }
    });

    test('passes when config file is missing (fail-open)', () => {
      const result = preflightModelCheck('any-model', null, { configPath: '/nonexistent/path.json' });
      expect(result.ok).toBe(true);
      expect(result.warning).toBe('config_unreadable');
    });

    test('passes for null/empty model (governance will default)', () => {
      const result = preflightModelCheck(null, null, { configPath });
      expect(result.ok).toBe(true);
    });
  });

  describe('Integration: preflightModelCheck in DispatchEngine', () => {
    // For integration tests we use the real openclaw.json (it exists on this machine)
    test('enqueue succeeds for valid model (using real config)', () => {
      const e = tmpEngine({ maxSlots: 5 });
      // gpt-5.3-codex exists in the real config
      const task = e.enqueue({
        title: 'Valid model task',
        agentId: 'coder',
        model: 'boom-coder/gpt-5.3-codex',
      });
      expect(task.taskId).toBeTruthy();
    });

    test('enqueue blocks invalid model (using real config)', () => {
      const e = tmpEngine({ maxSlots: 5 });
      expect(() => {
        e.enqueue({
          title: 'Bad model task',
          agentId: 'coder',
          model: 'boom-coder/gpt-99-turbo',
        });
      }).toThrow(/Model preflight failed/);
    });

    test('enqueue blocks nonexistent provider (using real config)', () => {
      const e = tmpEngine({ maxSlots: 5 });
      expect(() => {
        e.enqueue({
          title: 'Bad provider task',
          model: 'fake-provider/gpt-5.3-codex',
        });
      }).toThrow(/Model preflight failed/);
    });

    test('enqueueBatch blocks on first invalid model', () => {
      const e = tmpEngine({ maxSlots: 5 });
      expect(() => {
        e.enqueueBatch([
          { title: 'Good task', model: 'boom-coder/gpt-5.3-codex', agentId: 'coder' },
          { title: 'Bad task', model: 'boom-coder/nonexistent-model', agentId: 'coder' },
        ]);
      }).toThrow(/Model preflight failed/);
    });
  });

  describe('readOpenClawConfig', () => {
    test('reads the real openclaw.json', () => {
      const config = readOpenClawConfig();
      expect(config).toBeTruthy();
      expect(config.models).toBeTruthy();
      expect(config.models.providers).toBeTruthy();
      expect(Object.keys(config.models.providers).length).toBeGreaterThan(0);
    });

    test('returns null for missing file', () => {
      const config = readOpenClawConfig('/nonexistent/file.json');
      expect(config).toBeNull();
    });
  });
});
