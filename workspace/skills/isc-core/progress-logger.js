#!/usr/bin/env node
/**
 * ProgressLog.md 记录机制
 * 每轮构建-测试循环记录，作为晨间简报
 */

const fs = require('fs');
const path = require('path');
const { WORKSPACE } = require('../shared/paths');

const PROGRESS_PATH = path.join(WORKSPACE, 'progress-log.md');

class ProgressLogger {
  constructor() {
    this.logs = [];
    this.load();
  }

  load() {
    if (fs.existsSync(PROGRESS_PATH)) {
      // 简单解析，实际可更复杂
      this.logs = [];
    }
  }

  // 记录构建-测试循环
  recordCycle(data) {
    const entry = {
      timestamp: new Date().toISOString(),
      cycle: data.cycle || 'unknown',
      build: {
        what: data.build || '',
        files_changed: data.files || 0,
        lines_changed: data.lines || 0
      },
      test: {
        status: data.testStatus || 'unknown',
        passed: data.passed || 0,
        failed: data.failed || 0,
        errors: data.errors || []
      },
      decision: {
        action: data.decision || 'continue',
        reason: data.reason || '',
        next_step: data.nextStep || ''
      },
      learnings: data.learnings || []
    };

    this.logs.push(entry);
    this.save();
    return entry;
  }

  // 快速记录成功
  recordSuccess(what, learnings = []) {
    return this.recordCycle({
      cycle: 'success',
      build: what,
      testStatus: 'passed',
      decision: 'continue',
      learnings
    });
  }

  // 快速记录失败
  recordFailure(what, errors, nextStep) {
    return this.recordCycle({
      cycle: 'failure',
      build: what,
      testStatus: 'failed',
      errors,
      decision: 'retry',
      nextStep
    });
  }

  // 生成晨间简报
  generateMorningBrief() {
    const last24h = this.logs.filter(l => {
      const logTime = new Date(l.timestamp);
      const hoursAgo = (Date.now() - logTime) / (1000 * 60 * 60);
      return hoursAgo <= 24;
    });

    const lines = [];
    lines.push('# 晨间简报');
    lines.push(`生成时间: ${new Date().toISOString()}`);
    lines.push('');
    lines.push(`过去24小时: ${last24h.length} 个循环`);
    
    const success = last24h.filter(l => l.test.status === 'passed').length;
    const failed = last24h.filter(l => l.test.status === 'failed').length;
    lines.push(`- ✅ 成功: ${success}`);
    lines.push(`- ❌ 失败: ${failed}`);
    lines.push('');

    if (last24h.length > 0) {
      lines.push('## 最新活动');
      for (const log of last24h.slice(-5)) {
        const time = new Date(log.timestamp).toLocaleTimeString();
        const status = log.test.status === 'passed' ? '✅' : '❌';
        lines.push(`- ${time} ${status} ${log.build.what.substring(0, 50)}...`);
      }
      lines.push('');

      // 汇总学到的教训
      const allLearnings = last24h.flatMap(l => l.learnings || []);
      if (allLearnings.length > 0) {
        lines.push('## 新学到的教训');
        for (const learning of [...new Set(allLearnings)]) {
          lines.push(`- ${learning}`);
        }
      }
    }

    return lines.join('\n');
  }

  save() {
    const lines = ['# Progress Log', ''];
    
    for (const log of this.logs.slice(-100)) { // 保留最近100条
      const time = new Date(log.timestamp).toLocaleString();
      lines.push(`## ${time}`);
      lines.push('');
      lines.push(`**构建**: ${log.build.what}`);
      lines.push(`**测试**: ${log.test.status}`);
      lines.push(`**决策**: ${log.decision.action}`);
      if (log.learnings.length > 0) {
        lines.push(`**教训**: ${log.learnings.join(', ')}`);
      }
      lines.push('');
    }

    fs.writeFileSync(PROGRESS_PATH, lines.join('\n'), 'utf-8');
  }

  getReport() {
    return `ProgressLog: ${this.logs.length} 条记录`;
  }
}

// 导出模块
module.exports = { ProgressLogger };

// 直接运行
if (require.main === module) {
  const logger = new ProgressLogger();
  console.log(logger.getReport());
  console.log('\n--- 晨间简报 ---\n');
  console.log(logger.generateMorningBrief());
}
