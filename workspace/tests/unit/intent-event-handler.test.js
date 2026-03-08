'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const WORKSPACE = '/root/.openclaw/workspace';
const handlerPath = path.join(WORKSPACE, 'infrastructure', 'dispatcher', 'handlers', 'intent-event-handler.js');
const dtoBridgePath = path.join(WORKSPACE, 'skills', 'lto-core', 'event-bridge.js');
const crasBridgePath = path.join(WORKSPACE, 'skills', 'cras', 'event-bridge.js');
const busPath = path.join(WORKSPACE, 'infrastructure', 'event-bus', 'bus-adapter.js');

const emitted = [];
require.cache[busPath] = {
  id: busPath,
  filename: busPath,
  loaded: true,
  exports: {
    emit(type, payload, source) {
      emitted.push({ type, payload, source });
      return { id: `evt_mock_${Date.now()}` };
    }
  }
};

require.cache[dtoBridgePath] = {
  id: dtoBridgePath,
  filename: dtoBridgePath,
  loaded: true,
  exports: {
    createTaskFromEvent(event) {
      return {
        status: 'ok',
        task_id: 'task_test_directive',
        task: { name: event.payload.task_name, description: event.payload.description }
      };
    }
  }
};

require.cache[crasBridgePath] = {
  id: crasBridgePath,
  filename: crasBridgePath,
  loaded: true,
  exports: {
    analyzeRequest(event) {
      return {
        status: 'ok',
        insight: { id: 'insight_test_reflect', finding: event.payload.error }
      };
    }
  }
};

const handler = require(handlerPath);

function test(name, fn) {
  try {
    emitted.length = 0;
    fn();
    console.log(`✅ ${name}`);
  } catch (err) {
    console.error(`❌ ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

function makeEvent(type, payload) {
  return { id: `evt_${Date.now()}`, type, payload: payload || {}, source: 'test' };
}

test('intent.ruleify creates rule draft and emits isc.rule.created', () => {
  const event = makeEvent('intent.ruleify', {
    target: 'Post Commit Quality Gate',
    summary: '提交后应自动创建质量检查规则'
  });
  const result = handler(event);
  assert.strictEqual(result.status, 'ok');
  assert.strictEqual(result.action, 'ruleify');
  assert.ok(result.result.rule_id.startsWith('rule.intent-post-commit-quality-gate-'));
  assert.ok(fs.existsSync(result.result.file));
  assert.strictEqual(emitted[0].type, 'isc.rule.created');
});

test('intent.reflect routes into CRAS analysis bridge', () => {
  const result = handler(makeEvent('intent.reflect', {
    summary: '需要复盘此次 no-route 问题'
  }));
  assert.strictEqual(result.action, 'reflect');
  assert.strictEqual(result.result.insight.id, 'insight_test_reflect');
});

test('intent.directive routes into 本地任务编排 task creation bridge', () => {
  const result = handler(makeEvent('intent.directive', {
    target: '修复事件路由',
    summary: '补齐 no-route 的消费链路'
  }));
  assert.strictEqual(result.action, 'directive');
  assert.strictEqual(result.result.task_id, 'task_test_directive');
  assert.strictEqual(result.result.task.name, '修复事件路由');
});
