/**
 * 本地任务编排 Event Consumer
 * 文件系统监视器 — 监听 .dto-signals/ 目录中的事件文件，
 * 自动解析并触发对应处理器（包括 SEEF Evaluator）。
 *
 * 解决的问题: 之前事件只写 JSON 文件，没有消费者进程监听。
 *
 * @version 1.0.0
 * @since 2026-03-01
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { WORKSPACE } = require('../../shared/paths');

// ── 常量 ───────────────────────────────────────────────
const SIGNALS_DIR   = path.join(WORKSPACE, '.dto-signals');
const ARCHIVE_DIR   = path.join(SIGNALS_DIR, '.archive');
const LOG_FILE      = path.join(WORKSPACE, 'skills/lto-core/logs/event-consumer.jsonl');
const POLL_INTERVAL = 2000;   // ms – 轮询间隔（fs.watch 的后备）
const DEBOUNCE_MS   = 300;    // ms – 去抖

// 订阅配置目录
const SUBSCRIPTIONS_DIR = path.join(WORKSPACE, 'skills/lto-core/subscriptions');

// SEEF evaluator 路径
const SEEF_EVALUATOR = path.join(WORKSPACE, 'skills/seef/sub-skills/evaluator/index.cjs');

// ── EventConsumer ──────────────────────────────────────
class EventConsumer extends EventEmitter {
  constructor(options = {}) {
    super();
    this.signalsDir   = options.signalsDir   || SIGNALS_DIR;
    this.archiveDir   = options.archiveDir   || ARCHIVE_DIR;
    this.logFile      = options.logFile      || LOG_FILE;
    this.pollInterval = options.pollInterval || POLL_INTERVAL;
    this.debounceMs   = options.debounceMs   || DEBOUNCE_MS;

    this._watcher        = null;
    this._pollTimer      = null;
    this._processing     = new Set();    // 正在处理的文件（去重）
    this._debounceTimers = new Map();    // filename → timer
    this._subscriptions  = new Map();    // eventType → [handler configs]
    this._running        = false;
    this._stats = {
      started:   null,
      processed: 0,
      failed:    0,
      skipped:   0,
    };
  }

  // ── 启动 ─────────────────────────────────────────────
  async start() {
    if (this._running) return;
    this._running = true;
    this._stats.started = new Date().toISOString();

    // 确保目录存在
    fs.mkdirSync(this.signalsDir, { recursive: true });
    fs.mkdirSync(this.archiveDir, { recursive: true });
    fs.mkdirSync(path.dirname(this.logFile), { recursive: true });

    // 加载订阅配置
    this._loadSubscriptions();

    this._log('info', 'EventConsumer started', {
      signalsDir: this.signalsDir,
      subscriptions: this._subscriptions.size,
    });

    // 先处理积压
    await this._processBacklog();

    // 启动 fs.watch（如果平台支持）+ 轮询兜底
    try {
      this._watcher = fs.watch(this.signalsDir, (eventType, filename) => {
        if (filename && filename.endsWith('.json') && !filename.startsWith('.')) {
          this._debouncedProcess(filename);
        }
      });
      this._watcher.on('error', (err) => {
        this._log('warn', 'fs.watch error, falling back to poll', { error: err.message });
        this._startPolling();
      });
    } catch {
      this._log('warn', 'fs.watch unavailable, using poll mode');
    }

    // 始终启动轮询作为兜底
    this._startPolling();

    return this;
  }

  // ── 停止 ─────────────────────────────────────────────
  stop() {
    this._running = false;

    if (this._watcher) {
      this._watcher.close();
      this._watcher = null;
    }

    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }

    for (const timer of this._debounceTimers.values()) {
      clearTimeout(timer);
    }
    this._debounceTimers.clear();

    this._log('info', 'EventConsumer stopped', this._stats);
    return this;
  }

  // ── 订阅配置加载 ─────────────────────────────────────
  _loadSubscriptions() {
    if (!fs.existsSync(SUBSCRIPTIONS_DIR)) return;

    const files = fs.readdirSync(SUBSCRIPTIONS_DIR).filter(f => f.endsWith('.json'));

    for (const file of files) {
      try {
        const cfg = JSON.parse(fs.readFileSync(path.join(SUBSCRIPTIONS_DIR, file), 'utf8'));
        if (cfg.enabled === false) continue;

        for (const evt of cfg.events || []) {
          if (!this._subscriptions.has(evt)) this._subscriptions.set(evt, []);
          this._subscriptions.get(evt).push({
            id:       cfg.id,
            name:     cfg.name,
            handler:  cfg.handler,
            filters:  cfg.filters || {},
            priority: cfg.priority || 'normal',
          });
        }
      } catch (e) {
        this._log('warn', `Failed to load subscription: ${file}`, { error: e.message });
      }
    }

    this._log('info', `Loaded ${this._subscriptions.size} event subscriptions`);
  }

  // ── 轮询 ─────────────────────────────────────────────
  _startPolling() {
    if (this._pollTimer) return;

    this._pollTimer = setInterval(async () => {
      if (!this._running) return;
      await this._processBacklog();
    }, this.pollInterval);

    // unref 允许进程在没有其它工作时退出
    if (this._pollTimer.unref) this._pollTimer.unref();
  }

  // ── 去抖 ─────────────────────────────────────────────
  _debouncedProcess(filename) {
    if (this._debounceTimers.has(filename)) {
      clearTimeout(this._debounceTimers.get(filename));
    }

    const timer = setTimeout(() => {
      this._debounceTimers.delete(filename);
      this._processFile(filename).catch(err => {
        this._log('error', `Process error: ${filename}`, { error: err.message });
      });
    }, this.debounceMs);

    this._debounceTimers.set(filename, timer);
  }

  // ── 积压处理 ─────────────────────────────────────────
  async _processBacklog() {
    let files;
    try {
      files = fs.readdirSync(this.signalsDir)
        .filter(f => f.endsWith('.json') && !f.startsWith('.'));
    } catch {
      return;
    }

    for (const file of files) {
      if (!this._running) break;
      await this._processFile(file);
    }
  }

  // ── 单文件处理 ───────────────────────────────────────
  async _processFile(filename) {
    if (this._processing.has(filename)) return;
    this._processing.add(filename);

    const filepath = path.join(this.signalsDir, filename);

    try {
      // 文件可能已经被处理过了（竞态）
      if (!fs.existsSync(filepath)) {
        this._processing.delete(filename);
        return;
      }

      const raw = fs.readFileSync(filepath, 'utf8');
      let events;

      try {
        const parsed = JSON.parse(raw);
        // 支持单个对象或数组
        events = Array.isArray(parsed) ? parsed : [parsed];
      } catch (e) {
        this._log('error', `Invalid JSON: ${filename}`, { error: e.message });
        this._archiveFile(filepath, filename, 'invalid');
        this._stats.failed++;
        this._processing.delete(filename);
        return;
      }

      // 从文件名推断事件类型（如 skill.registered.json → skill.registered）
      const inferredType = this._inferEventType(filename);

      let anyProcessed = false;

      for (const evt of events) {
        const eventType = evt.eventType || evt.type || inferredType;

        if (!eventType) {
          this._log('warn', `No event type for entry in ${filename}`, evt);
          this._stats.skipped++;
          continue;
        }

        // 标准化事件格式
        const normalizedEvent = {
          type:      eventType,
          payload:   evt,
          timestamp: evt.timestamp || new Date().toISOString(),
          source:    'dto-signal-file',
          file:      filename,
        };

        // 查找匹配的订阅
        const handlers = this._findHandlers(eventType, evt);

        if (handlers.length === 0) {
          // 没有匹配的处理器，但仍然归档
          this._log('info', `No handlers for event: ${eventType}`, { file: filename });
          anyProcessed = true;
          continue;
        }

        // 执行所有匹配的处理器
        for (const handler of handlers) {
          try {
            await this._invokeHandler(handler, normalizedEvent);
            anyProcessed = true;
            this._stats.processed++;
            this._log('info', `Processed event`, {
              eventType,
              handler: handler.id,
              file: filename,
            });
          } catch (err) {
            this._stats.failed++;
            this._log('error', `Handler failed: ${handler.id}`, {
              eventType,
              file: filename,
              error: err.message,
            });
          }
        }
      }

      // 归档
      this._archiveFile(filepath, filename, anyProcessed ? 'processed' : 'no-handler');

    } catch (err) {
      this._stats.failed++;
      this._log('error', `Unexpected error processing ${filename}`, { error: err.message, stack: err.stack });
    } finally {
      this._processing.delete(filename);
    }
  }

  // ── 事件类型推断 ─────────────────────────────────────
  _inferEventType(filename) {
    // skill.registered.json → skill.registered
    // cras.insight.high-failure.json → cras.insight.high-failure
    // task-completion-xxx.json → task-completion
    const base = filename.replace(/\.json$/, '');
    // 如果匹配 xxx-xxx-date 模式，截掉日期后缀
    const cleaned = base.replace(/-\d{4}-\d{2}-\d{2}$/, '');
    return cleaned;
  }

  // ── 查找处理器 ───────────────────────────────────────
  _findHandlers(eventType, payload) {
    const handlers = [];

    // 精确匹配
    const exact = this._subscriptions.get(eventType) || [];
    handlers.push(...exact);

    // 通配符匹配：skill.* 匹配 skill.registered
    for (const [pattern, subs] of this._subscriptions) {
      if (pattern.endsWith('.*')) {
        const prefix = pattern.slice(0, -2);
        if (eventType.startsWith(prefix + '.') && pattern !== eventType) {
          handlers.push(...subs);
        }
      }
    }

    // 映射 "registration" → "skill.registered" 等旧格式兼容
    const typeMap = {
      'registration': 'skill.registered',
      'update':       'skill.updated',
    };
    if (payload.eventType && typeMap[payload.eventType]) {
      const mapped = typeMap[payload.eventType];
      if (mapped !== eventType) {
        const extra = this._subscriptions.get(mapped) || [];
        handlers.push(...extra);
      }
    }

    // 应用过滤器
    return handlers.filter(h => this._passesFilters(payload, h.filters));
  }

  // ── 过滤器 ───────────────────────────────────────────
  _passesFilters(payload, filters) {
    if (!filters) return true;

    if (filters.excludeSkills) {
      const skillName = payload.skillName || payload.skillId || '';
      if (filters.excludeSkills.includes(skillName)) return false;
    }

    if (filters.minVersion && payload.version) {
      if (this._compareVersions(payload.version, filters.minVersion) < 0) return false;
    }

    return true;
  }

  _compareVersions(v1, v2) {
    const p1 = String(v1).split('.').map(Number);
    const p2 = String(v2).split('.').map(Number);
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
      const a = p1[i] || 0, b = p2[i] || 0;
      if (a > b) return 1;
      if (a < b) return -1;
    }
    return 0;
  }

  // ── 处理器调用 ───────────────────────────────────────
  async _invokeHandler(subscription, event) {
    const { handler } = subscription;

    if (handler.type === 'skill') {
      await this._invokeSkillHandler(handler, event);
    } else if (handler.type === 'script') {
      await this._invokeScriptHandler(handler, event);
    } else {
      this._log('warn', `Unknown handler type: ${handler.type}`, { subscription: subscription.id });
    }
  }

  /**
   * 调用技能处理器（核心：SEEF Evaluator 在这里被触发）
   */
  async _invokeSkillHandler(handler, event) {
    const { skill, subskill, input } = handler;

    // 解析模板变量
    const resolvedInput = this._resolveTemplate(input || {}, event);

    this._log('info', `Invoking skill handler: ${skill}/${subskill}`, { input: resolvedInput });

    // 直接调用 SEEF Evaluator（主路径）
    if (skill === 'seef' && subskill === 'evaluator') {
      return this._invokeSEEFEvaluator(resolvedInput);
    }

    // 通用技能调用
    const skillBasePath = path.join(WORKSPACE, 'skills', skill);

    // 尝试 sub-skills/<subskill>/index.cjs
    const subSkillCjs = path.join(skillBasePath, 'sub-skills', subskill, 'index.cjs');
    if (fs.existsSync(subSkillCjs)) {
      return this._runNode(subSkillCjs, resolvedInput);
    }

    // 尝试 subskills/<subskill>.py
    const subSkillPy = path.join(skillBasePath, 'subskills', `${subskill}.py`);
    if (fs.existsSync(subSkillPy)) {
      return this._runPython(subSkillPy, resolvedInput);
    }

    // 尝试 index.js
    const indexJs = path.join(skillBasePath, 'index.js');
    if (fs.existsSync(indexJs)) {
      try {
        const mod = require(indexJs);
        if (typeof mod[subskill] === 'function') {
          return await mod[subskill](resolvedInput);
        } else if (typeof mod.evaluate === 'function') {
          return await mod.evaluate(resolvedInput);
        }
      } catch (e) {
        throw new Error(`Skill ${skill} invoke failed: ${e.message}`);
      }
    }

    throw new Error(`Cannot locate handler for skill=${skill} subskill=${subskill}`);
  }

  /**
   * SEEF Evaluator 专用调用
   */
  async _invokeSEEFEvaluator(input) {
    this._log('info', '🎯 Triggering SEEF Evaluator', input);

    // 确保 skillPath 存在
    if (!input.skillPath && input.skillId) {
      input.skillPath = `skills/${input.skillId}`;
    }

    // 确保 skillName
    if (!input.skillName && input.skillId) {
      input.skillName = input.skillId;
    }

    // 通过 child_process 调用，避免 require 缓存问题
    if (fs.existsSync(SEEF_EVALUATOR)) {
      return this._runNode(SEEF_EVALUATOR, input);
    }

    // 降级：尝试 Python evaluator
    const pyEval = path.join(WORKSPACE, 'skills/seef/subskills/evaluator.py');
    if (fs.existsSync(pyEval)) {
      const skillFullPath = path.resolve(WORKSPACE, input.skillPath || '');
      return this._runPython(pyEval, skillFullPath);
    }

    throw new Error('SEEF Evaluator not found at any known location');
  }

  // ── 子进程执行 ───────────────────────────────────────
  _runNode(scriptPath, input) {
    return new Promise((resolve, reject) => {
      const { execFile } = require('child_process');
      const inputStr = JSON.stringify(input);

      execFile('node', [scriptPath, inputStr], {
        cwd: WORKSPACE,
        timeout: 30000,
        env: { ...process.env, DTO_EVENT_CONSUMER: '1' },
      }, (err, stdout, stderr) => {
        if (stderr) this._log('debug', `SEEF stderr: ${stderr.trim()}`);
        if (stdout) this._log('debug', `SEEF stdout: ${stdout.trim()}`);

        if (err) {
          reject(new Error(`Node script failed: ${err.message}`));
        } else {
          resolve(stdout);
        }
      });
    });
  }

  _runPython(scriptPath, input) {
    return new Promise((resolve, reject) => {
      const { execFile } = require('child_process');
      const args = typeof input === 'string' ? [scriptPath, input] : [scriptPath, JSON.stringify(input)];

      execFile('python3', args, {
        cwd: WORKSPACE,
        timeout: 30000,
      }, (err, stdout, stderr) => {
        if (stderr) this._log('debug', `Python stderr: ${stderr.trim()}`);
        if (stdout) this._log('debug', `Python stdout: ${stdout.trim()}`);

        if (err) {
          reject(new Error(`Python script failed: ${err.message}`));
        } else {
          resolve(stdout);
        }
      });
    });
  }

  // ── 脚本处理器 ───────────────────────────────────────
  async _invokeScriptHandler(handler, event) {
    const { command } = handler;
    const { execFile } = require('child_process');
    const util = require('util');
    const exec = util.promisify(execFile);

    const { stdout } = await exec('bash', ['-c', command], {
      cwd: WORKSPACE,
      timeout: 30000,
      env: {
        ...process.env,
        DTO_EVENT: JSON.stringify(event),
      },
    });

    return stdout;
  }

  // ── 模板解析 ─────────────────────────────────────────
  _resolveTemplate(template, event) {
    // 构建上下文：模板中 {{event.payload.x}} 可以正确解析
    const context = { event };
    const resolved = {};

    for (const [key, value] of Object.entries(template)) {
      if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
        const pathStr = value.slice(2, -2).trim();
        resolved[key] = this._getNestedValue(context, pathStr);
      } else {
        resolved[key] = value;
      }
    }

    return resolved;
  }

  _getNestedValue(obj, pathStr) {
    return pathStr.split('.').reduce((cur, key) => cur?.[key], obj);
  }

  // ── 归档 ─────────────────────────────────────────────
  _archiveFile(filepath, filename, status) {
    try {
      const ts  = new Date().toISOString().replace(/[:.]/g, '-');
      const dst = path.join(this.archiveDir, `${ts}_${status}_${filename}`);
      fs.renameSync(filepath, dst);
      this._log('info', `Archived: ${filename} → ${path.basename(dst)}`);
    } catch (err) {
      // 如果 rename 失败（跨设备等），尝试 copy + delete
      try {
        const ts  = new Date().toISOString().replace(/[:.]/g, '-');
        const dst = path.join(this.archiveDir, `${ts}_${status}_${filename}`);
        fs.copyFileSync(filepath, dst);
        fs.unlinkSync(filepath);
      } catch (e2) {
        this._log('error', `Archive failed: ${filename}`, { error: e2.message });
      }
    }
  }

  // ── 日志 ─────────────────────────────────────────────
  _log(level, message, data = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      component: 'EventConsumer',
      message,
      ...data,
    };

    // 控制台输出
    const prefix = { info: '📨', warn: '⚠️', error: '❌', debug: '🔍' }[level] || '•';
    console.log(`${prefix} [EventConsumer] ${message}`);

    // 持久化日志
    try {
      fs.appendFileSync(this.logFile, JSON.stringify(entry) + '\n');
    } catch { /* best-effort */ }

    // 发射事件供外部监听
    this.emit('log', entry);
  }

  // ── 状态查询 ─────────────────────────────────────────
  getStats() {
    return {
      ...this._stats,
      running:       this._running,
      subscriptions: this._subscriptions.size,
      pending:       this._processing.size,
    };
  }
}

