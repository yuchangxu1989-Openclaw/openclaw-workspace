#!/usr/bin/env node
/**
 * L3 Pipeline Cron Entry Point
 * 
 * 功能：CRAS快通道 - 每5分钟执行一次L3意图识别闭环
 * 调度：every 5 minutes (cron: star/5 * * * *)
 * 
 * 退出码：
 *   0 = 正常完成
 *   1 = 执行异常
 *   2 = 超时强制退出
 *   3 = pipeline模块未就绪
 */

'use strict';

const TIMEOUT_MS = 60_000; // 60秒超时保护
const PIPELINE_PATH = '../infrastructure/pipeline/l3-pipeline';

// ── 超时保护 ──
const timeoutTimer = setTimeout(() => {
  console.error(JSON.stringify({
    status: 'TIMEOUT',
    message: `L3 pipeline exceeded ${TIMEOUT_MS / 1000}s limit, force exit`,
    timestamp: new Date().toISOString(),
  }));
  process.exit(2);
}, TIMEOUT_MS);
timeoutTimer.unref(); // 不阻止正常退出

// ── 主执行逻辑 ──
async function main() {
  const startTime = Date.now();

  // 1. 加载pipeline模块
  let pipeline;
  try {
    pipeline = require(PIPELINE_PATH);
  } catch (err) {
    // pipeline模块尚未完成，输出占位摘要
    console.log(JSON.stringify({
      status: 'SKIPPED',
      reason: 'pipeline_not_ready',
      message: `L3 pipeline module not found at ${PIPELINE_PATH}. Waiting for implementation.`,
      error: err.message,
      timestamp: new Date().toISOString(),
    }));
    process.exit(3);
  }

  // 2. 检测pipeline导出的run方法
  const runFn = pipeline.run || pipeline.execute || pipeline.default?.run || pipeline.default;
  if (typeof runFn !== 'function') {
    console.error(JSON.stringify({
      status: 'ERROR',
      reason: 'no_run_method',
      message: 'L3 pipeline module does not export a callable run/execute function',
      exports: Object.keys(pipeline),
      timestamp: new Date().toISOString(),
    }));
    process.exit(1);
  }

  // 3. 执行单次run
  try {
    const result = await runFn({ source: 'cron', trigger: 'scheduled-5min' });

    const elapsed = Date.now() - startTime;

    // 4. 输出执行摘要
    console.log(JSON.stringify({
      status: 'OK',
      elapsed_ms: elapsed,
      result: result ?? null,
      timestamp: new Date().toISOString(),
    }));

    process.exit(0);
  } catch (err) {
    const elapsed = Date.now() - startTime;

    console.error(JSON.stringify({
      status: 'ERROR',
      reason: 'execution_failed',
      message: err.message,
      stack: err.stack?.split('\n').slice(0, 5),
      elapsed_ms: elapsed,
      timestamp: new Date().toISOString(),
    }));

    process.exit(1);
  }
}

// ── 未捕获异常兜底 ──
process.on('uncaughtException', (err) => {
  console.error(JSON.stringify({
    status: 'FATAL',
    reason: 'uncaught_exception',
    message: err.message,
    timestamp: new Date().toISOString(),
  }));
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error(JSON.stringify({
    status: 'FATAL',
    reason: 'unhandled_rejection',
    message: String(reason),
    timestamp: new Date().toISOString(),
  }));
  process.exit(1);
});

main();
