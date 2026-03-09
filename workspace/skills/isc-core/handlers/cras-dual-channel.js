'use strict';

/**
 * cras-dual-channel.js
 * Handler for rule.cras-dual-channel-001
 *
 * 验证意图捕获的快慢双通道设计：
 * 快通道（5min增量扫描）提取原子意图事件实时emit；
 * 慢通道（daily聚合）计算意图占比/频次/趋势emit模式事件。
 */

const path = require('path');
const { scanFiles, writeReport, gateResult, checkFileExists } = require('../lib/handler-utils');

const FAST_CHANNEL_SIGNALS = [/incremental|增量扫描|fast.?channel|快通道|realtime|实时/gi];
const SLOW_CHANNEL_SIGNALS = [/daily|聚合|slow.?channel|慢通道|trend|趋势|频次/gi];

/**
 * @param {object} context - ISC 运行时上下文
 * @param {string} context.repoRoot - 仓库根目录
 * @returns {object} gate result
 */
async function handler(context = {}) {
  const repoRoot = context.repoRoot || process.cwd();
  const checks = [];
  const findings = [];

  // Scan CRAS-related files for dual-channel evidence
  const crasDir = path.join(repoRoot, 'skills');
  let hasFastChannel = false;
  let hasSlowChannel = false;

  scanFiles(crasDir, /\.(js|md|json)$/, (filePath) => {
    let content;
    try {
      content = require('fs').readFileSync(filePath, 'utf8');
    } catch {
      return;
    }

    if (!/cras/i.test(filePath) && !/cras/i.test(content)) return;

    for (const pat of FAST_CHANNEL_SIGNALS) {
      pat.lastIndex = 0;
      if (pat.test(content)) {
        hasFastChannel = true;
        findings.push({ file: path.relative(repoRoot, filePath), channel: 'fast' });
        break;
      }
    }
    for (const pat of SLOW_CHANNEL_SIGNALS) {
      pat.lastIndex = 0;
      if (pat.test(content)) {
        hasSlowChannel = true;
        findings.push({ file: path.relative(repoRoot, filePath), channel: 'slow' });
        break;
      }
    }
  }, { maxDepth: 4, skip: ['node_modules', '.git', '.entropy-archive'] });

  checks.push({
    name: 'fast-channel-exists',
    ok: hasFastChannel,
    message: hasFastChannel ? '快通道（增量扫描）已配置' : '缺少快通道设计',
  });

  checks.push({
    name: 'slow-channel-exists',
    ok: hasSlowChannel,
    message: hasSlowChannel ? '慢通道（聚合趋势）已配置' : '缺少慢通道设计',
  });

  checks.push({
    name: 'dual-channel-separation',
    ok: hasFastChannel && hasSlowChannel,
    message: hasFastChannel && hasSlowChannel
      ? '快慢双通道分离设计已就绪'
      : '实时感知和统计报告未分离，违反双通道原则',
  });

  const result = gateResult('cras-dual-channel-001', checks, { failClosed: false });

  writeReport(path.join(repoRoot, 'reports', 'cras-dual-channel.json'), {
    rule: 'rule.cras-dual-channel-001',
    timestamp: new Date().toISOString(),
    summary: { status: result.status, hasFastChannel, hasSlowChannel },
    findings: findings.slice(0, 30),
  });

  return result;
}

module.exports = handler;
