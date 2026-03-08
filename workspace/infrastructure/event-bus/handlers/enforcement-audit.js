const fs = require('fs');
const path = require('path');
const { buildClosedBookSummary, applyReleaseEvidenceDefaults } = require('../../enforcement/isc-eval-gates');

function collectRulesFromText(text) {
  const ids = new Set();
  const re = /ISC[-_\s]?(\d{3,4})/gi;
  let m;
  while ((m = re.exec(text))) ids.add(`ISC-${m[1]}`);
  // Also collect named ISC rules
  const named = /ISC[-_]([A-Z]+-[A-Z]+-\d+)/g;
  while ((m = named.exec(text))) ids.add(`ISC-${m[1]}`);
  return ids;
}

module.exports = async function(event, rule, context) {
  const root = (context && (context.workspaceRoot || context.cwd || context.rootDir)) || process.cwd();
  const handlersDir = path.join(root, 'infrastructure', 'event-bus', 'handlers');
  const rulesDoc = path.join(root, 'CRITICAL_ENFORCEMENT_RULES.md');
  const agentsMd = path.join(root, '..', 'workspace-coder', 'AGENTS.md');

  const declared = new Set();
  for (const docPath of [rulesDoc, agentsMd]) {
    if (fs.existsSync(docPath)) {
      const txt = fs.readFileSync(docPath, 'utf8');
      for (const id of collectRulesFromText(txt)) declared.add(id);
    }
  }
  // Always declare the two hard-gate rules
  declared.add('ISC-INTENT-EVAL-001');
  declared.add('ISC-CLOSED-BOOK-001');

  const handlerFiles = fs.existsSync(handlersDir)
    ? fs.readdirSync(handlersDir).filter((f) => f.endsWith('.js'))
    : [];

  const implemented = new Set();
  for (const file of handlerFiles) {
    const content = fs.readFileSync(path.join(handlersDir, file), 'utf8');
    for (const id of collectRulesFromText(content + '\n' + file)) implemented.add(id);
  }

  // Also check the enforcement module
  const enforcementDir = path.join(root, 'infrastructure', 'enforcement');
  if (fs.existsSync(enforcementDir)) {
    for (const file of fs.readdirSync(enforcementDir).filter(f => f.endsWith('.js'))) {
      const content = fs.readFileSync(path.join(enforcementDir, file), 'utf8');
      for (const id of collectRulesFromText(content + '\n' + file)) implemented.add(id);
    }
  }

  // Check ISC eval gates module existence
  const iscGatesPath = path.join(root, 'infrastructure', 'enforcement', 'isc-eval-gates.js');
  const iscGatesActive = fs.existsSync(iscGatesPath);
  if (iscGatesActive) {
    implemented.add('ISC-INTENT-EVAL-001');
    implemented.add('ISC-CLOSED-BOOK-001');
  }

  const missingHandlers = [...declared].filter((id) => !implemented.has(id));
  const closedBookSummary = buildClosedBookSummary(event && event.payload ? event.payload : {});

  return {
    ok: missingHandlers.length === 0,
    declared: declared.size,
    implemented: implemented.size,
    missingHandlers,
    iscHardGates: {
      'ISC-INTENT-EVAL-001': iscGatesActive ? 'active' : 'missing',
      'ISC-CLOSED-BOOK-001': iscGatesActive ? 'active' : 'missing'
    },
    ...applyReleaseEvidenceDefaults(event && event.payload ? event.payload : {}, null, { closedBookSummary }),
    message: missingHandlers.length === 0 ? 'ISC规则均有对应handler线索 (含硬钢印)' : `缺少${missingHandlers.length}个ISC规则对应handler`
  };
};
