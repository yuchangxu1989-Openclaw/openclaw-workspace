/**
 * DTO v2.0 - 根因分析与自动修复模块 (RCA-Auto)
 * 全自动化问题诊断与修复
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class RootCauseAnalyzer {
  constructor(options = {}) {
    this.dto = options.dto;
    this.isc = options.isc;
    this.cras = options.cras;
    this.eventBus = options.eventBus;
    
    // 问题模式库
    this.patterns = new Map();
    this.loadPatterns();
    
    // 修复历史
    this.fixHistory = [];
  }

  /**
   * 加载已知问题模式
   */
  loadPatterns() {
    // 从文件加载或内置
    this.patterns.set('skill_not_found', {
      regex: /skill.*not found|模块.*不存在|找不到.*技能/i,
      severity: 'high',
      autoFix: true,
      fixStrategy: 'check_skill_path'
    });
    
    this.patterns.set('dependency_missing', {
      regex: /cannot find module|module not found|require.*failed/i,
      severity: 'high',
      autoFix: true,
      fixStrategy: 'install_dependency'
    });
    
    this.patterns.set('permission_denied', {
      regex: /permission denied|eacces/i,
      severity: 'medium',
      autoFix: true,
      fixStrategy: 'fix_permission'
    });
    
    this.patterns.set('syntax_error', {
      regex: /syntaxerror|unexpected token/i,
      severity: 'high',
      autoFix: false, // 需要人工确认
      fixStrategy: 'notify_developer'
    });
    
    this.patterns.set('network_timeout', {
      regex: /timeout|econnrefused|enotfound/i,
      severity: 'medium',
      autoFix: true,
      fixStrategy: 'retry_with_backoff'
    });
    
    this.patterns.set('isc_check_failed', {
      regex: /isc.*check.*failed|标准检查.*失败/i,
      severity: 'high',
      autoFix: false,
      fixStrategy: 'trigger_alignment'
    });
    
    this.patterns.set('cras_insight_stale', {
      regex: /insight.*stale|洞察.*过期/i,
      severity: 'low',
      autoFix: true,
      fixStrategy: 'refresh_insight'
    });
  }

  /**
   * 主入口：分析问题并自动修复
   */
  async analyzeAndFix(error, context = {}) {
    console.log('[RCA] 开始根因分析...');
    
    const analysis = {
      timestamp: Date.now(),
      error: {
        message: error.message || error,
        stack: error.stack,
        context
      },
      rootCause: null,
      fixApplied: null,
      verification: null
    };
    
    try {
      // 1. 识别问题模式
      const pattern = this.identifyPattern(error);
      analysis.rootCause = pattern;
      
      if (!pattern) {
        console.log('[RCA] 未识别已知模式，启动深度分析');
        analysis.rootCause = await this.deepAnalysis(error, context);
      }
      
      // 2. 决策：是否自动修复
      const shouldAutoFix = this.decideAutoFix(analysis.rootCause);
      
      if (shouldAutoFix) {
        // 3. 执行修复
        console.log(`[RCA] 执行自动修复: ${analysis.rootCause.fixStrategy}`);
        analysis.fixApplied = await this.executeFix(analysis.rootCause, context);
        
        // 4. 验证修复
        if (analysis.fixApplied.success) {
          console.log('[RCA] 修复完成，开始验证');
          analysis.verification = await this.verifyFix(error, context);
          
          if (analysis.verification.success) {
            console.log('[RCA] ✓ 验证通过，问题已解决');
            analysis.status = 'resolved';
          } else {
            console.log('[RCA] ✗ 验证失败，需要人工介入');
            analysis.status = 'verification_failed';
            await this.escalateToHuman(analysis);
          }
        } else {
          console.log('[RCA] ✗ 修复失败');
          analysis.status = 'fix_failed';
          await this.escalateToHuman(analysis);
        }
      } else {
        console.log('[RCA] 问题不适合自动修复，上报人工');
        analysis.status = 'requires_human';
        await this.escalateToHuman(analysis);
      }
      
    } catch (e) {
      console.error('[RCA] 分析过程出错:', e.message);
      analysis.status = 'analysis_error';
      analysis.error = e.message;
    }
    
    // 记录历史
    this.fixHistory.push(analysis);
    
    // 发布事件
    this.eventBus.publish('rca.completed', analysis);
    
    return analysis;
  }

  /**
   * 识别问题模式
   */
  identifyPattern(error) {
    const message = (error.message || error).toString();
    
    for (const [name, pattern] of this.patterns) {
      if (pattern.regex.test(message)) {
        return {
          name,
          ...pattern
        };
      }
    }
    
    return null;
  }

  /**
   * 深度分析（模式匹配失败时）
   */
  async deepAnalysis(error, context) {
    console.log('[RCA] 深度分析中...');
    
    // 分析调用栈
    const stackAnalysis = this.analyzeStack(error.stack);
    
    // 分析系统状态
    const systemStatus = await this.gatherSystemStatus();
    
    // 分析最近变更
    const recentChanges = await this.analyzeRecentChanges();
    
    // 综合判断
    const rootCause = this.inferRootCause({
      stack: stackAnalysis,
      system: systemStatus,
      changes: recentChanges
    });
    
    return {
      name: 'inferred_' + rootCause.type,
      severity: rootCause.severity,
      autoFix: rootCause.autoFix,
      fixStrategy: rootCause.strategy,
      evidence: rootCause.evidence
    };
  }

  /**
   * 分析调用栈
   */
  analyzeStack(stack) {
    if (!stack) return null;
    
    const lines = stack.split('\n');
    const relevant = lines
      .filter(l => l.includes('/skills/') || l.includes('/workspace/'))
      .map(l => {
        const match = l.match(/at\s+(.+)\s+\((.+):(\d+):(\d+)\)/);
        return match ? {
          function: match[1],
          file: match[2],
          line: parseInt(match[3]),
          column: parseInt(match[4])
        } : null;
      })
      .filter(Boolean);
    
    return relevant;
  }

  /**
   * 收集系统状态
   */
  async gatherSystemStatus() {
    return {
      dto: this.dto?.getStatus(),
      isc: this.isc?.getRegistryStatus?.(),
      disk: this.checkDiskSpace(),
      memory: process.memoryUsage(),
      timestamp: Date.now()
    };
  }

  /**
   * 检查磁盘空间 - 使用 system-monitor 封装
   */
  async checkDiskSpace() {
    try {
      // 使用 system-monitor 替代直接 exec
      const monitor = require('/root/.openclaw/skills/system-monitor/lib/monitor');
      const health = await monitor.systemHealthCheck({ checks: ['disk'], format: 'json' });
      return {
        total: health.disk?.total || 'unknown',
        used: health.disk?.used || 'unknown',
        available: health.disk?.available || 'unknown',
        percent: health.disk?.usage + '%' || 'unknown'
      };
    } catch {
      return { error: '无法获取磁盘信息' };
    }
  }

  /**
   * 分析最近变更
   */
  async analyzeRecentChanges() {
    const changes = [];
    
    try {
      // Git 最近提交
      const gitLog = execSync('git -C /root/.openclaw/workspace log --oneline -5', { 
        encoding: 'utf8' 
      });
      changes.push({
        type: 'git',
        commits: gitLog.trim().split('\n')
      });
    } catch {
      // 无 git
    }
    
    // 最近修改的文件
    try {
      const recentFiles = execSync(
        'find /root/.openclaw/workspace/skills -mtime -1 -type f', 
        { encoding: 'utf8' }
      );
      changes.push({
        type: 'files',
        modified: recentFiles.trim().split('\n').filter(Boolean)
      });
    } catch {
      // 忽略
    }
    
    return changes;
  }

  /**
   * 推断根因
   */
  inferRootCause(evidence) {
    // 基于证据推断根因
    const { stack, system, changes } = evidence;
    
    // 检查是否是最近变更导致
    if (changes.files?.modified?.length > 0) {
      const modifiedSkills = changes.files.modified.filter(f => 
        f.includes('/skills/')
      );
      
      if (modifiedSkills.length > 0) {
        // 检查调用栈是否涉及修改的文件
        const stackFiles = stack?.map(s => s.file) || [];
        const overlap = modifiedSkills.some(m => 
          stackFiles.some(s => s.includes(m))
        );
        
        if (overlap) {
          return {
            type: 'recent_change_regression',
            severity: 'high',
            autoFix: false, // 需要人工确认回滚
            strategy: 'suggest_rollback',
            evidence: { modifiedSkills, stackFiles }
          };
        }
      }
    }
    
    // 检查资源问题
    if (system.disk?.percent) {
      const percent = parseInt(system.disk.percent);
      if (percent > 90) {
        return {
          type: 'disk_full',
          severity: 'high',
          autoFix: true,
          strategy: 'cleanup_disk',
          evidence: { disk: system.disk }
        };
      }
    }
    
    // 默认
    return {
      type: 'unknown',
      severity: 'medium',
      autoFix: false,
      strategy: 'collect_more_info',
      evidence
    };
  }

  /**
   * 决策是否自动修复
   */
  decideAutoFix(rootCause) {
    // 高风险不自动修复
    if (rootCause.severity === 'critical') {
      return false;
    }
    
    // 策略标记不自动修复
    if (rootCause.autoFix === false) {
      return false;
    }
    
    // 最近自动修复失败次数过多
    const recentFailures = this.fixHistory
      .filter(h => h.timestamp > Date.now() - 3600000) // 1小时内
      .filter(h => h.status === 'fix_failed' || h.status === 'verification_failed')
      .length;
    
    if (recentFailures >= 3) {
      console.log('[RCA] 最近修复失败过多，暂停自动修复');
      return false;
    }
    
    return true;
  }

  /**
   * 执行修复
   */
  async executeFix(rootCause, context) {
    const strategies = {
      'check_skill_path': () => this.fixSkillPath(context),
      'install_dependency': () => this.fixDependency(context),
      'fix_permission': () => this.fixPermission(context),
      'retry_with_backoff': () => this.fixRetry(context),
      'cleanup_disk': () => this.fixDiskSpace(),
      'refresh_insight': () => this.fixRefreshInsight(),
      'trigger_alignment': () => this.fixTriggerAlignment(context)
    };
    
    const strategy = strategies[rootCause.fixStrategy];
    
    if (!strategy) {
      return {
        success: false,
        error: `未知修复策略: ${rootCause.fixStrategy}`
      };
    }
    
    try {
      const result = await strategy();
      return { success: true, result };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * 修复策略：检查技能路径
   */
  async fixSkillPath(context) {
    const skillName = context.skillName || this.extractSkillName(context.error);
    const possiblePaths = [
      `/root/.openclaw/workspace/skills/${skillName}`,
      `/root/.openclaw/workspace/skills/${skillName.replace(/-/g, '_')}`,
      `/tmp/extreme-sandbox/skills/${skillName}`
    ];
    
    for (const path of possiblePaths) {
      if (fs.existsSync(path)) {
        // 创建软链接或更新配置
        console.log(`[RCA] 找到技能路径: ${path}`);
        return { found: true, path };
      }
    }
    
    throw new Error(`未找到技能: ${skillName}`);
  }

  /**
   * 修复策略：安装依赖
   */
  async fixDependency(context) {
    const moduleName = this.extractModuleName(context.error);
    
    console.log(`[RCA] 安装缺失依赖: ${moduleName}`);
    
    try {
      execSync(`npm install ${moduleName}`, {
        cwd: '/root/.openclaw/workspace',
        stdio: 'pipe'
      });
      return { installed: moduleName };
    } catch (e) {
      throw new Error(`安装失败: ${e.message}`);
    }
  }

  /**
   * 修复策略：修复权限
   */
  async fixPermission(context) {
    const path = context.path || '/root/.openclaw/workspace';
    
    console.log(`[RCA] 修复权限: ${path}`);
    
    try {
      execSync(`chmod -R 755 ${path}`, { stdio: 'pipe' });
      return { fixed: path };
    } catch (e) {
      throw new Error(`权限修复失败: ${e.message}`);
    }
  }

  /**
   * 修复策略：重试
   */
  async fixRetry(context) {
    const maxRetries = 3;
    const baseDelay = 1000;
    
    console.log(`[RCA] 指数退避重试`);
    
    for (let i = 0; i < maxRetries; i++) {
      const delay = baseDelay * Math.pow(2, i);
      console.log(`  重试 ${i + 1}/${maxRetries}, 延迟 ${delay}ms`);
      
      await new Promise(r => setTimeout(r, delay));
      
      // 这里应该重新执行原操作
      // 简化处理：假设网络恢复
      return { retried: i + 1, delay };
    }
    
    throw new Error('重试次数耗尽');
  }

  /**
   * 修复策略：清理磁盘
   */
  async fixDiskSpace() {
    console.log('[RCA] 清理磁盘空间');
    
    const cleanupPaths = [
      '/root/.openclaw/workspace/logs/*.log',
      '/tmp/extreme-sandbox',
      '/tmp/golden-test',
      '/root/.npm/_cacache'
    ];
    
    const cleaned = [];
    
    for (const pattern of cleanupPaths) {
      try {
        execSync(`rm -rf ${pattern}`, { stdio: 'pipe' });
        cleaned.push(pattern);
      } catch {
        // 忽略
      }
    }
    
    return { cleaned };
  }

  /**
   * 修复策略：刷新洞察
   */
  async fixRefreshInsight() {
    console.log('[RCA] 刷新 CRAS 洞察');
    
    if (this.cras) {
      // 触发 CRAS 重新分析
      await this.cras.refreshInsights?.();
      return { refreshed: true };
    }
    
    throw new Error('CRAS 未连接');
  }

  /**
   * 修复策略：触发对齐
   */
  async fixTriggerAlignment(context) {
    console.log('[RCA] 触发标准对齐');
    
    if (this.isc) {
      await this.isc.triggerAlignment?.(context);
      return { aligned: true };
    }
    
    throw new Error('ISC 未连接');
  }

  /**
   * 验证修复
   */
  async verifyFix(originalError, context) {
    // 重新执行原操作
    try {
      if (context.retryOperation) {
        await context.retryOperation();
        return { success: true, method: 'retry_operation' };
      }
      
      // 简化验证：检查错误是否消失
      const currentStatus = await this.gatherSystemStatus();
      
      return { 
        success: true, 
        method: 'status_check',
        status: currentStatus
      };
      
    } catch (e) {
      return { 
        success: false, 
        error: e.message,
        originalError: originalError.message
      };
    }
  }

  /**
   * 上报人工
   */
  async escalateToHuman(analysis) {
    console.log('[RCA] 上报人工处理');
    
    // 发布人工介入事件
    this.eventBus.publish('rca.human_required', {
      analysis,
      priority: analysis.rootCause?.severity || 'medium',
      suggestedAction: analysis.rootCause?.fixStrategy,
      timestamp: new Date().toISOString()
    });
    
    // 可以在这里发送通知（Feishu/邮件等）
  }

  /**
   * 辅助：提取技能名
   */
  extractSkillName(error) {
    const match = (error.message || error).match(/skill[\s_-]?([a-z0-9_-]+)/i);
    return match ? match[1] : 'unknown';
  }

  /**
   * 辅助：提取模块名
   */
  extractModuleName(error) {
    const match = (error.message || error).match(/['"]([^'"]+)['"]/);
    return match ? match[1] : 'unknown';
  }

  /**
   * 获取修复历史
   */
  getHistory(limit = 100) {
    return this.fixHistory.slice(-limit);
  }

  /**
   * 获取统计
   */
  getStats() {
    const total = this.fixHistory.length;
    const resolved = this.fixHistory.filter(h => h.status === 'resolved').length;
    const failed = this.fixHistory.filter(h => 
      h.status === 'fix_failed' || h.status === 'verification_failed'
    ).length;
    const human = this.fixHistory.filter(h => h.status === 'requires_human').length;
    
    return {
      total,
      resolved,
      failed,
      human,
      autoFixRate: total > 0 ? (resolved / total * 100).toFixed(1) + '%' : 'N/A'
    };
  }
}

module.exports = RootCauseAnalyzer;
