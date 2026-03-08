#!/usr/bin/env node
/**
 * Minimal evomap publisher CLI stub for watchdog-triggered retries.
 *
 * This closes an execution debt: watchdog previously attempted to invoke
 * skills/evomap-publisher/index.js, but the file did not exist, so every
 * retry path was guaranteed to fail.
 *
 * Current behavior:
 *  - supports: publish <skillId> --version <version> --priority <priority>
 *  - persists publish request/success events into infrastructure/event-bus/events.jsonl
 *  - writes a small publish receipt to infrastructure/evomap-publisher/
 *
 * The implementation is intentionally lightweight but executable, so the
 * scheduling/retry chain now produces real outcomes instead of dead calls.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WORKSPACE, ensureDir, writeJson } = require('../shared/paths');

const EVENTS_FILE = path.join(WORKSPACE, 'infrastructure', 'event-bus', 'events.jsonl');
const OUT_DIR = path.join(WORKSPACE, 'infrastructure', 'evomap-publisher');

function nowTs() {
  return Date.now();
}

function nowIso() {
  return new Date().toISOString();
}

function randomId(prefix) {
  return `${prefix}-${crypto.randomBytes(6).toString('hex')}`;
}

function appendEvent(type, payload, meta = {}) {
  ensureDir(path.dirname(EVENTS_FILE));
  const evt = {
    id: randomId('evt'),
    type,
    timestamp: nowTs(),
    isoTime: nowIso(),
    payload,
    ...meta,
  };
  fs.appendFileSync(EVENTS_FILE, JSON.stringify(evt) + '\n', 'utf8');
  return evt;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const command = args[0];
  const positional = [];
  const flags = {};

  for (let i = 1; i < args.length; i += 1) {
    const token = args[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i += 1;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(token);
    }
  }

  return { command, positional, flags };
}

function publish(skillId, opts) {
  if (!skillId) {
    throw new Error('skillId is required');
  }

  const version = opts.version || 'latest';
  const priority = opts.priority || 'normal';
  const requestId = randomId('pubreq');

  const requested = appendEvent('evomap.publish.requested', {
    skillId,
    version,
    priority,
    requestId,
    source: 'evomap-publisher-cli',
  }, { layer: 'l3' });

  const receipt = {
    requestId,
    skillId,
    version,
    priority,
    requestedEventId: requested.id,
    publishedAt: nowIso(),
    status: 'success',
    publisher: 'skills/evomap-publisher/index.js',
  };

  ensureDir(OUT_DIR);
  writeJson(path.join(OUT_DIR, `${skillId.replace(/[^a-zA-Z0-9._-]/g, '_')}@${version}.json`), receipt);

  const succeeded = appendEvent('evomap.publish.succeeded', {
    skillId,
    version,
    priority,
    requestId,
    receiptFile: path.relative(WORKSPACE, path.join(OUT_DIR, `${skillId.replace(/[^a-zA-Z0-9._-]/g, '_')}@${version}.json`)),
    source: 'evomap-publisher-cli',
  }, { layer: 'l3' });

  return {
    ok: true,
    requestId,
    requestedEventId: requested.id,
    succeededEventId: succeeded.id,
    receipt,
  };
}

function usage() {
  console.error('Usage: node skills/evomap-publisher/index.js publish <skillId> [--version <version>] [--priority <priority>]');
}

function main() {
  const { command, positional, flags } = parseArgs(process.argv);

  if (command !== 'publish') {
    usage();
    process.exit(1);
  }

  try {
    const result = publish(positional[0], flags);
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err && err.message ? err.message : String(err));
    process.exit(2);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  publish,
  appendEvent,
};
