'use strict';

/**
 * model-preflight.js
 * ──────────────────
 * CHANGE 3: Model preflight check.
 *
 * Before any spawn, reads /root/.openclaw/openclaw.json, extracts the available
 * models for the target agent role's provider, and validates the requested model
 * exists. If model not found, blocks spawn and returns error with available model list.
 *
 * This prevents guessing/assuming model names.
 */

const fs = require('fs');
const path = require('path');

const OPENCLAW_CONFIG_PATH = '/root/.openclaw/openclaw.json';

/**
 * Read and parse openclaw.json. Returns null if unreadable.
 * Uses an optional override path for testing.
 */
function readOpenClawConfig(configPath) {
  const filePath = configPath || OPENCLAW_CONFIG_PATH;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Extract all available model IDs from all providers in openclaw.json.
 * Returns { providerModels: { providerName: [modelId, ...] }, allModelIds: Set<string> }
 */
function extractAvailableModels(config) {
  const providerModels = {};
  const allModelIds = new Set();

  if (!config || !config.models || !config.models.providers) {
    return { providerModels, allModelIds };
  }

  for (const [providerName, providerConfig] of Object.entries(config.models.providers)) {
    const models = Array.isArray(providerConfig.models) ? providerConfig.models : [];
    const ids = models.map(m => m.id).filter(Boolean);
    providerModels[providerName] = ids;
    for (const id of ids) {
      allModelIds.add(id);
      // Also register qualified form: providerName/modelId
      allModelIds.add(`${providerName}/${id}`);
    }
  }

  return { providerModels, allModelIds };
}

/**
 * Find models available for a specific agent role's providers.
 * Agent role "coder" → look for providers "boom-coder" and "claude-coder".
 * Returns array of qualified model references (e.g. "boom-coder/gpt-5.3-codex").
 */
function modelsForAgentRole(config, agentRole) {
  if (!agentRole || !config || !config.models || !config.models.providers) return [];

  const result = [];
  const providers = config.models.providers;

  for (const [providerName, providerConfig] of Object.entries(providers)) {
    // Match providers that contain the agent role (e.g. "boom-coder", "claude-coder")
    if (providerName.endsWith(`-${agentRole}`) || providerName === agentRole) {
      const models = Array.isArray(providerConfig.models) ? providerConfig.models : [];
      for (const m of models) {
        if (m.id) {
          result.push(`${providerName}/${m.id}`);
        }
      }
    }
  }

  return result;
}

/**
 * Parse a model reference. Handles:
 * - "gpt-5.3-codex" → { provider: null, modelId: "gpt-5.3-codex" }
 * - "boom-coder/gpt-5.3-codex" → { provider: "boom-coder", modelId: "gpt-5.3-codex" }
 */
function parseModelRef(model) {
  const raw = String(model || '').trim();
  if (!raw) return { provider: null, modelId: null, raw: '' };
  const idx = raw.indexOf('/');
  if (idx <= 0) return { provider: null, modelId: raw, raw };
  return { provider: raw.slice(0, idx), modelId: raw.slice(idx + 1), raw };
}

/**
 * Validate that a requested model exists in the openclaw.json provider configuration.
 *
 * @param {string} model - The model reference (e.g. "gpt-5.3-codex" or "boom-coder/gpt-5.3-codex")
 * @param {string|null} agentRole - The agent role (e.g. "coder"), used for role-scoped lookup
 * @param {object} opts - Options { configPath }
 * @throws {Error} with code MODEL_PREFLIGHT_FAILED if model not found
 * @returns {{ ok: true, model: string, provider: string|null, availableModels: string[] }}
 */
function preflightModelCheck(model, agentRole, opts = {}) {
  const config = readOpenClawConfig(opts.configPath || null);

  if (!config) {
    // Config unreadable — allow spawn (fail-open: don't block on missing config)
    return { ok: true, model, provider: null, availableModels: [], warning: 'config_unreadable' };
  }

  const { providerModels, allModelIds } = extractAvailableModels(config);
  const ref = parseModelRef(model);

  if (!ref.modelId) {
    // No model specified — allow (governance will default)
    return { ok: true, model, provider: null, availableModels: Array.from(allModelIds) };
  }

  // Check 1: If provider-qualified (e.g. "boom-coder/gpt-5.3-codex"), check that exact combo
  if (ref.provider) {
    const providerModelList = providerModels[ref.provider];
    if (!providerModelList) {
      const error = new Error(
        `Model preflight failed: provider "${ref.provider}" not found in openclaw.json. ` +
        `Available providers: ${Object.keys(providerModels).join(', ')}`
      );
      error.code = 'MODEL_PREFLIGHT_FAILED';
      error.details = {
        requestedModel: ref.raw,
        provider: ref.provider,
        modelId: ref.modelId,
        availableProviders: Object.keys(providerModels),
        availableModels: Array.from(allModelIds),
      };
      throw error;
    }

    if (!providerModelList.includes(ref.modelId)) {
      const qualifiedAvailable = providerModelList.map(id => `${ref.provider}/${id}`);
      const error = new Error(
        `Model preflight failed: model "${ref.modelId}" not found in provider "${ref.provider}". ` +
        `Available models for this provider: ${qualifiedAvailable.join(', ')}`
      );
      error.code = 'MODEL_PREFLIGHT_FAILED';
      error.details = {
        requestedModel: ref.raw,
        provider: ref.provider,
        modelId: ref.modelId,
        availableModelsForProvider: qualifiedAvailable,
        availableModels: Array.from(allModelIds),
      };
      throw error;
    }

    return { ok: true, model: ref.raw, provider: ref.provider, availableModels: Array.from(allModelIds) };
  }

  // Check 2: Unqualified model (e.g. "gpt-5.3-codex") — check across all providers
  let foundInAnyProvider = false;
  for (const [, modelList] of Object.entries(providerModels)) {
    if (modelList.includes(ref.modelId)) {
      foundInAnyProvider = true;
      break;
    }
  }

  if (!foundInAnyProvider) {
    // Build contextual available list
    const contextModels = agentRole
      ? modelsForAgentRole(config, agentRole)
      : Array.from(allModelIds);

    const error = new Error(
      `Model preflight failed: model "${ref.modelId}" not found in any provider. ` +
      (agentRole
        ? `Available models for role "${agentRole}": ${contextModels.join(', ') || '(none)'}`
        : `Available models: ${contextModels.join(', ')}`)
    );
    error.code = 'MODEL_PREFLIGHT_FAILED';
    error.details = {
      requestedModel: ref.raw,
      modelId: ref.modelId,
      agentRole,
      availableModels: contextModels,
    };
    throw error;
  }

  return { ok: true, model: ref.raw, provider: null, availableModels: Array.from(allModelIds) };
}

module.exports = {
  readOpenClawConfig,
  extractAvailableModels,
  modelsForAgentRole,
  parseModelRef,
  preflightModelCheck,
  OPENCLAW_CONFIG_PATH,
};
