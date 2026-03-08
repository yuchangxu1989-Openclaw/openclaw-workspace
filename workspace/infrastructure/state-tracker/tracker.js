'use strict';

/**
 * 流水线状态追踪器
 *
 * 追踪一次端到端流水线运行的各阶段：
 * ISC → 本地任务编排 → SEEF → AEO → CRAS
 *
 * 每次运行持久化为 JSON 文件，支持并发安全读写。
 */

const fs = require('fs');
const path = require('path');

const STATE_DIR = path.join(__dirname, 'runs');
const CURRENT_FILE = path.join(__dirname, 'current.json');

// 确保目录存在
if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });

const STAGES = ['isc', 'lto', 'seef', 'aeo', 'cras'];
const STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  DONE: 'done',
  FAILED: 'failed',
  SKIPPED: 'skipped'
};

/**
 * 创建新的流水线运行
 * @param {string} trigger - 触发来源 (如 'manual', 'webhook', 'schedule')
 * @param {Object} [metadata] - 额外元数据
 * @returns {Object} 运行记录
 */
function createRun(trigger, metadata = {}) {
  const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const run = {
    id: runId,
    trigger,
    metadata,
    status: 'running',
    stages: {},
    created_at: Date.now(),
    updated_at: Date.now()
  };

  STAGES.forEach(s => {
    run.stages[s] = {
      status: STATUS.PENDING,
      started_at: null,
      completed_at: null,
      result: null
    };
  });

  // 写入文件
  fs.writeFileSync(
    path.join(STATE_DIR, `${runId}.json`),
    JSON.stringify(run, null, 2)
  );
  fs.writeFileSync(
    CURRENT_FILE,
    JSON.stringify({ current_run: runId, updated_at: Date.now() }, null, 2)
  );

  console.log(`[Tracker] 创建运行: ${runId}`);
  return run;
}

/**
 * 更新某阶段的状态
 * @param {string} runId - 运行 ID
 * @param {string} stage - 阶段名 (isc/lto/seef/aeo/cras)
 * @param {string} status - 新状态
 * @param {*} [result] - 阶段结果数据
 * @returns {Object} 更新后的运行记录
 */
function updateStage(runId, stage, status, result = null) {
  const filePath = path.join(STATE_DIR, `${runId}.json`);
  if (!fs.existsSync(filePath)) throw new Error(`Run not found: ${runId}`);

  const run = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!run.stages[stage]) throw new Error(`Unknown stage: ${stage}`);

  run.stages[stage].status = status;
  run.stages[stage].result = result;
  run.updated_at = Date.now();

  if (status === STATUS.RUNNING) {
    run.stages[stage].started_at = Date.now();
  }
  if (status === STATUS.DONE || status === STATUS.FAILED) {
    run.stages[stage].completed_at = Date.now();
  }

  // 检查是否全部完成
  const allDone = STAGES.every(s =>
    [STATUS.DONE, STATUS.FAILED, STATUS.SKIPPED].includes(run.stages[s].status)
  );
  if (allDone) {
    const anyFailed = STAGES.some(s => run.stages[s].status === STATUS.FAILED);
    run.status = anyFailed ? 'completed_with_errors' : 'completed';
    run.completed_at = Date.now();
  }

  fs.writeFileSync(filePath, JSON.stringify(run, null, 2));
  console.log(`[Tracker] ${runId} → ${stage}: ${status}`);
  return run;
}

/**
 * 获取指定运行记录
 * @param {string} runId
 * @returns {Object|null}
 */
function getRun(runId) {
  const filePath = path.join(STATE_DIR, `${runId}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * 获取当前运行
 * @returns {Object|null}
 */
function getCurrentRun() {
  if (!fs.existsSync(CURRENT_FILE)) return null;
  const cur = JSON.parse(fs.readFileSync(CURRENT_FILE, 'utf8'));
  return getRun(cur.current_run);
}

/**
 * 列出最近的运行记录
 * @param {number} [limit=10]
 * @returns {Array<Object>}
 */
function listRuns(limit = 10) {
  if (!fs.existsSync(STATE_DIR)) return [];
  return fs.readdirSync(STATE_DIR)
    .filter(f => f.endsWith('.json'))
    .sort().reverse().slice(0, limit)
    .map(f => JSON.parse(fs.readFileSync(path.join(STATE_DIR, f), 'utf8')));
}

module.exports = { createRun, updateStage, getRun, getCurrentRun, listRuns, STAGES, STATUS };
