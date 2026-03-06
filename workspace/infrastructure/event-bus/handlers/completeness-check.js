const fs = require('fs');
const path = require('path');

module.exports = async function(event, rule, context) {
  const root = (context && (context.workspaceRoot || context.cwd || context.rootDir)) || process.cwd();
  const skillsDir = path.join(root, 'skills');
  const missing = [];

  if (!fs.existsSync(skillsDir)) {
    return { ok: false, reason: 'skills目录不存在', missing: ['skills/'] };
  }

  for (const skill of fs.readdirSync(skillsDir)) {
    const dir = path.join(skillsDir, skill);
    if (!fs.statSync(dir).isDirectory()) continue;
    const required = ['SKILL.md', 'index.js'];
    const absent = required.filter((f) => !fs.existsSync(path.join(dir, f)));
    if (absent.length) {
      missing.push({ skill, absent });
    }
  }

  return {
    ok: missing.length === 0,
    missing,
    message: missing.length ? `发现${missing.length}个技能目录不完整` : '技能完整性检查通过'
  };
};
