'use strict';

/**
 * ISC Rule Matcher — 认知层核心规则匹配引擎
 * 
 * 事件进来 → 匹配触发规则 → 评估条件 → 输出决策
 * 
 * 四级匹配优先级：
 *   1. 精确匹配   skill.created === skill.created
 *   2. 前缀通配   skill.* matches skill.created
 *   3. 后缀通配   *.created matches skill.created
 *   4. 全通配     * matches anything
 * 
 * @module isc-rule-matcher
 */

const fs = require('fs');
const path = require('path');

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_RULES_DIR = path.resolve(__dirname, '../../skills/isc-core/rules');
const MATCH_TYPES = { EXACT: 'exact', PREFIX: 'prefix', SUFFIX: 'suffix', WILDCARD: 'wildcard' };
const MATCH_PRIORITY = { [MATCH_TYPES.EXACT]: 4, [MATCH_TYPES.PREFIX]: 3, [MATCH_TYPES.SUFFIX]: 2, [MATCH_TYPES.WILDCARD]: 1 };
const MAX_DECISION_LOG = 500;

// ── Severity → numeric priority mapping ──────────────────────────────────────

const SEVERITY_MAP = {
  critical: 100, high: 80, medium: 60, low: 40, info: 20,
  p0: 100, p1: 80, p2: 60, p3: 40, p4: 20,
};

/**
 * Normalize heterogeneous priority/severity into a numeric score.
 * Handles: numeric string "10", severity string "high", governance.priority "HIGH", etc.
 */
function normalizePriority(rule) {
  // Explicit numeric priority (some rules use numbers like 10, 20)
  const govPri = rule.governance && rule.governance.priority;
  const rawPri = rule.priority || govPri;
  if (rawPri !== undefined && rawPri !== '') {
    const num = Number(rawPri);
    if (!isNaN(num)) return num;
    const mapped = SEVERITY_MAP[String(rawPri).toLowerCase()];
    if (mapped !== undefined) return mapped;
  }
  // Fall back to severity field
  if (rule.severity) {
    const mapped = SEVERITY_MAP[String(rule.severity).toLowerCase()];
    if (mapped !== undefined) return mapped;
  }
  return 50; // default middle priority
}

// ── Pattern helpers ──────────────────────────────────────────────────────────

/**
 * Classify an event pattern string.
 * @param {string} pattern
 * @returns {{ type: string, base: string }}
 */
function classifyPattern(pattern) {
  if (pattern === '*') return { type: MATCH_TYPES.WILDCARD, base: '*' };
  if (pattern.endsWith('.*')) return { type: MATCH_TYPES.PREFIX, base: pattern.slice(0, -2) };
  if (pattern.startsWith('*.')) return { type: MATCH_TYPES.SUFFIX, base: pattern.slice(2) };
  // Also support patterns like "skill*" (no dot) — treat as prefix
  if (pattern.endsWith('*') && !pattern.startsWith('*')) return { type: MATCH_TYPES.PREFIX, base: pattern.slice(0, -1) };
  if (pattern.startsWith('*') && !pattern.endsWith('*')) return { type: MATCH_TYPES.SUFFIX, base: pattern.slice(1) };
  return { type: MATCH_TYPES.EXACT, base: pattern };
}

/**
 * Check if an event type matches a pattern.
 * @param {string} eventType
 * @param {string} pattern
 * @returns {string|null} match type or null
 */
function matchPattern(eventType, pattern) {
  const { type, base } = classifyPattern(pattern);
  switch (type) {
    case MATCH_TYPES.EXACT:
      return eventType === base ? MATCH_TYPES.EXACT : null;
    case MATCH_TYPES.PREFIX:
      return eventType.startsWith(base) ? MATCH_TYPES.PREFIX : null;
    case MATCH_TYPES.SUFFIX:
      return eventType.endsWith(base) ? MATCH_TYPES.SUFFIX : null;
    case MATCH_TYPES.WILDCARD:
      return MATCH_TYPES.WILDCARD;
    default:
      return null;
  }
}

// ── Condition evaluator ──────────────────────────────────────────────────────

