const fs = require('fs');
const path = require('path');

module.exports = async function(event, rule, context) {
  const root = (context && (context.workspaceRoot || context.cwd || context.rootDir)) || process.cwd();
  const violations = [];

  const iscRuleFile = path.join(root, 'CRITICAL_ENFORCEMENT_RULES.md');
  if (fs.existsSync(iscRuleFile)) {
    const t = fs.readFileSync(iscRuleFile, 'utf8');
    const bad = t.match(/ISC[-_\s]?\d{1,2}\b/g) || [];
    if (bad.length) violations.push({ scope: 'isc-rule', bad });
  }

  const skillsDir = path.join(root, 'skills');
  if (fs.existsSync(skillsDir)) {
    for (const name of fs.readdirSync(skillsDir)) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
        violations.push({ scope: 'skill', name });
      }
    }
  }

  if (event && event.type && !/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(event.type)) {
    violations.push({ scope: 'event-type', name: event.type });
  }

  return {
    ok: violations.length === 0,
    violations,
    message: violations.length ? `发现${violations.length}项命名不规范` : '命名规范检查通过'
  };
};
