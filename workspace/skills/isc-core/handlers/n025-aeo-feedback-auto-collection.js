#!/usr/bin/env node
/**
 * ISC Handler: AEO Feedback Auto-Collection
 * Rule: rule.n025-aeo-feedback-auto-collection-025
 *
 * Triggered on user_message_received / conversation_turn_completed.
 * Detects feedback signals in conversations, archives them to the feedback store.
 * Uses handler-utils.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { checkFileExists, writeReport, gateResult } = require('../lib/handler-utils');

const WORKSPACE = process.env.WORKSPACE || path.resolve(__dirname, '../../..');
const FEEDBACK_STORE = path.join(WORKSPACE, 'data/aeo-feedback-store.json');
const REPORT_PATH = path.join(WORKSPACE, 'reports/n025-aeo-feedback-collection-report.json');

const FEEDBACK_SIGNALS = [
  'not working', 'wrong', 'incorrect', 'bug', 'error',
  'great', 'perfect', 'thanks', 'awesome', 'helpful',
  'slow', 'fast', 'confused', 'unclear',
];

/**
 * Detect feedback signals in a message.
 * @param {string} message
 * @returns {{hasFeedback: boolean, signals: string[], sentiment: string}}
 */
function detectFeedback(message) {
  if (!message) return { hasFeedback: false, signals: [], sentiment: 'neutral' };
  const lower = message.toLowerCase();
  const found = FEEDBACK_SIGNALS.filter(s => lower.includes(s));
  const positive = ['great', 'perfect', 'thanks', 'awesome', 'helpful'];
  const negative = ['not working', 'wrong', 'incorrect', 'bug', 'error'];
  const posCount = found.filter(s => positive.includes(s)).length;
  const negCount = found.filter(s => negative.includes(s)).length;
  const sentiment = posCount > negCount ? 'positive' : negCount > posCount ? 'negative' : 'neutral';
  return { hasFeedback: found.length > 0, signals: found, sentiment };
}

/**
 * Append feedback entry to store.
 */
function appendFeedback(entry) {
  let store = [];
  if (checkFileExists(FEEDBACK_STORE)) {
    try { store = JSON.parse(fs.readFileSync(FEEDBACK_STORE, 'utf8')); } catch { store = []; }
  }
  store.push(entry);
  // Keep last 500 entries
  if (store.length > 500) store = store.slice(-500);
  writeReport(FEEDBACK_STORE, store);
  return store.length;
}

function main() {
  const message = process.argv[2] || '';
  const checks = [];

  // Check 1: Feedback detection
  const detection = detectFeedback(message);
  checks.push({
    name: 'feedback_detection',
    ok: true,
    message: detection.hasFeedback
      ? `Detected signals: [${detection.signals.join(', ')}] (${detection.sentiment})`
      : 'No feedback signals detected',
  });

  // Check 2: Archive if feedback found
  if (detection.hasFeedback) {
    const storeSize = appendFeedback({
      timestamp: new Date().toISOString(),
      signals: detection.signals,
      sentiment: detection.sentiment,
      message_preview: message.slice(0, 100),
    });
    checks.push({
      name: 'feedback_archived',
      ok: true,
      message: `Archived to feedback store (${storeSize} total entries)`,
    });
  }

  const result = gateResult('n025-aeo-feedback-auto-collection', checks);
  const report = { ...result, timestamp: new Date().toISOString(), detection };

  writeReport(REPORT_PATH, report);
  console.log(JSON.stringify(report, null, 2));
  process.exit(result.exitCode);
}

main();
