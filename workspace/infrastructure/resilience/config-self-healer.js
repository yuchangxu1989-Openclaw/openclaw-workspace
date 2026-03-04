'use strict';

/**
 * Config Self-Healer — resilient config loading with fallbacks
 * 
 * Handles:
 *   1. Rule file JSON parse failure → skip that rule + alert, don't crash RuleMatcher
 *   2. Feature flags file corruption → fall back to defaults
 *   3. routes.json corruption → fall back to built-in default routes
 * 
 * @module resilience/config-self-healer
 */

const fs = require('fs');
const path = require('path');

// Decision Logger
let _decisionLogger = null;
try {
  _decisionLogger = require('../decision-log/decision-logger');
} catch (_) {}

// ── Paths ───────────────────────────────────────────────────────
const RULES_DIR = path.resolve(__dirname, '../../skills/isc-core/rules');
const FLAGS_FILE = path.resolve(__dirname, '../config/flags.json');
const ROUTES_FILE = path.resolve(__dirname, '../dispatcher/routes.json');
const HEAL_LOG_FILE = path.join(__dirname, 'heal-log.jsonl');

// ── Default routes (built-in fallback) ──────────────────────────
const DEFAULT_ROUTES = Object.freeze({
  'user.message': {
    handler: 'user-message-router',
    priority: 'high',
    description: 'Route user messages to appropriate handler',
  },
  'system.error': {
    handler: 'system-alert',
    priority: 'high',
    description: 'System errors trigger alerting',
  },
  'user.intent.*': {
    handler: 'intent-dispatch',
    priority: 'normal',
    description: 'L3 detected user intents',
  },
});

// ── Default feature flags ───────────────────────────────────────
const DEFAULT_FLAGS = Object.freeze({
  L3_PIPELINE_ENABLED: false,
  L3_EVENTBUS_ENABLED: true,
  L3_RULEMATCHER_ENABLED: true,
  L3_INTENTSCANNER_ENABLED: true,
  L3_DISPATCHER_ENABLED: true,
  L3_DECISIONLOG_ENABLED: true,
  L3_CIRCUIT_BREAKER_DEPTH: 5,
});

// ── Rule File Self-Healing ──────────────────────────────────────

/**
 * Load all ISC rule files with individual fault tolerance.
 * Corrupted files are skipped (not crash-inducing).
 * 
 * @param {string} [rulesDir] - Rules directory path
 * @returns {{ rules: object[], errors: Array<{file: string, error: string}>, healed: boolean }}
 */
function loadRulesSafe(rulesDir) {
  const dir = rulesDir || RULES_DIR;
  const rules = [];
  const errors = [];

  let files;
  try {
    files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  } catch (err) {
    // Entire directory unreadable
    _logHeal('rules_dir_unreadable', { dir, error: err.message });
    return { rules: [], errors: [{ file: dir, error: err.message }], healed: true };
  }

  for (const file of files) {
    const filePath = path.join(dir, file);
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const rule = JSON.parse(raw);
      rule._filePath = filePath;
      rule._fileName = file;
      rules.push(rule);
    } catch (err) {
      // Skip this rule, alert, continue
      errors.push({ file, error: err.message });
      _logHeal('rule_parse_failed', {
        file,
        error: err.message,
        action: 'skipped — other rules still loaded',
      });
    }
  }

  return {
    rules,
    errors,
    healed: errors.length > 0,
    total: files.length,
    loaded: rules.length,
    skipped: errors.length,
  };
}

// ── Feature Flags Self-Healing ──────────────────────────────────

/**
 * Load feature flags with fallback to defaults.
 * 
 * @param {string} [flagsFile] - Flags file path
 * @returns {{ flags: object, source: string, error?: string }}
 */
function loadFlagsSafe(flagsFile) {
  const file = flagsFile || FLAGS_FILE;

  try {
    if (!fs.existsSync(file)) {
      return { flags: { ...DEFAULT_FLAGS }, source: 'defaults', reason: 'file not found' };
    }

    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('flags.json must be a plain object');
    }

    // Merge with defaults (file values override defaults)
    const merged = { ...DEFAULT_FLAGS, ...parsed };
    return { flags: merged, source: 'file' };
  } catch (err) {
    _logHeal('flags_corrupted', {
      file,
      error: err.message,
      action: 'falling back to defaults',
    });

    // Try to repair: write defaults back
    try {
      fs.writeFileSync(file, JSON.stringify(DEFAULT_FLAGS, null, 2));
      _logHeal('flags_repaired', { file, action: 'wrote defaults to file' });
    } catch (_) {
      // Can't even repair — just use in-memory defaults
    }

    return {
      flags: { ...DEFAULT_FLAGS },
      source: 'defaults_fallback',
      error: err.message,
    };
  }
}

