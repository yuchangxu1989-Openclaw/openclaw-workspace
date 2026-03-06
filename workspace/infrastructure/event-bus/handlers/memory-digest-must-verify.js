'use strict';

const fs = require('fs');
const path = require('path');

function appendJsonl(filePath, record) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf8');
}

function candidatePathsFromPayload(payload = {}) {
  const values = [
    ...(Array.isArray(payload.files) ? payload.files : []),
    ...(Array.isArray(payload.file_paths) ? payload.file_paths : []),
    payload.file,
    payload.file_path,
    payload.path,
    payload.target_file,
    payload.memory_file,
  ].filter(Boolean);
  return [...new Set(values.map(v => String(v)))];
}

module.exports = async function memoryDigestMustVerify(event, rule, context = {}) {
  const workspace = context.workspace || '/root/.openclaw/workspace';
  const payload = event.payload || {};
  const reportFile = path.join(workspace, 'infrastructure', 'logs', 'memory-digest-verification.jsonl');
  const candidates = candidatePathsFromPayload(payload);

  const resolved = candidates.map(p => path.isAbsolute(p) ? p : path.join(workspace, p));
  const existing = resolved.filter(p => fs.existsSync(p));

  const verificationPassed = existing.length > 0;
  const status = verificationPassed ? 'verified' : 'missing_context';
  const record = {
    timestamp: new Date().toISOString(),
    handler: 'memory-digest-must-verify',
    ruleId: rule.id,
    eventType: event.type,
    candidates: resolved,
    existing,
    verificationPassed,
    status,
  };
  appendJsonl(reportFile, record);

  if (verificationPassed && context.bus?.emit) {
    await context.bus.emit('knowledge.disk.verified', {
      source_event: event.id,
      files: existing,
      rule_id: rule.id,
    }, 'memory-digest-must-verify');
  }

  return {
    ok: verificationPassed,
    autonomous: verificationPassed,
    status,
    verifiedFiles: existing,
    checkedFiles: resolved,
  };
};
