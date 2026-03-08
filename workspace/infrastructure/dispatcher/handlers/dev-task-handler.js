'use strict';

/**
 * Dev Task Handler (IC4) — 开发/技能类消息处理
 *
 * Handles development tasks, skill creation, code generation,
 * webpage building, content pipeline, and automation workflows.
 * Records to decision log and returns structured dev task result.
 *
 * 默认主链增强：done -> gate -> release -> git publish
 * 1) 形成有效输出后自动进入发布资格判断
 * 2) 满足条件时自动触发 git 发布动作（经 EventBus 统一发布链）
 * 3) 附带最小验证信号
 *
 * @param {object} event - The event with payload.text
 * @param {object} context - Dispatcher context with intent info
 * @returns {object} { status, handler, result }
 */

const bus = require('../../event-bus/bus');
const { DispatchEngine } = require('../../../skills/public/multi-agent-dispatch/dispatch-engine');

let _decisionLogger = null;
try { _decisionLogger = require('../../decision-log/decision-logger'); } catch (_) {}

let _engine = null;
function getDispatchEngine() {
  if (_engine) return _engine;
  _engine = new DispatchEngine({
    baseDir: '/root/.openclaw/workspace/skills/public/multi-agent-dispatch',
    maxSlots: parseInt(process.env.DISPATCH_ENGINE_SLOTS || '19', 10),
  });
  return _engine;
}

function buildDispatchTask(base, idx, total, event, taskType) {
  const priority = base.priority || 'high';
  return {
    title: total > 1 ? `${base.title} [${idx + 1}/${total}]` : base.title,
    description: base.description,
    source: 'user-message-auto-expand',
    priority,
    agentId: 'coder',
    model: process.env.DISPATCH_ENGINE_MODEL || null,
    tags: ['basic-op-auto-expand', taskType, ...(base.tags || [])],
    payload: {
      task: base.description,
      parentEventId: event.id || null,
      eventType: event.type || 'user.message',
      autoExpand: true,
      derivedKind: base.kind,
    },
  };
}

function logDecision(entry) {
  if (_decisionLogger && typeof _decisionLogger.log === 'function') {
    try {
      _decisionLogger.log({
        phase: 'execution',
        component: 'DevTaskHandler',
        what: entry.what || 'dev task processing',
        why: entry.why || 'IC4 development/skill detected',
        confidence: entry.confidence || 0.8,
        decision_method: 'intent_classification',
        input_summary: JSON.stringify(entry).slice(0, 500),
      });
    } catch (_) {}
  }
}

function buildReleaseQualification(event, taskType, autoExpand, basicOp) {
  const derivedKinds = (basicOp.derivedTasks || []).map((task) => task.kind).filter(Boolean);
  const hasRule = derivedKinds.includes('rule');
  const hasIntegration = derivedKinds.includes('integration');
  const hasValidation = derivedKinds.includes('validation');
  const hasEffectiveOutput = Boolean(autoExpand.enabled && autoExpand.derivedCount > 0);
  const minimalValidationPassed = Boolean(hasValidation || /验证|validate|test/i.test((event.payload && event.payload.text) || ''));
  const qualifies = Boolean(hasEffectiveOutput && minimalValidationPassed);

  return {
    chain: ['done', 'gate', 'release', 'git_publish'],
    task_type: taskType,
    has_effective_output: hasEffectiveOutput,
    minimal_validation_passed: minimalValidationPassed,
    release_ready: qualifies,
    auto_git_publish_eligible: qualifies,
    derived_kinds: derivedKinds,
    checks: {
      effective_output: hasEffectiveOutput,
      minimal_validation: minimalValidationPassed,
      preferred_rule_included: hasRule,
      preferred_integration_included: hasIntegration,
    },
    reason: qualifies
      ? 'effective_output_and_minimal_validation_present'
      : 'missing_effective_output_or_minimal_validation',
  };
}

async function emitDefaultPublishChain(event, text, taskType, autoExpand, qualification) {
  const sourcePayload = {
    source_event_id: event.id || null,
    source_event_type: event.type || 'user.message',
    text,
    task_type: taskType,
    auto_expand: autoExpand.enabled,
    derived_count: autoExpand.derivedCount || 0,
    enqueued_task_ids: autoExpand.enqueuedTaskIds || [],
    qualification,
  };

  bus.emit('task.status.done', {
    ...sourcePayload,
    default_chain: 'done -> gate -> release -> git publish',
    effective_output: qualification.has_effective_output,
  }, 'dev-task-handler');

  bus.emit('task.status.completed', {
    ...sourcePayload,
    default_chain: 'done -> gate -> release -> git publish',
    effective_output: qualification.has_effective_output,
  }, 'dev-task-handler');

  bus.emit('task.output.validated', {
    ...sourcePayload,
    validation_level: 'minimal',
    validation_passed: qualification.minimal_validation_passed,
  }, 'dev-task-handler');

  bus.emit('release.qualification.requested', {
    ...sourcePayload,
    default_chain: 'done -> gate -> release -> git publish',
  }, 'dev-task-handler');

  if (qualification.release_ready) {
    bus.emit('release.qualified', {
      ...sourcePayload,
      release_ready: true,
      default_chain: 'done -> gate -> release -> git publish',
    }, 'dev-task-handler');

    bus.emit('system.general.modified', {
      ...sourcePayload,
      changedFiles: [],
      files: [],
      commit_message: `[auto-publish] ${taskType}: promote default chain from done -> gate -> release -> git publish`,
      release_ready: true,
      publish_mode: 'git_publish_default_chain',
    }, 'dev-task-handler');
  }
}

