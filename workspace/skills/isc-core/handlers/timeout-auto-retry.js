#!/usr/bin/env node
/**
 * ISC Handler: Timeout Auto-Retry (ISC-TIMEOUT-AUTO-RETRY-001)
 * Checks subagent completion events for timeout/failed status and enqueues retries.
 * Max 2 retries. user_cancelled excluded.
 * Uses handler-utils.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { checkFileExists, writeReport, gateResult } = require('../lib/handler-utils');

const WORKSPACE = process.env.WORKSPACE || path.resolve(__dirname, '../../..');
const QUEUE_PATH = path.join(WORKSPACE, 'logs/auto-retry-queue.json');
const REPORT_PATH = path.join(WORKSPACE, 'reports/timeout-auto-retry-report.json');
const MAX_RETRY = 2;

function loadQueue() {
  if (!checkFileExists(QUEUE_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function saveQueue(queue) {
  writeReport(QUEUE_PATH, queue);
}

/**
 * Process a subagent completion event.
 * @param {object} event - { taskId, status, cancel_reason?, retry_count?, label?, task? }
 */
function processCompletion(event) {
  const retryableStatuses = ['timed_out', 'timeout', 'failed'];
  const checks = [];

  // 1. Check if status is retryable
  const isRetryable = retryableStatuses.includes(event.status);
  checks.push({
    name: 'status_retryable',
    ok: true,
    message: isRetryable
      ? `Status "${event.status}" is retryable`
      : `Status "${event.status}" does not need retry`,
  });

  if (!isRetryable) {
    const result = gateResult('timeout-auto-retry', checks);
    console.log(JSON.stringify({ ...result, action: 'no_retry_needed' }, null, 2));
    return result;
  }

  // 2. Check not user_cancelled
  const isUserCancelled = event.cancel_reason === 'user_cancelled';
  checks.push({
    name: 'not_user_cancelled',
    ok: !isUserCancelled,
    message: isUserCancelled
      ? 'Skipping: user_cancelled'
      : 'Not user_cancelled, eligible for retry',
  });

  if (isUserCancelled) {
    const result = gateResult('timeout-auto-retry', checks);
    console.log(JSON.stringify({ ...result, action: 'skipped_user_cancelled' }, null, 2));
    return result;
  }

  // 3. Check retry count
  const retryCount = event.retry_count || 0;
  const underLimit = retryCount < MAX_RETRY;
  checks.push({
    name: 'under_retry_limit',
    ok: underLimit,
    message: underLimit
      ? `Retry count ${retryCount} < max ${MAX_RETRY}`
      : `Retry count ${retryCount} >= max ${MAX_RETRY}, exhausted`,
  });

  if (!underLimit) {
    const result = gateResult('timeout-auto-retry', checks);
    console.log(JSON.stringify({ ...result, action: 'retries_exhausted' }, null, 2));
    return result;
  }

  // 4. Enqueue retry
  const queue = loadQueue();
  queue.push({
    taskId: event.taskId || `task-${Date.now()}`,
    label: event.label || '',
    task: event.task || '',
    status: event.status,
    retry_count: retryCount + 1,
    enqueued_at: new Date().toISOString(),
  });
  saveQueue(queue);

  checks.push({
    name: 'enqueued',
    ok: true,
    message: `Enqueued for retry #${retryCount + 1}`,
  });

  const result = gateResult('timeout-auto-retry', checks);
  const report = {
    ...result,
    timestamp: new Date().toISOString(),
    queue_size: queue.length,
    action: 'enqueued_retry',
  };

  writeReport(REPORT_PATH, report);
  console.log(JSON.stringify(report, null, 2));
  return result;
}

function main() {
  // Accept event from stdin or argv
  let event;
  const arg = process.argv[2];
  if (arg) {
    try {
      event = JSON.parse(arg);
    } catch {
      event = { taskId: 'test', status: arg || 'timeout' };
    }
  } else {
    // Demo/validation mode: report current queue status
    const queue = loadQueue();
    const checks = [{
      name: 'queue_status',
      ok: true,
      message: `Current retry queue has ${queue.length} items`,
    }];
    const result = gateResult('timeout-auto-retry', checks);
    console.log(JSON.stringify({ ...result, queue_size: queue.length, timestamp: new Date().toISOString() }, null, 2));
    process.exit(0);
  }

  const result = processCompletion(event);
  process.exit(result.exitCode);
}

main();
