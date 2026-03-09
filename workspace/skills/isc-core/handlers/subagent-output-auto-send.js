/**
 * subagent-output-auto-send - 子Agent产出自动发送处理器
 *
 * 规则: rule.intent-子agent产出自动发送-g7wmm7
 * 职责: 将报告类产出自动发送，解决记忆丢失后行为不一致问题
 */
const fs = require('fs');
const path = require('path');
const { writeReport, emitEvent, scanFiles, gateResult } = require('../lib/handler-utils');

const LOG_DIR = path.join(__dirname, '..', 'logs');

module.exports = {
  name: 'subagent-output-auto-send',
  ruleId: 'rule.intent-子agent产出自动发送-g7wmm7',

  /**
   * @param {Object} context
   * @param {string} [context.outputDir] - 产出目录
   * @param {string} [context.outputType] - 产出类型 (report|analysis|summary)
   * @param {string} [context.targetChannel] - 目标发送渠道
   * @param {Object} [context.bus] - 事件总线
   */
  async execute(context = {}) {
    const { outputDir = '', outputType = 'report', targetChannel = '', bus } = context;

    const pendingOutputs = [];
    if (outputDir) {
      scanFiles(outputDir, /\.(json|md|txt)$/, (filePath, fileName) => {
        try {
          const stat = fs.statSync(filePath);
          const ageMs = Date.now() - stat.mtimeMs;
          if (ageMs < 3600000) { // 1小时内的新产出
            pendingOutputs.push({ file: fileName, path: filePath, size: stat.size, ageMs });
          }
        } catch {}
      }, { maxDepth: 2 });
    }

    const checks = [
      {
        name: 'output_dir_specified',
        ok: !!outputDir,
        message: outputDir ? `产出目录: ${outputDir}` : '未指定产出目录',
      },
      {
        name: 'target_channel_specified',
        ok: !!targetChannel,
        message: targetChannel ? `目标渠道: ${targetChannel}` : '未指定目标发送渠道',
      },
      {
        name: 'pending_outputs_found',
        ok: pendingOutputs.length > 0,
        message: `发现 ${pendingOutputs.length} 个待发送产出`,
      },
    ];

    const result = gateResult('subagent-output-auto-send', checks, { failClosed: false });
    result.pendingOutputs = pendingOutputs;
    result.outputType = outputType;
    result.timestamp = new Date().toISOString();

    writeReport(path.join(LOG_DIR, 'subagent-output-auto-send-last.json'), result);

    for (const output of pendingOutputs) {
      await emitEvent(bus, 'isc.subagent.output_ready', {
        file: output.file,
        path: output.path,
        type: outputType,
        targetChannel,
      });
    }

    console.log(`[subagent-output] ${result.ok ? '✅' : '⚠️'} ${pendingOutputs.length} outputs pending → ${targetChannel || 'no channel'}`);
    return result;
  },
};
