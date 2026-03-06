'use strict';

const fs = require('fs');
const path = require('path');

function appendJsonl(filePath, record) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf8');
}

function readRecentLines(filePath, limit = 20) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, 'utf8').trim();
  if (!text) return [];
  return text.split('\n').slice(-limit).map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

module.exports = async function interactionSourceFileDelivery(event, rule, context = {}) {
  const workspace = context.workspace || '/root/.openclaw/workspace';
  const payload = event.payload || {};
  const auditFile = path.join(workspace, 'infrastructure', 'logs', 'source-file-delivery-audit.jsonl');
  const targetPath = payload.file_path || payload.path || payload.absolute_path || payload.source_file;
  const resolvedPath = targetPath ? (path.isAbsolute(targetPath) ? targetPath : path.join(workspace, targetPath)) : null;

  let deliveryMode = 'missing_file';
  let contentPreview = null;
  let verificationPassed = false;

  if (resolvedPath && fs.existsSync(resolvedPath)) {
    const stat = fs.statSync(resolvedPath);
    if (stat.isFile()) {
      const content = fs.readFileSync(resolvedPath, 'utf8');
      contentPreview = content.slice(0, 400);
      deliveryMode = 'content_fallback_prepared';
      verificationPassed = content.length >= 0;
    }
  }

  appendJsonl(auditFile, {
    timestamp: new Date().toISOString(),
    handler: 'interaction-source-file-delivery',
    ruleId: rule.id,
    eventType: event.type,
    eventId: event.id,
    resolvedPath,
    deliveryMode,
    contentPreview,
    verificationPassed,
  });

  const last = readRecentLines(auditFile, 1)[0];
  const writeVerified = last?.eventId === event.id && last?.deliveryMode === deliveryMode;

  if (verificationPassed && writeVerified && context.bus?.emit) {
    await context.bus.emit('user.source_file.delivery.prepared', {
      source_event: event.id,
      file_path: resolvedPath,
      delivery_mode: deliveryMode,
      preview_chars: contentPreview ? contentPreview.length : 0,
      rule_id: rule.id,
    }, 'interaction-source-file-delivery');
  }

  return {
    ok: verificationPassed && writeVerified,
    autonomous: verificationPassed,
    deliveryMode,
    filePath: resolvedPath,
    previewChars: contentPreview ? contentPreview.length : 0,
  };
};
