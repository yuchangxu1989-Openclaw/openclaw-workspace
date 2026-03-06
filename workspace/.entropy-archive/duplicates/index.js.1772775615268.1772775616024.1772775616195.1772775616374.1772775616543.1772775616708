/**
 * 并行子代理执行器 v3.1 - publishable 版本
 *
 * 设计目标:
 * 1) 不依赖 OpenClaw 内部绝对/相对路径
 * 2) sessions 模块可选依赖，支持注入与动态加载
 * 3) 提供通用接口，可在不同宿主环境复用
 */

/**
 * 创建并行子代理执行器
 * @param {Object} [options]
 * @param {Object} [options.sessionsApi] - 注入的 sessions API（推荐）
 * @param {Function} [options.sessionsApi.sessions_spawn] - 会话创建函数
 * @param {string} [options.sessionsModule] - 可选模块名/路径（如 openclaw-sessions）
 */
function createParallelSubagentExecutor(options = {}) {
  const sessionsApi = resolveSessionsApi(options);

  async function runParallel(tasks = [], runtimeOptions = {}) {
    if (!Array.isArray(tasks)) throw new TypeError('tasks 必须是数组');

    const concurrency = Number.isInteger(runtimeOptions.concurrency) && runtimeOptions.concurrency > 0
      ? runtimeOptions.concurrency
      : 5;

    const results = new Array(tasks.length);
    let cursor = 0;

    async function worker() {
      while (true) {
        const i = cursor++;
        if (i >= tasks.length) break;
        const task = tasks[i] || {};

        try {
          if (typeof task === 'string') {
            results[i] = await sessionsApi.sessions_spawn({ task });
          } else {
            results[i] = await sessionsApi.sessions_spawn(task);
          }
        } catch (error) {
          results[i] = {
            ok: false,
            error: error?.message || String(error),
            task
          };
        }
      }
    }

    const workers = Array.from({ length: Math.min(concurrency, Math.max(tasks.length, 1)) }, () => worker());
    await Promise.all(workers);

    return {
      ok: true,
      total: tasks.length,
      success: results.filter(r => r && r.ok !== false).length,
      failed: results.filter(r => r && r.ok === false).length,
      results
    };
  }

  return {
    runParallel,
    run: runParallel,
    sessionsApi
  };
}

/**
 * 动态解析 sessions API
 * 解析优先级：
 * 1) options.sessionsApi 注入
 * 2) options.sessionsModule / env OPENCLAW_SESSIONS_MODULE 指定模块
 * 3) 常规模块名 openclaw-sessions（可选依赖）
 */
function resolveSessionsApi(options = {}) {
  if (options.sessionsApi && typeof options.sessionsApi.sessions_spawn === 'function') {
    return options.sessionsApi;
  }

  const moduleName = options.sessionsModule || process.env.OPENCLAW_SESSIONS_MODULE || 'openclaw-sessions';

  try {
    const mod = require(moduleName);
    if (mod && typeof mod.sessions_spawn === 'function') return mod;
  } catch (_) {
    // ignore and throw structured error below
  }

  const err = new Error(
    '未找到可用的 sessions API。请通过 createParallelSubagentExecutor({ sessionsApi }) 注入，' +
    '或安装/指定包含 sessions_spawn 的模块（例如 openclaw-sessions）。'
  );
  err.code = 'SESSIONS_API_UNAVAILABLE';
  throw err;
}

module.exports = {
  createParallelSubagentExecutor,
  resolveSessionsApi
};

// CLI 演示模式：仅在直接运行时启用
if (require.main === module) {
  (async () => {
    try {
      const executor = createParallelSubagentExecutor();
      const demo = await executor.runParallel([
        { task: 'demo task A' },
        { task: 'demo task B' }
      ], { concurrency: 2 });
      console.log(JSON.stringify(demo, null, 2));
    } catch (e) {
      console.error('[parallel-subagent] 启动失败:', e.message);
      process.exitCode = 1;
    }
  })();
}
