/**
 * eval-quality-check handler
 * 
 * 触发规则: coding-quality-thinking-001
 * 职责: 核心模块编码时检查是否启用了thinking模式
 */
const fs = require('fs');
const path = require('path');
const { gateResult, writeReport, checkFileExists } = require('../lib/handler-utils');

const LOG_PATH = path.join(__dirname, '..', 'logs', 'eval-quality-check.jsonl');

module.exports = {
  name: 'eval-quality-check',

  /**
   * @param {Object} context
   * @param {string} context.filePath - 被修改的文件路径
   * @param {string} [context.model] - 使用的模型名
   * @param {boolean} [context.thinkingEnabled] - 是否开启了thinking模式
   * @param {string[]} [context.coreModules] - 核心模块路径模式
   */
  async execute(context = {}) {
    const {
      filePath = '',
      model = 'unknown',
      thinkingEnabled = false,
      coreModules = ['lib/', 'handlers/', 'engine/', 'core/'],
    } = context;

    const checks = [];

    // 检查是否为核心模块
    const isCoreModule = coreModules.some(m => filePath.includes(m));

    if (!isCoreModule) {
      checks.push({ name: 'scope-check', ok: true, message: '非核心模块，跳过thinking检查' });
      return gateResult('coding-quality-thinking', checks);
    }

    // 核心模块必须开thinking
    checks.push({
      name: 'thinking-mode',
      ok: thinkingEnabled,
      message: thinkingEnabled
        ? `thinking已启用 (model: ${model})`
        : `核心模块 ${filePath} 编码未启用thinking模式，请开启高质量推理`,
    });

    const result = gateResult('coding-quality-thinking', checks);

    // 日志
    const logEntry = {
      timestamp: new Date().toISOString(),
      filePath,
      model,
      thinkingEnabled,
      isCoreModule,
      passed: result.ok,
    };
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.appendFileSync(LOG_PATH, JSON.stringify(logEntry) + '\n');

    console.log(`[eval-quality-check] ${filePath}: ${result.ok ? 'PASS' : 'BLOCKED'}`);
    return result;
  },
};
