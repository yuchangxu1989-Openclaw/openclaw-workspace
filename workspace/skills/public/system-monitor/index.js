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
const { CRON_DIR, AGENTS_DIR, WORKSPACE } = _require('../shared/paths');

const MONITOR_CONFIG = {
  version: '1.0.1',
  paths: {
    cron: path.join(CRON_DIR, 'jobs.json'),
    sessions: path.join(AGENTS_DIR, 'main/sessions'),
    workspace: WORKSPACE
  },
  thresholds: {
    maxCronError: 3,      // 最大连续错误次数
    maxSessionAge: 3600000, // 最大会话年龄1小时
    maxDiskUsage: 90      // 最大磁盘使用率90%
  }
};

class SystemMonitor {
  constructor() {
    this.issues = [];
    this.status = { healthy: true };
  }

  async checkHealth() {
    console.log('[SystemMonitor] 开始健康检查...');
    
    // 检查Cron任务
    await this.checkCronJobs();
    
    // 检查磁盘空间
    await this.checkDiskSpace();
    
    // 生成报告
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
        if (job.state?.consecutiveErrors > MONITOR_CONFIG.thresholds.maxCronError) {
          this.issues.push({
            type: 'cron',
            severity: 'error',
            job: job.name,
            message: `任务连续失败 ${job.state.consecutiveErrors} 次`
          });
        }
      }
      
      console.log(`  Cron任务检查: ${jobs.jobs?.length || 0} 个任务`);
    } catch (e) {
      this.issues.push({ type: 'cron', severity: 'error', message: e.message });
    }
  }

  async checkDiskSpace() {
    try {
      const output = execSync('df -h / | tail -1', { encoding: 'utf8' });
      const match = output.match(/(\d+)%/);
      if (match) {
        const usage = parseInt(match[1]);
        if (usage > MONITOR_CONFIG.thresholds.maxDiskUsage) {
          this.issues.push({
            type: 'disk',
            severity: 'critical',
            message: `磁盘使用率 ${usage}% 超过阈值`
          });
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
      summary: {
        total: this.issues.length,
        errors: errors.length,
        warnings: warnings.length
      },
      issues: this.issues
    };
    
    console.log('\n[SystemMonitor] 健康报告:');
    console.log(`  状态: ${report.status}`);
    console.log(`  问题: ${errors.length} 错误, ${warnings.length} 警告`);
    
    return report;
  }
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  const monitor = new SystemMonitor();
  
  if (args.includes('health')) {
    const report = await monitor.checkHealth();
    process.exit(report.status === 'healthy' ? 0 : 1);
  } else {
    console.log('Usage: node index.js health');
  }
}

export { SystemMonitor };

// 运行主函数
main().catch(console.error);