/**
 * Simple condition evaluator for rule.trigger.condition strings.
 * Supports:
 *   - Simple truthiness: "evaluation_request_received" → check payload[key]
 *   - Comparison: "issue_frequency >= 3", "severity == 'high'"
 *   - Boolean operators: AND, OR (single level, no nesting)
 *   - Negation: NOT prefix
 * 
 * This is intentionally simple — complex conditions should use action.checks arrays.
 */
function evaluateCondition(conditionStr, event) {
  if (!conditionStr || typeof conditionStr !== 'string') {
    return { shouldFire: true, reason: 'no condition defined' };
  }

  const trimmed = conditionStr.trim();
  if (!trimmed) return { shouldFire: true, reason: 'empty condition' };

  const payload = event.payload || {};
  const context = { ...payload, event_type: event.type, event_source: event.source, event_layer: event.layer };

  try {
    // Split by OR first, then AND within each OR branch
    const orBranches = trimmed.split(/\s+OR\s+/);
    
    for (const branch of orBranches) {
      const andClauses = branch.split(/\s+AND\s+/);
      let branchResult = true;
      const reasons = [];

      for (const clause of andClauses) {
        const result = evaluateSingleClause(clause.trim(), context);
        if (!result.pass) {
          branchResult = false;
          reasons.push(result.reason);
          break; // short-circuit AND
        }
        reasons.push(result.reason);
      }

      if (branchResult) {
        return { shouldFire: true, reason: `condition met: ${reasons.join('; ')}` };
      }
    }

    return { shouldFire: false, reason: `condition not met: ${trimmed}` };
  } catch (err) {
    // Condition parse failure → conservative: let rule fire but log warning
    return { shouldFire: true, reason: `condition parse warning: ${err.message} (defaulting to fire)` };
  }
}

function evaluateSingleClause(clause, ctx) {
  // Handle NOT prefix
  if (clause.startsWith('NOT ')) {
    const inner = evaluateSingleClause(clause.slice(4).trim(), ctx);
    return { pass: !inner.pass, reason: `NOT(${inner.reason})` };
  }

  // Comparison operators: >=, <=, >, <, ==, !=
  const compMatch = clause.match(/^([a-zA-Z_][a-zA-Z0-9_.]*)\s*(>=|<=|>|<|==|!=)\s*(.+)$/);
  if (compMatch) {
    const [, key, op, rawVal] = compMatch;
    const actual = resolveValue(key, ctx);
    const expected = parseValue(rawVal.trim());
    const result = compare(actual, op, expected);
    return { pass: result, reason: `${key}(${actual}) ${op} ${expected}: ${result}` };
  }

  // Method-like: key.length > 0
  const methodMatch = clause.match(/^([a-zA-Z_][a-zA-Z0-9_.]*\.length)\s*(>=|<=|>|<|==|!=)\s*(.+)$/);
  if (methodMatch) {
    const [, keyPath, op, rawVal] = methodMatch;
    const actual = resolveValue(keyPath, ctx);
    const expected = parseValue(rawVal.trim());
    const result = compare(actual, op, expected);
    return { pass: result, reason: `${keyPath}(${actual}) ${op} ${expected}: ${result}` };
  }

  // Boolean check: "key_exists" or "some_flag"
  const val = resolveValue(clause, ctx);
  const pass = !!val;
  return { pass, reason: `${clause}: ${pass ? 'truthy' : 'falsy'}` };
}

function resolveValue(keyPath, ctx) {
  const parts = keyPath.split('.');
  let cur = ctx;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function parseValue(raw) {
  // String literal: 'high' or "high"
  if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
    return raw.slice(1, -1);
  }
  // Boolean
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  // Number
  const num = Number(raw);
  if (!isNaN(num)) return num;
  return raw;
}

function compare(actual, op, expected) {
  switch (op) {
    case '==': return actual == expected; // intentional loose equality for type coercion
    case '!=': return actual != expected;
    case '>=': return Number(actual) >= Number(expected);
    case '<=': return Number(actual) <= Number(expected);
    case '>':  return Number(actual) > Number(expected);
    case '<':  return Number(actual) < Number(expected);
    default:   return false;
  }
}

// ── ISCRuleMatcher Class ─────────────────────────────────────────────────────

