#!/usr/bin/env node
/**
 * self-check-scanners — 系统自省扫描器统一入口
 * 
 * 收编5个自省脚本，提供统一CLI：
 *   node index.js --all          运行全部扫描器
 *   node index.js --scanner <name>  运行单个扫描器
 *   node index.js --list         列出可用扫描器
 *
 * 扫描器清单：
 *   unknown-unknowns   认知盲区扫描（意图no-match、链路缺失、handler缺失）
 *   rework             返工分析（子Agent重启/steer根因）
 *   day-completion     Day完成度扫描（TODO/FIXME、配置一致性、事件对齐）
 *   correction-harvest 纠偏采集（用户纠偏信号→规则草案）
 *   detect-correction  纠偏语义检测探针（LLM few-shot判断）
 */
const { execSync } = require('child_process');
const path = require('path');

const SCRIPTS_DIR = path.join(__dirname, 'scripts');

const SCANNERS = {
  'unknown-unknowns': {
    file: 'unknown-unknowns-scanner.js',
    desc: '认知盲区扫描 — 意图no-match率、全链路缺失率、handler缺失、告警响应率、评测覆盖差距'
  },
  'rework': {
    file: 'rework-analyzer.js',
    desc: '返工分析 — 子Agent被steer/重启时分析根因，追加到ISC规则或编排规则'
  },
  'day-completion': {
    file: 'day-completion-scanner.js',
    desc: 'Day完成度扫描 — TODO/FIXME债务、配置一致性、事件producer/consumer对齐'
  },
  'correction-harvest': {
    file: 'correction-harvester.js',
    desc: '纠偏采集 — 检测用户纠偏信号，提取内容→抽象规则草案→待review队列'
  },
  'detect-correction': {
    file: 'detect-user-correction.js',
    desc: '纠偏语义检测探针 — LLM few-shot判断用户消息是否包含纠偏语义'
  }
};

function listScanners() {
  console.log('📋 可用扫描器：\n');
  for (const [name, info] of Object.entries(SCANNERS)) {
    console.log(`  ${name.padEnd(22)} ${info.desc}`);
  }
  console.log(`\n共 ${Object.keys(SCANNERS).length} 个扫描器`);
}

function runScanner(name, extraArgs = []) {
  const scanner = SCANNERS[name];
  if (!scanner) {
    console.error(`❌ 未知扫描器: ${name}`);
    console.error(`可用: ${Object.keys(SCANNERS).join(', ')}`);
    process.exit(1);
  }

  const scriptPath = path.join(SCRIPTS_DIR, scanner.file);
  const args = extraArgs.length ? ' ' + extraArgs.join(' ') : '';
  console.log(`\n🔍 运行 [${name}] ${scanner.desc}`);
  console.log(`   → node ${scanner.file}${args}\n`);

  try {
    const output = execSync(`node "${scriptPath}"${args}`, {
      cwd: SCRIPTS_DIR,
      stdio: 'inherit',
      timeout: 120_000
    });
  } catch (err) {
    console.error(`\n⚠️  扫描器 [${name}] 退出码: ${err.status || 'unknown'}`);
    return false;
  }
  return true;
}

function runAll(extraArgs = []) {
  console.log('🚀 运行全部扫描器...\n' + '='.repeat(60));
  const results = {};
  for (const name of Object.keys(SCANNERS)) {
    // detect-correction 需要输入参数，跳过batch模式
    if (name === 'detect-correction') {
      console.log(`\n⏭️  跳过 [detect-correction]（需要消息输入参数，不适合batch运行）`);
      results[name] = 'skipped';
      continue;
    }
    results[name] = runScanner(name, extraArgs) ? 'ok' : 'error';
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 汇总：');
  for (const [name, status] of Object.entries(results)) {
    const icon = status === 'ok' ? '✅' : status === 'skipped' ? '⏭️' : '❌';
    console.log(`  ${icon} ${name}: ${status}`);
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);

if (args.includes('--list') || args.includes('-l')) {
  listScanners();
} else if (args.includes('--all') || args.includes('-a')) {
  const extra = args.filter(a => a !== '--all' && a !== '-a');
  runAll(extra);
} else if (args.includes('--scanner') || args.includes('-s')) {
  const idx = args.indexOf('--scanner') !== -1 ? args.indexOf('--scanner') : args.indexOf('-s');
  const name = args[idx + 1];
  if (!name) {
    console.error('用法: node index.js --scanner <name>');
    process.exit(1);
  }
  const extra = args.filter((a, i) => i !== idx && i !== idx + 1);
  runScanner(name, extra);
} else if (args.length === 0) {
  console.log('self-check-scanners — 系统自省扫描器统一入口\n');
  console.log('用法:');
  console.log('  node index.js --list              列出可用扫描器');
  console.log('  node index.js --all               运行全部扫描器');
  console.log('  node index.js --scanner <name>    运行单个扫描器');
  console.log('  node index.js --scanner <name> [额外参数...]');
} else {
  // 如果第一个参数是扫描器名，直接运行
  if (SCANNERS[args[0]]) {
    runScanner(args[0], args.slice(1));
  } else {
    console.error(`未知参数: ${args[0]}`);
    console.error('用 --list 查看可用扫描器');
    process.exit(1);
  }
}
