'use strict';

/**
 * vector-service v2.0.0 — 统一语义向量服务入口
 *
 * 三大动作：
 *   vectorize    向量化（增量/全量/检查缺失/清理孤儿）
 *   search       语义搜索
 *   maintenance  向量维护（清理+修复+报告）
 *
 * CLI: node index.js --action vectorize|search|maintenance [options]
 */

const { execSync } = require('child_process');
const path = require('path');

const SERVICE_DIR = path.resolve(__dirname, '../../infrastructure/vector-service');
const VECTORIZE_SH = path.join(SERVICE_DIR, 'vectorize.sh');
const SEARCH_SH = path.join(SERVICE_DIR, 'search.sh');
const MAINTENANCE_SH = path.join(SERVICE_DIR, 'vector-maintenance.sh');

// ─── CLI参数解析 ───

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    if (key.startsWith('--')) {
      const name = key.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        args[name] = true;
      } else {
        args[name] = next;
        i++;
      }
    }
  }
  return args;
}

// ─── Shell执行 ───

function sh(cmd, opts = {}) {
  try {
    return execSync(cmd, {
      encoding: 'utf8',
      timeout: opts.timeout || 300000,
      cwd: opts.cwd || SERVICE_DIR,
      stdio: opts.silent ? 'pipe' : 'inherit',
    });
  } catch (e) {
    if (opts.silent) return e.stdout || '';
    throw e;
  }
}

// ─── 动作：vectorize ───

function doVectorize(opts) {
  const flags = [];
  if (opts.continuous) flags.push('--continuous');
  if (opts['check-missing']) flags.push('--check-missing');
  if (opts['auto-fix']) flags.push('--auto-fix');
  if (opts['cleanup-orphans']) flags.push('--cleanup-orphans');
  if (opts['dry-run'] === 'false') flags.push('--dry-run false');
  if (opts.type) flags.push('--type', opts.type);

  const cmd = `bash "${VECTORIZE_SH}" ${flags.join(' ')}`;
  console.log(`[vector-service] vectorize: ${cmd}`);
  sh(cmd);
  return { ok: true, action: 'vectorize', flags };
}

// ─── 动作：search ───

function doSearch(opts) {
  const query = opts.query;
  if (!query) {
    console.error('[vector-service] search 需要 --query 参数');
    return { ok: false, error: 'missing --query' };
  }
  const topK = opts['top-k'] || opts.topK || '5';
  const type = opts.type || 'all';

  const cmd = `bash "${SEARCH_SH}" "${query.replace(/"/g, '\\"')}" ${topK} ${type}`;
  console.log(`[vector-service] search: ${cmd}`);
  sh(cmd);
  return { ok: true, action: 'search', query, topK, type };
}

// ─── 动作：maintenance ───

function doMaintenance() {
  const cmd = `bash "${MAINTENANCE_SH}"`;
  console.log(`[vector-service] maintenance: ${cmd}`);
  sh(cmd);
  return { ok: true, action: 'maintenance' };
}

// ─── 统一入口 ───

async function run(input) {
  const action = (input && input.action) || 'vectorize';

  switch (action) {
    case 'vectorize':
      return doVectorize(input);
    case 'search':
      return doSearch(input);
    case 'maintenance':
      return doMaintenance();
    default:
      console.error(`[vector-service] 未知动作: ${action}`);
      console.error('  可用动作: vectorize | search | maintenance');
      return { ok: false, error: `unknown action: ${action}` };
  }
}

// ─── CLI模式 ───

if (require.main === module) {
  const args = parseArgs(process.argv);
  run(args).then(result => {
    if (!result.ok) process.exit(1);
  }).catch(e => {
    console.error('[vector-service] 执行失败:', e.message);
    process.exit(1);
  });
}

module.exports = run;
module.exports.run = run;
