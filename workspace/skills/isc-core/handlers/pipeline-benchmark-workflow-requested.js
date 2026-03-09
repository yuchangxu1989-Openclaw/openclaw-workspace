#!/usr/bin/env node
/**
 * ISC Handler: Pipeline Benchmark — Workflow Requested
 * 兼容 workflow.requested 事件，触发并行子 agent 编排前的预检。
 */
'use strict';
const path = require('path');
const { checkFileExists, gateResult, writeReport, readRuleJson } = require('../lib/handler-utils');

const WORKSPACE = process.env.WORKSPACE || path.resolve(__dirname, '../../..');

function checkWorkflowRequested() {
  const checks = [];
  const workflowId = process.env.ISC_WORKFLOW_ID || '';

  // 1. workflow ID 非空
  checks.push({
    name: 'workflow-id-present',
    ok: !!workflowId,
    message: workflowId ? `Workflow ID: ${workflowId}` : 'ISC_WORKFLOW_ID not set',
  });

  // 2. 规则目录存在
  const rulesDir = path.join(WORKSPACE, 'skills', 'isc-core', 'rules');
  checks.push({
    name: 'rules-dir-exists',
    ok: checkFileExists(rulesDir),
    message: checkFileExists(rulesDir) ? 'Rules directory exists' : 'Rules directory missing',
  });

  // 3. handler-utils 可用
  const utilsPath = path.join(WORKSPACE, 'skills', 'isc-core', 'lib', 'handler-utils.js');
  checks.push({
    name: 'handler-utils-available',
    ok: checkFileExists(utilsPath),
    message: checkFileExists(utilsPath) ? 'handler-utils.js available' : 'handler-utils.js missing',
  });

  // 4. 至少有一条 P1 规则
  const fs = require('fs');
  if (checkFileExists(rulesDir)) {
    const ruleFiles = fs.readdirSync(rulesDir).filter(f => f.endsWith('.json'));
    const p1Rules = ruleFiles.filter(f => {
      const rule = readRuleJson(path.join(rulesDir, f));
      return rule && rule.priority === 'P1';
    });
    checks.push({
      name: 'p1-rules-exist',
      ok: p1Rules.length > 0,
      message: `Found ${p1Rules.length} P1 rules`,
    });
  }

  return checks;
}

function main() {
  const checks = checkWorkflowRequested();
  const result = gateResult('pipeline-benchmark-workflow-requested', checks);

  const reportPath = path.join(WORKSPACE, 'reports', 'isc', `workflow-requested-${Date.now()}.json`);
  writeReport(reportPath, result);

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.exitCode);
}

main();
