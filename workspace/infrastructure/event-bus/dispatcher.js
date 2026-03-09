const fs = require('fs');
const path = require('path');
const { evaluate: evaluateCondition } = require('./condition-evaluator');
const bus = require('./bus');

class Dispatcher {
  constructor(options = {}) {
    this.rulesDir = options.rulesDir || path.resolve(__dirname, '../../skills/isc-core/rules');
    this.maxDepth = options.maxDepth || 5;
    this.logger = options.logger || console;
    this.logFile = options.logFile || path.resolve(__dirname, '../logs/dispatcher-actions.jsonl');
    this.routesFile = options.routesFile || path.resolve(__dirname, '../dispatcher/routes.json');

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
      files = [];
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

    this._loadRouteRules();
  }

  _loadRouteRules() {
    try {
      if (!fs.existsSync(this.routesFile)) return;
      const raw = fs.readFileSync(this.routesFile, 'utf8');
      const data = JSON.parse(raw);
      const routeRules = Array.isArray(data?.routes)
        ? data.routes
        : Array.isArray(data)
          ? data
          : [];
      for (const rule of routeRules) {
        if (!rule || !rule.trigger) continue;
        if (!rule.id) rule.id = `route_${Date.now()}`;
        this.rules.push(rule);
        this._indexRule(rule);
      }
    } catch (e) {
      this.logger.warn?.(`[Dispatcher] Failed to load route rules: ${e.message}`) ||
        this.logger.log?.(`[Dispatcher] Failed to load route rules: ${e.message}`);
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
    if (typeof events === 'object') return Object.values(events).flat();
    return [String(events)];
  }

  async dispatch(eventType, payload = {}, _depth = 0) {
    // 类型保护：eventType可能是对象而非字符串（修复 startsWith is not a function）
    if (typeof eventType !== 'string') {
      eventType = (eventType && typeof eventType.type === 'string') ? eventType.type : String(eventType || '');
    }
    this.stats.dispatched++;

    if (_depth >= this.maxDepth) {
      this.logger.warn?.(`[Dispatcher] Max depth ${this.maxDepth} reached for ${eventType}`) ||
        this.logger.log?.(`[Dispatcher] Max depth ${this.maxDepth} reached for ${eventType}`);
      return;
    }

    const matched = this._matchRules(eventType);
    this.stats.matched += matched.length;

    if (matched.length === 0) {
      this._emitStandardEvent('dispatcher.route.failed', {
        originalEventType: eventType,
        routeEventType: eventType,
        matchedRules: 0,
        reason: 'no_matching_route',
        source: payload?.source || 'dispatcher',
        subsystem: payload?.subsystem || eventType.split('.')[0] || 'dispatcher',
        sandbox: payload?.sandbox !== false,
        severity: payload?.severity || 'warning',
        originalPayload: payload
      });
    }

    for (const rule of matched) {
      try {
        if (!this._evaluateConditions(rule, payload)) {
          this.stats.skipped++;
          this._log({ status: 'skipped', eventType, ruleId: rule.id, depth: _depth });
          continue;
        }

        const actions = this._extractActions(rule);
        for (const action of actions) {
          this._logAction({ eventType, ruleId: rule.id, action, payload, depth: _depth });
          await this._executeHandler(action, rule, { id: `evt_${Date.now()}`, type: eventType, payload, source: 'dispatcher' });
        }
        if (rule.action && rule.action.handler) {
          await this._executeHandler(rule.action, rule, { id: `evt_${Date.now()}`, type: eventType, payload, source: 'dispatcher' });
        }
        await this._executeHandler({ handler: 'log-action' }, rule, { id: `evt_${Date.now()}`, type: eventType, payload, source: 'dispatcher' });
        this.stats.executed++;
        this._log({ status: 'executed', eventType, ruleId: rule.id, depth: _depth });
      } catch (e) {
        this.stats.failed++;
        this._log({ status: 'failed', eventType, ruleId: rule.id, error: e.message, depth: _depth });
        this._emitStandardEvent('dispatcher.route.failed', {
          originalEventType: eventType,
          routeEventType: eventType,
          ruleId: rule.id,
          reason: 'dispatch_execution_failed',
          error: e.message,
          source: payload?.source || 'dispatcher',
          subsystem: payload?.subsystem || eventType.split('.')[0] || 'dispatcher',
          sandbox: payload?.sandbox !== false,
          severity: payload?.severity || 'error',
          originalPayload: payload
        });
      }
    }
  }

  _matchRules(eventType) {
    const results = new Set();
    const exact = this.eventIndex.get(eventType);
    if (exact) exact.forEach(r => results.add(r));
    const wildcard = this.eventIndex.get('*');
    if (wildcard) wildcard.forEach(r => results.add(r));
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
    const conditions = rule.conditions || (rule.trigger && rule.trigger.condition) || rule.condition;
    const result = evaluateCondition(conditions, payload);

    if (result.needs_llm) {
      this._log({
        status: 'needs_llm',
        ruleId: rule.id,
        reason: result.reason,
        conditions: typeof conditions === 'string' ? conditions : JSON.stringify(conditions).slice(0, 200),
      });
    }

    return result.pass;
  }

  _extractActions(rule) {
    const trigger = rule.trigger;
    if (!trigger) return [{ type: 'unknown' }];
    if (trigger.actions && Array.isArray(trigger.actions)) return trigger.actions;
    if (trigger.action) return [trigger.action];
    return [{ type: 'log_only' }];
  }

  _resolveHandlerPath(handlerName) {
    if (!handlerName) return null;

    const isPathLike = handlerName.includes('/') || handlerName.endsWith('.js');
    if (isPathLike) {
      const candidate = path.isAbsolute(handlerName)
        ? handlerName
        : path.resolve(process.cwd(), handlerName);
      if (fs.existsSync(candidate)) return candidate;
    }

    const shortName = handlerName.endsWith('.js') ? handlerName.slice(0, -3) : handlerName;
    const fallback = path.join(__dirname, 'handlers', `${shortName}.js`);
    if (fs.existsSync(fallback)) return fallback;

    // 下划线 → 连字符 兼容（规则里用auto_trigger，文件名是auto-trigger.js）
    const hyphenated = shortName.replace(/_/g, '-');
    if (hyphenated !== shortName) {
      const hyphenFallback = path.join(__dirname, 'handlers', `${hyphenated}.js`);
      if (fs.existsSync(hyphenFallback)) return hyphenFallback;
    }

    const dispatcherFallback = path.resolve(__dirname, '../dispatcher/handlers', `${shortName}.js`);
    if (fs.existsSync(dispatcherFallback)) return dispatcherFallback;

    return null;
  }

  // 显式 action.type → handler 映射表
  static get HANDLER_MAP() {
    return {
      'skill.classification.auto_detect': 'skill-classification-auto-detect',
      'skill.metadata.update_distribution': 'skill-metadata-update-distribution',
      'quality.code.no_direct_llm_check': 'quality-code-no-direct-llm-check',
      'isc.rule.triggered': 'isc-rule-triggered',
      'threshold.alert.notify': 'threshold-alert-notify',
    };
  }

  async _executeHandler(action, rule, event) {
    let handlerName = action.handler || action.type;
    if (!handlerName) return;

    // 查映射表：action type可直接映射到handler
    if (!action.handler && handlerName && Dispatcher.HANDLER_MAP[handlerName]) {
      handlerName = Dispatcher.HANDLER_MAP[handlerName];
    }

    const handlerPath = this._resolveHandlerPath(handlerName);
    try {
      if (!handlerPath) {
        const reason = `handler_not_found:${handlerName}`;
        this.logger.warn?.(`[Dispatcher] ⚠️ 未知action，无对应handler: ${handlerName}`) ||
          this.logger.log?.(`[Dispatcher] ⚠️ 未知action，无对应handler: ${handlerName}`);
        this._emitHandlerFailure(event, rule, action, new Error(reason));
        throw new Error(reason);
      }
      const handler = require(handlerPath);
      const result = await handler(event, rule, {});
      this.logger.debug?.(`[Dispatcher] Handler ${handlerName} executed: ${JSON.stringify(result)}`);
    } catch (e) {
      this._emitHandlerFailure(event, rule, action, e);
      this.logger.warn?.(`[Dispatcher] Handler ${handlerName} failed: ${e.message}`) ||
        this.logger.log?.(`[Dispatcher] Handler ${handlerName} failed: ${e.message}`);
      throw e;
    }
  }

  _emitHandlerFailure(event, rule, action, error) {
    const handlerName = action?.handler || action?.type || 'unknown';
    const payload = event?.payload || {};
    this._emitStandardEvent('dispatcher.handler.failed', {
      originalEventType: event?.type,
      routeEventType: event?.type,
      ruleId: rule?.id,
      handler: handlerName,
      entityType: 'dispatcher_handler',
      entityId: handlerName,
      message: error?.message || 'handler_failed',
      reason: error?.message || 'handler_failed',
      source: 'dispatcher',
      subsystem: payload?.subsystem || 'dispatcher',
      sandbox: payload?.sandbox !== false,
      severity: payload?.severity || 'error',
      originalPayload: payload
    });

    const queuePath = path.resolve(__dirname, '../dispatcher/manual-queue.jsonl');
    const queueEntry = {
      timestamp: new Date().toISOString(),
      eventType: event?.type,
      ruleId: rule?.id || null,
      handler: handlerName,
      reason: error?.message || 'handler_failed',
      payload,
      source: 'dispatcher.handler.failed'
    };
    try {
      fs.mkdirSync(path.dirname(queuePath), { recursive: true });
      fs.appendFileSync(queuePath, JSON.stringify(queueEntry) + '\n');
    } catch (_) {}

    this._emitStandardEvent('dispatcher.manual_queue.enqueued', {
      originalEventType: event?.type,
      routeEventType: event?.type,
      ruleId: rule?.id,
      handler: handlerName,
      queue: 'manual-queue',
      entityType: 'dispatcher_manual_queue',
      entityId: handlerName,
      message: 'manual queue enqueued after handler failure',
      reason: error?.message || 'handler_failed',
      source: 'dispatcher',
      subsystem: payload?.subsystem || 'dispatcher',
      sandbox: payload?.sandbox !== false,
      severity: payload?.severity || 'warning',
      originalPayload: payload
    });
  }

  _emitStandardEvent(eventType, payload) {
    try {
      bus.emit(eventType, {
        ...payload,
        source: payload?.source || 'dispatcher'
      });
    } catch (e) {
      this.logger.warn?.(`[Dispatcher] Standard event emit failed: ${eventType} ${e.message}`) ||
        this.logger.log?.(`[Dispatcher] Standard event emit failed: ${eventType} ${e.message}`);
    }
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
