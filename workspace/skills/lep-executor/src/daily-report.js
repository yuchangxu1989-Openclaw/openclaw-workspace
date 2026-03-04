#!/usr/bin/env node
/**
 * LEP 韧性日报生成器
 * 生成每日系统韧性状态报告
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { WORKSPACE } = require('../../_shared/paths');

// 配置
const WORKSPACE_ROOT = WORKSPACE;
const REPORT_DATE = new Date().toLocaleDateString('zh-CN', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'long'
});
const TIMESTAMP = new Date().toISOString();

// 颜色代码（终端输出用）
const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  bold: '\x1b[1m'
};

/**
 * 检查技能目录状态
 */
function checkSkillsHealth() {
  const skillsDir = path.join(WORKSPACE_ROOT, 'skills');
  const results = {
    total: 0,
    healthy: 0,
    issues: []
  };

  try {
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    const skillDirs = entries.filter(e => e.isDirectory()).map(e => e.name);
    
    results.total = skillDirs.length;

    for (const skill of skillDirs) {
      const skillPath = path.join(skillsDir, skill);
      const skillMdPath = path.join(skillPath, 'SKILL.md');
      
      // 检查 SKILL.md 是否存在
      if (!fs.existsSync(skillMdPath)) {
        results.issues.push({
          skill,
          severity: 'warning',
          message: 'SKILL.md 缺失'
        });
        continue;
      }

      // 检查 package.json（如果是Node技能）
      const pkgPath = path.join(skillPath, 'package.json');
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
          const nodeModulesPath = path.join(skillPath, 'node_modules');
          if (!fs.existsSync(nodeModulesPath)) {
            results.issues.push({
              skill,
              severity: 'info',
              message: 'Node模块未安装'
            });
          }
        } catch (e) {
          results.issues.push({
            skill,
            severity: 'error',
            message: 'package.json 解析失败'
          });
        }
      }

      results.healthy++;
    }
  } catch (error) {
    results.issues.push({
      skill: 'system',
      severity: 'error',
      message: `无法读取技能目录: ${error.message}`
    });
  }

  return results;
}

/**
 * 检查关键系统文件
 */
function checkSystemFiles() {
  const criticalFiles = [
    { path: 'CAPABILITY-ANCHOR.md', name: '能力锚点' },
    { path: 'MEMORY.md', name: '长期记忆' },
    { path: 'SOUL.md', name: '身份设定' },
    { path: 'skills/isc-core/config/evomap-upload-manifest.json', name: 'EvoMap清单' }
  ];

  const results = {
    healthy: 0,
    total: criticalFiles.length,
    issues: []
  };

  for (const file of criticalFiles) {
    const fullPath = path.join(WORKSPACE_ROOT, file.path);
    if (fs.existsSync(fullPath)) {
      try {
        const stats = fs.statSync(fullPath);
        const age = Date.now() - stats.mtime.getTime();
        const ageDays = Math.floor(age / (1000 * 60 * 60 * 24));
        
        results.healthy++;
        
        if (ageDays > 7) {
          results.issues.push({
            file: file.name,
            severity: 'info',
            message: `${ageDays}天未更新`
          });
        }
      } catch (e) {
        results.issues.push({
          file: file.name,
          severity: 'warning',
          message: '状态读取失败'
        });
      }
    } else {
      results.issues.push({
        file: file.name,
        severity: 'critical',
        message: '文件缺失'
      });
    }
  }

  return results;
}

/**
 * 获取Git状态
 */
function getGitStatus() {
  try {
    const status = execSync('git status --short', { 
      cwd: WORKSPACE_ROOT,
      encoding: 'utf8',
      timeout: 5000
    });
    
    const unpushed = execSync('git log origin/main..HEAD --oneline 2>/dev/null || echo ""', {
      cwd: WORKSPACE_ROOT,
      encoding: 'utf8',
      timeout: 5000
    });

    return {
      uncommitted: status.trim().split('\n').filter(l => l.trim()).length,
      unpushed: unpushed.trim().split('\n').filter(l => l.trim()).length,
      dirty: status.trim().length > 0 || unpushed.trim().length > 0
    };
  } catch (error) {
    return {
      uncommitted: -1,
      unpushed: -1,
      dirty: false,
      error: error.message
    };
  }
}

/**
 * 检查Cron任务状态
 */
function checkCronJobs() {
  try {
    // 尝试读取crontab或检查cron服务
    const cronStatus = execSync('systemctl is-active cron 2>/dev/null || echo "unknown"', {
      encoding: 'utf8',
      timeout: 3000
    });
    
    return {
      service: cronStatus.trim(),
      healthy: cronStatus.trim() === 'active'
    };
  } catch (error) {
    return {
      service: 'unknown',
      healthy: false,
      error: error.message
    };
  }
}

/**
 * 检查磁盘空间
 */
function checkDiskSpace() {
  try {
    const df = execSync('df -h /root | tail -1', {
      encoding: 'utf8',
      timeout: 3000
    });
    
    const parts = df.trim().split(/\s+/);
    const usagePercent = parseInt(parts[4]?.replace('%', '') || '0');
    
    return {
      total: parts[1] || 'N/A',
      used: parts[2] || 'N/A',
      available: parts[3] || 'N/A',
      usagePercent,
      healthy: usagePercent < 80
    };
  } catch (error) {
    return {
      total: 'N/A',
      used: 'N/A',
      available: 'N/A',
      usagePercent: -1,
      healthy: false,
      error: error.message
    };
  }
}

/**
 * 生成日报
 */
