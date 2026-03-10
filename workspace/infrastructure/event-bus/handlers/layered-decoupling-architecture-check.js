'use strict';
/**
 * Handler: layered-decoupling-architecture-check
 * Validates that components belong to clear architectural layers.
 * Stub implementation — logs and passes.
 */
const fs = require('fs');
const path = require('path');

module.exports = async function(event, rule, context) {
  const workspace = (context && context.workspace) || '/root/.openclaw/workspace';

  // If a shell script is specified in the rule, note it
  const script = rule?.action?.script;
  let scriptExists = false;
  if (script) {
    scriptExists = fs.existsSync(path.join(workspace, script));
  }

  return {
    status: 'ok',
    handler: 'layered-decoupling-architecture-check',
    ruleId: rule?.id || null,
    eventType: event?.type || null,
    script: script || null,
    scriptExists,
    timestamp: new Date().toISOString()
  };
};
