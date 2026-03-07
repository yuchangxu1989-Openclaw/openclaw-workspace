/**
 * report-trigger.js — Bridge between DispatchEngine and Reporting
 *
 * Requirement #6: 调度更新本身就是汇报触发器。
 * Requirement #GP: 每 N 次汇报自动插入阶段性全局进展总结。
 * Enqueue / status change / completion → auto triggers renderReport().
 *
 * Usage:
 *   const { DispatchEngine } = require('../multi-agent-dispatch/dispatch-engine');
 *   const { ReportTrigger } = require('./report-trigger');
 *
 *   const engine = new DispatchEngine({ maxSlots: 19 });
 *   const trigger = new ReportTrigger(engine, {
 *     agentRegistry: { writer: '创作大师', coder: '开发工程师', ... },
 *     globalProgressInterval: 3,  // insert summary every 3 reports
 *     onReport: ({ text, card, title, stats, event, globalProgress }) => { ... }
 *   });
 *
 * Zero dependencies beyond the two sibling skills.
 */

'use strict';

const { renderReport } = require('./index.js');
const {
  computeGlobalProgress,
  renderProgressText,
  renderProgressCardElements,
  DEFAULTS: GP_DEFAULTS,
} = require('./global-progress.js');

// ── Default agent display name registry ─────────────────────────────────────
// Sourced from workspace SOUL.md files. Override via opts.agentRegistry.

const DEFAULT_AGENT_REGISTRY = {
  main:       '战略家',
  analyst:    '洞察分析师',
  coder:      '开发工程师',
  writer:     '创作大师',
  researcher: '系统架构师',
  reviewer:   '质量仲裁官',
  scout:      '情报专家',
  engineer:   '开发工程师',
  auditor:    '审计官',
  strategist: '战略家',
};

// ── Convert dispatch task → reporting task ───────────────────────────────────

const STATUS_MAP = {
  queued:    'queued',
  spawning:  'running',    // spawning ≈ running for reporting purposes
  running:   'running',
  done:      'completed',
  failed:    'failed',
  cancelled: 'completed',  // treat cancelled as completed (it's done)
};

function toReportingTask(dispatchTask, registry) {
  const agentId = dispatchTask.agentId || 'unknown';
  const displayName = registry[agentId] || dispatchTask.displayName || agentId;

  return {
    agentId,
    displayName,
    model:    dispatchTask.model || '—',
    task:     dispatchTask.title || dispatchTask.task || '(untitled)',
    status:   STATUS_MAP[dispatchTask.status] || dispatchTask.status || 'queued',
    duration: dispatchTask.duration || null,
    blocker:  dispatchTask.error || null,
    error:    dispatchTask.error || null,
  };
}

// ── ReportTrigger class ─────────────────────────────────────────────────────

class ReportTrigger {
  /**
   * @param {DispatchEngine} engine  — dispatch engine instance
   * @param {object} opts
   * @param {object}   opts.agentRegistry        — { agentId: displayName }
   * @param {Function} opts.onReport             — callback({ text, card, title, stats, event, globalProgress })
   * @param {object}   opts.renderOpts           — extra opts for renderReport()
   * @param {boolean}  opts.includeRecent        — include recent finished in report (default: true)
   * @param {number}   opts.recentMax            — max recent finished tasks (default: 10)
   * @param {number}   opts.globalProgressInterval — insert global progress every N reports (default: 3, 0 = off)
   */
  constructor(engine, opts = {}) {
    this.engine = engine;
    this.registry = { ...DEFAULT_AGENT_REGISTRY, ...(opts.agentRegistry || {}) };
    this.onReport = opts.onReport || null;
    this.renderOpts = opts.renderOpts || {};
    this.includeRecent = opts.includeRecent !== false;
    this.recentMax = opts.recentMax || 10;
    this._lastReport = null;

    // Global progress tracking
    this.globalProgressInterval = opts.globalProgressInterval ?? GP_DEFAULTS.interval;
    this._reportCount = 0;
    this._lastGlobalProgress = null;

    // Hook into all dispatch engine events
    this._bind();
  }

  _bind() {
    const e = this.engine;
    // dispatched = task enqueued + assigned to slot
    e.on('dispatched', (tasks) => this._trigger('dispatched', { dispatched: tasks }));
    // running = spawn confirmed
    e.on('running', (task) => this._trigger('running', { task }));
    // finished = done/failed/cancelled (slot freed, backfill may happen)
    e.on('finished', (task) => this._trigger('finished', { task }));
  }

  /**
   * Build current report from engine state.
   * Can be called directly (manual refresh) or auto-triggered by events.
   * Periodically includes a global progress summary section.
   */
  buildReport(event) {
    const state = this.engine._load();
    const tasks = [];

    // Active: spawning + running
    for (const t of Object.values(state.spawning)) {
      tasks.push(toReportingTask(t, this.registry));
    }
    for (const t of Object.values(state.running)) {
      tasks.push(toReportingTask(t, this.registry));
    }

    // Recent finished (for the "新完成" / "风险" sections)
    if (this.includeRecent && state.finished.length > 0) {
      const recent = state.finished.slice(0, this.recentMax);
      for (const t of recent) {
        tasks.push(toReportingTask(t, this.registry));
      }
    }

    const result = renderReport(tasks, this.renderOpts);
    result.event = event || 'manual';

    // ── Global Progress Injection ────────────────────────────────────────
    this._reportCount++;
    result.reportCount = this._reportCount;
    result.globalProgress = null;

    const interval = this.globalProgressInterval;
    if (interval > 0 && this._reportCount % interval === 0) {
      try {
        const progressData = computeGlobalProgress(this.engine);
        const progressText = renderProgressText(progressData);
        const progressCardElements = renderProgressCardElements(progressData);

        result.globalProgress = {
          data: progressData,
          text: progressText,
          cardElements: progressCardElements,
          reportCount: this._reportCount,
          interval,
        };

        // Append progress text to the main text report
        result.text = result.text + '\n\n' + progressText;

        // Append progress card elements to the card
        if (result.card && Array.isArray(result.card.elements)) {
          result.card.elements.push(...progressCardElements);
        }

        this._lastGlobalProgress = result.globalProgress;
      } catch (e) {
        // Don't let progress computation errors break the report
        console.error(`[report-trigger] globalProgress error: ${e.message}`);
      }
    }

    this._lastReport = result;
    return result;
  }

  /**
   * Internal trigger — called on every dispatch engine event.
   */
  _trigger(eventName, detail) {
    const report = this.buildReport(eventName);
    if (this.onReport) {
      try { this.onReport(report); } catch (e) {
        // Don't let report callback errors break the dispatch engine
        console.error(`[report-trigger] onReport error: ${e.message}`);
      }
    }
  }

  /** Get last generated report (or null). */
  get lastReport() {
    return this._lastReport;
  }

  /** Get last global progress summary (or null). */
  get lastGlobalProgress() {
    return this._lastGlobalProgress;
  }

  /** Current report count since construction. */
  get reportCount() {
    return this._reportCount;
  }

  /** Update agent registry at runtime. */
  updateRegistry(patch) {
    Object.assign(this.registry, patch);
  }

  /** Unbind from engine events. */
  detach() {
    this.engine.removeAllListeners('dispatched');
    this.engine.removeAllListeners('running');
    this.engine.removeAllListeners('finished');
  }
}

// ── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  ReportTrigger,
  toReportingTask,
  DEFAULT_AGENT_REGISTRY,
  STATUS_MAP,
  // Re-export global progress utilities for direct use
  computeGlobalProgress,
  renderProgressText,
  renderProgressCardElements,
};
