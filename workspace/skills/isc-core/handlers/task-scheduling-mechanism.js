/**
 * task-scheduling-mechanism - 任务调度机制处理器
 *
 * 规则: rule.intent-任务调度机制-yuiao8
 * 职责: 确保任务优先委派给子Agent执行，主Agent不应亲自操作
 */
const path = require('path');
const { writeReport, emitEvent, gateResult } = require('../lib/handler-utils');

const LOG_DIR = path.join(__dirname, '..', 'logs');

module.exports = {
  name: 'task-scheduling-mechanism',
  ruleId: 'rule.intent-任务调度机制-yuiao8',

  /**
   * @param {Object} context
   * @param {string} [context.executor] - 执行者 (main|subagent)
   * @param {string} [context.taskDescription] - 任务描述
   * @param {boolean} [context.isDelegatable] - 任务是否可委派
   * @param {Object} [context.bus] - 事件总线
   */
  async execute(context = {}) {
    const { executor = '', taskDescription = '', isDelegatable = true, bus } = context;

    const isMainAgent = executor.toLowerCase() === 'main';
    const shouldDelegate = isDelegatable && isMainAgent;

    const checks = [
      {
        name: 'delegation_check',
        ok: !shouldDelegate,
        message: shouldDelegate
          ? `任务 "${taskDescription}" 由主Agent执行，应委派给子Agent`
          : '任务执行者合规',
      },
      {
        name: 'executor_identified',
        ok: !!executor,
        message: executor ? `执行者: ${executor}` : '未指定执行者',
      },
    ];

    const result = gateResult('task-scheduling-mechanism', checks, { failClosed: false });
    result.recommendation = shouldDelegate ? 'delegate_to_subagent' : 'none';
    result.timestamp = new Date().toISOString();

    writeReport(path.join(LOG_DIR, 'task-scheduling-mechanism-last.json'), result);
    await emitEvent(bus, 'isc.task.scheduling_checked', result);

    console.log(`[task-scheduling] ${result.ok ? '✅' : '⚠️'} executor=${executor || 'unknown'}, delegatable=${isDelegatable}`);
    return result;
  },
};
