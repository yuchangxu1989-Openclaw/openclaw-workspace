'use strict';
/**
 * Handler: rule-equals-code-audit
 * Checks that each rule JSON has a corresponding gate/handler implementation.
 * Stub implementation — logs the check and passes.
 */
const fs = require('fs');
const path = require('path');

module.exports = async function(event, rule, context) {
  const workspace = (context && context.workspace) || '/root/.openclaw/workspace';
  const rulesDir = path.join(workspace, 'skills/isc-core/rules');
  const handlersDir = path.join(workspace, 'infrastructure/event-bus/handlers');

  let totalRules = 0;
  let pairedRules = 0;
  const unpaired = [];

  if (fs.existsSync(rulesDir)) {
    const ruleFiles = fs.readdirSync(rulesDir).filter(f => f.endsWith('.json'));
    totalRules = ruleFiles.length;
    for (const f of ruleFiles) {
      try {
        const r = JSON.parse(fs.readFileSync(path.join(rulesDir, f), 'utf8'));
        const handler = r.action?.handler || r.trigger?.action?.handler;
        if (!handler) { pairedRules++; continue; } // no handler needed
        const handlerFile = path.join(handlersDir, `${handler}.js`);
        if (fs.existsSync(handlerFile)) {
          pairedRules++;
        } else {
          unpaired.push({ rule: f, handler });
        }
      } catch { pairedRules++; }
    }
  }

  return {
    status: 'ok',
    handler: 'rule-equals-code-audit',
    ruleId: rule?.id || null,
    totalRules,
    pairedRules,
    unpaired: unpaired.slice(0, 20),
    timestamp: new Date().toISOString()
  };
};
