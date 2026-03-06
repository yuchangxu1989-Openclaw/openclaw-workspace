#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { FileSender } = require('./index.js');

const SUPPORTED_EXTS = new Set(['.md', '.png', '.json', '.pdf']);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..');
const LOG_DIR = path.join(WORKSPACE_ROOT, 'infrastructure', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'artifact-auto-send.jsonl');
const ALERTS_FILE = path.join(LOG_DIR, 'alerts.jsonl');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function log(entry) {
  ensureDir(LOG_DIR);
  fs.appendFileSync(LOG_FILE, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
}

function alert(entry) {
  ensureDir(LOG_DIR);
  fs.appendFileSync(ALERTS_FILE, JSON.stringify({
    timestamp: new Date().toISOString(),
    handler: 'artifact-auto-send',
    severity: entry.severity || 'error',
    acknowledged: false,
    ...entry,
  }) + '\n');
}

function inferReceiveIdType(receiveId, explicitType) {
  if (explicitType) return explicitType;
  if (!receiveId) return null;
  if (receiveId.startsWith('oc_')) return 'chat_id';
  if (receiveId.startsWith('ou_')) return 'open_id';
  if (receiveId.startsWith('on_')) return 'user_id';
  return null;
}

function resolveTarget({ receiveId, receiveIdType }) {
  const envReceiveId = receiveId || process.env.ARTIFACT_AUTO_SEND_TARGET || process.env.FEISHU_TARGET_USER;
  const envType = inferReceiveIdType(envReceiveId, receiveIdType || process.env.ARTIFACT_AUTO_SEND_TARGET_TYPE);
  if (!envReceiveId || !envType) {
    throw new Error('缺少可用接收方：需提供 receiveId/receiveIdType，或设置 ARTIFACT_AUTO_SEND_TARGET(+TYPE) / FEISHU_TARGET_USER');
  }
  return { receiveId: envReceiveId, receiveIdType: envType };
}

function normalizeCandidate(filePath) {
  const abs = path.resolve(filePath);
  const ext = path.extname(abs).toLowerCase();
  const stat = fs.existsSync(abs) ? fs.statSync(abs) : null;
  return { filePath: abs, ext, exists: !!stat, isFile: !!stat?.isFile(), size: stat?.size || 0 };
}

async function autoSendArtifact({ filePath, receiveId, receiveIdType, filename, required = false, source = 'unknown' }) {
  const candidate = normalizeCandidate(filePath);
  if (!candidate.exists || !candidate.isFile) {
    const error = `产物不存在或不是文件: ${candidate.filePath}`;
    log({ level: 'error', stage: 'validate', source, filePath: candidate.filePath, error });
    if (required || candidate.ext === '.md') {
      alert({
        eventType: 'artifact.auto_send.failed',
        message: error,
        source,
        stage: 'validate',
        filePath: candidate.filePath,
        ext: candidate.ext || null,
      });
    }
    if (required) throw new Error(error);
    return { success: false, skipped: true, reason: error };
  }

  if (!SUPPORTED_EXTS.has(candidate.ext)) {
    const reason = `文件类型未纳入自动发送: ${candidate.ext || '(none)'}`;
    log({ level: 'warn', stage: 'filter', source, filePath: candidate.filePath, reason });
    return { success: false, skipped: true, reason };
  }

  const target = resolveTarget({ receiveId, receiveIdType });
  const sender = new FileSender();

  try {
    const result = await sender.sendFile({
      filePath: candidate.filePath,
      receiveId: target.receiveId,
      receiveIdType: target.receiveIdType,
      filename: filename || path.basename(candidate.filePath),
    });
    log({ level: 'info', stage: 'sent', source, filePath: candidate.filePath, ext: candidate.ext, receiveId: target.receiveId, receiveIdType: target.receiveIdType, result });
    return { success: true, ...result };
  } catch (error) {
    log({ level: 'error', stage: 'send', source, filePath: candidate.filePath, ext: candidate.ext, receiveId: target.receiveId, receiveIdType: target.receiveIdType, error: error.message });
    alert({
      eventType: 'artifact.auto_send.failed',
      message: error.message,
      source,
      stage: 'send',
      filePath: candidate.filePath,
      ext: candidate.ext,
      receiveId: target.receiveId,
      receiveIdType: target.receiveIdType,
    });
    throw error;
  }
}

async function main() {
  const [filePath, receiveId, receiveIdType, filename] = process.argv.slice(2);
  if (!filePath) {
    console.error('用法: node artifact-auto-send.js <filePath> [receiveId] [receiveIdType] [filename]');
    process.exit(1);
  }
  try {
    const result = await autoSendArtifact({ filePath, receiveId, receiveIdType, filename, required: true, source: 'cli' });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`[artifact-auto-send] 失败: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { autoSendArtifact, SUPPORTED_EXTS };
