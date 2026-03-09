/**
 * deep-thinking-delegation - 子Agent深度思考委派处理器
 *
 * 规则: rule.intent-子agent深度思考委派机制-2l6fsj
 * 职责: 将深度思考任务委派给子Agent作为常规规则执行
 */
const path = require('path');
const { writeReport, emitEvent, gateResult } = require('../lib/handler-utils');

const LOG_DIR = path.join(__dirname, '..', 'logs');

const DEEP_THINKING_KEYWORDS = [
  'analyze', 'architect', 'design', 'review', 'evaluate', 'assess',
  'investigate', 'diagnose', 'root-cause', 'strategy', 'plan',
  '分析', '架构', '设计', '评审', '评估', '诊断', '根因', '策略', '规划',
];

module.exports = {
  name: 'deep-thinking-delegation',
  ruleId: 'rule.intent-子agent深度思考委派机制-2l6fsj',

  /**
   * @param {Object} context
   * @param {string} [context.taskDescription] - 任务描述
   * @param {string} [context.executor] - 当前执行者
   * @param {string} [context.thinkingLevel] - 思考级别 (low|medium|high)
   * @param {Object} [context.bus] - 事件总线
   */
  async execute(context = {}) {
    const { taskDescription = '', executor = '', thinkingLevel = 'medium', bus } = context;
    const descLower = taskDescription.toLowerCase();

    const isDeepThinking = DEEP_THINKING_KEYWORDS.some(k => descLower.includes(k));
    const isMainAgent = executor.toLowerCase() === 'main';
    const shouldDelegate = isDeepThinking && isMainAgent;

    const checks = [
      {
        name: 'deep_thinking_detected',
        ok: true,
        message: isDeepThinking
          ? `"${taskDescription}" 识别为深度思考任务`
          : `"${taskDescription}" 非深度思考任务`,
      },
      {
        name: 'delegation_compliance',
        ok: !shouldDelegate,
        message: shouldDelegate
          ? '深度思考任务应委派给子Agent，当前由主Agent执行'
          : '委派合规',
      },
    ];

    const result = gateResult('deep-thinking-delegation', checks, { failClosed: false });
    result.recommendation = shouldDelegate ? 'delegate_to_subagent_with_thinking' : 'none';
    result.suggestedThinking = isDeepThinking ? 'high' : thinkingLevel;
    result.timestamp = new Date().toISOString();

    writeReport(path.join(LOG_DIR, 'deep-thinking-delegation-last.json'), result);
    await emitEvent(bus, 'isc.task.deep_thinking_checked', result);

    console.log(`[deep-thinking] ${result.ok ? '✅' : '⚠️'} "${taskDescription || 'unknown'}" thinking=${result.suggestedThinking}`);
    return result;
  },
};
