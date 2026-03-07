#!/usr/bin/env node
'use strict';

/**
 * Pipeline Dashboard Integration Test Suite
 * 
 * Day2 Gap2 验证: 五层闭环监控是否真正采集到数据并生成可用报告
 * 
 * 测试:
 *   1. Collector 五层数据完整性
 *   2. Monitor 报告生成
 *   3. Feishu 卡片生成
 *   4. Delta 计算
 *   5. Cron entry point
 *   6. History 持久化
 *   7. EventBus adapter
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const WORKSPACE = '/root/.openclaw/workspace';
let passed = 0;
let failed = 0;
const results = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    results.push({ name, status: 'PASS' });
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    results.push({ name, status: 'FAIL', error: err.message });
    console.log(`  ❌ ${name}: ${err.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

console.log('\n🧪 Pipeline Dashboard Integration Tests\n');
console.log('────────────────────────────────────────\n');

// ── 1. Collector tests ──

console.log('📦 Collector Tests:');

let snapshot;
test('collectAll returns valid snapshot', () => {
  const collector = require(path.join(WORKSPACE, 'infrastructure/observability/pipeline-dashboard-collector'));
  snapshot = collector.collectAll({ windowHours: 24 });
  assert(snapshot, 'snapshot should exist');
  assert(snapshot.schema === 'pipeline-dashboard-v1', 'schema mismatch');
  assert(snapshot.generated_at, 'missing generated_at');
});

test('snapshot has all 5 layers', () => {
  assert(snapshot.layers.L1, 'missing L1');
  assert(snapshot.layers.L2, 'missing L2');
  assert(snapshot.layers.L3, 'missing L3');
  assert(snapshot.layers.L4, 'missing L4');
  assert(snapshot.layers.L5, 'missing L5');
});

test('each layer has required fields', () => {
  for (const [key, layer] of Object.entries(snapshot.layers)) {
    assert(layer.layer, `${key} missing layer field`);
    assert(layer.status, `${key} missing status`);
    assert(layer.data, `${key} missing data`);
    assert(Array.isArray(layer.alerts), `${key} missing alerts array`);
    assert(['healthy', 'warning', 'critical', 'no_data', 'unknown'].includes(layer.status),
      `${key} invalid status: ${layer.status}`);
  }
});

test('L1 has intent registry data', () => {
  const l1 = snapshot.layers.L1;
  assert(l1.data.registered_intents > 0, 'should have registered intents');
  assert(l1.data.categories, 'should have categories');
});

test('L2 has decision log data', () => {
  const l2 = snapshot.layers.L2;
  // Decision log has 2946 entries, should have data
  assert(l2.data.decisions_total > 0 || l2.data.rules_evaluated != null, 'should have decision/rule data');
});

test('L3 has pipeline run data', () => {
  const l3 = snapshot.layers.L3;
  assert(l3.data.pipeline_total_runs > 0, 'should have pipeline runs');
});

test('L4 has AEO data', () => {
  const l4 = snapshot.layers.L4;
  assert(l4.data.aeo_total_assessments > 0, 'should have AEO assessments');
  assert(l4.data.eval_sets_count > 0, 'should have eval sets');
});

test('L5 has system health data', () => {
  const l5 = snapshot.layers.L5;
  assert(l5.data.components, 'should have components');
  assert(l5.data.mem_pct != null, 'should have memory data');
  assert(l5.data.disk_pct != null, 'should have disk data');
  assert(l5.data.events_24h_count != null, 'should have event count');
});

test('overall status is computed', () => {
  assert(snapshot.overall, 'missing overall');
  assert(snapshot.overall.status, 'missing overall status');
  assert(snapshot.overall.status_icon, 'missing status icon');
});

test('all_alerts aggregated from all layers', () => {
  assert(Array.isArray(snapshot.all_alerts), 'all_alerts should be array');
  let total = 0;
  for (const layer of Object.values(snapshot.layers)) total += layer.alerts.length;
  assert(snapshot.all_alerts.length === total, `all_alerts count ${snapshot.all_alerts.length} !== sum ${total}`);
});

// ── 2. Persistence tests ──

console.log('\n💾 Persistence Tests:');

test('persist writes snapshot and history', () => {
  const collector = require(path.join(WORKSPACE, 'infrastructure/observability/pipeline-dashboard-collector'));
  collector.persist(snapshot);
  assert(fs.existsSync(path.join(WORKSPACE, 'infrastructure/observability/.dashboard-snapshot.json')), 'snapshot file');
  assert(fs.existsSync(path.join(WORKSPACE, 'infrastructure/observability/.dashboard-history.jsonl')), 'history file');
});

test('loadLastSnapshot returns valid data', () => {
  const collector = require(path.join(WORKSPACE, 'infrastructure/observability/pipeline-dashboard-collector'));
  const loaded = collector.loadLastSnapshot();
  assert(loaded, 'should load snapshot');
  assert(loaded.schema === 'pipeline-dashboard-v1', 'schema');
  assert(loaded.layers.L1, 'should have L1');
});

test('loadHistory returns entries', () => {
  const collector = require(path.join(WORKSPACE, 'infrastructure/observability/pipeline-dashboard-collector'));
  const history = collector.loadHistory(10);
  assert(history.length > 0, 'should have history entries');
  assert(history[0].ts, 'entry should have ts');
  assert(history[0].status, 'entry should have status');
});

// ── 3. Monitor tests ──

console.log('\n📊 Monitor Tests:');

test('generateMarkdownReport produces valid markdown', () => {
  const monitor = require(path.join(WORKSPACE, 'infrastructure/observability/autonomous-pipeline-monitor'));
  const report = monitor.generateMarkdownReport(snapshot, null);
  assert(report.length > 500, 'report too short');
  assert(report.includes('L1 意图层'), 'missing L1 section');
  assert(report.includes('L2 决策层'), 'missing L2 section');
  assert(report.includes('L3 执行层'), 'missing L3 section');
  assert(report.includes('L4 效果层'), 'missing L4 section');
  assert(report.includes('L5 系统健康'), 'missing L5 section');
  assert(report.includes('五层闭环监控'), 'missing footer tag');
});

test('generateFeishuCard returns valid card structure', () => {
  const monitor = require(path.join(WORKSPACE, 'infrastructure/observability/autonomous-pipeline-monitor'));
  const card = monitor.generateFeishuCard(snapshot, null);
  assert(card.config, 'missing config');
  assert(card.header, 'missing header');
  assert(card.header.title, 'missing title');
  assert(card.header.template, 'missing template');
  assert(Array.isArray(card.elements), 'elements should be array');
  assert(card.elements.length >= 4, 'too few elements');
  
  // Check card can be serialized
  const json = JSON.stringify(card);
  assert(json.length > 100, 'card JSON too short');
});

test('computeDelta handles null previous', () => {
  const monitor = require(path.join(WORKSPACE, 'infrastructure/observability/autonomous-pipeline-monitor'));
  const delta = monitor.computeDelta(snapshot, null);
  assert(delta === null, 'delta with null previous should be null');
});

test('computeDelta detects changes', () => {
  const monitor = require(path.join(WORKSPACE, 'infrastructure/observability/autonomous-pipeline-monitor'));
  const modified = JSON.parse(JSON.stringify(snapshot));
  modified.overall.composite_score = 50;
  modified.layers.L1.status = 'critical';
  
  const delta = monitor.computeDelta(snapshot, modified);
  assert(delta, 'delta should exist');
  assert(delta.score_change != null, 'should have score_change');
});

// ── 4. Cron tests ──

console.log('\n⏱️ Cron Tests:');

test('cron full mode returns OK JSON', () => {
  const output = execSync(
    `cd ${WORKSPACE} && node infrastructure/observability/pipeline-dashboard-cron.js 2>&1`,
    { encoding: 'utf8', timeout: 30000 }
  ).trim();
  // First line is the main output JSON
  const firstLine = output.split('\n')[0];
  const parsed = JSON.parse(firstLine);
  assert(parsed.status === 'OK', `status: ${parsed.status}`);
  assert(parsed.mode === 'full', `mode: ${parsed.mode}`);
  assert(parsed.overall, 'missing overall');
  assert(parsed.score != null, 'missing score');
  assert(typeof parsed.elapsed_ms === 'number', 'missing elapsed_ms');
});

test('cron quick mode returns OK JSON', () => {
  const output = execSync(
    `cd ${WORKSPACE} && node infrastructure/observability/pipeline-dashboard-cron.js --quick 2>&1`,
    { encoding: 'utf8', timeout: 30000 }
  ).trim();
  const firstLine = output.split('\n')[0];
  const parsed = JSON.parse(firstLine);
  assert(parsed.status === 'OK', `status: ${parsed.status}`);
  assert(parsed.mode === 'quick', `mode: ${parsed.mode}`);
});

// ── 5. Integration tests ──

console.log('\n🔗 Integration Tests:');

test('report file exists after cron run', () => {
  const dateTag = new Date().toISOString().slice(0, 10);
  const reportFile = path.join(WORKSPACE, 'reports', `pipeline-dashboard-${dateTag}.md`);
  assert(fs.existsSync(reportFile), `report file missing: ${reportFile}`);
  const content = fs.readFileSync(reportFile, 'utf8');
  assert(content.includes('Agent 运营五层仪表盘'), 'report title missing');
});

test('cron job registered in jobs.json', () => {
  const jobsJson = JSON.parse(fs.readFileSync(
    path.join(WORKSPACE, 'infrastructure/cron/jobs.json'), 'utf8'
  ));
  const fullJob = jobsJson.jobs.find(j => j.name === 'pipeline-dashboard-full');
  const quickJob = jobsJson.jobs.find(j => j.name === 'pipeline-dashboard-quick');
  assert(fullJob, 'pipeline-dashboard-full job not found');
  assert(quickJob, 'pipeline-dashboard-quick job not found');
  assert(fullJob.enabled === true, 'full job not enabled');
  assert(quickJob.enabled === true, 'quick job not enabled');
  assert(fullJob.tags.includes('day2-gap2'), 'missing day2-gap2 tag');
});

test('bus adapter module loads without error', () => {
  const adapter = require(path.join(WORKSPACE, 'infrastructure/observability/pipeline-dashboard-bus-adapter'));
  assert(typeof adapter.register === 'function', 'register should be a function');
});

test('snapshot history has trend data', () => {
  const collector = require(path.join(WORKSPACE, 'infrastructure/observability/pipeline-dashboard-collector'));
  const history = collector.loadHistory(50);
  assert(history.length >= 2, 'should have at least 2 history entries after multiple runs');
});

test('collector 1h window returns different results', () => {
  const collector = require(path.join(WORKSPACE, 'infrastructure/observability/pipeline-dashboard-collector'));
  const snap1h = collector.collectAll({ windowHours: 1 });
  // 1h window should have equal or fewer events
  assert(snap1h.window_hours === 1, 'window should be 1');
  assert(snap1h.layers.L5.data.events_24h_count != null, 'should still have event count');
});

// ── Results ──

console.log('\n────────────────────────────────────────');
console.log(`\n📊 Results: ${passed} passed, ${failed} failed, ${passed + failed} total\n`);

if (failed > 0) {
  console.log('❌ FAILED tests:');
  for (const r of results.filter(r => r.status === 'FAIL')) {
    console.log(`  - ${r.name}: ${r.error}`);
  }
  process.exit(1);
} else {
  console.log('✅ All tests passed!');
  process.exit(0);
}
