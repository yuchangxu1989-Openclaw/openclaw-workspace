const fs = require('fs');
const path = require('path');

const LOG_FILE = path.resolve(__dirname, '../../logs/gate-checks.jsonl');

module.exports = async function(event, rule, context) {
  const checks = rule.action?.checks || [];
  const results = [];

  for (const check of checks) {
    let status = 'pass';
    let detail = '';

    switch (check.id) {
      case 'scalability':
        status = checkScalability(event.payload || {});
        detail = status === 'pass' ? '无硬编码限制' : '发现硬编码限制';
        break;
      case 'generalizability':
        status = 'needs_review';
        detail = '需要人工或LLM审核';
        break;
      case 'rule_gate_pairing':
        status = checkRuleGatePairing();
        detail = '配对率检查';
        break;
      default:
        status = 'advisory_pass';
        detail = `未实现的检查类型: ${check.id}`;
    }

    results.push({
      checkId: check.id,
      question: check.question || check.description || '',
      status,
      detail,
      fail_action: check.fail_action,
    });
  }

  const hasFailures = results.some(r => r.status === 'fail');
  const hasReviews = results.some(r => r.status === 'needs_review');

  if (hasFailures) {
    context?.bus?.emit?.('gate.check.failed', {
      ruleId: rule.id,
      failures: results.filter(r => r.status === 'fail'),
    });
    context?.notify?.('feishu', `🚫 Gate检查失败 [${rule.id}]: ${results.filter(r => r.status === 'fail').map(r => r.checkId).join(', ')}`, { severity: 'high' });
  }

  if (hasReviews) {
    context?.bus?.emit?.('gate.check.needs_review', {
      ruleId: rule.id,
      reviews: results.filter(r => r.status === 'needs_review'),
    });
  }

  const record = {
    timestamp: new Date().toISOString(),
    handler: 'gate-check-trigger',
    eventType: event.type,
    ruleId: rule.id,
    checksEvaluated: results.length,
    results,
    blocked: hasFailures,
  };

  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(LOG_FILE, JSON.stringify(record) + '\n');

  return { success: true, result: { checksRun: results.length, results, blocked: hasFailures } };
};

function checkScalability(payload) {
  const content = JSON.stringify(payload || {});
  const hardcoded = /\b(MAX_SIZE|MAX_COUNT|LIMIT)\s*=\s*\d+/.test(content);
  return hardcoded ? 'fail' : 'pass';
}

function checkRuleGatePairing() {
  const rulesDir = '/root/.openclaw/workspace/skills/isc-core/rules';
  const handlersDir = '/root/.openclaw/workspace/infrastructure/event-bus/handlers';
  const ruleFiles = fs.readdirSync(rulesDir).filter(f => f.endsWith('.json'));
  let paired = 0;
  for (const file of ruleFiles) {
    const rule = JSON.parse(fs.readFileSync(path.join(rulesDir, file), 'utf8'));
    const handler = rule.action?.handler;
    if (handler && fs.existsSync(path.join(handlersDir, `${handler}.js`))) paired++;
  }
  const rate = ruleFiles.length > 0 ? paired / ruleFiles.length : 1;
  return rate >= 1.0 ? 'pass' : 'fail';
}
