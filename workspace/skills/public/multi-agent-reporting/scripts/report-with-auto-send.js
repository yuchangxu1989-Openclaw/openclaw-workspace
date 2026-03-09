#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { autoSendArtifact } = require('../skills/public/file-sender/artifact-auto-send');

const LOG_FILE = '/root/.openclaw/workspace/infrastructure/logs/artifact-auto-send.jsonl';

function log(entry) {
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  fs.appendFileSync(LOG_FILE, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
}

async function main() {
  const [filePath, receiveId, receiveIdType, filename] = process.argv.slice(2);
  if (!filePath) {
    console.error('用法: node scripts/report-with-auto-send.js <filePath> [receiveId] [receiveIdType] [filename]');
    process.exit(1);
  }

  try {
    const result = await autoSendArtifact({ filePath, receiveId, receiveIdType, filename, required: true, source: 'report-with-auto-send' });
    log({ level: 'info', stage: 'wrapper-ok', filePath: path.resolve(filePath), result });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    log({ level: 'error', stage: 'wrapper-fail', filePath: path.resolve(filePath), error: error.message });
    console.error(`[report-with-auto-send] 失败: ${error.message}`);
    process.exit(1);
  }
}

main();
