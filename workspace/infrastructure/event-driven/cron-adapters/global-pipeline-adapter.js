#!/usr/bin/env node
/**
 * 全局自主决策流水线 — Cron Adapter (Check-and-Skip + 重构报告)
 * 
 * 替代原来每30分钟全量扫描。
 * 检查 Git Change Watcher 是否已处理变更，如果是则跳过。
 * 
 * 完全重构报告格式：
 *   旧：检测到变更N项 + 版本递增
 *   新：变更分类（代码/配置/日志/数据）+ 语义分析 + 按需动作
 */
'use strict';

const path = require('path');
const { shouldSkip, markCronExecuted } = require('../cron-check-skip');
const { getGitChanges, generateChangeReport } = require('../watchers/git-change-watcher');
const bus = require('../../event-bus/bus');

const TASK_ID = 'global-pipeline';
const MAX_AGE_MS = 60 * 60 * 1000; // 60分钟（cron周期30分钟 * 2）

/**
 * 生成语义分析报告（v2格式）
 */
function generateSemanticReport(changes) {
  const report = generateChangeReport(changes);
  
  // 增强：语义分析
  const semanticInsights = [];
  
  // 代码变更语义
  if (report.categories.code) {
    const codeFiles = report.categories.code.files;
    const skillChanges = codeFiles.filter(f => f.path.startsWith('skills/'));
    const infraChanges = codeFiles.filter(f => f.path.startsWith('infrastructure/'));
    
    if (skillChanges.length > 0) {
      semanticInsights.push({
        type: 'skill-evolution',
        message: `${skillChanges.length}个技能文件变更，建议触发质量检测`,
        severity: 'medium',
        affected: skillChanges.map(f => f.path)
      });
    }
    
    if (infraChanges.length > 0) {
      semanticInsights.push({
        type: 'infrastructure-change',
        message: `${infraChanges.length}个基础设施变更，建议运行集成测试`,
        severity: 'high',
        affected: infraChanges.map(f => f.path)
      });
    }
  }
  
  // 配置变更语义
  if (report.categories.config) {
    const configFiles = report.categories.config.files;
    const ruleChanges = configFiles.filter(f => f.path.includes('rules/'));
    const routeChanges = configFiles.filter(f => f.path.includes('routes.json'));
    
    if (ruleChanges.length > 0) {
      semanticInsights.push({
        type: 'isc-rule-change',
        message: `${ruleChanges.length}个ISC规则变更，需要同步DTO`,
        severity: 'high',
        affected: ruleChanges.map(f => f.path)
      });
    }
    
    if (routeChanges.length > 0) {
      semanticInsights.push({
        type: 'dispatcher-route-change',
        message: 'Dispatcher路由表变更，需要验证路由完整性',
        severity: 'high',
        affected: routeChanges.map(f => f.path)
      });
    }
  }
  
  // 日志/数据变更（通常不需要动作，但超量预警）
  if (report.categories.log && report.categories.log.count > 10) {
    semanticInsights.push({
      type: 'log-volume-alert',
      message: `日志文件变更${report.categories.log.count}项，可能需要清理`,
      severity: 'low',
      affected: []
    });
  }
  
  return {
    ...report,
    semantic_insights: semanticInsights,
    recommended_actions: semanticInsights
      .filter(i => i.severity !== 'low')
      .flatMap(i => {
        switch (i.type) {
          case 'skill-evolution': return ['skill-quality-check'];
          case 'infrastructure-change': return ['integration-test'];
          case 'isc-rule-change': return ['lto-sync', 'isc-validate'];
          case 'dispatcher-route-change': return ['route-validate'];
          default: return [];
        }
      })
  };
}

async function main() {
  // 1. Check-and-skip
  const skipResult = shouldSkip(TASK_ID, {
    maxAgeMs: MAX_AGE_MS,
    hasNewChanges: () => {
      const changes = getGitChanges();
      return changes.length > 0;
    }
  });
  
  if (skipResult.skip) {
    console.log(JSON.stringify({
      status: 'SKIPPED',
      task: TASK_ID,
      reason: skipResult.reason,
      message: `Git Change Watcher 已处理变更，cron跳过`,
      timestamp: new Date().toISOString()
    }));
    markCronExecuted(TASK_ID, 'skipped');
    process.exit(0);
  }
  
  // 2. 执行全量扫描（cron兜底）
  console.log(`[cron-adapter] ${TASK_ID}: 执行cron兜底扫描`);
  
  try {
    const changes = getGitChanges();
    
    if (changes.length === 0) {
      console.log(JSON.stringify({
        status: 'IDLE',
        task: TASK_ID,
        message: '无Git变更',
        timestamp: new Date().toISOString()
      }));
      markCronExecuted(TASK_ID, 'idle');
      process.exit(0);
    }
    
    // 生成语义化报告
    const report = generateSemanticReport(changes);
    
    // emit 事件
    bus.emit('file.changed', {
      trigger: 'cron-fallback',
      report: {
        total: report.total_changes,
        summary: report.summary,
        categories: Object.keys(report.categories),
        actions_needed: report.actions_needed,
        semantic_insights: report.semantic_insights,
        recommended_actions: report.recommended_actions
      },
      detected_at: Date.now()
    }, 'global-pipeline-cron');
    
    console.log(JSON.stringify({
      status: 'OK',
      task: TASK_ID,
      mode: 'cron-fallback',
      report: {
        total_changes: report.total_changes,
        summary: report.summary,
        semantic_insights_count: report.semantic_insights.length,
        recommended_actions: report.recommended_actions
      },
      timestamp: new Date().toISOString()
    }));
    
    markCronExecuted(TASK_ID, 'executed');
  } catch (err) {
    console.error(JSON.stringify({
      status: 'ERROR',
      task: TASK_ID,
      error: err.message,
      timestamp: new Date().toISOString()
    }));
    markCronExecuted(TASK_ID, 'error');
    process.exit(1);
  }
}

main();
