'use strict';

const fs = require('fs');
const path = require('path');

function normalizeText(value) {
  return String(value || '').trim();
}

function splitModelRef(model) {
  const raw = normalizeText(model);
  if (!raw) return { raw: '', providerPrefix: null, modelId: null, qualified: false };
  const idx = raw.indexOf('/');
  if (idx <= 0) return { raw, providerPrefix: null, modelId: raw, qualified: false };
  return {
    raw,
    providerPrefix: raw.slice(0, idx),
    modelId: raw.slice(idx + 1),
    qualified: true,
  };
}

function buildProviderIndexFromAgents(agentsRoot = '/root/.openclaw/agents') {
  const index = new Map();
  let filesRead = 0;

  if (!fs.existsSync(agentsRoot)) {
    return { index, filesRead, agentsRoot };
  }

  const agentDirs = fs.readdirSync(agentsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const agentId of agentDirs) {
    const modelsPath = path.join(agentsRoot, agentId, 'agent', 'models.json');
    if (!fs.existsSync(modelsPath)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(modelsPath, 'utf8'));
      filesRead += 1;
      const providers = parsed?.providers || {};
      for (const [providerName, providerConfig] of Object.entries(providers)) {
        const models = Array.isArray(providerConfig?.models) ? providerConfig.models : [];
        for (const model of models) {
          const modelId = normalizeText(model?.id);
          if (!modelId) continue;
          if (!index.has(modelId)) index.set(modelId, new Set());
          index.get(modelId).add(providerName);
        }
      }
    } catch {
      // ignore malformed agent models.json; validation remains best-effort
    }
  }

  return { index, filesRead, agentsRoot };
}

function providerExistsForModel(providerIndex, providerName, modelId) {
  if (!providerName || !modelId) return false;
  const providers = providerIndex.get(modelId);
  return !!providers && providers.has(providerName);
}

function findProvidersForModel(providerIndex, modelId) {
  if (!modelId) return [];
  return Array.from(providerIndex.get(modelId) || []).sort();
}

function validateModelProviderRoute(model, options = {}) {
  const providerIndex = options.providerIndex || buildProviderIndexFromAgents(options.agentsRoot).index;
  const ref = splitModelRef(model);

  if (!ref.modelId) {
    const error = new Error('spawn payload model is required');
    error.code = 'SPAWN_MODEL_REQUIRED';
    throw error;
  }

  if (!ref.qualified) {
    return {
      ok: true,
      normalizedModel: ref.modelId,
      providerName: null,
      modelId: ref.modelId,
      providerScoped: false,
      matchedProviders: findProvidersForModel(providerIndex, ref.modelId),
    };
  }

  if (providerExistsForModel(providerIndex, ref.providerPrefix, ref.modelId)) {
    return {
      ok: true,
      normalizedModel: ref.raw,
      providerName: ref.providerPrefix,
      modelId: ref.modelId,
      providerScoped: true,
      matchedProviders: [ref.providerPrefix],
    };
  }

  const matchedProviders = findProvidersForModel(providerIndex, ref.modelId);
  const error = new Error(
    `spawn route mismatch: model "${ref.modelId}" is not served by provider "${ref.providerPrefix}"` +
    (matchedProviders.length ? `; available providers: ${matchedProviders.join(', ')}` : '; model not found in agent provider registry')
  );
  error.code = 'SPAWN_MODEL_PROVIDER_ROUTE_MISMATCH';
  error.details = {
    requestedModel: ref.raw,
    providerName: ref.providerPrefix,
    modelId: ref.modelId,
    matchedProviders,
  };
  throw error;
}

function failFastNormalizeSpawnPayload(task, options = {}) {
  const providerIndexMeta = options.providerIndexMeta || buildProviderIndexFromAgents(options.agentsRoot);
  const providerIndex = options.providerIndex || providerIndexMeta.index;
  const payload = { ...(task || {}) };
  const model = normalizeText(payload.model);

  const validation = validateModelProviderRoute(model, { providerIndex, agentsRoot: options.agentsRoot });

  if (validation.providerScoped) {
    payload.model = validation.modelId;
  } else if (validation.normalizedModel) {
    payload.model = validation.normalizedModel;
  }

  payload.runtimeModelKey = validation.providerScoped
    ? `${validation.providerName}/${validation.modelId}`
    : validation.modelId;
  payload.runtime_model_key = payload.runtimeModelKey;
  payload.modelKey = payload.runtimeModelKey;

  return {
    payload,
    route: validation,
    providerIndexMeta: {
      agentsRoot: providerIndexMeta.agentsRoot,
      filesRead: providerIndexMeta.filesRead,
    },
  };
}

module.exports = {
  splitModelRef,
  buildProviderIndexFromAgents,
  findProvidersForModel,
  validateModelProviderRoute,
  failFastNormalizeSpawnPayload,
};
