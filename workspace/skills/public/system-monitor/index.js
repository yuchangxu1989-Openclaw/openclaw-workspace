#!/usr/bin/env node
/**
 * System Monitor - 系统健康监控
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const _require = createRequire(import.meta.url);
const { CRON_DIR, AGENTS_DIR, WORKSPACE } = _require('../../shared/paths');

const MONITOR_CONFIG = {
  version: '1.2.0',
  paths: {
    cron: path.join(CRON_DIR, 'jobs.json'),
    sessions: path.join(AGENTS_DIR, 'main/sessions'),
    workspace: WORKSPACE,
    dispatcherHandlerState: path.join(WORKSPACE, 'infrastructure/resilience/handler-state.json'),
    autoRepairScript: path.join(WORKSPACE, 'infrastructure/monitoring/auto-rootcause-repair.js'),
    // 收编脚本路径
    alertAutoRootcause: path.join(__dirname, 'scripts/alert-auto-rootcause.js'),
    alertResponseGuard: path.join(__dirname, 'scripts/alert-response-guard.js'),
    mainAgentWatchdog: path.join(__dirname, 'scripts/main-agent-watchdog.sh'),
    gitPushHealthCheck: path.join(__dirname, 'scripts/git-push-health-check.sh')
  },
  thresholds: {
    maxCronError: 3,
    maxSessionAge: 3600000,
    maxDiskUsage: 90
  }
};

class SystemMonitor {
  constructor(options = {}) {
    this.issues = [];
    this.status = { healthy: true };
    this.options = options;
    this.autoRepairSummary = null;
  }

  async checkHealth() {
    console.log('[SystemMonitor] 开始健康检查...');
    await this.checkCronJobs();
    await this.checkDispatcherHandlers();
    await this.checkDiskSpace();
    if (this.options.autoRootcauseRepair) {
      await this.runAutoRootcauseRepair();
      this.issues = [];
      await this.checkCronJobs();
      await this.checkDispatcherHandlers();
      await this.checkDiskSpace();
    }
    return this.generateReport();
  }

  async checkCronJobs() {
    try {
      const cronPath = MONITOR_CONFIG.paths.cron;
      if (!fs.existsSync(cronPath)) {
        this.issues.push({ type: 'cron', severity: 'warning', message: 'Cron配置文件不存在' });
        return;
      }
      const jobs = JSON.parse(fs.readFileSync(cronPath, 'utf8'));
      for (const job of jobs.jobs || []) {
        const enabled = job.enabled !== false;
        const state = job.state || {};
        const consecutiveErrors = Number(state.consecutiveErrors || 0);
        const lastStatus = state.lastStatus || state.lastRunStatus || job.lastStatus || null;
        const lastError = state.lastError || job.lastError || '';

        if (!enabled && (consecutiveErrors > 0 || String(lastStatus).toLowerCase() === 'error' || String(lastError).trim())) {
          this.issues.push({
            type: 'cron',
            severity: 'warning',
            job: job.name,
            message: '任务已禁用，但保留历史错误状态，需清理避免误报',
            rootCause: 'disabled_job_with_historical_error_state',
            autoRepairable: true
          });
          continue;
        }

        if (enabled && consecutiveErrors > MONITOR_CONFIG.thresholds.maxCronError) {
          this.issues.push({
            type: 'cron',
            severity: 'error',
            job: job.name,
            message: `任务连续失败 ${consecutiveErrors} 次`,
            rootCause: 'active_job_repeated_failure',
            autoRepairable: false
          });
        }
      }
      console.log(`  Cron任务检查: ${jobs.jobs?.length || 0} 个任务`);
    } catch (e) {
      this.issues.push({ type: 'cron', severity: 'error', message: e.message });
    }
  }

  async checkDispatcherHandlers() {
    try {
      const file = MONITOR_CONFIG.paths.dispatcherHandlerState;
      if (!fs.existsSync(file)) return;
      const state = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const [handler, health] of Object.entries(state || {})) {
        if (health?.disabled) {
          this.issues.push({
            type: 'dispatcher',
            severity: 'error',
            handler,
            message: `Handler ${handler} 已被熔断禁用`,
            rootCause: 'handler_circuit_breaker_open',
            autoRepairable: false
          });
        }
      }
    } catch (e) {
      this.issues.push({ type: 'dispatcher', severity: 'warning', message: `无法检查dispatcher handler状态: ${e.message}` });
    }
  }

  async runAutoRootcauseRepair() {
    try {
      const out = execSync(`node ${MONITOR_CONFIG.paths.autoRepairScript}`, { encoding: 'utf8' });
      this.autoRepairSummary = JSON.parse(out.trim().split('\n').filter(Boolean).pop());
      console.log(`[SystemMonitor] 自动根因分析/修复完成: findings=${this.autoRepairSummary.findings}`);
    } catch (e) {
      this.issues.push({ type: 'repair', severity: 'warning', message: `自动根因修复执行失败: ${e.message}` });
    }
  }

  async checkDiskSpace() {
    try {
      const output = execSync('df -h / | tail -1', { encoding: 'utf8' });
      const match = output.match(/(\d+)%/);
      if (match) {
        const usage = parseInt(match[1]);
        if (usage > MONITOR_CONFIG.thresholds.maxDiskUsage) {
          this.issues.push({ type: 'disk', severity: 'critical', message: `磁盘使用率 ${usage}% 超过阈值` });
        }
        console.log(`  磁盘使用: ${usage}%`);
      }
    } catch (e) {
      this.issues.push({ type: 'disk', severity: 'warning', message: '无法检查磁盘空间' });
    }
  }

  generateReport() {
    const errors = this.issues.filter(i => i.severity === 'error' || i.severity === 'critical');
    const warnings = this.issues.filter(i => i.severity === 'warning');
    this.status.healthy = errors.length === 0;
    const report = {
      timestamp: new Date().toISOString(),
      status: this.status.healthy ? 'healthy' : 'unhealthy',
      summary: { total: this.issues.length, errors: errors.length, warnings: warnings.length },
      issues: this.issues,
      autoRepair: this.autoRepairSummary
    };
    console.log('\n[SystemMonitor] 健康报告:');
    console.log(`  状态: ${report.status}`);
    console.log(`  问题: ${errors.length} 错误, ${warnings.length} 警告`);
    if (report.autoRepair) console.log(`  自动处置: ${report.autoRepair.autoRepaired} 修复, ${report.autoRepair.tasksCreated} 派单`);
    return report;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const monitor = new SystemMonitor({ autoRootcauseRepair: args.includes('--auto-rootcause-repair') });

  switch (cmd) {
    case 'health': {
      const report = await monitor.checkHealth();
      process.exit(report.status === 'healthy' ? 0 : 1);
      break;
    }
    case 'alert-rootcause': {
      execSync(`node ${MONITOR_CONFIG.paths.alertAutoRootcause}`, { stdio: 'inherit' });
      break;
    }
    case 'alert-guard': {
      const subArgs = args.slice(1).join(' ');
      execSync(`node ${MONITOR_CONFIG.paths.alertResponseGuard} ${subArgs}`, { stdio: 'inherit' });
      break;
    }
    case 'watchdog': {
      const subArgs = args.slice(1).join(' ');
      execSync(`bash ${MONITOR_CONFIG.paths.mainAgentWatchdog} ${subArgs}`, { stdio: 'inherit' });
      break;
    }
    case 'git-probe': {
      execSync(`bash ${MONITOR_CONFIG.paths.gitPushHealthCheck}`, { stdio: 'inherit' });
      break;
    }
    default:
      console.log(`Usage: node index.js <command>

Commands:
  health [--auto-rootcause-repair]  系统健康检查
  alert-rootcause                   告警根因自动分析
  alert-guard [resolve <rule_id>]   未响应告警扫描/标记已响应
  watchdog [--watch] [--interval N] 主Agent文件操作违规检测
  git-probe                         Git push健康探针`);
  }
}

export { SystemMonitor };
main().catch(console.error);
