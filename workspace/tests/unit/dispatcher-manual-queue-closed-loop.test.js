'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = '/root/.openclaw/workspace';
const dispatcher = require('../../infrastructure/dispatcher/dispatcher');

const MANUAL_QUEUE_FILE = path.join(ROOT, 'infrastructure/dispatcher/manual-queue.jsonl');
const EVENTS_FILE = path.join(ROOT, 'infrastructure/event-bus/events.jsonl');
const TASKS_FILE = path.join(ROOT, 'infrastructure/dispatcher/state/auto-repair-tasks.json');

function readText(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch (_) { return ''; }
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return fallback; }
}

function countOccurrences(text, needle) {
  if (!text || !needle) return 0;
  return text.split(needle).length - 1;
}

(async () => {
  const eventId = `evt_failed_${Date.now()}`;
  const taskSeed = `repair_${Date.now()}`;

  const beforeEvents = readText(EVENTS_FILE);
  const beforeQueue = readText(MANUAL_QUEUE_FILE);
  const beforeTasks = readJson(TASKS_FILE, { items: [] });

  const result = await dispatcher.dispatch(
    { action: 'test.closed-loop.failure' },
    { id: eventId, type: 'test.closed-loop.failure' },
    {
      routes: {
        'test.closed-loop.failure': { handler: 'test-closed-loop-failure-handler' }
      },
      handlerMap: new Map([
        ['test-closed-loop-failure-handler', {
          handler: () => { throw new Error('closed-loop permanent failure'); },
          config: { handler: 'test-closed-loop-failure-handler' },
          source: 'unit-test'
        }]
      ]),
      timeoutMs: 200,
    }
  );

  assert.strictEqual(result.success, false, 'dispatch should fail');
  assert.strictEqual(result.error, 'closed-loop permanent failure');

  const afterEvents = readText(EVENTS_FILE);
  const afterQueue = readText(MANUAL_QUEUE_FILE);
  const afterTasks = readJson(TASKS_FILE, { items: [] });

  assert.ok(afterQueue.includes(eventId), 'manual queue should persist failed event');
  assert.ok(afterQueue.length > beforeQueue.length, 'manual queue file should grow');

  const createdDelta = countOccurrences(afterEvents, `"type":"manual.queue.item.created"`) - countOccurrences(beforeEvents, `"type":"manual.queue.item.created"`);
  assert.ok(createdDelta >= 1, 'manual.queue.item.created should be emitted');
  assert.ok(afterEvents.includes(`"eventId":"${eventId}"`), 'event bus should contain created event for failed dispatch');

  const taskDelta = (afterTasks.items || []).length - (beforeTasks.items || []).length;
  assert.ok(taskDelta >= 1, 'global closed-loop task should be created');

  const matchingTasks = (afterTasks.items || []).filter(item => String(item.triggerEventId || '').includes('evt_manual_queue_'));
  assert.ok(matchingTasks.length >= 1, 'created event should escalate into auto-repair task');

  console.log('dispatcher manual-queue closed-loop test passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
