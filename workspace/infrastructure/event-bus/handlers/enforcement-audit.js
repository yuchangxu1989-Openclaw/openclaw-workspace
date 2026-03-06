const fs = require('fs');
const path = require('path');

function collectRulesFromText(text) {
  const ids = new Set();
  const re = /ISC[-_\s]?(\d{3,4})/gi;
  let m;
  while ((m = re.exec(text))) ids.add(`ISC-${m[1]}`);
  return ids;
}

module.exports = async function(event, rule, context) {
  const root = (context && (context.workspaceRoot || context.cwd || context.rootDir)) || process.cwd();
  const handlersDir = path.join(root, 'infrastructure', 'event-bus', 'handlers');
  const rulesDoc = path.join(root, 'CRITICAL_ENFORCEMENT_RULES.md');

  const declared = new Set();
  if (fs.existsSync(rulesDoc)) {
    const txt = fs.readFileSync(rulesDoc, 'utf8');
    for (const id of collectRulesFromText(txt)) declared.add(id);
  }

  const handlerFiles = fs.existsSync(handlersDir)
    ? fs.readdirSync(handlersDir).filter((f) => f.endsWith('.js'))
    : [];

  const implemented = new Set();
  for (const file of handlerFiles) {
    const content = fs.readFileSync(path.join(handlersDir, file), 'utf8');
    for (const id of collectRulesFromText(content + '\n' + file)) implemented.add(id);
  }

  const missingHandlers = [...declared].filter((id) => !implemented.has(id));

  return {
    ok: missingHandlers.length === 0,
    declared: declared.size,
    implemented: implemented.size,
    missingHandlers,
    message: missingHandlers.length === 0 ? 'ISC规则均有对应handler线索' : `缺少${missingHandlers.length}个ISC规则对应handler`
  };
};
