const fs = require('fs');
const path = require('path');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function findLatestJsonReport(dir) {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir)
    .filter(name => name.endsWith('.json') && name !== 'latest-day2-gap3-gate.json')
    .map(name => {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      return { full, mtimeMs: stat.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files[0]?.full || null;
}

module.exports = async function(event, rule, context = {}) {
  const workspace = context.workspace || process.cwd();
  const reportsDir = path.join(workspace, 'reports', 'aeo');
  ensureDir(reportsDir);

  const reportPath = findLatestJsonReport(reportsDir);
  if (!reportPath) {
    throw new Error(`AEO E2E Gate Blocked: no AEO report found under ${reportsDir}`);
  }

  const report = readJson(reportPath);
  const passed = !!report.summary?.gateReady;

  const gateResult = {
    status: passed ? 'PASSED' : 'BLOCKED',
    report: path.relative(workspace, reportPath),
    tribunal: report.tribunal?.artifact || null,
    trigger: event.type,
    timestamp: new Date().toISOString(),
    summary: report.summary,
    badcases: report.badcases
  };

  const latestPath = path.join(reportsDir, 'latest-day2-gap3-gate.json');
  writeJson(latestPath, gateResult);

  if (!passed) {
    throw new Error(`AEO E2E Gate Blocked: ${report.tribunal?.reason || 'gateReady=false'}`);
  }

  return gateResult;
};

