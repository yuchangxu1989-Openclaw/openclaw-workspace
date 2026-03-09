/**
 * session-memory-mechanism - 会话记忆机制处理器
 *
 * 规则: rule.intent-会话记忆机制-f2lei
 * 职责: 确保重要信息写入memory日记文件，而非仅依赖commit历史
 */
const fs = require('fs');
const path = require('path');
const { writeReport, emitEvent, checkFileExists, gateResult } = require('../lib/handler-utils');

const WORKSPACE = '/root/.openclaw/workspace';
const MEMORY_DIR = path.join(WORKSPACE, 'memory');
const LOG_DIR = path.join(__dirname, '..', 'logs');

module.exports = {
  name: 'session-memory-mechanism',
  ruleId: 'rule.intent-会话记忆机制-f2lei',

  /**
   * @param {Object} context
   * @param {string} [context.date] - 检查日期 YYYY-MM-DD
   * @param {Object} [context.bus] - 事件总线
   */
  async execute(context = {}) {
    const { bus } = context;
    const today = context.date || new Date().toISOString().slice(0, 10);
    const memoryFile = path.join(MEMORY_DIR, `${today}.md`);

    const memoryDirExists = checkFileExists(MEMORY_DIR);
    const todayMemoryExists = checkFileExists(memoryFile);
    let todayMemorySize = 0;

    if (todayMemoryExists) {
      try { todayMemorySize = fs.statSync(memoryFile).size; } catch {}
    }

    const checks = [
      {
        name: 'memory_dir_exists',
        ok: memoryDirExists,
        message: memoryDirExists ? 'memory目录存在' : 'memory目录缺失，需创建',
      },
      {
        name: 'today_memory_exists',
        ok: todayMemoryExists,
        message: todayMemoryExists
          ? `${today}.md 存在 (${todayMemorySize} bytes)`
          : `${today}.md 不存在，今日记忆未记录`,
      },
      {
        name: 'memory_not_empty',
        ok: todayMemorySize > 50,
        message: todayMemorySize > 50 ? '记忆内容充实' : '记忆内容过少或为空',
      },
    ];

    const result = gateResult('session-memory-mechanism', checks, { failClosed: false });
    result.date = today;
    result.memoryFile = memoryFile;
    result.timestamp = new Date().toISOString();

    writeReport(path.join(LOG_DIR, 'session-memory-mechanism-last.json'), result);
    await emitEvent(bus, 'isc.memory.check_completed', result);

    console.log(`[session-memory] ${result.ok ? '✅' : '⚠️'} ${today}: ${todayMemoryExists ? `${todayMemorySize}B` : 'missing'}`);
    return result;
  },
};
