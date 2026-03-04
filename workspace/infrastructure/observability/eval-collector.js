/**
 * eval-collector.js — 评测样本自动回收收集器
 * 
 * ISC Rule: rule.eval-sample-auto-collection-001
 * 
 * 监听 EventBus 的 intent.classified / pipeline.completed 事件，
 * 将 input/output/timestamp/context 写入 tests/collection/pending/ 目录。
 * 每条样本一个 JSON 文件，命名: {timestamp}-{event-type}.json
 */

const fs = require('fs');
const path = require('path');

const PENDING_DIR = path.resolve(__dirname, '../../tests/collection/pending');
const COLLECTION_META = path.resolve(__dirname, '../../tests/collection/meta.json');

// Ensure directories exist
function ensureDirs() {
  fs.mkdirSync(PENDING_DIR, { recursive: true });
}

/**
 * Generate a filename-safe timestamp: 20260305-022300-123
 */
function fileTimestamp() {
  const now = new Date();
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  return [
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`,
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`,
    pad(now.getMilliseconds(), 3)
  ].join('-');
}

/**
 * Collect a single sample from an event.
 * 
 * @param {string} eventType - One of: intent.classified, pipeline.completed
 * @param {object} payload - Event payload with at minimum { input, output }
 * @param {object} [context={}] - Additional context (session, user, channel, etc.)
 * @returns {string} Path to the written sample file
 */
function collectSample(eventType, payload, context = {}) {
  ensureDirs();

  const timestamp = fileTimestamp();
  const sanitizedType = eventType.replace(/\./g, '-');
  const filename = `${timestamp}-${sanitizedType}.json`;
  const filepath = path.join(PENDING_DIR, filename);

  const sample = {
    id: `sample-${timestamp}-${sanitizedType}`,
    event_type: eventType,
    timestamp: new Date().toISOString(),
    input: payload.input || null,
    output: payload.output || null,
    context: {
      session_id: context.session_id || null,
      channel: context.channel || null,
      user_id: context.user_id || null,
      ...context
    },
    metadata: {
      source: 'auto_collect',
      status: 'pending_review',
      collected_by: 'eval-collector',
      rule_id: 'rule.eval-sample-auto-collection-001'
    }
  };

  fs.writeFileSync(filepath, JSON.stringify(sample, null, 2), 'utf-8');
  updateMeta('collected', eventType);
  return filepath;
}

/**
 * Register with an EventBus instance.
 * Expects eventBus to have .on(eventName, callback) interface.
 * 
 * @param {object} eventBus - EventBus with .on() method
 */
function register(eventBus) {
  if (!eventBus || typeof eventBus.on !== 'function') {
    console.warn('[eval-collector] Invalid eventBus, skipping registration');
    return;
  }

  const WATCHED_EVENTS = ['intent.classified', 'pipeline.completed'];

  for (const evt of WATCHED_EVENTS) {
    eventBus.on(evt, (payload, context) => {
      try {
        const filepath = collectSample(evt, payload, context);
        console.log(`[eval-collector] Collected sample: ${path.basename(filepath)}`);
      } catch (err) {
        console.error(`[eval-collector] Failed to collect sample for ${evt}:`, err.message);
      }
    });
  }

  console.log(`[eval-collector] Registered for events: ${WATCHED_EVENTS.join(', ')}`);
}

/**
 * List all pending (un-reviewed) samples.
 * 
 * @returns {Array<{filename: string, event_type: string, timestamp: string, id: string}>}
 */
function reviewPending() {
  ensureDirs();

  const files = fs.readdirSync(PENDING_DIR).filter(f => f.endsWith('.json'));
  const pending = [];

  for (const file of files) {
    try {
      const content = JSON.parse(fs.readFileSync(path.join(PENDING_DIR, file), 'utf-8'));
      if (content.metadata && content.metadata.status === 'pending_review') {
        pending.push({
          filename: file,
          id: content.id,
          event_type: content.event_type,
          timestamp: content.timestamp,
          input_preview: typeof content.input === 'string'
            ? content.input.slice(0, 100)
            : JSON.stringify(content.input).slice(0, 100)
        });
      }
    } catch (err) {
      // Skip malformed files
      console.warn(`[eval-collector] Skipping malformed file: ${file}`);
    }
  }

  return pending;
}

/**
 * Mark a sample as reviewed and optionally approve it for the registry.
 * 
 * @param {string} filename - File in pending directory
 * @param {'approved'|'rejected'} decision 
 * @param {string} [reviewer='human'] - Who reviewed
 * @returns {object} Updated sample
 */
function reviewSample(filename, decision, reviewer = 'human') {
  const filepath = path.join(PENDING_DIR, filename);
  if (!fs.existsSync(filepath)) {
    throw new Error(`Sample not found: ${filename}`);
  }

  const sample = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  sample.metadata.status = decision;
  sample.metadata.reviewed_by = reviewer;
  sample.metadata.reviewed_at = new Date().toISOString();

  fs.writeFileSync(filepath, JSON.stringify(sample, null, 2), 'utf-8');
  updateMeta('reviewed', sample.event_type);
  return sample;
}

/**
 * Update collection metadata (stats tracking).
 */
function updateMeta(action, eventType) {
  let meta = { total_collected: 0, total_reviewed: 0, by_event: {} };
  try {
    if (fs.existsSync(COLLECTION_META)) {
      meta = JSON.parse(fs.readFileSync(COLLECTION_META, 'utf-8'));
    }
  } catch (e) { /* reset on corruption */ }

  if (action === 'collected') {
    meta.total_collected = (meta.total_collected || 0) + 1;
  } else if (action === 'reviewed') {
    meta.total_reviewed = (meta.total_reviewed || 0) + 1;
  }

  if (!meta.by_event[eventType]) {
    meta.by_event[eventType] = { collected: 0, reviewed: 0 };
  }
  meta.by_event[eventType][action] = (meta.by_event[eventType][action] || 0) + 1;
  meta.last_updated = new Date().toISOString();

  fs.writeFileSync(COLLECTION_META, JSON.stringify(meta, null, 2), 'utf-8');
}

module.exports = {
  collectSample,
  register,
  reviewPending,
  reviewSample
};
