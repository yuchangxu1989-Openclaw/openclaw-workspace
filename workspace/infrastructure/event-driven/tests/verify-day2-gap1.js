#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const jobsPath = path.join(ROOT, 'infrastructure/cron/jobs.json');
const routesPath = path.join(ROOT, 'infrastructure/dispatcher/routes.json');
const bridgePath = path.join(ROOT, 'infrastructure/event-bus/cron-event-bridge-runner.js');
const handlerLog = path.join(ROOT, 'infrastructure/logs/cron-job-requested-handler.jsonl');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`✅ ${name}`);
  } catch (e) {
    failed++;
    console.log(`❌ ${name}: ${e.message}`);
  }
}

console.log('\n🧪 Day2 Gap1 - 定时任务事件驱动化重塑 验证\n');

const jobs = JSON.parse(fs.readFileSync(jobsPath, 'utf8'));
const routes = JSON.parse(fs.readFileSync(routesPath, 'utf8'));

test('jobs.json 已声明事件驱动重塑元数据', () => {
  assert.ok(jobs._event_driven_refactor);
  assert.strictEqual(jobs._event_driven_refactor.primary_event, 'cron.job.requested');
});

test('所有启用 cron job 已桥接到 cron.job.requested', () => {
  for (const job of jobs.jobs || []) {
    if (job.enabled === false) continue;
    assert.strictEqual(job.bridge_event, 'cron.job.requested', `job ${job.name}`);
    assert.strictEqual(job.bridge_runner, 'infrastructure/event-bus/cron-event-bridge-runner.js', `job ${job.name}`);
    assert.strictEqual(job.time_schedule, job.schedule, `job ${job.name}`);
  }
});

test('dispatcher routes 已注册 cron.job.requested handler', () => {
  assert.ok(routes['cron.job.requested']);
  assert.strictEqual(routes['cron.job.requested'].handler, 'cron-job-requested');
});

test('bridge runner --list 可列出可桥接作业', () => {
  const out = execSync(`node "${bridgePath}" --list`, { cwd: ROOT, encoding: 'utf8' });
  const parsed = JSON.parse(out);
  assert.strictEqual(parsed.status, 'OK');
  assert.ok(parsed.count >= 1);
});

test('bridge runner --emit-only 可成功发射请求事件', () => {
  const out = execSync(`node "${bridgePath}" --job system-health-l3 --emit-only`, { cwd: ROOT, encoding: 'utf8' });
  const parsed = JSON.parse(out);
  assert.strictEqual(parsed.status, 'OK');
  assert.strictEqual(parsed.count, 1);
  assert.ok(parsed.results[0].emitted);
});

test('handler 日志文件已生成接入记录', () => {
  assert.ok(fs.existsSync(handlerLog), 'handler log should exist');
  const content = fs.readFileSync(handlerLog, 'utf8').trim();
  assert.ok(content.length > 0, 'handler log should not be empty');
});

console.log(`\n通过: ${passed} | 失败: ${failed}\n`);
process.exit(failed > 0 ? 1 : 0);
