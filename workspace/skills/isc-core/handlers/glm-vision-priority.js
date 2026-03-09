'use strict';

/**
 * glm-vision-priority.js
 * Handler for rule.glm-vision-priority-001
 *
 * 图像/视频需求优先调用 GLM-4V-Plus 视觉模型。
 * 不可用时降级到备选模型。根治遗忘问题。
 */

const path = require('path');
const { checkFileExists, writeReport, gateResult } = require('../lib/handler-utils');

// 视觉任务意图模式
const VISION_PATTERNS = [
  /图片.*理解/,
  /图像.*分析/,
  /视频.*描述/,
  /看图/,
  /识别图片/,
  /图片内容/,
  /image.*analy/i,
  /visual.*recogni/i,
  /describe.*image/i,
  /what.*in.*picture/i,
];

const MODEL_PRIORITY = ['glm-4v-plus', 'glm-4v', 'gpt-4-vision', 'claude-3-opus'];

/**
 * @param {object} context - ISC 运行时上下文
 * @param {string} context.repoRoot - 仓库根目录
 * @param {string} [context.userMessage] - 用户消息文本
 * @param {string[]} [context.availableModels] - 可用模型列表
 * @returns {object} gate result
 */
async function handler(context = {}) {
  const repoRoot = context.repoRoot || process.cwd();
  const userMessage = context.userMessage || '';
  const availableModels = context.availableModels || [];
  const checks = [];

  // 检测视觉意图
  const isVisionTask = VISION_PATTERNS.some(p => p.test(userMessage));

  checks.push({
    name: 'vision-intent-detection',
    ok: true,
    message: isVisionTask
      ? `检测到视觉任务意图: "${userMessage.slice(0, 50)}"`
      : '未检测到视觉任务意图',
  });

  // 检查模型配置
  const configPath = path.join(repoRoot, 'config', 'models.json');
  const configExists = checkFileExists(configPath);
  let selectedModel = null;

  if (isVisionTask) {
    if (availableModels.length > 0) {
      selectedModel = MODEL_PRIORITY.find(m => availableModels.includes(m)) || availableModels[0];
    } else {
      selectedModel = MODEL_PRIORITY[0]; // default to glm-4v-plus
    }
  }

  checks.push({
    name: 'vision-model-routing',
    ok: !isVisionTask || !!selectedModel,
    message: isVisionTask
      ? `路由到视觉模型: ${selectedModel}`
      : '非视觉任务，跳过模型路由',
  });

  const result = gateResult('glm-vision-priority-001', checks, { failClosed: false });

  writeReport(path.join(repoRoot, 'reports', 'glm-vision-priority.json'), {
    rule: 'rule.glm-vision-priority-001',
    timestamp: new Date().toISOString(),
    isVisionTask,
    selectedModel,
    modelPriority: MODEL_PRIORITY,
    status: result.status,
  });

  return result;
}

module.exports = handler;