// ── Routes Self-Healing ─────────────────────────────────────────

/**
 * Load routes.json with fallback to built-in defaults.
 * 
 * @param {string} [routesFile] - Routes file path
 * @returns {{ routes: object, source: string, error?: string }}
 */
function loadRoutesSafe(routesFile) {
  const file = routesFile || ROUTES_FILE;

  try {
    if (!fs.existsSync(file)) {
      _logHeal('routes_missing', { file, action: 'using built-in defaults' });
      return { routes: { ...DEFAULT_ROUTES }, source: 'defaults', reason: 'file not found' };
    }

    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('routes.json must be a plain object');
    }

    return { routes: parsed, source: 'file' };
  } catch (err) {
    _logHeal('routes_corrupted', {
      file,
      error: err.message,
      action: 'falling back to built-in defaults',
    });

    // Try to backup corrupted file and write defaults
    try {
      const backupPath = file + '.corrupted.' + Date.now();
      if (fs.existsSync(file)) {
        fs.copyFileSync(file, backupPath);
      }
      fs.writeFileSync(file, JSON.stringify(DEFAULT_ROUTES, null, 2));
      _logHeal('routes_repaired', { file, backup: backupPath, action: 'wrote defaults' });
    } catch (_) {}

    return {
      routes: { ...DEFAULT_ROUTES },
      source: 'defaults_fallback',
      error: err.message,
    };
  }
}

// ── Generic Safe JSON Load ──────────────────────────────────────

/**
 * Safely load and parse a JSON file with a fallback value.
 * 
 * @param {string} filePath - File to load
 * @param {*} fallback - Default value if load fails
 * @param {object} [options] - Options
 * @param {boolean} [options.repair=false] - Whether to write fallback back to file
 * @param {string} [options.context='unknown'] - Context for logging
 * @returns {{ data: *, source: string, error?: string }}
 */
function loadJsonSafe(filePath, fallback, options = {}) {
  const context = options.context || path.basename(filePath);

  try {
    if (!fs.existsSync(filePath)) {
      return { data: fallback, source: 'fallback', reason: 'file not found' };
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return { data: parsed, source: 'file' };
  } catch (err) {
    _logHeal('json_load_failed', {
      file: filePath,
      context,
      error: err.message,
      action: options.repair ? 'repairing with fallback' : 'using fallback',
    });

    if (options.repair && fallback !== undefined) {
      try {
        fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2));
      } catch (_) {}
    }

    return { data: fallback, source: 'fallback', error: err.message };
  }
}

// ── Heal Log ────────────────────────────────────────────────────

function _logHeal(type, data) {
  const entry = { ts: new Date().toISOString(), healType: type, ...data };

  // Write to heal log
  try {
    fs.mkdirSync(path.dirname(HEAL_LOG_FILE), { recursive: true });
    fs.appendFileSync(HEAL_LOG_FILE, JSON.stringify(entry) + '\n');
  } catch (_) {}

  // Write to DecisionLogger
  if (_decisionLogger && typeof _decisionLogger.log === 'function') {
    try {
      _decisionLogger.log({
        phase: 'resilience',
        component: 'ConfigSelfHealer',
        what: `${type}: ${data.file || data.context || 'unknown'}`,
        why: data.error || data.action || 'self-healing triggered',
        confidence: 1.0,
        decision_method: 'self_heal',
      });
    } catch (_) {}
  }
}

/**
 * Get heal log entries.
 * @param {number} [limit=50]
 * @returns {object[]}
 */
function getHealLog(limit = 50) {
  try {
    if (!fs.existsSync(HEAL_LOG_FILE)) return [];
    const content = fs.readFileSync(HEAL_LOG_FILE, 'utf8').trim();
    if (!content) return [];
    return content.split('\n').filter(Boolean).slice(-limit).map(l => {
      try { return JSON.parse(l); } catch (_) { return null; }
    }).filter(Boolean);
  } catch (_) {
    return [];
  }
}

// ── Exports ─────────────────────────────────────────────────────

module.exports = {
  loadRulesSafe,
  loadFlagsSafe,
  loadRoutesSafe,
  loadJsonSafe,
  getHealLog,

  // Defaults (for testing)
  DEFAULT_ROUTES,
  DEFAULT_FLAGS,
  RULES_DIR,
  FLAGS_FILE,
  ROUTES_FILE,
  HEAL_LOG_FILE,
};
