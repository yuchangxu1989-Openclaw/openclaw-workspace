'use strict';

const fs = require('fs');
const path = require('path');

const stateDir = path.join(__dirname, '..', '..', 'skills', 'public', 'multi-agent-dispatch', 'state');
const engineStateFile = path.join(stateDir, 'engine-state.json');
const liveBoardFile = path.join(stateDir, 'live-board.json');

function readJsonSafe(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function resetDispatchState() {
  fs.mkdirSync(stateDir, { recursive: true });
  const empty = {
    version: 2,
    updatedAt: null,
    maxSlots: 19,
    queued: {},
    spawning: {},
    running: {},
    finished: [],
    eventLog: [],
  };
  fs.writeFileSync(engineStateFile, JSON.stringify(empty, null, 2));
  fs.writeFileSync(liveBoardFile, JSON.stringify({ generatedAt: new Date().toISOString(), tasks: [] }, null, 2));
}

describe('dev-task-handler basic-op auto expansion closed loop', () => {
  let handle;
  let bus;

  beforeEach(() => {
    jest.resetModules();
    resetDispatchState();
    bus = require('../../infrastructure/event-bus/bus');
    jest.spyOn(bus, 'emit').mockImplementation(() => {});
    handle = require('../../infrastructure/dispatcher/handlers/dev-task-handler');
  });

  afterEach(() => {
    if (bus && bus.emit && bus.emit.mockRestore) bus.emit.mockRestore();
  });

  test('auto-expands derived tasks, enqueues immediately, and emits closure signals', async () => {
    const event = {
      id: 'evt-basic-op-001',
      type: 'user.message',
      payload: {
        text: '把这个基操类任务自动扩列 / 自动派生 / 立即执行全局固化；补正式钢印/规则；接入 ISC / 意图 / 事件 / 执行链；补最小验证形成验收闭环',
      },
    };

    const result = await handle(event, {
      intent: { category: 'IC4', name: 'dev_task', confidence: 0.93 },
      basicOp: {
        shouldExpand: true,
        signal: { hit: true, score: 4, reasons: ['basic-op-keyword', 'batch-cue', 'executional-cue'] },
        derivedTasks: [
          { kind: 'rule', title: '补正式钢印/规则', description: '补正式钢印/规则', priority: 'high', tags: ['basic-op', 'rule'] },
          { kind: 'integration', title: '接入 ISC / 意图 / 事件 / 执行链', description: '接入 ISC / 意图 / 事件 / 执行链', priority: 'high', tags: ['basic-op', 'integration'] },
          { kind: 'validation', title: '补最小验证', description: '补最小验证形成验收闭环', priority: 'high', tags: ['basic-op', 'validation'] },
        ],
      },
    });

    expect(result.status).toBe('handled');
    expect(result.action).toBe('dev_task_auto_expanded');
    expect(result.auto_expand.enabled).toBe(true);
    expect(result.auto_expand.derivedCount).toBe(3);
    expect(result.auto_expand.enqueuedTaskIds).toHaveLength(3);
    expect(result.auto_expand.statuses).toHaveLength(3);
    expect(result.next_steps).toEqual(['derived_tasks_enqueued', 'workflow_requested', 'execute_task', 'validate_output', 'gate', 'release', 'git_publish']);
    expect(result.release_qualification).toEqual(expect.objectContaining({
      has_effective_output: true,
      minimal_validation_passed: true,
      release_ready: true,
      auto_git_publish_eligible: true,
    }));

    const state = readJsonSafe(engineStateFile, null);
    expect(state).not.toBeNull();
    expect(Object.keys(state.queued)).toHaveLength(0);
    expect(Object.keys(state.spawning)).toHaveLength(3);
    expect(Object.keys(state.running)).toHaveLength(0);

    const titles = Object.values(state.spawning).map((task) => task.title);
    expect(titles).toEqual(expect.arrayContaining([
      '补正式钢印/规则 [1/3]',
      '接入 ISC / 意图 / 事件 / 执行链 [2/3]',
      '补最小验证 [3/3]',
    ]));

    const firstTask = Object.values(state.spawning)[0];
    expect(firstTask.source).toBe('user-message-auto-expand');
    expect(firstTask.payload.autoExpand).toBe(true);
    expect(firstTask.payload.parentEventId).toBe('evt-basic-op-001');

    expect(bus.emit).toHaveBeenCalledWith(
      'intent.directive',
      expect.objectContaining({
        source_event_id: 'evt-basic-op-001',
        auto_expand: true,
        enqueued_task_ids: result.auto_expand.enqueuedTaskIds,
      }),
      'dev-task-handler'
    );

    expect(bus.emit).toHaveBeenCalledWith(
      'workflow.requested',
      expect.objectContaining({
        source_event_id: 'evt-basic-op-001',
        auto_expand: true,
        derived_count: 3,
        queue_depth_after: 0,
      }),
      'dev-task-handler'
    );

    expect(bus.emit).toHaveBeenCalledWith(
      'release.qualification.requested',
      expect.objectContaining({
        source_event_id: 'evt-basic-op-001',
        qualification: expect.objectContaining({ release_ready: true }),
      }),
      'dev-task-handler'
    );

    expect(bus.emit).toHaveBeenCalledWith(
      'release.qualified',
      expect.objectContaining({
        source_event_id: 'evt-basic-op-001',
        release_ready: true,
      }),
      'dev-task-handler'
    );

    expect(bus.emit).toHaveBeenCalledWith(
      'system.general.modified',
      expect.objectContaining({
        source_event_id: 'evt-basic-op-001',
        release_ready: true,
        publish_mode: 'git_publish_default_chain',
      }),
      'dev-task-handler'
    );
  });

  test('non-basic-op request keeps normal dev task flow without expansion', async () => {
    const result = await handle({
      id: 'evt-basic-op-002',
      type: 'user.message',
      payload: { text: '做一个简单网页展示产品介绍' },
    }, {
      intent: { category: 'IC2', name: 'webpage_build', confidence: 0.81 },
      basicOp: { shouldExpand: false, derivedTasks: [], signal: null },
    });

    expect(result.action).toBe('dev_task_created');
    expect(result.auto_expand.enabled).toBe(false);
    expect(result.auto_expand.derivedCount).toBe(0);
    expect(result.auto_expand.enqueuedTaskIds).toEqual([]);
    expect(result.next_steps).toEqual(['analyze_requirements', 'generate_plan', 'execute_task', 'validate_output']);

    const state = readJsonSafe(engineStateFile, null);
    expect(Object.keys(state.queued)).toHaveLength(0);
    expect(Object.keys(state.spawning)).toHaveLength(0);
    expect(bus.emit).not.toHaveBeenCalled();
  });
});
