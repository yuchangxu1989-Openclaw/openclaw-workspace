const fs = require('fs');
const path = require('path');

const OPENCLAW_HOME = process.env.OPENCLAW_HOME || '/root/.openclaw';
const WORKSPACE = process.env.OPENCLAW_WORKSPACE || path.join(OPENCLAW_HOME, 'workspace');
const SKILLS_DIR = path.join(WORKSPACE, 'skills');
const REPORTS_DIR = path.join(WORKSPACE, 'reports');
const MEMORY_DIR = path.join(WORKSPACE, 'memory');
const SECRETS_DIR = path.join(OPENCLAW_HOME, '.secrets');
const MEDIA_DIR = path.join(OPENCLAW_HOME, 'media');
const AGENTS_DIR = path.join(OPENCLAW_HOME, 'agents');
const CRON_DIR = path.join(OPENCLAW_HOME, 'cron');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

module.exports = {
  OPENCLAW_HOME,
  WORKSPACE,
  SKILLS_DIR,
  REPORTS_DIR,
  MEMORY_DIR,
  SECRETS_DIR,
  MEDIA_DIR,
  AGENTS_DIR,
  CRON_DIR,
  ensureDir,
  readJson,
  writeJson
};
