'use strict';

/**
 * 直接指令检测器
 * 识别用户的明确任务指令，跳过确认环节直接触发派发
 * 
 * 集成点：主Agent消息处理链路前置检测
 * 事件：dispatch.direct-command
 */

// 指令模式库（基于真实对话提取）
const COMMAND_PATTERNS = [
  // "派人"系列
  { pattern: /派人(去|做|处理|修复|实现|研究|调研|确认|核实|评估|分析|清理|优化|按照|搜)/gi, action: 'dispatch', confidence: 0.95 },
  { pattern: /派\S+去/gi, action: 'dispatch', confidence: 0.9 },

  // "赶紧/立刻/马上"紧急系列
  { pattern: /(赶紧|立刻|马上|快)(派人|去|做|修|处理|实现|解决)/gi, action: 'dispatch_urgent', confidence: 0.95 },
  { pattern: /需要(派人|去)(修复|处理|做|实现|解决|清理|优化)/gi, action: 'dispatch', confidence: 0.9 },

  // "去做/修复"系列
  { pattern: /(去|把).{0,10}(修复|修一下|fix|处理|解决)/gi, action: 'dispatch', confidence: 0.85 },

  // 直接指令动词开头
  { pattern: /^(删掉|清理|实现|优化|重构|部署|上线|回滚|激活|关闭|开启|升级|降级|迁移|合并)/gi, action: 'dispatch', confidence: 0.85 },

  // 否定+修正（"不要XXX，要YYY"）
  { pattern: /不要.{2,20}(要|应该|改成|换成)/gi, action: 'dispatch_with_correction', confidence: 0.8 },
];

// 反模式：这些不是指令，不应该自动派发
const ANTI_PATTERNS = [
  /你觉得.{0,10}(要不要|是不是|应不应该)/gi, // 征求意见
  /有没有.*方案/gi,                            // 咨询
  /什么是|是什么|什么概念|是啥/gi,              // 提问
  /如果.*怎么办/gi,                            // 假设性问题
  /为什么|为啥|咋回事/gi,                       // 追问原因
  /怎么看|怎么想|觉得呢/gi,                     // 征求意见
  /用来干啥|干什么用/gi,                        // 功能咨询
];

/**
 * 检测用户消息是否为直接指令
 * @param {string} text - 用户消息原文
 * @returns {{ isCommand: boolean, action?: string, confidence?: number, matchedText?: string, taskTarget?: string, reason?: string }}
 */
function detectDirectCommand(text) {
  if (!text || typeof text !== 'string') return { isCommand: false, reason: 'empty' };

  const trimmed = text.trim();
  if (trimmed.length < 2) return { isCommand: false, reason: 'too-short' };

  // 先排除反模式
  for (const anti of ANTI_PATTERNS) {
    anti.lastIndex = 0;
    if (anti.test(trimmed)) return { isCommand: false, reason: 'anti-pattern' };
  }

  // 匹配指令模式
  for (const cmd of COMMAND_PATTERNS) {
    cmd.pattern.lastIndex = 0;
    const match = cmd.pattern.exec(trimmed);
    if (match) {
      const afterMatch = trimmed.slice(match.index + match[0].length).trim();
      return {
        isCommand: true,
        action: cmd.action,
        confidence: cmd.confidence,
        matchedText: match[0],
        taskTarget: afterMatch || trimmed,
        fullText: trimmed,
      };
    }
  }

  return { isCommand: false, reason: 'no-match' };
}

/**
 * 生成dispatch事件payload
 * @param {object} detection - detectDirectCommand的返回值
 * @returns {object} 事件payload
 */
function toDispatchEvent(detection) {
  if (!detection.isCommand) return null;
  return {
    event: 'dispatch.direct-command',
    action: detection.action,
    confidence: detection.confidence,
    task: detection.fullText,
    taskTarget: detection.taskTarget,
    matchedText: detection.matchedText,
    skipConfirmation: detection.confidence >= 0.8,
    urgent: detection.action === 'dispatch_urgent',
    ts: new Date().toISOString(),
  };
}

module.exports = { detectDirectCommand, toDispatchEvent, COMMAND_PATTERNS, ANTI_PATTERNS };
