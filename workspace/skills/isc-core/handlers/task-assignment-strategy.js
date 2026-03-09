/**
 * task-assignment-strategy - 任务分配策略处理器
 *
 * 规则: rule.intent-任务分配策略-jrw5uo
 * 职责: 生成类任务必须优先分配给Opus模型，基于渠道失败经验确保质量
 */
const path = require('path');
const { writeReport, emitEvent, gateResult } = require('../lib/handler-utils');

const LOG_DIR = path.join(__dirname, '..', 'logs');

const OPUS_PREFERRED_INTENTS = [
  'generate', 'create', 'write', 'draft', 'compose', 'design', 'architect',
  'plan', 'analyze', 'synthesize', 'refactor',
];

module.exports = {
  name: 'task-assignment-strategy',
  ruleId: 'rule.intent-任务分配策略-jrw5uo',

  /**
   * @param {Object} context
   * @param {string} [context.taskType] - 任务类型
   * @param {string} [context.assignedModel] - 当前分配的模型
   * @param {string} [context.channel] - 触发渠道 (boom|codex|feishu)
   * @param {Object} [context.bus] - 事件总线
   */
  async execute(context = {}) {
    const { taskType = '', assignedModel = '', channel = 'unknown', bus } = context;
    const taskLower = taskType.toLowerCase();

    const isGenerativeTask = OPUS_PREFERRED_INTENTS.some(i => taskLower.includes(i));
    const isOpus = assignedModel.toLowerCase().includes('opus');

    const checks = [
      {
        name: 'generative_task_detection',
        ok: true,
        message: isGenerativeTask
          ? `"${taskType}" 识别为生成类任务`
          : `"${taskType}" 非生成类任务，策略不强制`,
      },
      {
        name: 'opus_assignment',
        ok: !isGenerativeTask || isOpus,
        message: isGenerativeTask && !isOpus
          ? `生成类任务应分配Opus，当前: ${assignedModel || 'unset'}`
          : '模型分配合规',
      },
    ];

    const result = gateResult('task-assignment-strategy', checks, { failClosed: false });
    result.recommendation = isGenerativeTask && !isOpus ? 'reassign_to_opus' : 'none';
    result.channel = channel;
    result.timestamp = new Date().toISOString();

    writeReport(path.join(LOG_DIR, 'task-assignment-strategy-last.json'), result);
    await emitEvent(bus, 'isc.task.assignment_checked', result);

    console.log(`[task-assignment] ${result.ok ? '✅' : '⚠️'} ${taskType || 'unknown'} → ${assignedModel || 'unset'} (${channel})`);
    return result;
  },
};
