'use strict';

/**
 * file-send-intent.js
 * Handler for ISC-FILE-SEND-INTENT-001
 *
 * 当用户表达发送文件意图时，自动检测并路由到 file-sender 技能。
 */

const path = require('path');
const { checkFileExists, writeReport, gateResult } = require('../lib/handler-utils');

// 文件发送意图模式
const INTENT_PATTERNS = [
  /发文件/,
  /发源文件/,
  /把.*发给我/,
  /发附件/,
  /源文件/,
  /把.*文件.*给我/,
  /发一下.*文件/,
  /文件发我/,
  /给我发文件/,
  /传文件/,
  /把.*传给我/,
  /发送文件/,
  /把报告发我/,
  /把.*给我/,
];

/**
 * @param {object} context - ISC 运行时上下文
 * @param {string} context.repoRoot - 仓库根目录
 * @param {string} [context.userMessage] - 用户消息文本
 * @returns {object} gate result
 */
async function handler(context = {}) {
  const repoRoot = context.repoRoot || process.cwd();
  const userMessage = context.userMessage || '';
  const checks = [];

  // 检测意图
  const matchedPattern = INTENT_PATTERNS.find(p => p.test(userMessage));
  const intentDetected = !!matchedPattern;

  checks.push({
    name: 'file-send-intent-detection',
    ok: true,
    message: intentDetected
      ? `检测到文件发送意图: "${userMessage.slice(0, 50)}"`
      : '未检测到文件发送意图',
  });

  // 检查 file-sender 技能是否存在
  const fileSenderSkill = path.join(repoRoot, 'skills', 'file-sender', 'SKILL.md');
  const skillExists = checkFileExists(fileSenderSkill);

  checks.push({
    name: 'file-sender-skill-available',
    ok: skillExists,
    message: skillExists
      ? 'file-sender 技能已就绪'
      : 'file-sender 技能缺失，无法自动发送文件',
  });

  const result = gateResult('file-send-intent-001', checks, { failClosed: false });

  writeReport(path.join(repoRoot, 'reports', 'file-send-intent.json'), {
    rule: 'ISC-FILE-SEND-INTENT-001',
    timestamp: new Date().toISOString(),
    intentDetected,
    skillAvailable: skillExists,
    status: result.status,
  });

  return result;
}

module.exports = handler;
