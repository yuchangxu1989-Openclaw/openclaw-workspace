#!/usr/bin/env node
/**
 * Regression tests for publish silence watchdog execution chain.
 *
 * Covers previously missing executable debt:
 * 1) watchdog can detect pending publish silence windows
 * 2) check mode performs no replay
 * 3) run mode replays via real publisher CLI and closes the window by emitting success
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const WATCHDOG = path.join(ROOT, 'skills', 'evomap-publisher', 'publish-silence-watchdog.js');
const PUBLISHER = path.join(ROOT, 'skills', 'evomap-publisher', 'index.js');

function mkWorkspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-watchdog-'));
  fs.mkdirSync(path.join(dir, 'infrastructure', 'event-bus'), { recursive: true });
  return dir;
}

function appendEvent(workspace, evt) {
  const file = path.join(workspace, 'infrastructure', 'event-bus', 'events.jsonl');
  fs.appendFileSync(file, JSON.stringify(evt) + '\n', 'utf8');
}

function runNode(script, args, workspace, extraEnv = {}) {
  const env = {
    ...process.env,
    OPENCLAW_HOME: workspace,
    OPENCLAW_WORKSPACE: workspace,
    ...extraEnv,
  };
  return spawnSync(process.execPath, [script, ...args], {
    cwd: ROOT,
    env,
    encoding: 'utf8',
  });
}

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function testPublisherCliEmitsEvents() {
  const workspace = mkWorkspace();
  const proc = runNode(PUBLISHER, ['publish', 'skill.alpha', '--version', '1.2.3', '--priority', 'high'], workspace);
  assert.strictEqual(proc.status, 0, `publisher exit != 0: ${proc.stderr}`);
  const lines = fs.readFileSync(path.join(workspace, 'infrastructure', 'event-bus', 'events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  const types = lines.map(x => x.type);
  assert(types.includes('evomap.publish.requested'), 'requested event missing');
  assert(types.includes('evomap.publish.succeeded'), 'succeeded event missing');
}

function testWatchdogCheckNoReplay() {
  const workspace = mkWorkspace();
  const oldTs = Date.now() - 5 * 3600 * 1000;
  appendEvent(workspace, {
    id: 'evt-old-1',
    type: 'skill.version.changed',
    timestamp: oldTs,
    payload: { skillId: 'skill.beta', version: '9.9.9' }
  });

  const proc = runNode(WATCHDOG, ['check'], workspace, {
    EP_SILENCE_THRESHOLD_MINUTES: '30',
    EP_SILENCE_LOOKBACK_HOURS: '24',
  });
  assert.strictEqual(proc.status, 0, `watchdog check exit != 0: ${proc.stderr}`);
  const summary = JSON.parse(proc.stdout);
  assert.strictEqual(summary.pendingCount, 1, 'expected one pending item');
  assert.strictEqual(summary.replayed.length, 0, 'check mode should not replay');
}

function testWatchdogRunReplaySuccess() {
  const workspace = mkWorkspace();
  const oldTs = Date.now() - 5 * 3600 * 1000;
  appendEvent(workspace, {
    id: 'evt-old-2',
    type: 'dto.publish.requested',
    timestamp: oldTs,
    payload: { skillId: 'skill.gamma', version: '2.0.0' }
  });

  const proc = runNode(WATCHDOG, ['run'], workspace, {
    EP_SILENCE_THRESHOLD_MINUTES: '30',
    EP_SILENCE_LOOKBACK_HOURS: '24',
  });
  assert.strictEqual(proc.status, 0, `watchdog run exit != 0: ${proc.stderr}`);
  const summary = JSON.parse(proc.stdout);
  assert.strictEqual(summary.pendingCount, 1, 'expected one pending replay item');
  assert(summary.replayed.includes('skill.gamma@2.0.0'), 'replay target missing');
  assert.strictEqual(summary.replayFailed.length, 0, 'replay should succeed');

  const report = loadJson(path.join(workspace, 'infrastructure', 'publish-watchdog', 'last-run.json'));
  assert(report.replayed.includes('skill.gamma@2.0.0'), 'report missing replayed item');

  const lines = fs.readFileSync(path.join(workspace, 'infrastructure', 'event-bus', 'events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  const successEvt = lines.find(x => x.type === 'evomap.publish.succeeded' && x.payload && x.payload.skillId === 'skill.gamma');
  assert(successEvt, 'successful publish event not emitted');
}

function main() {
  testPublisherCliEmitsEvents();
  testWatchdogCheckNoReplay();
  testWatchdogRunReplaySuccess();
  console.log('✅ publish silence watchdog regression passed');
}

main();