class ISCRuleMatcher {
  /**
   * @param {object} [options]
   * @param {string} [options.rulesDir] - Path to rules directory
   * @param {boolean} [options.hotReload=true] - Enable hot reload on directory change
   * @param {number} [options.hotReloadIntervalMs=5000] - Hot reload check interval
   * @param {number} [options.maxDecisionLog=500] - Max decision log entries
   */
  constructor(options = {}) {
    this.rulesDir = options.rulesDir || DEFAULT_RULES_DIR;
    this.hotReload = options.hotReload !== false;
    this.hotReloadIntervalMs = options.hotReloadIntervalMs || 5000;
    this.maxDecisionLog = options.maxDecisionLog || MAX_DECISION_LOG;

    // State
    this.rules = [];                    // All loaded rules
    this.exactIndex = new Map();        // eventType → [{ rule, priority }]
    this.prefixPatterns = [];           // [{ base, rule, priority }]
    this.suffixPatterns = [];           // [{ base, rule, priority }]
    this.wildcardRules = [];            // [{ rule, priority }]
    this.decisionLog = [];              // Recent match decisions
    this._lastMtime = 0;               // Last known mtime of rules dir
    this._reloadTimer = null;           // Hot reload interval handle
    this._loaded = false;
  }

  // ── Load & Index ─────────────────────────────────────────────────────────

  /**
   * Load all ISC rules from the rules directory and build indices.
   * @returns {{ total: number, indexed: number, errors: string[] }}
   */
  loadRules() {
    const errors = [];
    const files = this._listRuleFiles();
    const rules = [];

    for (const file of files) {
      try {
        const raw = fs.readFileSync(file, 'utf8');
        const rule = JSON.parse(raw);
        rule._filePath = file;
        rule._fileName = path.basename(file);
        rules.push(rule);
      } catch (err) {
        errors.push(`${path.basename(file)}: ${err.message}`);
      }
    }

    this.rules = rules;
    this._buildIndex();
    this._updateMtime();
    this._loaded = true;

    // Start hot reload timer if enabled
    if (this.hotReload && !this._reloadTimer) {
      this._startHotReload();
    }

    const indexed = this.exactIndex.size + this.prefixPatterns.length +
                    this.suffixPatterns.length + this.wildcardRules.length;

    return { total: rules.length, indexed, errors };
  }

  /**
   * Rebuild all indices from loaded rules.
   */
  _buildIndex() {
    this.exactIndex = new Map();
    this.prefixPatterns = [];
    this.suffixPatterns = [];
    this.wildcardRules = [];

    for (const rule of this.rules) {
      const trigger = rule.trigger || {};
      const events = trigger.events || [];
      const priority = normalizePriority(rule);

      if (events.length === 0) {
        // Rules with no events — skip indexing (they're condition-only or manual)
        continue;
      }

      for (const pattern of events) {
        const { type } = classifyPattern(pattern);
        const entry = { rule, priority, pattern };

        switch (type) {
          case MATCH_TYPES.EXACT:
            if (!this.exactIndex.has(pattern)) this.exactIndex.set(pattern, []);
            this.exactIndex.get(pattern).push(entry);
            break;
          case MATCH_TYPES.PREFIX:
            this.prefixPatterns.push({ ...entry, base: classifyPattern(pattern).base });
            break;
          case MATCH_TYPES.SUFFIX:
            this.suffixPatterns.push({ ...entry, base: classifyPattern(pattern).base });
            break;
          case MATCH_TYPES.WILDCARD:
            this.wildcardRules.push(entry);
            break;
        }
      }
    }

    // Sort prefix/suffix by base length descending (more specific first)
    this.prefixPatterns.sort((a, b) => b.base.length - a.base.length);
    this.suffixPatterns.sort((a, b) => b.base.length - a.base.length);
  }

  _listRuleFiles() {
    try {
      return fs.readdirSync(this.rulesDir)
        .filter(f => f.endsWith('.json'))
        .map(f => path.join(this.rulesDir, f));
    } catch (err) {
      return [];
    }
  }

  _updateMtime() {
    try {
      const stat = fs.statSync(this.rulesDir);
      this._lastMtime = stat.mtimeMs;
    } catch {
      this._lastMtime = 0;
    }
  }

