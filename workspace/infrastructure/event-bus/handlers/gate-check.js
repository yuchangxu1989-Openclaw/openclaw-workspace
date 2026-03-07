const path = require('path');
const { evaluateAll, buildSandboxEvidence, writeAuditReport } = require('../../enforcement/isc-eval-gates');

module.exports = async function(event, rule, context) {
  const workspace = (context && context.workspace) || '/root/.openclaw/workspace';
  const payload = (event && event.payload) || {};
  const verdict = evaluateAll(payload);
  const report = {
    timestamp: new Date().toISOString(),
    handler: 'gate-check',
    eventType: event?.type || null,
    ruleId: rule?.id || null,
    sandbox: buildSandboxEvidence({ workspace }),
    verdict
  };

  const auditPath = writeAuditReport(
    path.join(workspace, 'reports', 'artifact-gate', `audit-${Date.now()}.json`),
    report
  );

  return {
    ok: verdict.ok,
    handler: 'gate-check',
    eventType: event?.type || null,
    ruleId: rule?.id || null,
    gateStatus: verdict.gateStatus,
    failClosed: !verdict.ok,
    auditPath,
    verdict
  };
};
