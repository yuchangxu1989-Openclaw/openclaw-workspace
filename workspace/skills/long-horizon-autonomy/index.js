#!/usr/bin/env node
/**
 * long-horizon-autonomy 统一入口
 * 子命令模式：--action research|evolution|hygiene
 *
 * 三子系统：
 *   research   — 研究信号采集（research-signal-harvester, directed-research-harvester, theory-to-rule-pipeline）
 *   evolution  — 演化指标追踪（capability-growth-tracker, entropy-index-calculator, evolution-checkpoint-audit, weekly-evolution-report）
 *   hygiene    — 系统卫生清理（dead-skill-detector, orphaned-task-scanner, stale-backlog-pruner, log-archive-rotator）
 */

const { execSync } = require('child_process');
const path = require('path');

const SKILL_DIR = __dirname;

const SUBSYSTEMS = {
  research: [
    { file: 'research-signal-harvester.js', runtime: 'node', desc: '公开研究信号日报采集' },
    { file: 'directed-research-harvester.js', runtime: 'node', desc: '定向学术课题探针' },
    { file: 'theory-to-rule-pipeline.js', runtime: 'node', desc: '研究信号→ISC规则草稿转化' },
  ],
  evolution: [
    { file: 'capability-growth-tracker.js', runtime: 'node', desc: '能力增长指数追踪' },
    { file: 'entropy-index-calculator.sh', runtime: 'bash', desc: '系统熵值/有序度计算' },
    { file: 'evolution-checkpoint-audit.js', runtime: 'node', desc: '进化检查点审计' },
    { file: 'weekly-evolution-report.sh', runtime: 'bash', desc: '进化周报生成' },
  ],
  hygiene: [
    { file: 'dead-skill-detector.sh', runtime: 'bash', desc: '死亡技能检测' },
    { file: 'orphaned-task-scanner.sh', runtime: 'bash', desc: '孤儿任务扫描' },
    { file: 'stale-backlog-pruner.sh', runtime: 'bash', desc: '陈旧backlog清理' },
    { file: 'log-archive-rotator.sh', runtime: 'bash', desc: '日志归档轮转' },
  ],
};

function usage() {
  console.log('Usage: node index.js --action <research|evolution|hygiene> [--dry-run]');
  console.log('');
  Object.entries(SUBSYSTEMS).forEach(([name, scripts]) => {
    console.log(`  ${name}:`);
    scripts.forEach(s => console.log(`    - ${s.file} — ${s.desc}`));
  });
  process.exit(1);
}

// 解析参数
const args = process.argv.slice(2);
const actionIdx = args.indexOf('--action');
if (actionIdx === -1 || !args[actionIdx + 1]) usage();

const action = args[actionIdx + 1];
const dryRun = args.includes('--dry-run');

if (!SUBSYSTEMS[action]) {
  console.error(`Unknown action: ${action}`);
  console.error(`Valid actions: ${Object.keys(SUBSYSTEMS).join(', ')}`);
  process.exit(1);
}

const scripts = SUBSYSTEMS[action];
console.log(`[long-horizon-autonomy] Running subsystem: ${action} (${scripts.length} scripts)${dryRun ? ' [DRY-RUN]' : ''}`);

let passed = 0;
let failed = 0;

scripts.forEach(s => {
  const filePath = path.join(SKILL_DIR, s.file);
  const cmd = s.runtime === 'node' ? `node "${filePath}"` : `bash "${filePath}"`;

  if (dryRun) {
    console.log(`  [dry-run] would execute: ${cmd}`);
    passed++;
    return;
  }

  try {
    console.log(`  [run] ${s.file} — ${s.desc}`);
    const output = execSync(cmd, { encoding: 'utf8', timeout: 120000, cwd: SKILL_DIR });
    if (output.trim()) console.log(`    ${output.trim()}`);
    passed++;
  } catch (e) {
    console.error(`  [FAIL] ${s.file}: ${e.message.split('\n')[0]}`);
    failed++;
  }
});

console.log(`[long-horizon-autonomy] ${action} done: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