function generateReport() {
  const skillsHealth = checkSkillsHealth();
  const systemFiles = checkSystemFiles();
  const gitStatus = getGitStatus();
  const cronStatus = checkCronJobs();
  const diskSpace = checkDiskSpace();

  // 计算总体健康度
  let healthScore = 100;
  let criticalIssues = 0;
  let warnings = 0;

  // 技能健康度扣分
  if (skillsHealth.total > 0) {
    const skillHealthRate = skillsHealth.healthy / skillsHealth.total;
    if (skillHealthRate < 0.9) healthScore -= 10;
    if (skillHealthRate < 0.8) healthScore -= 20;
  }

  // 系统文件扣分
  if (systemFiles.healthy < systemFiles.total) {
    healthScore -= (systemFiles.total - systemFiles.healthy) * 15;
  }

  // Git状态扣分
  if (gitStatus.dirty) healthScore -= 5;

  // Cron服务扣分
  if (!cronStatus.healthy) healthScore -= 10;

  // 磁盘空间扣分
  if (!diskSpace.healthy) healthScore -= 15;

  // 统计问题
  const allIssues = [
    ...skillsHealth.issues.map(i => ({ ...i, category: '技能' })),
    ...systemFiles.issues.map(i => ({ ...i, category: '系统文件' }))
  ];
  
  criticalIssues = allIssues.filter(i => i.severity === 'critical').length;
  warnings = allIssues.filter(i => i.severity === 'warning' || i.severity === 'info').length;

  healthScore = Math.max(0, Math.min(100, healthScore));

  // 确定健康等级
  let healthLevel = '🟢 健康';
  if (healthScore < 60) healthLevel = '🔴 严重';
  else if (healthScore < 80) healthLevel = '🟡 警告';

  return {
    date: REPORT_DATE,
    timestamp: TIMESTAMP,
    healthScore,
    healthLevel,
    summary: {
      skills: `${skillsHealth.healthy}/${skillsHealth.total} 健康`,
      systemFiles: `${systemFiles.healthy}/${systemFiles.total} 完整`,
      git: gitStatus.dirty ? `${gitStatus.uncommitted} 未提交, ${gitStatus.unpushed} 未推送` : '已同步',
      cron: cronStatus.healthy ? '运行中' : '异常',
      disk: `${diskSpace.usagePercent}% 使用率`
    },
    details: {
      skillsHealth,
      systemFiles,
      gitStatus,
      cronStatus,
      diskSpace
    },
    issues: allIssues,
    stats: {
      criticalIssues,
      warnings,
      totalIssues: allIssues.length
    }
  };
}

/**
 * 格式化输出报告
 */
function formatReport(report) {
  const lines = [
    `╔════════════════════════════════════════════════════════════╗`,
    `║           LEP 韧性执行中心 - 每日健康报告                   ║`,
    `╚════════════════════════════════════════════════════════════╝`,
    ``,
    `📅 报告时间: ${report.date}`,
    `🕐 生成时间: ${report.timestamp}`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `📊 总体健康度: ${report.healthScore}/100 ${report.healthLevel}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `📋 执行摘要`,
    `────────────────────────────────────────────────────────────`,
    `  🧩 技能系统:     ${report.summary.skills}`,
    `  📁 系统文件:     ${report.summary.systemFiles}`,
    `  📝 Git状态:      ${report.summary.git}`,
    `  ⏰ Cron服务:     ${report.summary.cron}`,
    `  💾 磁盘空间:     ${report.summary.disk}`,
    ``,
    `⚠️  问题统计`,
    `────────────────────────────────────────────────────────────`,
    `  🔴 严重问题: ${report.stats.criticalIssues}`,
    `  🟡 警告/提示: ${report.stats.warnings}`,
    `  📊 总计: ${report.stats.totalIssues}`,
    ``,
  ];

  if (report.issues.length > 0) {
    lines.push(`📋 详细问题列表`);
    lines.push(`────────────────────────────────────────────────────────────`);
    
    for (const issue of report.issues) {
      const icon = issue.severity === 'critical' ? '🔴' : 
                   issue.severity === 'warning' ? '🟡' : 'ℹ️';
      const name = issue.skill || issue.file || '系统';
      lines.push(`  ${icon} [${issue.category || '未知'}] ${name}: ${issue.message}`);
    }
    lines.push('');
  }

  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`💡 LEP (Local Execution Protocol) 韧性执行中心 v1.0`);
  lines.push(`   确保系统在任何条件下都能可靠执行关键任务`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  return lines.join('\n');
}

/**
 * 保存报告到文件
 */
function saveReport(report, content) {
  try {
    const reportsDir = path.join(WORKSPACE_ROOT, 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const dateStr = new Date().toISOString().split('T')[0];
    const reportPath = path.join(reportsDir, `lep-daily-report-${dateStr}.txt`);
    
    fs.writeFileSync(reportPath, content, 'utf8');
    
    // 同时保存JSON版本
    const jsonPath = path.join(reportsDir, `lep-daily-report-${dateStr}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
    
    return reportPath;
  } catch (error) {
    return null;
  }
}

// 主程序
function main() {
  try {
    const report = generateReport();
    const formatted = formatReport(report);
    
    // 输出到控制台
    console.log(formatted);
    
    // 保存到文件
    const savedPath = saveReport(report, formatted);
    if (savedPath) {
      console.log(`\n💾 报告已保存: ${savedPath}`);
    }
    
    // 返回退出码（用于cron健康检查）
    process.exit(report.healthScore >= 60 ? 0 : 1);
  } catch (error) {
    console.error('❌ 报告生成失败:', error.message);
    process.exit(2);
  }
}

main();
