'use strict';

/**
 * Session startup anchor bootstrap:
 * - verifies CAPABILITY-ANCHOR exists
 * - opportunistically warms it into process memory / cache
 * - emits a session event for downstream observability
 *
 * Goal: reduce cases where known capabilities are omitted because the
 * session never touched the anchor at decision-entry time.
 */

const fs = require('fs');
const path = require('path');

const WORKSPACE = '/root/.openclaw/workspace';
const ANCHOR_PATH = path.join(WORKSPACE, 'CAPABILITY-ANCHOR.md');

let cached = {
  loadedAt: 0,
  mtimeMs: 0,
  size: 0,
  preview: '',
  content: ''
};

function readAnchor() {
  if (!fs.existsSync(ANCHOR_PATH)) {
    const err = new Error(`CAPABILITY-ANCHOR missing: ${ANCHOR_PATH}`);
    err.code = 'CAPABILITY_ANCHOR_MISSING';
    throw err;
  }

  const stat = fs.statSync(ANCHOR_PATH);
  if (cached.content && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return { ...cached, cacheHit: true, path: ANCHOR_PATH };
  }

  const content = fs.readFileSync(ANCHOR_PATH, 'utf8');
  cached = {
    loadedAt: Date.now(),
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    preview: content.slice(0, 1200),
    content,
  };

  return { ...cached, cacheHit: false, path: ANCHOR_PATH };
}

function ensureCapabilityAnchorLoaded(meta = {}) {
  const anchor = readAnchor();

  try {
    const { bus } = require('./event-bus/bus');
    bus.emit('session.capability-anchor.loaded', {
      source: meta.source || 'unknown',
      cacheHit: anchor.cacheHit,
      size: anchor.size,
      mtimeMs: anchor.mtimeMs,
      loadedAt: anchor.loadedAt,
      path: anchor.path,
    }, 'session-anchor-bootstrap');
  } catch (_) {
    // never block caller on telemetry failure
  }

  return anchor;
}

function getCapabilityAnchorSnapshot() {
  return cached.content ? { ...cached, path: ANCHOR_PATH } : null;
}

module.exports = {
  ensureCapabilityAnchorLoaded,
  getCapabilityAnchorSnapshot,
  ANCHOR_PATH,
};
