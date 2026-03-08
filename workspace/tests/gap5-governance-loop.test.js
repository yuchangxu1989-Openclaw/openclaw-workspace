#!/usr/bin/env node
'use strict';

/**
 * Gap5 治理闭环集成测试
 * 
 * 验证项目管理产物沉淀机制的四个子系统是否正确工作：
 * 1. artifact-gate-check: 产物门禁
 * 2. tracker-sync-handler: TRACKER同步
 * 3. sprint-closure-gate: Sprint收工验收
 * 4. ISC规则注册: 事件链路挂接
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const WORKSPACE = path.resolve(__dirname, '..');
const RULES_DIR = path.join(WORKSPACE, 'skills', 'isc-core', 'rules');
const HANDLERS_DIR = path.join(WORKSPACE, 'infrastructure', 'event-bus', 'handlers');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

console.log('\n🧪 Gap5 治理闭环集成测试\n');

// ═══════════════════════════════════════════
// Part 1: ISC规则注册验证
// ═══════════════════════════════════════════
console.log('─── Part 1: ISC规则注册 ───');

test('rule.project-artifact-gate-001.json 存在且可解析', () => {
  const file = path.join(RULES_DIR, 'rule.project-artifact-gate-001.json');
  assert.ok(fs.existsSync(file), 'rule file missing');
  const rule = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.strictEqual(rule.rule_id, 'rule.project-artifact-gate-001');
  assert.strictEqual(rule.type, 'gate');
  assert.strictEqual(rule.enforcement_tier, 'P0_block');
  assert.ok(rule.trigger.events.includes('task.status.completed'));
});

test('rule.tracker-sync-gate-001.json 存在且可解析', () => {
  const file = path.join(RULES_DIR, 'rule.tracker-sync-gate-001.json');
  assert.ok(fs.existsSync(file), 'rule file missing');
  const rule = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.strictEqual(rule.rule_id, 'rule.tracker-sync-gate-001');
  assert.ok(rule.trigger.events.includes('task.status.changed'));
  assert.ok(rule.conditions.status_mapping);
});

test('rule.sprint-closure-acceptance-001.json 存在且可解析', () => {
  const file = path.join(RULES_DIR, 'rule.sprint-closure-acceptance-001.json');
  assert.ok(fs.existsSync(file), 'rule file missing');
  const rule = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.strictEqual(rule.rule_id, 'rule.sprint-closure-acceptance-001');
  assert.ok(rule.conditions.four_gates.length === 4);
  assert.ok(rule.conditions.four_gates.find(g => g.id === 'artifact_audit'));
  assert.ok(rule.conditions.four_gates.find(g => g.id === 'metrics_collected'));
  assert.ok(rule.conditions.four_gates.find(g => g.id === 'lessons_captured'));
  assert.ok(rule.conditions.four_gates.find(g => g.id === 'tribunal_verdict'));
});

// ═══════════════════════════════════════════
// Part 2: Handler可加载验证
// ═══════════════════════════════════════════
console.log('\n─── Part 2: Handler可加载 ───');

test('artifact-gate-check.js 可require', () => {
  const handler = require(path.join(HANDLERS_DIR, 'artifact-gate-check.js'));
  assert.ok(typeof handler === 'function' || typeof handler.run === 'function');
  assert.ok(typeof handler.runGate === 'function');
  assert.ok(typeof handler.auditAllCompleted === 'function');
  assert.ok(typeof handler.sprintClosureGate === 'function');
});

test('tracker-sync-handler.js 可require', () => {
  const handler = require(path.join(HANDLERS_DIR, 'tracker-sync-handler.js'));
  assert.ok(typeof handler === 'function' || typeof handler.run === 'function');
  assert.ok(typeof handler.detectDesync === 'function');
  assert.ok(typeof handler.syncToTracker === 'function');
  assert.ok(typeof handler.fullSync === 'function');
});

// ═══════════════════════════════════════════
// Part 3: Artifact Gate 功能验证
// ═══════════════════════════════════════════
console.log('\n─── Part 3: Artifact Gate 功能 ───');

const artifactGate = require(path.join(HANDLERS_DIR, 'artifact-gate-check.js'));

test('runGate: 无产物任务 → BLOCK', () => {
  const result = artifactGate.runGate({
    id: 'test-task-1',
    title: '测试任务（无产物）',
    status: 'done',
    artifacts: ['/nonexistent/path/test.md']
  });
  assert.strictEqual(result.verdict, 'BLOCK');
  assert.ok(result.checks.artifact_exists);
  assert.strictEqual(result.checks.artifact_exists.passed, false);
});

test('runGate: 有真实产物任务 → PASS', () => {
  // Use PROJECT-TRACKER.md as a real artifact
  const result = artifactGate.runGate({
    id: 'test-task-2',
    title: '测试任务（有产物）',
    status: 'done',
    artifacts: ['PROJECT-TRACKER.md']
  });
  assert.strictEqual(result.verdict, 'PASS');
  assert.strictEqual(result.checks.artifact_exists.passed, true);
});

test('runGate: 空文件产物 → BLOCK', () => {
  // Create a tiny file
  const tmpFile = path.join(WORKSPACE, 'reports', '_test_empty_artifact.md');
  fs.mkdirSync(path.dirname(tmpFile), { recursive: true });
  fs.writeFileSync(tmpFile, '# Title\n');
  const result = artifactGate.runGate({
    id: 'test-task-3',
    title: '测试任务（空文件）',
    status: 'done',
    artifacts: ['reports/_test_empty_artifact.md']
  });
  assert.strictEqual(result.verdict, 'BLOCK');
  // Cleanup
  try { fs.unlinkSync(tmpFile); } catch (_) {}
});

test('auditAllCompleted: 批量审计可执行', () => {
  const result = artifactGate.auditAllCompleted();
  assert.ok(result.timestamp);
  assert.ok(typeof result.total_audited === 'number');
});

// ═══════════════════════════════════════════
// Part 4: Tracker Sync 功能验证
// ═══════════════════════════════════════════
console.log('\n─── Part 4: Tracker Sync 功能 ───');

const trackerSync = require(path.join(HANDLERS_DIR, 'tracker-sync-handler.js'));

test('detectDesync: 可检测状态差异', () => {
  const result = trackerSync.detectDesync();
  assert.ok(typeof result.tasks_count === 'number');
  assert.ok(typeof result.tracker_entries === 'number');
  assert.ok(Array.isArray(result.desyncs));
});

test('syncToTracker: 同步执行不报错', () => {
  const result = trackerSync.syncToTracker();
  assert.ok(result.ok);
  assert.ok(typeof result.synced === 'number');
});

test('fullSync: 完整同步流程可执行', () => {
  const result = trackerSync.fullSync();
  assert.ok(result.timestamp);
  assert.ok(typeof result.pre_sync_desyncs === 'number');
  assert.ok(typeof result.post_sync_desyncs === 'number');
});

// ═══════════════════════════════════════════
// Part 5: Sprint Closure Gate 验证
// ═══════════════════════════════════════════
console.log('\n─── Part 5: Sprint Closure Gate ───');

test('sprintClosureGate: 四重门禁全部执行', () => {
  const result = artifactGate.sprintClosureGate('test-sprint');
  assert.ok(result.timestamp);
  assert.ok(result.gates);
  assert.ok(result.gates.artifact_audit);
  assert.ok(result.gates.metrics_collected);
  assert.ok(result.gates.lessons_captured);
  assert.ok(result.gates.tribunal_verdict);
  assert.ok(['APPROVED', 'BLOCKED'].includes(result.verdict));
});

test('sprintClosureGate: 指标文件已存在 → metrics_collected通过', () => {
  const result = artifactGate.sprintClosureGate('l3-rebuild');
  assert.strictEqual(result.gates.metrics_collected.passed, true,
    'metrics gate should pass since 2026-03.json exists');
});

test('sprintClosureGate: 经验文件已存在 → lessons_captured通过', () => {
  const result = artifactGate.sprintClosureGate('l3-rebuild');
  assert.strictEqual(result.gates.lessons_captured.passed, true,
    'lessons gate should pass since lesson file exists');
});

// ═══════════════════════════════════════════
// Part 6: EventBus事件链路挂接验证
// ═══════════════════════════════════════════
console.log('\n─── Part 6: 事件链路挂接 ───');

test('ISC规则handler名称与实际handler文件一致', () => {
  const ruleFiles = [
    'rule.project-artifact-gate-001.json',
    'rule.tracker-sync-gate-001.json',
    'rule.sprint-closure-acceptance-001.json'
  ];
  
  for (const ruleFile of ruleFiles) {
    const rule = JSON.parse(fs.readFileSync(path.join(RULES_DIR, ruleFile), 'utf8'));
    const handlerName = rule.action.handler;
    const handlerFile = path.join(HANDLERS_DIR, `${handlerName}.js`);
    assert.ok(fs.existsSync(handlerFile), 
      `Handler file missing for rule ${ruleFile}: expected ${handlerFile}`);
  }
});

test('所有新规则的事件类型符合EventBus命名规范', () => {
  const ruleFiles = [
    'rule.project-artifact-gate-001.json',
    'rule.tracker-sync-gate-001.json',
    'rule.sprint-closure-acceptance-001.json'
  ];
  
  for (const ruleFile of ruleFiles) {
    const rule = JSON.parse(fs.readFileSync(path.join(RULES_DIR, ruleFile), 'utf8'));
    const events = rule.trigger.events;
    for (const evt of events) {
      // 事件名格式：domain.object.verb 或 domain.object.detail
      assert.ok(/^[a-z]+\.[a-z._]+$/.test(evt) || evt.includes('>=') || evt.includes('>'),
        `Event name format invalid: ${evt} in ${ruleFile}`);
    }
  }
});

test('project-mgmt经验沉淀规则已存在', () => {
  const file = path.join(RULES_DIR, 'rule.project-mgmt-lesson-capture-001.json');
  assert.ok(fs.existsSync(file), 'project-mgmt-lesson-capture rule should exist');
});

test('project-mgmt启动自检规则已存在', () => {
  const file = path.join(RULES_DIR, 'rule.project-mgmt-startup-checklist-001.json');
  assert.ok(fs.existsSync(file), 'project-mgmt-startup-checklist rule should exist');
});

// ═══════════════════════════════════════════
// Part 7: 产物文件存在性验证
// ═══════════════════════════════════════════
console.log('\n─── Part 7: 产物存在性 ───');

test('Sprint指标文件已创建', () => {
  const file = path.join(WORKSPACE, 'skills', 'project-mgmt', 'metrics', '2026-03.json');
  assert.ok(fs.existsSync(file));
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(data.planned_days !== undefined);
  assert.ok(data.tasks_total !== undefined);
});

test('Sprint经验教训文件已创建', () => {
  const dir = path.join(WORKSPACE, 'skills', 'project-mgmt', 'lessons');
  const files = fs.readdirSync(dir).filter(f => f.includes('2026-03') && f.endsWith('.md'));
  assert.ok(files.length > 0, 'should have at least one lesson file for 2026-03');
});

test('anti-patterns.md已存在', () => {
  const file = path.join(WORKSPACE, 'skills', 'project-mgmt', 'lessons', 'anti-patterns.md');
  assert.ok(fs.existsSync(file));
});

test('project-mgmt SKILL.md已存在且包含进化机制', () => {
  const file = path.join(WORKSPACE, 'skills', 'project-mgmt', 'SKILL.md');
  assert.ok(fs.existsSync(file));
  const content = fs.readFileSync(file, 'utf8');
  assert.ok(content.includes('经验沉淀'));
  assert.ok(content.includes('反模式'));
  assert.ok(content.includes('指标追踪'));
});

// ═══════════════════════════════════════════
// 报告
// ═══════════════════════════════════════════
console.log(`\n📊 结果: ${passed} passed, ${failed} failed, ${passed + failed} total\n`);

if (failed > 0) {
  console.log('⚠️ 有测试失败，需要修复后重新验证');
  process.exit(1);
} else {
  console.log('✅ Gap5 治理闭环全部验证通过');
  process.exit(0);
}
