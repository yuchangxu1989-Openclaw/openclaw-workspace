#!/usr/bin/env node
/**
 * Handler: rule.aeo-e2e-decision-pipeline-test-001
 * 全局决策流水线端到端AEO测试门禁
 *
 * Trigger events:
 *   event_bus.handler.modified, event_bus.dispatcher.modified,
 *   isc.rule.created, isc.rule.modified,
 *   skill.public.pre_publish, sprint.day.completion
 *
 * Action: 检查AEO测试报告，阻断或放行Day完成状态
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TRIGGER_EVENTS = [
  'event_bus.handler.modified',
  'event_bus.dispatcher.modified',
  'isc.rule.created',
  'isc.rule.modified',
  'skill.public.pre_publish',
  'sprint.day.completion',
];

const AEO_REPORT_GLOB = 'reports/aeo-e2e-*.json';
const WORKSPACE = process.env.ISC_WORKSPACE || path.resolve(__dirname, '../../..');

/**
 * Perception: receive event and determine if AEO gate applies
 */
function perceive(event) {
  if (!event || !event.type) {
    return { applicable: false, reason: 'no event type' };
  }
  const matched = TRIGGER_EVENTS.includes(event.type);
  return {
    applicable: matched,
    reason: matched ? `trigger matched: ${event.type}` : `event ${event.type} not in trigger list`,
    event,
  };
}

/**
 * Cognition: locate and validate AEO test reports
 *  - report exists?
 *  - all tests passed?
 *  - data source is real (not synthetic)?
 */
function evaluate() {
  const reportsDir = path.join(WORKSPACE, 'reports');
  if (!fs.existsSync(reportsDir)) {
    return { passed: false, reason: 'reports/ directory not found', details: [] };
  }

  let reportFiles;
  try {
    reportFiles = fs.readdirSync(reportsDir).filter(f => f.startsWith('aeo-e2e-') && f.endsWith('.json'));
  } catch {
    return { passed: false, reason: 'cannot read reports directory', details: [] };
  }

  if (reportFiles.length === 0) {
    return { passed: false, reason: 'no AEO e2e test reports found', details: [] };
  }

  const results = [];
  let allPassed = true;

  for (const file of reportFiles) {
    try {
      const report = JSON.parse(fs.readFileSync(path.join(reportsDir, file), 'utf-8'));

      // Check all tests passed
      const testsPassed = report.status === 'passed' || report.result === 'pass';
      // Check data source is real
      const dataReal = report.data_source !== 'synthetic' && report.data_source !== 'mock';

      const ok = testsPassed && dataReal;
      if (!ok) allPassed = false;

      results.push({
        file,
        testsPassed,
        dataReal,
        ok,
        summary: report.summary || null,
      });
    } catch (err) {
      allPassed = false;
      results.push({ file, ok: false, error: err.message });
    }
  }

  return {
    passed: allPassed,
    reason: allPassed ? 'all AEO e2e tests passed with real data' : 'one or more AEO checks failed',
    details: results,
  };
}

/**
 * Execution: block or allow based on evaluation
 */
function execute(evaluation) {
  if (evaluation.passed) {
    return {
      action: 'allow',
      message: '✅ AEO E2E gate passed — 允许进入裁决殿裁决',
      status: 'passed',
    };
  }
  return {
    action: 'block',
    message: `🚫 AEO E2E gate BLOCKED — ${evaluation.reason}`,
    status: 'blocked',
    details: evaluation.details,
  };
}

/**
 * Main handler entry point
 */
function handle(event) {
  // 1. Perception
  const perception = perceive(event);
  if (!perception.applicable) {
    return { skipped: true, reason: perception.reason };
  }

  // 2. Cognition
  const evaluation = evaluate();

  // 3. Execution
  const result = execute(evaluation);

  const output = {
    rule: 'rule.aeo-e2e-decision-pipeline-test-001',
    timestamp: new Date().toISOString(),
    perception: { event: event.type },
    evaluation: { passed: evaluation.passed, reason: evaluation.reason },
    result,
  };

  // Log output
  console.log(JSON.stringify(output, null, 2));
  return output;
}

// CLI mode: accept event as JSON arg or default to sprint.day.completion
if (require.main === module) {
  let event = { type: 'sprint.day.completion' };
  if (process.argv[2]) {
    try {
      event = JSON.parse(process.argv[2]);
    } catch {
      event = { type: process.argv[2] };
    }
  }
  const result = handle(event);
  process.exit(result.result && result.result.action === 'block' ? 1 : 0);
}

module.exports = { handle, perceive, evaluate, execute };
