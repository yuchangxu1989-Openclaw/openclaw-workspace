#!/usr/bin/env node
/**
 * ISC Handler: AEO Insight to Action
 * Rule: rule.n026-aeo-insight-to-action-026
 *
 * Triggered on aeo_issue_frequency_threshold_exceeded / n020_analysis_completed.
 * Converts AEO insights into actionable improvement items assigned to skill owners.
 * Uses handler-utils.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { checkFileExists, writeReport, gateResult } = require('../lib/handler-utils');

const WORKSPACE = process.env.WORKSPACE || path.resolve(__dirname, '../../..');
const ACTION_ITEMS_PATH = path.join(WORKSPACE, 'data/aeo-action-items.json');
const REPORT_PATH = path.join(WORKSPACE, 'reports/n026-aeo-insight-to-action-report.json');

/**
 * Convert an insight into an action item.
 * @param {object} insight - { issue, frequency, severity, skill, root_cause? }
 * @returns {object} action item
 */
function insightToAction(insight) {
  const priority = (insight.severity === 'high' || insight.frequency >= 5)
    ? 'P0'
    : insight.frequency >= 3 ? 'P1' : 'P2';

  return {
    id: `action-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    created_at: new Date().toISOString(),
    source_issue: insight.issue || 'unknown',
    skill: insight.skill || 'unassigned',
    priority,
    frequency: insight.frequency || 0,
    severity: insight.severity || 'medium',
    root_cause: insight.root_cause || 'pending_analysis',
    status: 'open',
    suggested_action: `Investigate and fix "${insight.issue}" in skill "${insight.skill}"`,
  };
}

/**
 * Append action item to store.
 */
function appendActionItem(item) {
  let items = [];
  if (checkFileExists(ACTION_ITEMS_PATH)) {
    try { items = JSON.parse(fs.readFileSync(ACTION_ITEMS_PATH, 'utf8')); } catch { items = []; }
  }
  items.push(item);
  writeReport(ACTION_ITEMS_PATH, items);
  return items.length;
}

function main() {
  let insight;
  const arg = process.argv[2];
  if (arg) {
    try { insight = JSON.parse(arg); } catch {
      insight = { issue: arg, frequency: 3, severity: 'medium', skill: 'unknown' };
    }
  } else {
    // Demo mode: show current action items status
    let items = [];
    if (checkFileExists(ACTION_ITEMS_PATH)) {
      try { items = JSON.parse(fs.readFileSync(ACTION_ITEMS_PATH, 'utf8')); } catch { items = []; }
    }
    const checks = [{
      name: 'action_items_status',
      ok: true,
      message: `Current action items: ${items.length} total, ${items.filter(i => i.status === 'open').length} open`,
    }];
    const result = gateResult('n026-aeo-insight-to-action', checks);
    console.log(JSON.stringify({ ...result, timestamp: new Date().toISOString() }, null, 2));
    process.exit(0);
  }

  const checks = [];

  // Check 1: Validate insight
  const hasIssue = !!(insight.issue || insight.skill);
  checks.push({
    name: 'insight_valid',
    ok: hasIssue,
    message: hasIssue ? `Insight for skill "${insight.skill}": ${insight.issue}` : 'No valid insight data',
  });

  // Check 2: Threshold met
  const thresholdMet = insight.frequency >= 3 || insight.severity === 'high';
  checks.push({
    name: 'threshold_met',
    ok: thresholdMet,
    message: thresholdMet
      ? `Threshold met (freq=${insight.frequency}, severity=${insight.severity})`
      : `Below threshold (freq=${insight.frequency}, severity=${insight.severity})`,
  });

  // Check 3: Create action item if threshold met
  if (hasIssue && thresholdMet) {
    const action = insightToAction(insight);
    const totalItems = appendActionItem(action);
    checks.push({
      name: 'action_created',
      ok: true,
      message: `Created ${action.priority} action item "${action.id}" (${totalItems} total)`,
    });
  }

  const result = gateResult('n026-aeo-insight-to-action', checks);
  const report = { ...result, timestamp: new Date().toISOString(), insight };

  writeReport(REPORT_PATH, report);
  console.log(JSON.stringify(report, null, 2));
  process.exit(result.exitCode);
}

main();
