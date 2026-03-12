'use strict';

/**
 * file-send-intent.js
 * Handler for ISC-FILE-SEND-INTENT-001
 *
 * 当用户表达发送文件意图时，自动检测并路由到 file-sender 技能。
 * v2.0: 纯LLM语义理解，移除正则匹配。
 */

const path = require('path');
const { checkFileExists, writeReport, gateResult } = require('../lib/handler-utils');

let _callLLM = null;
try {
  _callLLM = require(path.join(__dirname, '../../../skills/cras/intent-extractor-llm')).callLLM;
} catch (_) {
  try {
    _callLLM = require(path.join(__dirname, '../../../infrastructure/llm-context')).chat;
  } catch (_2) {}
}

const DETECT_PROMPT = `判断用户消息是否表达了"想要获取/发送/传输文件"的意图。
只输出JSON：{"detected":true/false,"confidence":0.0-1.0}
不要解释。`;

async function detectFileSendIntent(text) {
  if (!text || !text.trim()) return { detected: false, confidence: 0 };
  if (!_callLLM) return { detected: false, confidence: 0, reason: 'llm_unavailable' };

  try {
    const response = await _callLLM(DETECT_PROMPT, `用户消息：${text.slice(0, 300)}`, { timeout: 6000 });
    let jsonStr = String(response || '').trim();
    const start = jsonStr.indexOf('{');
    const end = jsonStr.lastIndexOf('}');
    if (start >= 0 && end > start) jsonStr = jsonStr.slice(start, end + 1);
    const parsed = JSON.parse(jsonStr);
    return {
      detected: !!parsed.detected,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    };
  } catch (_) {
    return { detected: false, confidence: 0 };
  }
}

async function handler(context = {}) {
  const repoRoot = context.repoRoot || process.cwd();
  const userMessage = context.userMessage || '';
  const checks = [];

  const intentResult = await detectFileSendIntent(userMessage);
  const intentDetected = intentResult.detected && intentResult.confidence >= 0.6;

  checks.push({
    name: 'file-send-intent-detection',
    ok: true,
    message: intentDetected
      ? `检测到文件发送意图 (confidence: ${intentResult.confidence}): "${userMessage.slice(0, 50)}"`
      : '未检测到文件发送意图',
  });

  const fileSenderSkill = path.join(repoRoot, 'skills', 'file-sender', 'SKILL.md');
  const skillExists = checkFileExists(fileSenderSkill);

  checks.push({
    name: 'file-sender-skill-available',
    ok: skillExists,
    message: skillExists ? 'file-sender 技能已就绪' : 'file-sender 技能缺失',
  });

  const result = gateResult('file-send-intent-001', checks, { failClosed: false });

  writeReport(path.join(repoRoot, 'reports', 'file-send-intent.json'), {
    rule: 'ISC-FILE-SEND-INTENT-001',
    timestamp: new Date().toISOString(),
    intentDetected,
    confidence: intentResult.confidence,
    skillAvailable: skillExists,
    status: result.status,
  });

  return result;
}

module.exports = handler;
