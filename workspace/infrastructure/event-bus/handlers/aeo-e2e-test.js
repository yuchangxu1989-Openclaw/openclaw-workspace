const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

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

function runScript(scriptPath, cwd) {
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd,
    encoding: 'utf8',
    timeout: 120000,
    env: { ...process.env }
  });
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  };
}

module.exports = async function(event, rule, context = {}) {
  const workspace = context.workspace || process.cwd();
  const logger = context.logger || console;
  const reportsDir = path.join(workspace, 'reports', 'aeo');
  ensureDir(reportsDir);

  const runnerPath = path.join(workspace, 'scripts', 'day2-gap3-aeo-close-loop.js');
  if (!fs.existsSync(runnerPath)) {
    throw new Error(`AEO close-loop runner not found: ${runnerPath}`);
  }

  logger.info?.('[aeo-e2e-test] executing close-loop runner', { eventType: event.type, runnerPath });
  const exec = runScript(runnerPath, workspace);

  if (exec.status !== 0) {
    throw new Error(`AEO close-loop runner failed: ${exec.stderr || exec.stdout}`);
  }

  let runnerOutput = {};
  try {
    runnerOutput = JSON.parse(exec.stdout.trim().split(/\n/).filter(Boolean).pop());
  } catch (_) {}

  const reportPath = runnerOutput.reportJsonPath
    ? path.join(workspace, runnerOutput.reportJsonPath)
    : null;

  if (!reportPath || !fs.existsSync(reportPath)) {
    throw new Error('AEO close-loop runner did not produce reportJsonPath');
  }

  const report = readJson(reportPath);
  const passed = !!report.summary?.gateReady;

  const gateResult = {
    status: passed ? 'PASSED' : 'BLOCKED',
    report: path.relative(workspace, reportPath),
    tribunal: runnerOutput.tribunalMdPath || null,
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
