const path = require('path');
const { evaluateAll, evaluateIntentGate, evaluateClosedBookGate, buildSandboxEvidence, writeAuditReport } = require('../../enforcement/isc-eval-gates');

/**
 * ISC-INTENT-EVAL-001 + ISC-CLOSED-BOOK-001 集成中间件
 * 
 * 为任意 handler 提供 fail-closed 包装。
 * 用法：
 *   const { wrapHandler, requireGates } = require('./isc-eval-middleware');
 *   module.exports = wrapHandler(originalHandler);   // 包装整个handler
 *   // 或在handler内部：
 *   const gate = requireGates(payload); if (!gate.ok) return gate;
 */

function requireGates(payload = {}, options = {}) {
  const verdict = evaluateAll(payload);
  if (!verdict.ok) {
    return {
      ok: false,
      blocked: true,
      failClosed: true,
      gateStatus: 'FAIL-CLOSED',
      reason: verdict.summary,
      rules: verdict.rules.filter(r => !r.ok).map(r => r.ruleId),
      violations: verdict.rules.flatMap(r => r.violations),
      verdict
    };
  }
  return { ok: true, blocked: false, gateStatus: 'PASS', verdict };
}

function wrapHandler(handler, options = {}) {
  const handlerName = options.name || handler.name || 'unknown';
  const skipGateFor = options.skipGateFor || []; // event types to skip

  return async function iscGatedHandler(event, rule, context) {
    const eventType = event?.type || '';
    
    // Allow skip for non-evaluation events
    if (skipGateFor.some(pat => eventType.includes(pat))) {
      return handler(event, rule, context);
    }

    const workspace = (context && context.workspace) || '/root/.openclaw/workspace';
    const payload = (event && event.payload) || {};

    // Check if this event carries evaluation/gate/report semantics
    const isEvalRelated = /eval|gate|review|report|release|benchmark|audit|verdict|pass|accept|approv/i.test(
      eventType + ' ' + JSON.stringify(payload).substring(0, 2000)
    );

    if (isEvalRelated) {
      const verdict = evaluateAll(payload);
      if (!verdict.ok) {
        const auditData = {
          timestamp: new Date().toISOString(),
          handler: handlerName,
          eventType,
          ruleId: rule?.id || null,
          action: 'BLOCKED_BY_ISC_GATE',
          sandbox: buildSandboxEvidence({ workspace }),
          verdict
        };
        
        const auditPath = writeAuditReport(
          path.join(workspace, 'reports', 'artifact-gate', `isc-blocked-${Date.now()}.json`),
          auditData
        );

        return {
          ok: false,
          handler: handlerName,
          blocked: true,
          failClosed: true,
          gateStatus: 'FAIL-CLOSED',
          reason: verdict.summary,
          auditPath,
          verdict
        };
      }
    }

    // Gate passed or not eval-related, proceed with original handler
    return handler(event, rule, context);
  };
}

module.exports = { requireGates, wrapHandler };
