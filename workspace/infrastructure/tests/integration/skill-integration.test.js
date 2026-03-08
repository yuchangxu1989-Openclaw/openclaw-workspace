#!/usr/bin/env node
'use strict';

/**
 * Day 2 集成测试 — L3 与技能系统闭环验证
 * 
 * 验证事件从技能→EventBus→Pipeline→Dispatcher→技能的完整闭环：
 * 
 * 场景 1: CRAS knowledge.learned → EventBus → Dispatcher → skill-cras-handler
 * 场景 2: 本地任务编排 task.completed → EventBus → Dispatcher → skill-lto-handler
 * 场景 3: ISC rule.changed → EventBus → Dispatcher → skill-isc-handler
 * 场景 4: AEO evaluation.completed → EventBus → Dispatcher → skill-cras-handler
 * 场景 5: SEEF skill.published → EventBus → Dispatcher → skill-cras-handler
 * 场景 6: 完整闭环：CRAS emit → Pipeline.run → Dispatcher dispatch
 * 场景 7: 反向集成：Dispatcher直接调用各技能handler
 * 
 * 放置路径: infrastructure/tests/integration/skill-integration.test.js
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// ─── 模块导入 ────────────────────────────────────────────────────

const INFRA_ROOT = path.join(__dirname, '..', '..');
const SKILLS_ROOT = path.join(INFRA_ROOT, '..', 'skills');

// EventBus
const EventBus = require(path.join(INFRA_ROOT, 'event-bus', 'bus-adapter.js'));

// Dispatcher
const Dispatcher = require(path.join(INFRA_ROOT, 'dispatcher', 'dispatcher.js'));

// Skill event bridges
const CRASBridge = require(path.join(SKILLS_ROOT, 'cras', 'event-bridge.js'));
const DTOBridge = require(path.join(SKILLS_ROOT, 'lto-core', 'event-bridge.js'));
const ISCBridge = require(path.join(SKILLS_ROOT, 'isc-core', 'event-bridge.js'));
const AEOBridge = require(path.join(SKILLS_ROOT, 'aeo', 'event-bridge.js'));
const SEEFBridge = require(path.join(SKILLS_ROOT, 'seef', 'event-bridge.js'));

// Dispatcher handlers (reverse integration)
const craHandler = require(path.join(INFRA_ROOT, 'dispatcher', 'handlers', 'skill-cras-handler.js'));
const dtoHandler = require(path.join(INFRA_ROOT, 'dispatcher', 'handlers', 'skill-lto-handler.js'));
const iscHandler = require(path.join(INFRA_ROOT, 'dispatcher', 'handlers', 'skill-isc-handler.js'));

// ─── 测试基础设施 ────────────────────────────────────────────────

let _passed = 0;
let _failed = 0;
const _results = [];

function check(label, fn) {
  try {
    fn();
    _passed++;
    _results.push({ label, status: 'PASS' });
    console.log(`    ✅ PASS: ${label}`);
  } catch (e) {
    _failed++;
    _results.push({ label, status: 'FAIL', error: e.message });
    console.log(`    ❌ FAIL: ${label}`);
    console.log(`           ${e.message}`);
  }
}

function section(name) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${name}`);
  console.log(`${'═'.repeat(60)}`);
}

// ═══════════════════════════════════════════════════════════
// 场景 1: CRAS Event Bridge → EventBus
// ═══════════════════════════════════════════════════════════

function testCRASEventBridge() {
  section('场景 1: CRAS knowledge.learned → EventBus');

  // Test emitKnowledgeLearned exists and works
  check('CRASBridge.emitKnowledgeLearned is a function', () => {
    assert.strictEqual(typeof CRASBridge.emitKnowledgeLearned, 'function');
  });

  check('emitKnowledgeLearned emits to EventBus', () => {
    const result = CRASBridge.emitKnowledgeLearned({
      source: 'integration-test',
      insight_count: 3,
      topic: 'test-topic'
    });
    assert.ok(result, 'Should return event result');
    // bus-adapter returns { id, suppressed }
    assert.ok(result.id || result.suppressed === true, 'Should have id or be suppressed (dedup)');
  });

  check('CRASBridge.analyzeRequest is a function', () => {
    assert.strictEqual(typeof CRASBridge.analyzeRequest, 'function');
  });

  check('analyzeRequest returns structured result', () => {
    const result = CRASBridge.analyzeRequest({
      id: 'test-event-1',
      type: 'aeo.assessment.completed',
      payload: {
        skill_name: 'test-skill',
        score: 0.95,
        passed: true,
        track: 'quality'
      }
    });
    assert.strictEqual(result.status, 'ok');
    assert.strictEqual(result.handler, 'cras-analysis');
  });
}

// ═══════════════════════════════════════════════════════════
// 场景 2: 本地任务编排 Event Bridge → EventBus
// ═══════════════════════════════════════════════════════════

function testDTOEventBridge() {
  section('场景 2: 本地任务编排 task.completed → EventBus');

  check('DTOBridge.emitTaskCompleted is a function', () => {
    assert.strictEqual(typeof DTOBridge.emitTaskCompleted, 'function');
  });

  check('emitTaskCompleted emits to EventBus', () => {
    const result = DTOBridge.emitTaskCompleted({
      taskId: 'test-task-1',
      executionId: 'exec-test-1',
      status: 'completed',
      duration: 1500
    });
    assert.ok(result, 'Should return event');
    assert.ok(result.id, 'Should have event id');
  });

  check('DTOBridge.createTaskFromEvent is a function', () => {
    assert.strictEqual(typeof DTOBridge.createTaskFromEvent, 'function');
  });

  check('createTaskFromEvent creates task file', () => {
    const result = DTOBridge.createTaskFromEvent({
      id: 'test-event-lto-1',
      type: 'lto.task.request',
      payload: {
        task_name: 'integration-test-task',
        description: 'Created by integration test'
      }
    });
    assert.strictEqual(result.status, 'ok');
    assert.ok(result.task_id, 'Should return task_id');
    assert.ok(result.task, 'Should return task object');

    // Verify file was actually created
    const taskFile = path.join(SKILLS_ROOT, 'lto-core', 'tasks', `${result.task_id}.json`);
    assert.ok(fs.existsSync(taskFile), `Task file should exist: ${taskFile}`);

    // Cleanup
    try { fs.unlinkSync(taskFile); } catch (_) {}
  });
}

// ═══════════════════════════════════════════════════════════
// 场景 3: ISC Event Bridge → EventBus
// ═══════════════════════════════════════════════════════════

function testISCEventBridge() {
  section('场景 3: ISC rule.changed → EventBus');

  check('ISCBridge.emitRuleChanged is a function', () => {
    assert.strictEqual(typeof ISCBridge.emitRuleChanged, 'function');
  });

  check('emitRuleChanged emits to EventBus', () => {
    const result = ISCBridge.emitRuleChanged([
      { rule_id: 'test-rule-1', type: 'updated' },
      { rule_id: 'test-rule-2', type: 'created' }
    ]);
    assert.ok(result, 'Should return event');
    assert.ok(result.id, 'Should have event id');
  });

  check('emitRuleChanged returns null for empty changes', () => {
    const result = ISCBridge.emitRuleChanged([]);
    assert.strictEqual(result, null);
  });

  check('ISCBridge.checkRulesFromEvent is a function', () => {
    assert.strictEqual(typeof ISCBridge.checkRulesFromEvent, 'function');
  });

  check('checkRulesFromEvent returns rules list', () => {
    const result = ISCBridge.checkRulesFromEvent({
      id: 'test-event-isc-1',
      type: 'isc.rule.check',
      payload: {}
    });
    assert.strictEqual(result.status, 'ok');
    assert.ok(Array.isArray(result.rules) || result.rule, 'Should return rules or rule');
  });
}

// ═══════════════════════════════════════════════════════════
// 场景 4: AEO Event Bridge → EventBus
// ═══════════════════════════════════════════════════════════

function testAEOEventBridge() {
  section('场景 4: AEO evaluation.completed → EventBus');

  check('AEOBridge.onEvaluationComplete is a function', () => {
    assert.strictEqual(typeof AEOBridge.onEvaluationComplete, 'function');
  });

  check('onEvaluationComplete emits to EventBus', () => {
    const result = AEOBridge.onEvaluationComplete({
      skill_name: 'test-skill',
      track: 'quality',
      score: 0.92,
      passed: true,
      evaluation_type: 'integration-test'
    });
    assert.ok(result, 'Should return event');
    assert.ok(result.id, 'Should have event id');
  });

  check('AEOBridge.onAssessmentComplete still works', () => {
    const result = AEOBridge.onAssessmentComplete({
      skill_name: 'test-skill-2',
      track: 'effect',
      score: 0.88,
      passed: true
    });
    assert.ok(result, 'Should return event');
    assert.ok(result.id, 'Should have event id');
  });
}

// ═══════════════════════════════════════════════════════════
// 场景 5: SEEF Event Bridge → EventBus
// ═══════════════════════════════════════════════════════════

function testSEEFEventBridge() {
  section('场景 5: SEEF skill.published → EventBus');

  check('SEEFBridge.emitSkillPublished is a function', () => {
    assert.strictEqual(typeof SEEFBridge.emitSkillPublished, 'function');
  });

  check('emitSkillPublished emits to EventBus', () => {
    const result = SEEFBridge.emitSkillPublished({
      skill_name: 'test-published-skill',
      version: '2.0.0',
      target: 'evomap'
    });
    assert.ok(result, 'Should return event');
    assert.ok(result.id, 'Should have event id');
  });
}

// ═══════════════════════════════════════════════════════════
// 场景 6: 完整闭环 — Emit → Dispatcher route → Handler
// ═══════════════════════════════════════════════════════════

async function testFullLoopDispatch() {
  section('场景 6: 完整闭环 — EventBus → Dispatcher → Skill Handler');

  // Load routes
  const routes = JSON.parse(fs.readFileSync(
    path.join(INFRA_ROOT, 'dispatcher', 'routes.json'), 'utf8'
  ));

  // Test 1: cras.knowledge.learned → skill-cras-handler
  check('Route exists for cras.knowledge.learned', () => {
    assert.ok(routes['cras.knowledge.learned'], 'Should have route for cras.knowledge.learned');
    assert.strictEqual(routes['cras.knowledge.learned'].handler, 'skill-cras-handler');
  });

  // Test 2: lto.task.completed → skill-lto-handler
  check('Route exists for lto.task.completed', () => {
    assert.ok(routes['lto.task.completed'], 'Should have route for lto.task.completed');
    assert.strictEqual(routes['lto.task.completed'].handler, 'skill-lto-handler');
  });

  // Test 3: isc.rule.changed → skill-isc-handler
  check('Route exists for isc.rule.changed', () => {
    assert.ok(routes['isc.rule.changed'], 'Should have route for isc.rule.changed');
    assert.strictEqual(routes['isc.rule.changed'].handler, 'skill-isc-handler');
  });

  // Test 4: aeo.evaluation.completed → skill-cras-handler
  check('Route exists for aeo.evaluation.completed', () => {
    assert.ok(routes['aeo.evaluation.completed'], 'Should have route for aeo.evaluation.completed');
    assert.strictEqual(routes['aeo.evaluation.completed'].handler, 'skill-cras-handler');
  });

  // Test 5: seef.skill.published → skill-cras-handler
  check('Route exists for seef.skill.published', () => {
    assert.ok(routes['seef.skill.published'], 'Should have route for seef.skill.published');
    assert.strictEqual(routes['seef.skill.published'].handler, 'skill-cras-handler');
  });

  // Test 6: Actual dispatch of cras.knowledge.learned event
  try {
    const dispatchResult = await Dispatcher.dispatch(
      { action: 'cras.knowledge.learned' },
      {
        id: 'integration-test-event-1',
        type: 'cras.knowledge.learned',
        payload: { source: 'test', insight_count: 5 },
        timestamp: Date.now()
      }
    );
    check('Dispatcher dispatches cras.knowledge.learned successfully', () => {
      assert.ok(dispatchResult, 'Should return dispatch result');
      // May be file_dispatched or success depending on handler availability
      assert.ok(
        dispatchResult.success || dispatchResult.result === 'file_dispatched',
        `Should succeed or file-dispatch: ${JSON.stringify(dispatchResult)}`
      );
    });
  } catch (err) {
    check('Dispatcher dispatches cras.knowledge.learned successfully', () => {
      assert.fail(`Dispatch threw: ${err.message}`);
    });
  }

  // Test 7: Actual dispatch of lto.task.completed event
  try {
    const dispatchResult = await Dispatcher.dispatch(
      { action: 'lto.task.completed' },
      {
        id: 'integration-test-event-2',
        type: 'lto.task.completed',
        payload: { task_id: 'test-task', duration: 1000 },
        timestamp: Date.now()
      }
    );
    check('Dispatcher dispatches lto.task.completed successfully', () => {
      assert.ok(dispatchResult, 'Should return dispatch result');
      assert.ok(
        dispatchResult.success || dispatchResult.result === 'file_dispatched',
        `Should succeed: ${JSON.stringify(dispatchResult)}`
      );
    });
  } catch (err) {
    check('Dispatcher dispatches lto.task.completed successfully', () => {
      assert.fail(`Dispatch threw: ${err.message}`);
    });
  }

  // Test 8: Actual dispatch of isc.rule.changed event
  try {
    const dispatchResult = await Dispatcher.dispatch(
      { action: 'isc.rule.changed' },
      {
        id: 'integration-test-event-3',
        type: 'isc.rule.changed',
        payload: { change_count: 1, changes: [{ rule_id: 'R001', action: 'updated' }] },
        timestamp: Date.now()
      }
    );
    check('Dispatcher dispatches isc.rule.changed successfully', () => {
      assert.ok(dispatchResult, 'Should return dispatch result');
      assert.ok(
        dispatchResult.success || dispatchResult.result === 'file_dispatched',
        `Should succeed: ${JSON.stringify(dispatchResult)}`
      );
    });
  } catch (err) {
    check('Dispatcher dispatches isc.rule.changed successfully', () => {
      assert.fail(`Dispatch threw: ${err.message}`);
    });
  }
}

// ═══════════════════════════════════════════════════════════
// 场景 7: 反向集成 — Dispatcher Handler 直接调用技能
// ═══════════════════════════════════════════════════════════

function testReverseIntegration() {
  section('场景 7: 反向集成 — Dispatcher Handlers → Skill APIs');

  // 7a: CRAS handler
  check('skill-cras-handler returns valid result', () => {
    const result = craHandler({
      id: 'reverse-test-1',
      type: 'cras.knowledge.learned',
      payload: { source: 'test', insight_count: 2 }
    }, { handlerName: 'skill-cras-handler' });
    assert.ok(result, 'Should return result');
    assert.strictEqual(result.status, 'ok');
    assert.ok(result.handler, 'Should identify handler');
  });

  check('skill-cras-handler analyzeRequest path works', () => {
    const result = craHandler({
      id: 'reverse-test-2',
      type: 'cras.insight.request',
      payload: {
        skill_name: 'test-skill',
        score: 0.85,
        passed: true,
        track: 'quality'
      }
    }, { handlerName: 'skill-cras-handler' });
    assert.ok(result, 'Should return result');
    assert.strictEqual(result.status, 'ok');
  });

  // 7b: 本地任务编排 handler
  check('skill-lto-handler createTask works', () => {
    const result = dtoHandler({
      id: 'reverse-test-3',
      type: 'lto.task.create',
      payload: {
        task_name: 'reverse-test-task',
        description: 'Created by reverse integration test'
      }
    }, { handlerName: 'skill-lto-handler' });
    assert.ok(result, 'Should return result');
    assert.strictEqual(result.status, 'ok');
    assert.ok(result.task_id, 'Should have task_id');

    // Cleanup task file
    if (result.task_id) {
      const taskFile = path.join(SKILLS_ROOT, 'lto-core', 'tasks', `${result.task_id}.json`);
      try { fs.unlinkSync(taskFile); } catch (_) {}
    }
  });

  // 7c: ISC handler
  check('skill-isc-handler checkRules works', () => {
    const result = iscHandler({
      id: 'reverse-test-4',
      type: 'isc.rule.changed',
      payload: { rule_id: 'nonexistent-rule' }
    }, { handlerName: 'skill-isc-handler' });
    assert.ok(result, 'Should return result');
    assert.strictEqual(result.status, 'ok');
    assert.ok(result.handler, 'Should identify handler');
  });

  check('skill-isc-handler lists all rules', () => {
    const result = iscHandler({
      id: 'reverse-test-5',
      type: 'isc.rule.check',
      payload: {}
    }, { handlerName: 'skill-isc-handler' });
    assert.ok(result, 'Should return result');
    assert.strictEqual(result.status, 'ok');
    assert.ok(result.rules || result.total !== undefined, 'Should return rules or total');
  });
}

// ═══════════════════════════════════════════════════════════
// 场景 8: 事件桥接 API 完整性验证
// ═══════════════════════════════════════════════════════════

function testBridgeAPICompleteness() {
  section('场景 8: 事件桥接 API 完整性验证');

  // CRAS
  check('CRAS bridge has processAssessments', () => {
    assert.strictEqual(typeof CRASBridge.processAssessments, 'function');
  });
  check('CRAS bridge has emitKnowledgeLearned', () => {
    assert.strictEqual(typeof CRASBridge.emitKnowledgeLearned, 'function');
  });
  check('CRAS bridge has analyzeRequest', () => {
    assert.strictEqual(typeof CRASBridge.analyzeRequest, 'function');
  });

  // 本地任务编排
  check('本地任务编排 bridge has processEvents', () => {
    assert.strictEqual(typeof DTOBridge.processEvents, 'function');
  });
  check('本地任务编排 bridge has emitTaskCompleted', () => {
    assert.strictEqual(typeof DTOBridge.emitTaskCompleted, 'function');
  });
  check('本地任务编排 bridge has createTaskFromEvent', () => {
    assert.strictEqual(typeof DTOBridge.createTaskFromEvent, 'function');
  });

  // ISC
  check('ISC bridge has detectChanges', () => {
    assert.strictEqual(typeof ISCBridge.detectChanges, 'function');
  });
  check('ISC bridge has publishChanges', () => {
    assert.strictEqual(typeof ISCBridge.publishChanges, 'function');
  });
  check('ISC bridge has emitRuleChanged', () => {
    assert.strictEqual(typeof ISCBridge.emitRuleChanged, 'function');
  });
  check('ISC bridge has checkRulesFromEvent', () => {
    assert.strictEqual(typeof ISCBridge.checkRulesFromEvent, 'function');
  });

  // AEO
  check('AEO bridge has onAssessmentComplete', () => {
    assert.strictEqual(typeof AEOBridge.onAssessmentComplete, 'function');
  });
  check('AEO bridge has onEvaluationComplete', () => {
    assert.strictEqual(typeof AEOBridge.onEvaluationComplete, 'function');
  });
  check('AEO bridge has publishBatchResults', () => {
    assert.strictEqual(typeof AEOBridge.publishBatchResults, 'function');
  });

  // SEEF
  check('SEEF bridge has processEvents', () => {
    assert.strictEqual(typeof SEEFBridge.processEvents, 'function');
  });
  check('SEEF bridge has emitSkillPublished', () => {
    assert.strictEqual(typeof SEEFBridge.emitSkillPublished, 'function');
  });
  check('SEEF bridge has routeToSubSkill', () => {
    assert.strictEqual(typeof SEEFBridge.routeToSubSkill, 'function');
  });
}

// ═══════════════════════════════════════════════════════════
// 主入口
// ═══════════════════════════════════════════════════════════

async function main() {
  console.log('\n🔬 Day 2 Integration Test: L3 ↔ Skill System Closed-Loop');
  console.log(`   Started: ${new Date().toISOString()}\n`);

  // Sync tests
  testCRASEventBridge();
  testDTOEventBridge();
  testISCEventBridge();
  testAEOEventBridge();
  testSEEFEventBridge();
  testBridgeAPICompleteness();
  testReverseIntegration();

  // Async tests
  await testFullLoopDispatch();

  // Summary
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  测试摘要`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`  ✅ 通过: ${_passed}`);
  console.log(`  ❌ 失败: ${_failed}`);
  console.log(`  📊 总计: ${_passed + _failed}`);
  console.log(`${'═'.repeat(60)}\n`);

  // Write result file
  const resultFile = path.join(__dirname, 'skill-integration-result.json');
  fs.writeFileSync(resultFile, JSON.stringify({
    timestamp: new Date().toISOString(),
    passed: _passed,
    failed: _failed,
    total: _passed + _failed,
    results: _results
  }, null, 2));

  if (_failed > 0) {
    console.log('❌ 有失败的测试！\n');
    process.exit(1);
  } else {
    console.log('✅ 所有测试通过！\n');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
