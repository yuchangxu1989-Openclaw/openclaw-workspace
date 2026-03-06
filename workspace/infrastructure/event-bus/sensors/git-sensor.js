#!/usr/bin/env node
'use strict';

/**
 * Git传感器 - 扫描信号目录，将git操作转化为事件
 *
 * 输入：signals/ 目录下的 .signal 文件
 * 输出：事件发射到 event bus
 * 副作用：处理完的信号文件移入 signals/processed/
 *
 * @module git-sensor
 */

const fs = require('fs');
const path = require('path');
const bus = require('../bus-adapter');

const SIGNAL_DIR = path.join(__dirname, '../signals');
const PROCESSED_DIR = path.join(SIGNAL_DIR, 'processed');
const ERROR_DIR = path.join(SIGNAL_DIR, 'error');
const DEDUPE_FILE = path.join(SIGNAL_DIR, '.git-sensor-dedupe.json');
const DEDUPE_TTL_MS = 24 * 60 * 60 * 1000;

function _ensureDirs() {
  fs.mkdirSync(SIGNAL_DIR, { recursive: true });
  fs.mkdirSync(PROCESSED_DIR, { recursive: true });
  fs.mkdirSync(ERROR_DIR, { recursive: true });
}

function _safeReadJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function _loadDedupe() {
  try {
    const obj = JSON.parse(fs.readFileSync(DEDUPE_FILE, 'utf8'));
    return obj && typeof obj === 'object' ? obj : {};
  } catch (_) {
    return {};
  }
}

function _saveDedupe(map) {
  try {
    fs.writeFileSync(DEDUPE_FILE, JSON.stringify(map, null, 2));
  } catch (_) {}
}

function _pruneDedupe(map) {
  const now = Date.now();
  for (const [k, ts] of Object.entries(map)) {
    if (!ts || (now - ts) > DEDUPE_TTL_MS) delete map[k];
  }
}

function _emitWithRetry(type, payload, source) {
  try {
    bus.emit(type, payload, source);
    return true;
  } catch (_) {
    try {
      bus.emit(type, payload, source);
      return true;
    } catch (err2) {
      return err2;
    }
  }
}

function _cleanProcessed(maxAgeMs) {
  if (!fs.existsSync(PROCESSED_DIR)) return;
  const now = Date.now();
  for (const f of fs.readdirSync(PROCESSED_DIR)) {
    const p = path.join(PROCESSED_DIR, f);
    try {
      const st = fs.statSync(p);
      if ((now - st.mtimeMs) > maxAgeMs) fs.unlinkSync(p);
    } catch (_) {}
  }
}

function scan() {
  _ensureDirs();

  const dedupe = _loadDedupe();
  _pruneDedupe(dedupe);

  const files = fs.readdirSync(SIGNAL_DIR)
    .filter(f => f.endsWith('.signal'))
    .sort();

  const results = [];

  for (const file of files) {
    const filePath = path.join(SIGNAL_DIR, file);

    let signal;
    try {
      signal = _safeReadJSON(filePath);
    } catch (err) {
      fs.renameSync(filePath, path.join(ERROR_DIR, file));
      console.error(`[git-sensor] invalid signal JSON: ${file} - ${err.message}`);
      continue;
    }

    if (signal.type === 'git.committed') {
      const commit = signal.commit || '';
      if (commit && dedupe[commit]) {
        fs.renameSync(filePath, path.join(PROCESSED_DIR, file));
        continue;
      }

      const changedFiles = String(signal.files || '').split(',').filter(Boolean);
      const skillChanges = changedFiles.filter(f => f.startsWith('skills/'));
      const ruleChanges = changedFiles.filter(f => f.includes('rules/') && f.endsWith('.json'));
      const docChanges = changedFiles.filter(f => f.endsWith('.md'));
      const infraChanges = changedFiles.filter(f => f.startsWith('infrastructure/'));

      const ok1 = _emitWithRetry('git.commit.completed', {
        commit,
        file_count: changedFiles.length,
        files: changedFiles.slice(0, 50),
        categories: {
          skills: skillChanges.length,
          rules: ruleChanges.length,
          docs: docChanges.length,
          infra: infraChanges.length,
        }
      }, 'git-sensor');

      if (ok1 !== true) {
        console.error(`[git-sensor] emit failed: git.commit.completed - ${ok1.message || ok1}`);
        continue;
      }
      results.push('git.commit.completed');

      if (skillChanges.length > 0) {
        const ok2 = _emitWithRetry('skill.files.changed', { commit, paths: skillChanges }, 'git-sensor');
        if (ok2 !== true) {
          console.error(`[git-sensor] emit failed: skill.files.changed - ${ok2.message || ok2}`);
          continue;
        }
        results.push('skill.files.changed');
      }

      if (ruleChanges.length > 0) {
        const ok3 = _emitWithRetry('isc.rule.files_changed', { commit, paths: ruleChanges }, 'git-sensor');
        if (ok3 !== true) {
          console.error(`[git-sensor] emit failed: isc.rule.files_changed - ${ok3.message || ok3}`);
          continue;
        }
        results.push('isc.rule.files_changed');
      }

      if (commit) dedupe[commit] = Date.now();
      fs.renameSync(filePath, path.join(PROCESSED_DIR, file));
      continue;
    }

    if (signal.type === 'git.pre_commit') {
      const stagedFiles = String(signal.staged || '').split(',').filter(Boolean);
      const ok = _emitWithRetry('git.pre_commit.detected', {
        staged_count: stagedFiles.length,
        staged: stagedFiles.slice(0, 50),
        ts: signal.ts || Date.now(),
      }, 'git-sensor');

      if (ok !== true) {
        console.error(`[git-sensor] emit failed: git.pre_commit.detected - ${ok.message || ok}`);
        continue;
      }
      results.push('git.pre_commit.detected');
      fs.renameSync(filePath, path.join(PROCESSED_DIR, file));
      continue;
    }

    fs.renameSync(filePath, path.join(ERROR_DIR, file));
    console.error(`[git-sensor] unsupported signal type: ${signal.type || 'unknown'} (${file})`);
  }

  _saveDedupe(dedupe);
  _cleanProcessed(24 * 60 * 60 * 1000);

  return { processed: files.length, events: results };
}

if (require.main === module) {
  const out = scan();
  console.log(JSON.stringify(out));
}

module.exports = {
  scan,
  _cleanProcessed,
};
