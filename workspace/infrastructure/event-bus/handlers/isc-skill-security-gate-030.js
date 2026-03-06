const path = require('path');
const { walk, readText, hasAny } = require('./p0-utils');

module.exports = async function(event, rule, context = {}) {
  const workspace = context.workspace || '/root/.openclaw/workspace';
  const logger = context.logger || console;
  const bus = context.bus || { emit() {} };
  const notify = typeof context.notify === 'function' ? context.notify.bind(context) : () => {};
  const skillPath = event.skillPath || event.payload?.skillPath || event.path || path.join(workspace, 'skills');
  const files = walk(skillPath, ['.js', '.ts', '.py', '.sh', '.json', '.md']);
  const threats = [];
  const categories = rule?.threatCategories?.categories || [];

  for (const file of files) {
    const txt = readText(file);
    for (const c of categories) {
      if (Array.isArray(c.patterns) && hasAny(txt, c.patterns)) {
        threats.push({ file, id: c.id, name: c.name, severity: c.severity });
      }
    }
  }

  const result = {
    scan: 'completed',
    threats: threats.length,
    details: threats,
    passed: threats.length === 0
  };

  bus.emit('skill.security.scan.completed', { skillPath, result });
  if (!result.passed) {
    notify(`❌ 技能安全门禁失败：检测到 ${threats.length} 个威胁`);
    bus.emit('skill.general.publish.blocked', { reason: 'security_gate_failed', result });
    throw new Error('skill security gate failed');
  }

  logger.info('[isc-skill-security-gate-030] passed', result);
  return result;
};
