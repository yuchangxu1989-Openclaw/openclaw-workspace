#!/usr/bin/env node
/**
 * ISC Handler: Auto ASR Voice Transcribe
 * Automatically transcribes voice/audio messages using GLM-ASR.
 * 
 * Rule: rule.auto-asr-on-voice-message-001
 * Trigger: audio/voice message received (ogg/mp3/wav/m4a)
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const WORKSPACE = process.env.WORKSPACE || path.resolve(__dirname, '../../..');
const ASR_SCRIPT = path.resolve(WORKSPACE, 'skills/public/glm-asr/index.js');
const SECRETS_PATH = '/root/.openclaw/.secrets/zhipu-keys.env';

// Formats that need renaming for GLM-ASR compatibility
const NEEDS_RENAME = new Set(['ogg', 'oga']);

function loadApiKey() {
  if (!fs.existsSync(SECRETS_PATH)) {
    throw new Error(`Secrets file not found: ${SECRETS_PATH}`);
  }
  const content = fs.readFileSync(SECRETS_PATH, 'utf8');
  const match = content.match(/^ZHIPU_API_KEY_1=(.+)$/m);
  if (!match) throw new Error('ZHIPU_API_KEY_1 not found in secrets');
  return match[1].trim();
}

function getFileExt(filePath) {
  return path.extname(filePath).slice(1).toLowerCase();
}

/**
 * Transcribe an audio file using GLM-ASR.
 * @param {string} audioPath - Path to the audio file
 * @returns {string} Transcribed text
 */
function transcribe(audioPath) {
  if (!fs.existsSync(audioPath)) {
    throw new Error(`Audio file not found: ${audioPath}`);
  }
  if (!fs.existsSync(ASR_SCRIPT)) {
    throw new Error(`ASR script not found: ${ASR_SCRIPT}`);
  }

  const apiKey = loadApiKey();
  const ext = getFileExt(audioPath);
  let targetPath = audioPath;

  // ogg/oga → copy as .wav (GLM-ASR doesn't support ogg extension)
  if (NEEDS_RENAME.has(ext)) {
    targetPath = audioPath.replace(/\.[^.]+$/, '.wav');
    fs.copyFileSync(audioPath, targetPath);
  }

  try {
    const result = execSync(
      `node "${ASR_SCRIPT}" --file "${targetPath}"`,
      {
        env: { ...process.env, ZHIPU_API_KEY: apiKey },
        encoding: 'utf8',
        timeout: 120000,
        maxBuffer: 10 * 1024 * 1024
      }
    );
    return result.trim();
  } finally {
    // Clean up renamed temp file
    if (targetPath !== audioPath && fs.existsSync(targetPath)) {
      try { fs.unlinkSync(targetPath); } catch (_) {}
    }
  }
}

// CLI entry point
if (require.main === module) {
  const audioFile = process.argv[2];
  if (!audioFile) {
    console.error('Usage: node auto-asr-voice-transcribe.js <audio-file>');
    process.exit(1);
  }
  try {
    const text = transcribe(audioFile);
    console.log(text);
  } catch (err) {
    console.error(`ASR Error: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { transcribe };
