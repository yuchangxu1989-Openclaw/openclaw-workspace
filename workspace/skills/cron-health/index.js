#!/usr/bin/env node
'use strict';

/**
 * cron-health — Cron全生命周期技能统一入口
 *
 * Usage:
 *   node index.js --action heal         # 自动修复cron配置
 *   node index.js --action slo-check    # cron空转SLO检测
 *   node index.js --action smoke-test   # 回归冒烟测试
 *   node index.js --action all          # 依次执行全部
 */

const { execFileSync, execSync } = require('child_process');
const path = require('path');

const SCRIPTS_DIR = path.join(__dirname, 'scripts');

const ACTIONS = {
  'heal': {
    desc: 'Cron配置自动修复',
    run: () => execFileSync('node', [path.join(SCRIPTS_DIR, 'cron-healer.js')], { stdio: 'inherit' }),
  },
  'slo-check': {
    desc: 'Cron空转SLO检测',
    run: () => execFileSync('bash', [path.join(SCRIPTS_DIR, 'cron-idle-slo-checker.sh')], { stdio: 'inherit' }),
  },
  'smoke-test': {
    desc: 'Cron回归冒烟测试',
    run: () => execFileSync('bash', [path.join(SCRIPTS_DIR, 'cron-regression-smoke.sh')], { stdio: 'inherit' }),
  },
};

function printUsage() {
  console.log('Usage: node index.js --action <heal|slo-check|smoke-test|all>\n');
  console.log('Actions:');
  for (const [name, { desc }] of Object.entries(ACTIONS)) {
    console.log(`  ${name.padEnd(14)} ${desc}`);
  }
  console.log(`  ${'all'.padEnd(14)} 依次执行全部（heal → slo-check → smoke-test）`);
}

function main() {
  const args = process.argv.slice(2);
  const actionIdx = args.indexOf('--action');
  if (actionIdx === -1 || !args[actionIdx + 1]) {
    printUsage();
    process.exit(1);
  }

  const action = args[actionIdx + 1];

  if (action === 'all') {
    let exitCode = 0;
    for (const [name, { desc, run }] of Object.entries(ACTIONS)) {
      console.log(`\n${'═'.repeat(60)}`);
      console.log(`▶ [${name}] ${desc}`);
      console.log('═'.repeat(60));
      try {
        run();
        console.log(`✅ ${name} 完成`);
      } catch (err) {
        console.error(`❌ ${name} 失败 (exit=${err.status || 1})`);
        exitCode = 1;
      }
    }
    process.exit(exitCode);
  }

  if (!ACTIONS[action]) {
    console.error(`Unknown action: ${action}`);
    printUsage();
    process.exit(1);
  }

  console.log(`▶ [${action}] ${ACTIONS[action].desc}`);
  try {
    ACTIONS[action].run();
    console.log(`✅ ${action} 完成`);
  } catch (err) {
    console.error(`❌ ${action} 失败 (exit=${err.status || 1})`);
    process.exit(err.status || 1);
  }
}

main();
