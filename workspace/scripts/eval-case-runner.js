/**
 * eval-case-runner.js — 评测单个用例的标准流程
 *
 * 核心原则：执行者 ≠ 评测者
 *
 * 输入：case定义JSON文件路径（命令行参数）
 * 输出：{caseId, executor_result, evaluator_result, verdict, reason}
 *
 * 流程：
 *   1. 解析用例定义
 *   2. 构造执行任务描述（给开发Agent）
 *   3. 记录执行结果
 *   4. 构造评测任务描述（给质量分析Agent，不同agentId）
 *   5. 记录评测结论
 *   6. 输出到评测报告
 */

const fs = require('fs');
const path = require('path');

// ─── 模板 ───────────────────────────────────────────────

function buildExecutorTask(caseData) {
  return [
    '你是开发工程师，执行以下评测用例。只做执行，不做自评。',
    '',
    `用例ID: ${caseData.id || caseData.caseId || 'unknown'}`,
    `触发场景: ${caseData.trigger || JSON.stringify(caseData.input)}`,
    `预期执行链: ${JSON.stringify(caseData.expected_chain || caseData.expected || '')}`,
    '',
    '请按预期执行链执行，输出你的实际执行结果。',
  ].join('\n');
}

function buildEvaluatorTask(caseData, actualResult) {
  return [
    '你是质量分析师，评测以下执行结果。你和执行者是不同的Agent，角色分离。',
    '',
    `用例ID: ${caseData.id || caseData.caseId || 'unknown'}`,
    `触发场景: ${caseData.trigger || JSON.stringify(caseData.input)}`,
    `预期执行链: ${JSON.stringify(caseData.expected_chain || caseData.expected || '')}`,
    `判定标准: ${JSON.stringify(caseData.criteria || caseData.acceptance || '按预期执行链完整度判定')}`,
    '',
    `实际执行结果:`,
    actualResult,
    '',
    '请给出判定：Pass / Partial / Badcase',
    '并说明理由。',
    '',
    '输出格式（严格JSON）：',
    '{"verdict": "Pass|Partial|Badcase", "reason": "..."}',
  ].join('\n');
}

// ─── 主流程 ─────────────────────────────────────────────

async function run() {
  const caseFilePath = process.argv[2];
  if (!caseFilePath) {
    console.error('Usage: node eval-case-runner.js <case.json>');
    process.exit(1);
  }

  // 1. 解析用例
  const raw = fs.readFileSync(caseFilePath, 'utf-8');
  const caseData = JSON.parse(raw);
  const caseId = caseData.id || caseData.caseId || path.basename(caseFilePath, '.json');

  // 2. 构造执行任务
  const executorTask = buildExecutorTask(caseData);

  // 3. 构造评测任务（占位，等执行结果填入）
  // 在实际OpenClaw集成中，这里会调用sessions_spawn
  // 本脚本输出任务描述供上层引擎调用

  const output = {
    caseId,
    caseFile: caseFilePath,
    executor: {
      agentId: 'coder',
      task: executorTask,
      // executor_result 由上层引擎填入
    },
    evaluator: {
      agentId: 'reviewer',
      taskTemplate: 'eval-evaluator-template',
      // evaluator_result 由上层引擎填入
    },
    roleSeparation: {
      executorAgentId: 'coder',
      evaluatorAgentId: 'reviewer',
      separated: true, // 不同agentId = 真正分离
    },
    verdict: null,
    reason: null,
  };

  // 如果是dry-run模式，输出任务定义
  if (process.argv.includes('--dry-run')) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  // 正常模式：输出供eval-engine.sh消费
  // 实际的Agent调用由eval-engine.sh通过OpenClaw sessions_spawn完成
  // 这里输出结构化的任务定义
  console.log(JSON.stringify(output, null, 2));
}

run().catch((err) => {
  console.error(`[eval-case-runner] Error: ${err.message}`);
  process.exit(1);
});
