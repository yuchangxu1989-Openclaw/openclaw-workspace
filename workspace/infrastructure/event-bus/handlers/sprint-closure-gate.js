#!/usr/bin/env node
'use strict';

/**
 * sprint-closure-gate — Sprint收工验收门禁处理器
 * 
 * 委托 artifact-gate-check 的 sprintClosureGate 函数执行四重验收。
 * 独立handler文件确保ISC规则handler名称与文件一一对应。
 * 
 * [ISC-INTENT-EVAL-001 + ISC-CLOSED-BOOK-001] fail-closed enforcement integrated.
 */

const { sprintClosureGate } = require('./artifact-gate-check');
const { evaluateAll, buildSandboxEvidence, writeAuditReport } = require('../../enforcement/isc-eval-gates');
const path = require('path');

async function run(input, context) {
  const workspace = (context && context.workspace) || '/root/.openclaw/workspace';
  const sprintName = input?.sprint || input?.payload?.sprint || 'current';
  const payload = input?.payload || input || {};

  // ISC hard-gate: must pass intent-eval + closed-book before sprint closure can report PASS
  const iscVerdict = evaluateAll(payload);
  const closureResult = sprintClosureGate(sprintName);

  // Inject ISC gate result into sprint closure
  closureResult.isc_gates = {
    intent_eval: iscVerdict.rules[0],
    closed_book: iscVerdict.rules[1],
    combined_ok: iscVerdict.ok,
    gateStatus: iscVerdict.gateStatus
  };

  // If ISC gates fail, override verdict to BLOCKED (FAIL-CLOSED default)
  if (!iscVerdict.ok) {
    closureResult.verdict = 'BLOCKED';
    closureResult.isc_fail_closed = true;
    closureResult.gateStatus = 'FAIL-CLOSED';
    closureResult.isc_summary = iscVerdict.summary;

    if (!closureResult.missing_gates) closureResult.missing_gates = [];
    closureResult.missing_gates.push('ISC-INTENT-EVAL-001', 'ISC-CLOSED-BOOK-001');

    writeAuditReport(
      path.join(workspace, 'reports', 'artifact-gate', `sprint-closure-isc-blocked-${Date.now()}.json`),
      { timestamp: new Date().toISOString(), handler: 'sprint-closure-gate', sandbox: buildSandboxEvidence({ workspace }), verdict: iscVerdict, closureResult }
    );
  }

  return closureResult;
}

module.exports = run;
module.exports.run = run;

if (require.main === module) {
  const result = sprintClosureGate(process.argv[2] || 'current');
  console.log(JSON.stringify(result, null, 2));
}