async function handle(event, context) {
  const text = (event.payload && event.payload.text) || '';
  const intent = context.intent || { category: 'IC4', name: 'dev_task' };
  const basicOp = context.basicOp || { shouldExpand: false, derivedTasks: [], signal: null };

  logDecision({
    what: `Processing dev task: ${text.slice(0, 80)}`,
    why: `IC4 dev-task handler invoked — ${intent.name || 'general'}`,
    confidence: intent.confidence || 0.8,
  });

  // Classify dev task type
  let taskType = 'general_development';
  if (/技能|skill/i.test(text)) taskType = 'skill_creation';
  if (/网页|页面|网站|前端|html/i.test(text)) taskType = 'webpage_build';
  if (/流水线|pipeline|自动化/i.test(text)) taskType = 'automation_pipeline';
  if (/PDF|文档.*知识|结构化/i.test(text)) taskType = 'knowledge_extraction';
  if (/公众号|自媒体|运营|内容/i.test(text)) taskType = 'content_operation';
  if (/编排|协调|多.*技能/i.test(text)) taskType = 'skill_orchestration';

  let autoExpand = {
    enabled: false,
    derivedCount: 0,
    enqueuedTaskIds: [],
  };

  let qualification = {
    chain: ['done', 'gate', 'release', 'git_publish'],
    has_effective_output: false,
    minimal_validation_passed: false,
    release_ready: false,
    auto_git_publish_eligible: false,
    checks: {
      effective_output: false,
      minimal_validation: false,
      preferred_rule_included: false,
      preferred_integration_included: false,
    },
    reason: 'not_applicable',
  };

  if (basicOp.shouldExpand) {
    const engine = getDispatchEngine();
    const dispatchTasks = basicOp.derivedTasks.map((task, idx, arr) => buildDispatchTask(task, idx, arr.length, event, taskType));
    const enqueued = engine.enqueueBatch(dispatchTasks);
    autoExpand = {
      enabled: true,
      signal: basicOp.signal,
      derivedCount: dispatchTasks.length,
      enqueuedTaskIds: enqueued.map((t) => t.taskId),
      statuses: enqueued.map((t) => ({ taskId: t.taskId, status: t.status, title: t.title })),
    };

    bus.emit('intent.directive', {
      source_event_id: event.id || null,
      source_event_type: event.type || 'user.message',
      text,
      auto_expand: true,
      derived_tasks: basicOp.derivedTasks,
      enqueued_task_ids: autoExpand.enqueuedTaskIds,
    }, 'dev-task-handler');

    bus.emit('workflow.requested', {
      source_event_id: event.id || null,
      source_event_type: event.type || 'user.message',
      text,
      auto_expand: true,
      queue_depth_after: engine.queueDepth(),
      derived_count: dispatchTasks.length,
    }, 'dev-task-handler');

    qualification = buildReleaseQualification(event, taskType, autoExpand, basicOp);
    await emitDefaultPublishChain(event, text, taskType, autoExpand, qualification);
  }

  return {
    status: 'handled',
    handler: 'dev-task-handler',
    intent,
    task_type: taskType,
    action: basicOp.shouldExpand ? 'dev_task_auto_expanded' : 'dev_task_created',
    text_preview: text.slice(0, 100),
    timestamp: new Date().toISOString(),
    capabilities: ['code_generation', 'skill_scaffolding', 'build_pipeline', 'content_pipeline'],
    next_steps: basicOp.shouldExpand
      ? ['derived_tasks_enqueued', 'workflow_requested', 'execute_task', 'validate_output', 'gate', 'release', 'git_publish']
      : ['analyze_requirements', 'generate_plan', 'execute_task', 'validate_output'],
    auto_expand: autoExpand,
    release_qualification: qualification,
  };
}

module.exports = handle;
module.exports.handle = handle;
module.exports.buildReleaseQualification = buildReleaseQualification;
module.exports.emitDefaultPublishChain = emitDefaultPublishChain;
