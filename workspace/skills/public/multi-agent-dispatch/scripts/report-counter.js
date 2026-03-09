#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const WORKSPACE = path.resolve(__dirname, '..');
const REPORTS_DIR = path.join(WORKSPACE, 'reports', 'task-queue');
const COUNTER_FILE = path.join(REPORTS_DIR, 'report-counter.json');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function touchReportCounter(meta = {}) {
  const previous = readJson(COUNTER_FILE, { count: 0, history: [] });
  const nextCount = Number(previous.count || 0) + 1;
  const now = new Date().toISOString();
  const history = Array.isArray(previous.history) ? previous.history.slice(-19) : [];
  history.push({
    count: nextCount,
    at: now,
    source: meta.source || 'unknown',
    event: meta.event || null,
    title: meta.title || null,
    active: meta.stats?.active ?? null,
    completed: meta.stats?.completed ?? null,
    blocked: meta.stats?.blocked ?? null,
    queued: meta.stats?.queued ?? null
  });

  const payload = {
    count: nextCount,
    updated_at: now,
    last_source: meta.source || 'unknown',
    last_event: meta.event || null,
    last_title: meta.title || null,
    last_stats: meta.stats || null,
    history
  };
  writeJson(COUNTER_FILE, payload);
  return payload;
}

module.exports = {
  COUNTER_FILE,
  touchReportCounter,
  readJson,
  writeJson,
};
