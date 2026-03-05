/**
 * Event Dispatcher — Phase 0 核心基建
 * 事件→规则匹配→条件评估→Action记录
 */

const fs = require('fs');
const path = require('path');

class Dispatcher {
  constructor(options = {}) {
    this.rulesDir = options.rulesDir || path.resolve(__dirname, '../../skills/isc-core/rules');
    this.maxDepth = options.maxDepth || 5;
    this.logger = options.logger || console;
    this.logFile = options.logFile || path.resolve(__dirname, '../logs/dispatcher-actions.jsonl');

    this.rules = [];
    this.eventIndex = new Map(); // eventPattern → [rule, ...]
    this.stats = { dispatched: 0, matched: 0, executed: 0, skipped: 0, failed: 0 };
  }

  async init() {
    this.rules = [];
    this.eventIndex = new Map();

    let files;
    try {
      files = fs.readdirSync(this.rulesDir).filter(f => f.endsWith('.json'));
    } catch (e) {
      this.logger.warn?.(`[Dispatcher] Cannot read rules dir: ${e.message}`) || 
        this.logger.log?.(`[Dispatcher] Cannot read rules dir: ${e.message}`);
      return;
    }

    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(this.rulesDir, file), 'utf-8');
        const rule = JSON.parse(raw);
        if (!rule.id) rule.id = path.basename(file, '.json');
        this.rules.push(rule);
        this._indexRule(rule);
      } catch (e) {
        this.logger.warn?.(`[Dispatcher] Failed to load ${file}: ${e.message}`) ||
          this.logger.log?.(`[Dispatcher] Failed to load ${file}: ${e.message}`);
      }
    }
  }

  _indexRule(rule) {
    const events = this._extractEvents(rule);
    for (const evt of events) {
      if (!this.eventIndex.has(evt)) this.eventIndex.set(evt, []);
      this.eventIndex.get(evt).push(rule);
    }
  }

  _extractEvents(rule) {
    const trigger = rule.trigger;
    if (!trigger) return [];
    let events = trigger.events;
    if (!events) return [];
    if (Array.isArray(events)) return events;
    // object format: flatten values
    if (typeof events === 'object') return Object.values(events).flat();
    return [String(events)];
  }

  async dispatch(eventType, payload = {}, _depth = 0) {
    this.stats.dispatched++;

    if (_depth >= this.maxDepth) {
      this.logger.warn?.(`[Dispatcher] Max depth ${this.maxDepth} reached for ${eventType}`) ||
        this.logger.log?.(`[Dispatcher] Max depth ${this.maxDepth} reached for ${eventType}`);
      return;
    }

    const matched = this._matchRules(eventType);
    this.stats.matched += matched.length;

    for (const rule of matched) {
      try {
        if (!this._evaluateConditions(rule, payload)) {
          this.stats.skipped++;
          this._log({ status: 'skipped', eventType, ruleId: rule.id, depth: _depth });
          continue;
        }

        // Execute action (Phase 0: log only)
        const actions = this._extractActions(rule);
        for (const action of actions) {
          this._logAction({ eventType, ruleId: rule.id, action, payload, depth: _depth });
        }
        this.stats.executed++;
        this._log({ status: 'executed', eventType, ruleId: rule.id, depth: _depth });
      } catch (e) {
        this.stats.failed++;
        this._log({ status: 'failed', eventType, ruleId: rule.id, error: e.message, depth: _depth });
      }
    }
  }

  _matchRules(eventType) {
    const results = new Set();

    // Exact match
    const exact = this.eventIndex.get(eventType);
    if (exact) exact.forEach(r => results.add(r));

    // Wildcard *
    const wildcard = this.eventIndex.get('*');
    if (wildcard) wildcard.forEach(r => results.add(r));

    // Domain wildcard: skill.* matches skill.created, skill.updated, etc.
    for (const [pattern, rules] of this.eventIndex) {
      if (pattern.endsWith('.*')) {
        const domain = pattern.slice(0, -2);
        if (eventType.startsWith(domain + '.') || eventType === domain) {
          rules.forEach(r => results.add(r));
        }
      }
    }

    return [...results];
  }

  _evaluateConditions(rule, payload) {
    const conditions = rule.conditions;
    if (!conditions || typeof conditions !== 'object') return true;
    if (Array.isArray(conditions)) return true; // skip array conditions for now

    for (const [field, expected] of Object.entries(conditions)) {
      if (payload[field] !== expected) return false;
    }
    return true;
  }

  _extractActions(rule) {
    const trigger = rule.trigger;
    if (!trigger) return [{ type: 'unknown' }];
    if (trigger.actions && Array.isArray(trigger.actions)) return trigger.actions;
    if (trigger.action) return [trigger.action];
    return [{ type: 'log_only' }];
  }

  _logAction(entry) {
    const record = { timestamp: new Date().toISOString(), ...entry };
    try {
      const dir = path.dirname(this.logFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(this.logFile, JSON.stringify(record) + '\n');
    } catch (e) {
      this.logger.error?.(`[Dispatcher] Log write failed: ${e.message}`);
    }
  }

  _log(entry) {
    this.logger.debug?.(`[Dispatcher] ${JSON.stringify(entry)}`);
  }

  getStats() { return { ...this.stats }; }
  getRuleCount() { return this.rules.length; }
  getEventIndex() {
    const result = {};
    for (const [k, v] of this.eventIndex) {
      result[k] = v.map(r => r.id);
    }
    return result;
  }
}

module.exports = { Dispatcher };
