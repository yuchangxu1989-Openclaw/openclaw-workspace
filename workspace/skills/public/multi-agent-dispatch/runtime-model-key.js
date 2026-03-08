'use strict';

function normalizeModelKey(value) {
  return String(value || '').trim();
}

function inferProviderScopedDefaultModelKey(task = {}, fallbackModel = null) {
  const fallback = normalizeModelKey(fallbackModel);
  if (fallback.includes('/')) return fallback;

  const agentId = normalizeModelKey(
    task.agentId
    || (task.payload && task.payload.agentId)
    || (task.governance && task.governance.agentId)
  );

  if (!agentId || !fallback) return null;
  return `boom-${agentId}/${fallback}`;
}

function inferModelKey(task = {}, fallbackModel = null) {
  const candidates = [
    task.modelKey,
    task.runtime_model_key,
    task.runtimeModelKey,
    task.model_key,
    task.key,
    task.payload && task.payload.modelKey,
    task.payload && task.payload.runtime_model_key,
    task.payload && task.payload.runtimeModelKey,
    task.payload && task.payload.model_key,
    task.payload && task.payload.key,
    task.governance && task.governance.modelKey,
    task.governance && task.governance.runtimeModelKey,
    inferProviderScopedDefaultModelKey(task, fallbackModel),
    fallbackModel,
    task.model,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeModelKey(candidate);
    if (normalized) return normalized;
  }
  return null;
}

function attachModelKey(task = {}, fallbackModel = null) {
  const modelKey = inferModelKey(task, fallbackModel);
  return {
    ...task,
    modelKey,
    runtimeModelKey: modelKey,
    runtime_model_key: modelKey,
  };
}

module.exports = {
  normalizeModelKey,
  inferProviderScopedDefaultModelKey,
  inferModelKey,
  attachModelKey,
};
