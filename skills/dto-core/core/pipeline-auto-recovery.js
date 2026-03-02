#!/usr/bin/env node
/**
 * 流水线健康监控与自动恢复 v1.0
 * 监控流水线状态，故障后自动拉起
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const MONITOR_CONFIG = {
  pipelinePath: '/root/.openclaw/workspace/skills/dto-core/core/global-auto-decision-pipeline.js',
  feedbackPath: '/root/.openclaw/workspace/.pipeline-feedback.jsonl',
  statePath: '/root/.openclaw/workspace/.pipeline-monitor.json',
  // 流水线是批处理模式，cron每小时运行一次监控
  // 超过70分钟（1小时+10分钟缓冲）无新同步视为需要运行
  maxSilentMinutes: 70,
  maxFailures: 1 // 批处理模式下，1次检测到落后就触发运行
};

class PipelineAutoRecovery {
  constructor() {
    this.state = this.loadState();
  }

  loadState() {
    if (fs.existsSync(MONITOR_CONFIG.statePath)) {
      return JSON.parse(fs.readFileSync(MONITOR_CONFIG.statePath, 'utf8'));
    }
    return {
      lastRun: 0,
      consecutiveFailures: 0,
      totalRestarts: 0
    };
  }

  saveState() {
    fs.writeFileSync(MONITOR_CONFIG.statePath, JSON.stringify(this.state, null, 2));
  }

  /**
   * 检查流水线健康状态
   */
  checkHealth() {
    // 检查最后反馈时间（从文件内容中读取，而非 mtime）
    let lastFeedbackTime = 0;
    if (fs.existsSync(MONITOR_CONFIG.feedbackPath)) {
      try {
        const content = fs.readFileSync(MONITOR_CONFIG.feedbackPath, 'utf8');
        const lines = content.trim().split('\n').filter(l => l);
        if (lines.length > 0) {
          const lastEntry = JSON.parse(lines[lines.length - 1]);
          lastFeedbackTime = new Date(lastEntry.time).getTime();
        }
      } catch (e) {
        // 回退到文件修改时间
        const stats = fs.statSync(MONITOR_CONFIG.feedbackPath);
        lastFeedbackTime = stats.mtime.getTime();
      }
    }

    const silentMinutes = (Date.now() - lastFeedbackTime) / (60 * 1000);
    
    console.log(`[监控] 最后反馈: ${silentMinutes.toFixed(1)}分钟前`);

    // 超过10分钟无反馈，视为故障
    if (silentMinutes > MONITOR_CONFIG.maxSilentMinutes) {
      return { healthy: false, reason: `静默${silentMinutes.toFixed(0)}分钟` };
    }

    return { healthy: true };
  }

  /**
   * 记录监控心跳（避免误报）
   */
  recordHeartbeat() {
    const heartbeatEntry = {
      time: new Date().toISOString(),
      skill: 'dto-core',
      type: 'monitor_heartbeat',
      status: 'healthy'
    };
    fs.appendFileSync(MONITOR_CONFIG.feedbackPath, JSON.stringify(heartbeatEntry) + '\n');
  }

  /**
   * 运行流水线（同步执行，等待完成）
   */
  runPipeline() {
    console.log('[恢复] 运行流水线...');
    
    try {
      // 同步执行流水线，等待完成
      execSync(`node "${MONITOR_CONFIG.pipelinePath}"`, {
        stdio: 'inherit',
        timeout: 5 * 60 * 1000 // 5分钟超时
      });
      
      this.state.lastRun = Date.now();
      this.state.totalRuns = (this.state.totalRuns || 0) + 1;
      this.saveState();
      
      console.log('✅ 流水线执行完成');
      return true;
    } catch (e) {
      console.error(`[恢复] 执行失败: ${e.message}`);
      return false;
    }
  }

  /**
   * 主监控循环 - 批处理模式适配
   */
  monitor() {
    console.log('╔════════════════════════════════════════╗');
    console.log('║     流水线健康监控与自动恢复 v1.1      ║');
    console.log('║     [批处理模式 - 按需运行]            ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`[监控] 同步阈值: ${MONITOR_CONFIG.maxSilentMinutes}分钟 (适配每小时cron)`);
    console.log(`[监控] 历史运行: ${this.state.totalRuns || 0}次`);

    const health = this.checkHealth();

    if (!health.healthy) {
      console.log(`⚠️ 检测到落后: ${health.reason}`);
      console.log('🔄 触发流水线执行...');
      
      if (this.runPipeline()) {
        this.state.consecutiveFailures = 0;
        this.saveState();
      } else {
        this.state.consecutiveFailures++;
        this.saveState();
      }
    } else {
      console.log('✅ 流水线状态正常，无需执行');
      // 记录监控心跳，避免下次误报
      this.recordHeartbeat();
      this.state.consecutiveFailures = 0;
      this.saveState();
    }
  }
}

// 运行监控
const monitor = new PipelineAutoRecovery();
monitor.monitor();
