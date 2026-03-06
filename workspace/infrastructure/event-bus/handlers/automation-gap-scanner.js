const fs = require('fs');
const path = require('path');

module.exports = async function(event, rule, context) {
  const root = (context && (context.workspaceRoot || context.cwd || context.rootDir)) || process.cwd();
  const scanDirs = ['scripts', 'docs', 'designs', 'memory'];
  const manualHints = [/手工/g, /人工/g, /manual/gi, /copy\s*paste/gi, /逐个处理/g];
  const autoHints = [/自动化/g, /automation/gi, /cron/gi, /event[-\s]?bus/gi, /脚本/g];

  const candidates = [];

  for (const dir of scanDirs) {
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs)) continue;
    const files = fs.readdirSync(abs).filter((n) => /\.(md|txt|js|sh)$/i.test(n));
    for (const f of files) {
      const p = path.join(abs, f);
      const content = fs.readFileSync(p, 'utf8');
      const manualCount = manualHints.reduce((acc, r) => acc + ((content.match(r) || []).length), 0);
      const autoCount = autoHints.reduce((acc, r) => acc + ((content.match(r) || []).length), 0);
      if (manualCount >= 2 && autoCount === 0) {
        candidates.push({ file: path.relative(root, p), manualSignals: manualCount });
      }
    }
  }

  return {
    ok: true,
    gapCount: candidates.length,
    candidates,
    message: candidates.length ? `发现${candidates.length}处潜在自动化缺口` : '未发现明显自动化缺口'
  };
};