  // ── Match ────────────────────────────────────────────────────────────────

  /**
   * Match an event against all loaded rules.
   * 
   * @param {object} event - { type, payload, timestamp, source, layer }
   * @returns {Array<{ rule: object, priority: number, match_type: string, pattern: string }>}
   */
  match(event) {
    if (!this._loaded) this.loadRules();

    const eventType = event && event.type;
    if (!eventType) return [];

    const candidates = [];
    const seen = new Set(); // deduplicate by rule id

    // 1. Exact match (highest priority)
    const exactHits = this.exactIndex.get(eventType);
    if (exactHits) {
      for (const entry of exactHits) {
        const ruleId = entry.rule.id || entry.rule.name || entry.rule._fileName;
        if (!seen.has(ruleId)) {
          seen.add(ruleId);
          candidates.push({
            rule: entry.rule,
            priority: entry.priority,
            match_type: MATCH_TYPES.EXACT,
            pattern: entry.pattern,
          });
        }
      }
    }

    // 2. Prefix match
    for (const entry of this.prefixPatterns) {
      const ruleId = entry.rule.id || entry.rule.name || entry.rule._fileName;
      if (!seen.has(ruleId) && eventType.startsWith(entry.base)) {
        seen.add(ruleId);
        candidates.push({
          rule: entry.rule,
          priority: entry.priority,
          match_type: MATCH_TYPES.PREFIX,
          pattern: entry.pattern,
        });
      }
    }

    // 3. Suffix match
    for (const entry of this.suffixPatterns) {
      const ruleId = entry.rule.id || entry.rule.name || entry.rule._fileName;
      if (!seen.has(ruleId) && eventType.endsWith(entry.base)) {
        seen.add(ruleId);
        candidates.push({
          rule: entry.rule,
          priority: entry.priority,
          match_type: MATCH_TYPES.SUFFIX,
          pattern: entry.pattern,
        });
      }
    }

    // 4. Wildcard match
    for (const entry of this.wildcardRules) {
      const ruleId = entry.rule.id || entry.rule.name || entry.rule._fileName;
      if (!seen.has(ruleId)) {
        seen.add(ruleId);
        candidates.push({
          rule: entry.rule,
          priority: entry.priority,
          match_type: MATCH_TYPES.WILDCARD,
          pattern: entry.pattern,
        });
      }
    }

    // Sort: match type priority DESC, then rule priority DESC
    candidates.sort((a, b) => {
      const matchDiff = MATCH_PRIORITY[b.match_type] - MATCH_PRIORITY[a.match_type];
      if (matchDiff !== 0) return matchDiff;
      return b.priority - a.priority;
    });

    // Decision log
    this._logDecision({
      timestamp: Date.now(),
      event_type: eventType,
      event_source: event.source || 'unknown',
      candidates_count: candidates.length,
      matched_rules: candidates.map(c => ({
        id: c.rule.id || c.rule.name,
        match_type: c.match_type,
        priority: c.priority,
        pattern: c.pattern,
      })),
    });

    return candidates;
  }

  // ── Evaluate ─────────────────────────────────────────────────────────────

  /**
   * Evaluate whether a matched rule should fire given the event context.
   * 
   * @param {object} rule - The ISC rule object
   * @param {object} event - The event object
   * @returns {{ shouldFire: boolean, reason: string }}
   */
  evaluate(rule, event) {
    const trigger = rule.trigger || {};

    // Check trigger.condition (string-based condition)
    const conditionStr = trigger.condition;
    if (conditionStr) {
      const result = evaluateCondition(conditionStr, event);
      this._logDecision({
        timestamp: Date.now(),
        type: 'evaluation',
        rule_id: rule.id || rule.name,
        event_type: event.type,
        condition: conditionStr,
        result: result,
      });
      return result;
    }

    // No condition → always fire
    return { shouldFire: true, reason: 'no trigger condition (unconditional)' };
  }

