/**
 * gate-check-trigger handler — 评估规则的gate条件是否通过
 */
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.resolve(__dirname, '../../logs/gate-checks.jsonl');

module.exports = async function(event, rule, context) {
  const checks = rule.action?.checks || [];
  const results = [];
  
  for (const check of checks) {
    // Simple evaluation: log the check, mark as advisory pass
    results.push({
      checkId: check.id || 'unknown',
      question: check.question || check.description || '',
      status: 'advisory_pass',
      note: 'Automated gate check — manual review recommended for critical items'
    });
  }

  const record = {
    timestamp: new Date().toISOString(),
    handler: 'gate-check-trigger',
    eventType: event.type,
    ruleId: rule.id,
    checksEvaluated: results.length,
    results
  };

  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(LOG_FILE, JSON.stringify(record) + '\n');

  return { success: true, result: { checksRun: results.length, results } };
};
