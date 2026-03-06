const fs = require('fs');
const path = require('path');

const WORKSPACE = path.resolve(__dirname, '..', '..', '..');
const LOG_FILE = path.resolve(__dirname, '../../logs/skill-distribution.jsonl');

const LOCAL_PATTERNS = [/\/root\//, /\/home\//, /~\//, /\.openclaw\//];
const SECRET_PATTERNS = [/sk-[a-zA-Z0-9]{32,}/, /AKIA[A-Z0-9]{16}/, /-----BEGIN.*KEY-----/];

module.exports = async function(event, rule, context) {
  const payload = event.payload || {};
  const paths = payload.paths || [];
  const results = [];

  for (const skillPath of paths) {
    const fullPath = path.resolve(context?.workspace || WORKSPACE, skillPath);
    if (!fs.existsSync(fullPath)) continue;

    const checks = {
      noLocalPaths: !containsLocalPaths(fullPath),
      hasStandardIO: hasStandardInterface(fullPath),
      hasDocs: hasDocumentation(fullPath),
      noHardcodedSecrets: !containsSecrets(fullPath),
    };

    const passAll = Object.values(checks).every(Boolean);
    const isPublic = skillPath.startsWith('skills/public/');
    const isInternal = skillPath.startsWith('skills/') && !isPublic;

    if (passAll && isInternal) {
      context?.bus?.emit?.('skill.classification.suggest_public', {
        skillPath,
        checks,
        reason: '满足通用标准',
      });
      context?.notify?.('feishu', `💡 技能 ${path.basename(skillPath)} 满足通用标准，建议移入 skills/public/`, { severity: 'info' });
    } else if (!passAll && isPublic) {
      const violations = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
      context?.bus?.emit?.('skill.classification.violation', {
        skillPath,
        checks,
        violations,
      });
      context?.notify?.('feishu', `⚠️ skills/public/${path.basename(skillPath)} 不符合通用标准：${violations.join(', ')}`, { severity: 'warning' });
    }

    results.push({ skillPath, classification: passAll ? 'publishable' : 'local', checks });
  }

  const record = {
    timestamp: new Date().toISOString(),
    handler: 'classify-skill-distribution',
    eventType: event.type,
    ruleId: rule?.id,
    processed: paths.length,
    results,
  };

  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(LOG_FILE, JSON.stringify(record) + '\n');

  return { success: true, result: results };
};

function walkDir(dirPath) {
  const out = [];
  const stack = [dirPath];
  while (stack.length) {
    const cur = stack.pop();
    const entries = fs.readdirSync(cur, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(full);
      else out.push(full);
    }
  }
  return out;
}

function containsLocalPaths(dirPath) {
  const files = walkDir(dirPath).filter(f => f.endsWith('.js') || f.endsWith('.md'));
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    if (LOCAL_PATTERNS.some(p => p.test(content))) return true;
  }
  return false;
}

function hasStandardInterface(dirPath) {
  const skillMd = path.join(dirPath, 'SKILL.md');
  const indexJs = path.join(dirPath, 'index.js');
  return fs.existsSync(skillMd) || fs.existsSync(indexJs);
}

function hasDocumentation(dirPath) {
  return fs.existsSync(path.join(dirPath, 'SKILL.md')) || fs.existsSync(path.join(dirPath, 'README.md'));
}

function containsSecrets(dirPath) {
  const files = walkDir(dirPath);
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    if (SECRET_PATTERNS.some(p => p.test(content))) return true;
  }
  return false;
}
