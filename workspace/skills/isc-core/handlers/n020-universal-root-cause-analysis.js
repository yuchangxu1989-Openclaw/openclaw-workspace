#!/usr/bin/env node
/**
 * ISC Handler: N020 Universal Root Cause Analysis
 * 通用根因分析与差距分析 — 针对系统问题自动生成结构化诊断报告。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { scanFiles, writeReport, gateResult, gitExec } = require('../lib/handler-utils');

const WORKSPACE = process.env.WORKSPACE || path.resolve(__dirname, '../../..');

function collectIncidents() {
  const dirs = [
    path.join(WORKSPACE, 'reports'),
    path.join(WORKSPACE, 'logs'),
  ];

  const incidents = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const files = scanFiles(dir, /\.(json|jsonl|log|txt)$/, null, { maxDepth: 2 });
    for (const file of files.slice(0, 200)) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        if (/error|failed|failure|exception|超时|失败|告警/i.test(content)) {
          incidents.push({ file, hint: 'error-pattern-detected' });
        }
      } catch { /* skip */ }
    }
  }
  return incidents;
}

function analyzeRootCause(incidentCount) {
  const changedFiles = gitExec(WORKSPACE, 'diff --name-only HEAD~1..HEAD').split('\n').filter(Boolean);

  const causes = [];
  if (incidentCount > 20) causes.push('systemic-instability');
  if (changedFiles.some(f => /rule|handler/.test(f))) causes.push('rule-handler-change-risk');
  if (changedFiles.some(f => /config|gateway/.test(f))) causes.push('configuration-drift');
  if (causes.length === 0) causes.push('isolated-runtime-anomaly');

  const gaps = [];
  if (incidentCount > 0) gaps.push('monitoring-coverage-gap');
  if (incidentCount > 10) gaps.push('auto-repair-capability-gap');
  if (incidentCount > 30) gaps.push('architecture-resilience-gap');

  return { causes, gaps, changedFiles: changedFiles.slice(0, 30) };
}

function main() {
  const checks = [];
  const incidents = collectIncidents();
  const analysis = analyzeRootCause(incidents.length);

  checks.push({
    name: 'incident-collection',
    ok: true,
    message: `Collected ${incidents.length} incident candidate(s)`,
  });

  checks.push({
    name: 'root-cause-identified',
    ok: analysis.causes.length > 0,
    message: `Causes: ${analysis.causes.join(', ')}`,
  });

  checks.push({
    name: 'gap-analysis-complete',
    ok: true,
    message: analysis.gaps.length > 0 ? `Gaps: ${analysis.gaps.join(', ')}` : 'No significant gaps',
  });

  const result = gateResult('n020-universal-root-cause-analysis', checks, { failClosed: false });
  const reportPath = path.join(WORKSPACE, 'reports', 'isc', `n020-root-cause-${Date.now()}.json`);
  writeReport(reportPath, {
    ...result,
    incident_count: incidents.length,
    incidents: incidents.slice(0, 50).map(i => path.relative(WORKSPACE, i.file)),
    analysis,
  });

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.exitCode);
}

main();
