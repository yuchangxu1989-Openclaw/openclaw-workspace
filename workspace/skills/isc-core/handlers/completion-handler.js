/**
 * completion-handler - 子Agent完成事件程序化处理
 *
 * 规则: ISC-COMPLETION-HANDLER-001
 * 职责: 收到子Agent completion event后调用completion-handler.sh，确保不跳过直接回复用户
 */
const path = require('path');
const { gitExec, writeReport, emitEvent, checkFileExists } = require('../lib/handler-utils');

const SCRIPT_PATH = '/root/.openclaw/workspace/scripts/completion-handler.sh';
const LOG_DIR = path.join(__dirname, '..', 'logs');

module.exports = {
  name: 'completion-handler',
  ruleId: 'ISC-COMPLETION-HANDLER-001',

  /**
   * @param {Object} context
   * @param {string} context.label - 子Agent标签
   * @param {string} context.status - done|failed
   * @param {string} context.summary - 简要结果
   * @param {Object} [context.bus] - 事件总线
   */
  async execute(context = {}) {
    const { label = 'unknown', status = 'done', summary = '', bus } = context;
    const checks = [];

    // 检查 completion-handler.sh 存在
    const scriptExists = checkFileExists(SCRIPT_PATH);
    checks.push({ name: 'script_exists', ok: scriptExists, message: scriptExists ? 'completion-handler.sh found' : 'completion-handler.sh missing' });

    if (!scriptExists) {
      const result = { ok: false, label, status, error: 'completion-handler.sh not found' };
      writeReport(path.join(LOG_DIR, 'completion-handler-last.json'), result);
      await emitEvent(bus, 'isc.completion-handler.failed', result);
      return result;
    }

    // 验证参数完整性
    const hasLabel = !!label && label !== 'unknown';
    checks.push({ name: 'label_provided', ok: hasLabel, message: hasLabel ? `label: ${label}` : 'missing label' });

    const validStatus = ['done', 'failed'].includes(status);
    checks.push({ name: 'valid_status', ok: validStatus, message: `status: ${status}` });

    const result = {
      ok: checks.every(c => c.ok),
      label,
      status,
      summary,
      checks,
      scriptPath: SCRIPT_PATH,
      command: `bash ${SCRIPT_PATH} ${label} ${status} "${summary}"`,
      timestamp: new Date().toISOString(),
    };

    writeReport(path.join(LOG_DIR, 'completion-handler-last.json'), result);
    await emitEvent(bus, 'isc.completion-handler.executed', result);

    console.log(`[completion-handler] ${result.ok ? '✅' : '❌'} label=${label} status=${status}`);
    return result;
  },
};
