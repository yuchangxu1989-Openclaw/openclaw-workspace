const assert = require('assert');
const fs = require('fs');
const path = require('path');

const routes = JSON.parse(fs.readFileSync(path.join(__dirname, '../../infrastructure/dispatcher/routes.json'), 'utf8'));

['git.pre_commit.detected', 'git.commit.quality_check', 'git.commit.architecture_review', 'git.commit.rule_code_pairing'].forEach((key) => {
  assert(routes[key], `missing route: ${key}`);
  assert.strictEqual(routes[key].handler, 'log-action', `route ${key} should use log-action`);
});

const handler = require('../../infrastructure/event-bus/handlers/isc-skill-security-gate-030');
(async () => {
  const result = await handler({ payload: { skillPath: path.join(__dirname, '../../skills/public/multi-agent-reporting') } }, { threatCategories: { categories: [] } }, {});
  assert.strictEqual(result.passed, true);
  console.log('day2 closeout route/hardening test passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