  /**
   * Full pipeline: match + evaluate. Returns only rules that should fire.
   * 
   * @param {object} event
   * @returns {Array<{ rule: object, priority: number, match_type: string, evaluation: object }>}
   */
  process(event) {
    const matches = this.match(event);
    const results = [];

    for (const m of matches) {
      const evaluation = this.evaluate(m.rule, event);
      if (evaluation.shouldFire) {
        results.push({
          rule: m.rule,
          priority: m.priority,
          match_type: m.match_type,
          pattern: m.pattern,
          evaluation,
        });
      } else {
        // Log exclusion
        this._logDecision({
          timestamp: Date.now(),
          type: 'exclusion',
          rule_id: m.rule.id || m.rule.name,
          event_type: event.type,
          reason: evaluation.reason,
        });
      }
    }

    return results;
  }

  // ── Decision Log ─────────────────────────────────────────────────────────

  _logDecision(entry) {
    this.decisionLog.push(entry);
    if (this.decisionLog.length > this.maxDecisionLog) {
      this.decisionLog = this.decisionLog.slice(-Math.floor(this.maxDecisionLog * 0.8));
    }
  }

  /**
   * Get recent decision log entries.
   * @param {number} [limit=50]
   * @returns {Array}
   */
  getDecisionLog(limit = 50) {
    return this.decisionLog.slice(-limit);
  }

  /**
   * Clear the decision log.
   */
  clearDecisionLog() {
    this.decisionLog = [];
  }

  // ── Hot Reload ───────────────────────────────────────────────────────────

  _startHotReload() {
    this._reloadTimer = setInterval(() => {
      this._checkAndReload();
    }, this.hotReloadIntervalMs);
    // Don't block process exit
    if (this._reloadTimer.unref) this._reloadTimer.unref();
  }

  _checkAndReload() {
    try {
      const stat = fs.statSync(this.rulesDir);
      if (stat.mtimeMs !== this._lastMtime) {
        const result = this.loadRules();
        this._logDecision({
          timestamp: Date.now(),
          type: 'hot_reload',
          total: result.total,
          indexed: result.indexed,
          errors: result.errors,
        });
      }
    } catch {
      // Directory gone? Ignore, will retry next tick
    }
  }

  /**
   * Force reload rules.
   * @returns {{ total: number, indexed: number, errors: string[] }}
   */
  reload() {
    return this.loadRules();
  }

  /**
   * Stop hot reload timer and clean up.
   */
  destroy() {
    if (this._reloadTimer) {
      clearInterval(this._reloadTimer);
      this._reloadTimer = null;
    }
  }

  // ── Introspection ────────────────────────────────────────────────────────

  /**
   * Get engine stats.
   */
  stats() {
    return {
      totalRules: this.rules.length,
      exactPatterns: this.exactIndex.size,
      prefixPatterns: this.prefixPatterns.length,
      suffixPatterns: this.suffixPatterns.length,
      wildcardRules: this.wildcardRules.length,
      rulesWithNoEvents: this.rules.filter(r => !(r.trigger && r.trigger.events && r.trigger.events.length)).length,
      decisionLogSize: this.decisionLog.length,
      hotReload: this.hotReload,
      rulesDir: this.rulesDir,
    };
  }

  /**
   * List all registered event types that have exact rules.
   * @returns {string[]}
   */
  listEventTypes() {
    return Array.from(this.exactIndex.keys()).sort();
  }

  /**
   * Find which rules would trigger for a given event type (without evaluation).
   * Useful for debugging.
   * @param {string} eventType
   * @returns {Array}
   */
  explain(eventType) {
    return this.match({ type: eventType, payload: {}, timestamp: Date.now() });
  }
}

// ── Singleton convenience ────────────────────────────────────────────────────

let _defaultInstance = null;

/**
 * Get or create the default ISCRuleMatcher instance.
 * @param {object} [options]
 * @returns {ISCRuleMatcher}
 */
function getDefaultMatcher(options) {
  if (!_defaultInstance) {
    _defaultInstance = new ISCRuleMatcher(options);
    _defaultInstance.loadRules();
  }
  return _defaultInstance;
}

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  ISCRuleMatcher,
  getDefaultMatcher,
  // Expose internals for testing
  _internals: {
    classifyPattern,
    matchPattern,
    evaluateCondition,
    normalizePriority,
    MATCH_TYPES,
    MATCH_PRIORITY,
  },
};