// ── CLI 入口 ───────────────────────────────────────────
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0] || 'start';

  if (command === 'start') {
    const consumer = new EventConsumer();

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  本地任务编排 Event Consumer v1.0.0');
    console.log(`  Watching: ${SIGNALS_DIR}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    consumer.start().then(() => {
      console.log('✅ Consumer is running. Press Ctrl+C to stop.');
    });

    process.on('SIGINT',  () => { consumer.stop(); process.exit(0); });
    process.on('SIGTERM', () => { consumer.stop(); process.exit(0); });

  } else if (command === 'once') {
    // 单次处理模式（处理积压后退出）
    const consumer = new EventConsumer();
    fs.mkdirSync(consumer.signalsDir, { recursive: true });
    fs.mkdirSync(consumer.archiveDir, { recursive: true });
    fs.mkdirSync(path.dirname(consumer.logFile), { recursive: true });
    consumer._running = true;
    consumer._loadSubscriptions();
    consumer._processBacklog().then(() => {
      consumer._running = false;
      console.log('✅ Backlog processed:', consumer.getStats());
      process.exit(0);
    });

  } else if (command === 'status') {
    // 检查日志
    if (fs.existsSync(LOG_FILE)) {
      const lines = fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n').slice(-20);
      console.log('Last 20 log entries:');
      lines.forEach(l => console.log(l));
    } else {
      console.log('No log file found.');
    }

  } else {
    console.log('Usage: node event-consumer.js [start|once|status]');
    process.exit(1);
  }
}

module.exports = EventConsumer;
