/**
 * interactive-card-context-inference handler - 交互卡片上下文推断
 *
 * 触发规则: rule.interactive-card-context-inference-001
 * 职责: 收到引用交互卡片的回复时，回溯最近消息推断卡片内容并直接响应
 */
'use strict';

const path = require('path');
const { writeReport, gateResult, emitEvent } = require('../lib/handler-utils');

module.exports = {
  name: 'interactive-card-context-inference',

  /**
   * 推断交互卡片上下文
   * @param {Object} context - 规则触发上下文
   * @param {Object} context.repliedMessage - 被引用的消息
   * @param {Array}  [context.recentMessages] - 最近的消息列表
   * @param {Object} [context.bus] - 事件总线
   */
  async execute(context = {}) {
    const { repliedMessage = {}, recentMessages = [], bus } = context;
    const checks = [];

    // Step 1: 确认触发条件 - 消息包含 [Interactive Card]
    const hasCard = (repliedMessage.body || '').includes('[Interactive Card]');
    checks.push({
      name: 'trigger-match',
      ok: hasCard,
      message: hasCard ? '消息包含交互卡片引用' : '未检测到交互卡片引用',
    });

    if (!hasCard) {
      return gateResult('interactive-card-context-inference', checks, { failClosed: false });
    }

    // Step 2: 回溯最近5条自己发出的消息
    const ownMessages = recentMessages
      .filter(m => m.fromSelf)
      .slice(-5);

    checks.push({
      name: 'context-retrieval',
      ok: ownMessages.length > 0,
      message: `找到 ${ownMessages.length} 条自身消息用于推断`,
    });

    // Step 3: 匹配可能的卡片内容
    const inferredContent = ownMessages
      .filter(m => m.body && (m.body.includes('card') || m.body.includes('卡片') || m.hasCardAttachment))
      .map(m => ({ body: m.body, ts: m.timestamp }));

    checks.push({
      name: 'card-inference',
      ok: inferredContent.length > 0,
      message: inferredContent.length > 0
        ? `推断出 ${inferredContent.length} 条可能的卡片内容`
        : '未能推断出卡片内容，将使用最近消息上下文',
    });

    // Step 4: 禁止向用户反问，发射推断结果事件
    const inferResult = {
      inferred: inferredContent.length > 0 ? inferredContent : ownMessages.slice(-1),
      replyTo: repliedMessage,
      autoRespond: true,
    };

    await emitEvent(bus, 'card.context.inferred', inferResult);

    const result = gateResult('interactive-card-context-inference', checks, { failClosed: false });

    const reportPath = path.join(__dirname, '..', 'logs', 'interactive-card-inference-report.json');
    writeReport(reportPath, { ...result, inferResult });

    console.log(`[interactive-card-context-inference] 推断完成: ${result.passed}/${result.total} 通过`);
    return result;
  },
};
