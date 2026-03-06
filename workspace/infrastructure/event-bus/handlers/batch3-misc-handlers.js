const fs = require('fs');
const path = require('path');

const WORKSPACE = '/root/.openclaw/workspace';
const LOG_DIR = path.join(WORKSPACE, 'infrastructure', 'logs');

function appendLog(name, data) {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.appendFileSync(path.join(LOG_DIR, `${name}.jsonl`), JSON.stringify({ timestamp: new Date().toISOString(), ...data }) + '\n');
}

function passFail(issues) {
  return issues.length === 0 ? 'pass' : 'block';
}

async function genericCheck(event, rule, checkerName, fn) {
  const payload = event.payload || {};
  const out = fn(payload, event, rule);
  const result = out.result || passFail(out.issues || []);
  appendLog(checkerName, { handler: checkerName, eventType: event.type, ruleId: rule.id, result, ...out });
  return { success: result !== 'block', result, ...out };
}

module.exports = {
  genericCheck,
  passFail,
};
