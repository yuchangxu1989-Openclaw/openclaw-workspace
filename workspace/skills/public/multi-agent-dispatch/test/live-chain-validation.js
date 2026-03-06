#!/usr/bin/env node
'use strict';

/**
 * live-chain-validation.js
 * ────────────────────────
 * Real end-to-end chain validation against production state files.
 * 
 * Tests the complete chain:
 *   1. Enqueue → immediate dispatch
 *   2. Running confirmation
 *   3. Slot freed → backfill
 *   4. Report trigger → text + card output
 *   5. 0-active → completed/risks/decisions report
 *   6. Cleanup test tasks afterward
 */

const fs = require('fs');
const path = require('path');

const { DispatchEngine } = require('../dispatch-engine');
// Integration test: requires sibling reporting skill (peer dependency)
let ReportTrigger;
try { ({ ReportTrigger } = require('../../multi-agent-reporting/report-trigger')); }
catch { console.error('multi-agent-reporting not found — skipping'); process.exit(0); }
const { onDispatchBridge, getPendingTasks, clearPending } = require('../dispatch-bridge');

const REPORT_OUTPUT = path.join(__dirname, '..', 'state', 'live-validation-report.json');

function main() {
  console.log('🔗 Live Chain Validation\n');
  const results = { tests: [], reports: [], timestamp: new Date().toISOString() };
  let passed = 0, failed = 0;

  function check(cond, name) {
    if (cond) { passed++; results.tests.push({ name, ok: true }); console.log(`  ✅ ${name}`); }
    else { failed++; results.tests.push({ name, ok: false }); console.log(`  ❌ ${name}`); }
  }

  // Initialize engine with production state
  const engine = new DispatchEngine({
    maxSlots: 19,
    onDispatch: onDispatchBridge,
  });

  // Initialize reporting trigger
  const reportHistory = [];
  const trigger = new ReportTrigger(engine, {
    agentRegistry: {
      main: '战略家', analyst: '洞察分析师', coder: '开发工程师',
      writer: '创作大师', researcher: '系统架构师', reviewer: '质量仲裁官',
    },
    onReport: (report) => reportHistory.push({
      ts: new Date().toISOString(),
      event: report.event,
      title: report.title,
      statsSnapshot: { ...report.stats },
      textPreview: report.text.slice(0, 200),
    }),
  });

  // ── Chain 1: Enqueue → Dispatch → Report ────────────────────────────────
  console.log('Chain 1: Enqueue → Dispatch → Report');
  clearPending();

  const t1 = engine.enqueue({
    title: '验证-调度引擎激活',
    agentId: 'coder',
    model: 'boom-coder/gpt-5.4',
    priority: 'high',
    source: 'live-validation',
    tags: ['validation', 'test'],
  });

  check(t1.taskId, 'task created with ID');
  check(engine._load().spawning[t1.taskId] !== undefined, 'task in spawning (instant dispatch)');
  check(reportHistory.length >= 1, 'report triggered on enqueue');

  const pending = getPendingTasks();
  check(pending.some(p => p.taskId === t1.taskId), 'bridge recorded pending dispatch');

  // ── Chain 2: Running Confirmation ───────────────────────────────────────
  console.log('\nChain 2: Running Confirmation');
  engine.markRunning(t1.taskId, { sessionKey: 'agent:coder:subagent:test-abc' });
  check(engine._load().running[t1.taskId] !== undefined, 'task in running');
  check(reportHistory.some(r => r.event === 'running'), 'running report triggered');

  // ── Chain 3: Slot Fill + Queue + Backfill ───────────────────────────────
  console.log('\nChain 3: Fill Slots → Queue → Backfill');
  
  // Fill remaining 18 slots
  const fillTasks = [];
  for (let i = 0; i < 18; i++) {
    fillTasks.push(engine.enqueue({
      title: `填充任务-${i + 1}`,
      agentId: ['coder', 'writer', 'analyst', 'researcher'][i % 4],
      model: 'boom-coder/gpt-5.4',
      source: 'live-validation',
      tags: ['validation', 'fill'],
    }));
  }
  check(engine.busyCount() === 19, `19 slots occupied (actual: ${engine.busyCount()})`);
  check(engine.freeSlots() === 0, '0 free slots');

  // Queue one more
  const overflow = engine.enqueue({
    title: '溢出待补位任务',
    agentId: 'reviewer',
    model: 'claude-opus-4-20250514',
    priority: 'critical',
    source: 'live-validation',
  });
  check(engine.queueDepth() >= 1, `queue has ${engine.queueDepth()} task(s)`);

  // Free a slot → should backfill
  engine.markDone(t1.taskId, { result: 'validation ok' });
  check(engine.busyCount() === 19, 'backfilled: still 19 busy');
  check(engine._load().spawning[overflow.taskId] !== undefined || engine._load().running[overflow.taskId] !== undefined, 'overflow task dispatched (backfill)');

  // ── Chain 4: Complete All → 0-Active Report ─────────────────────────────
  console.log('\nChain 4: Complete All → 0-Active Report');

  // Mark everything done
  const allActive = [...Object.keys(engine._load().spawning), ...Object.keys(engine._load().running)];
  for (const tid of allActive) {
    try { engine.markRunning(tid); } catch {} // may already be running
    try { engine.markDone(tid, { result: 'validated' }); } catch {}
  }

  const finalReport = trigger.buildReport('validation-complete');
  check(finalReport.stats.active === 0, '0 active after complete-all');
  check(finalReport.text.includes('新完成'), 'final report has completed section');
  check(finalReport.card.header.template === 'green' || finalReport.card.header.template === 'grey',
    `card color: ${finalReport.card.header.template} (expected green/grey)`);

  // ── Chain 5: Failed Task → Risk in Report ───────────────────────────────
  console.log('\nChain 5: Failed Task → Risk in Report');
  const failTask = engine.enqueue({
    title: '故意失败测试',
    agentId: 'writer',
    source: 'live-validation',
  });
  engine.markRunning(failTask.taskId);
  engine.markFailed(failTask.taskId, { error: '模拟超时失败' });

  const riskReport = trigger.buildReport('risk-test');
  check(riskReport.text.includes('关键风险') || riskReport.text.includes('失败'), 'risk report contains risk section');
  check(riskReport.stats.blocked >= 1, `blocked count: ${riskReport.stats.blocked}`);

  // ── Cleanup: reset to clean state ──────────────────────────────────────
  console.log('\nCleanup');
  engine.reset();
  clearPending();
  check(engine.busyCount() === 0, 'engine reset to clean state');

  // ── Final Summary ──────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════');
  console.log(`  Live Chain: ${passed} passed, ${failed} failed`);
  console.log(`  Reports generated: ${reportHistory.length}`);
  console.log('══════════════════════════════════════════════════\n');

  // Sample report outputs
  results.passed = passed;
  results.failed = failed;
  results.totalReports = reportHistory.length;
  results.reports = reportHistory.slice(-3);
  results.sampleReport = {
    text: trigger.buildReport('final-sample').text,
    card: trigger.buildReport('final-sample').card,
  };

  fs.writeFileSync(REPORT_OUTPUT, JSON.stringify(results, null, 2));
  console.log(`📝 Results: ${REPORT_OUTPUT}`);

  trigger.detach();
  return { passed, failed };
}

const { passed, failed } = main();
process.exit(failed > 0 ? 1 : 0);
