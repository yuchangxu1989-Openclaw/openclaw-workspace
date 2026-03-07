module.exports = async function cronJobRequested(event, rule, ctx) {
  const fs = require('fs');
  const path = require('path');
  const { spawnSync } = require('child_process');

  const root = path.resolve(__dirname, '../..');
  const logFile = path.resolve(root, 'logs/cron-job-requested-handler.jsonl');
  const payload = event && event.payload ? event.payload : {};
  const job = payload.job || {};
  const command = payload.command || {};
  const script = command.script;
  const args = Array.isArray(command.args) ? command.args : [];

  function log(entry) {
    const dir = path.dirname(logFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(logFile, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
  }

  if (!script) {
    log({ status: 'skipped', reason: 'missing_script', job: job.name || null });
    return { ok: false, skipped: true, reason: 'missing_script' };
  }

  // 事件驱动主路径：优先只记录接入成功，不默认执行，避免重复跑批。
  // 当 fallback=true 时才真正调用底层脚本，确保与 bridge-runner 形成可控兜底链路。
  if (!payload.fallback) {
    log({
      status: 'accepted',
      mode: 'event-only',
      job: job.name || null,
      script,
      args
    });
    return { ok: true, accepted: true, mode: 'event-only', job: job.name || null };
  }

  const scriptPath = path.resolve(root, script);
  if (!fs.existsSync(scriptPath)) {
    log({ status: 'error', reason: 'script_not_found', job: job.name || null, script: scriptPath });
    return { ok: false, error: 'script_not_found', script: scriptPath };
  }

  const result = spawnSync('node', [scriptPath, ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: ((job.timeout_seconds || 60) * 1000),
    env: { ...process.env, CRON_EVENT_DRIVEN: '1' }
  });

  log({
    status: result.status === 0 ? 'executed' : 'failed',
    mode: 'event-fallback-exec',
    job: job.name || null,
    exitCode: result.status,
    stdout: (result.stdout || '').slice(0, 1000),
    stderr: (result.stderr || '').slice(0, 1000)
  });

  return {
    ok: result.status === 0,
    exitCode: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  };
};
