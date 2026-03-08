/**
 * N016: Repair Loop Executor
 * 修复循环执行器 - 流水线后自动修复循环
 * 
 * 规则定义: decision-auto-repair-loop-post-pipeline-016.json
 * @version 1.0.0
 */

const { BaseExecutor } = require('./base');
const fs = require('fs');
const path = require('path');

class N016RepairLoopExecutor extends BaseExecutor {
  static RULE_ID = 'N016';
  static RULE_NAME = 'auto_repair_loop_post_pipeline';

  async execute(context) {
    const rule = await this.loadRule(this.constructor.RULE_ID);
    const { max_iterations, exit_conditions, steps } = rule.execution;
    
    const executionLog = [];
    let iteration = 0;
    let currentIssues = context.fixableIssues || [];
    
    this.logger.info(`[N016] Starting repair loop, max iterations: ${max_iterations}`);
    this.logger.info(`[N016] Initial issues: ${currentIssues.length}`);
    
    // 发送开始通知
    await this.notify('log', {
      level: 'info',
      content: `[N016] 修复循环开始，初始问题数: ${currentIssues.length}`
    });
    
    for (iteration = 0; iteration < max_iterations; iteration++) {
      this.logger.info(`[N016] Iteration ${iteration + 1}/${max_iterations}`);
      
      const iterationResult = await this.executeIteration(steps, {
        ...context,
        fixableIssues: currentIssues,
        iteration
      });
      
      executionLog.push(iterationResult);
      
      // 更新当前问题列表
      currentIssues = iterationResult.newIssues || currentIssues;
      
      // 检查退出条件
      const shouldExit = await this.checkExitConditions(exit_conditions, {
        iteration,
        max_iterations,
        previousIssues: context.fixableIssues,
        currentIssues,
        iterationResult
      });
      
      if (shouldExit) {
        this.logger.info(`[N016] Exit condition met, ending loop`);
        break;
      }
    }
    
    // 发送完成通知
    const isMaxIterations = iteration >= max_iterations - 1;
    const remainingCount = currentIssues.length;
    const fixedCount = (context.fixableIssues?.length || 0) - remainingCount;
    
    await this.sendNotification(rule.notification, {
      isMaxIterations,
      iteration: iteration + 1,
      max_iterations,
      fixedCount: Math.max(0, fixedCount),
      remainingCount
    });
    
    return {
      status: isMaxIterations ? 'max_iterations_reached' : 'completed',
      iterations: iteration + 1,
      initialIssues: context.fixableIssues?.length || 0,
      remainingIssues: remainingCount,
      fixedIssues: Math.max(0, fixedCount),
      executionLog
    };
  }

  async executeIteration(steps, context) {
    const results = [];
    let newIssues = context.fixableIssues || [];
    
    for (const step of steps) {
      this.logger.info(`[N016] Executing step ${step.order}: ${step.action}`);
      
      try {
        const result = await this.executeStep(step, { ...context, newIssues });
        results.push(result);
        
        // 如果步骤返回新问题列表，更新
        if (result.newIssues !== undefined) {
          newIssues = result.newIssues;
        }
        
        // 如果步骤失败且需要退出
        if (!result.success && step.on_false === 'exit_loop') {
          this.logger.warn(`[N016] Step ${step.action} failed, exiting loop`);
          break;
        }
      } catch (error) {
        this.logger.error(`[N016] Step ${step.action} error: ${error.message}`);
        results.push({ action: step.action, success: false, error: error.message });
        
        if (step.on_failure === 'exit_loop') {
          break;
        }
      }
    }
    
    return { 
      iteration: context.iteration,
      results,
      newIssues
    };
  }

  async executeStep(step, context) {
    switch (step.action) {
      case 'execute_fixes':
        return await this.executeFixes(step, context);
        
      case 're_scan':
        return await this.reScan(step, context);
        
      case 'evaluate':
        return await this.evaluate(step, context);
        
      default:
        throw new Error(`Unknown step type: ${step.action}`);
    }
  }

  async executeFixes(step, context) {
    const { fixableIssues } = context;
    
    if (!fixableIssues || fixableIssues.length === 0) {
      return { action: 'execute_fixes', success: true, fixed: [], newIssues: [] };
    }
    
    this.logger.info(`[N016] Executing fixes for ${fixableIssues.length} issues`);
    
    const results = [];
    const fixed = [];
    
    for (const issue of fixableIssues) {
      try {
        let result;
        
        // 根据问题类型执行不同的修复
        switch (issue.type) {
          case 'file_not_found':
            result = await this.fixFileNotFound(issue);
            break;
            
          case 'path_mismatch':
            result = await this.fixPathMismatch(issue);
            break;
            
          case 'config_missing':
            result = await this.fixConfigMissing(issue);
            break;
            
          case 'dependency_missing':
            result = await this.fixDependencyMissing(issue);
            break;
            
          default:
            result = await this.executeGenericFix(issue);
        }
        
        results.push({ issue, ...result });
        if (result.success) {
          fixed.push(issue);
        }
      } catch (error) {
        this.logger.error(`[N016] Fix failed for issue ${issue.id}: ${error.message}`);
        results.push({ issue, success: false, error: error.message });
      }
    }
    
    // 未修复的问题进入下一轮
    const remaining = fixableIssues.filter(i => !fixed.includes(i));
    
    return {
      action: 'execute_fixes',
      success: results.some(r => r.success),
      fixed,
      failed: results.filter(r => !r.success),
      newIssues: remaining
    };
  }

  async fixFileNotFound(issue) {
    const { path: filePath } = issue;
    
    this.logger.info(`[N016] Creating missing file: ${filePath}`);
    
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // 根据文件类型创建默认内容
      const defaultContent = this.getDefaultContent(filePath);
      fs.writeFileSync(filePath, defaultContent, 'utf8');
      
      return { success: true, action: 'create_file', path: filePath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async fixPathMismatch(issue) {
    const { oldPath, newPath, references } = issue;
    
    this.logger.info(`[N016] Fixing path mismatch: ${oldPath} → ${newPath}`);
    
    const results = [];
    
    for (const ref of references || []) {
      try {
        const content = fs.readFileSync(ref.file, 'utf8');
        const updated = content.replace(
          new RegExp(this.escapeRegExp(oldPath), 'g'),
          newPath
        );
        fs.writeFileSync(ref.file, updated, 'utf8');
        
        results.push({ file: ref.file, success: true });
      } catch (error) {
        results.push({ file: ref.file, success: false, error: error.message });
      }
    }
    
    return {
      success: results.some(r => r.success),
      results
    };
  }

  async fixConfigMissing(issue) {
    const { configPath, defaultValue } = issue;
    
    this.logger.info(`[N016] Creating missing config: ${configPath}`);
    
    try {
      const dir = path.dirname(configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      const content = typeof defaultValue === 'object' 
        ? JSON.stringify(defaultValue, null, 2)
        : String(defaultValue);
        
      fs.writeFileSync(configPath, content, 'utf8');
      
      return { success: true, action: 'create_config', path: configPath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async fixDependencyMissing(issue) {
    const { packageName, version } = issue;
    
    this.logger.info(`[N016] Installing missing dependency: ${packageName}`);
    
    try {
      const { execSync } = require('child_process');
      const cmd = version 
        ? `npm install ${packageName}@${version}`
        : `npm install ${packageName}`;
      
      execSync(cmd, { stdio: 'pipe' });
      
      return { success: true, action: 'install_dependency', package: packageName };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async executeGenericFix(issue) {
    // 通用修复：尝试执行issue中定义的fix动作
    if (issue.fix) {
      try {
        const result = await this.executeSubTask(issue.fix);
        return { success: true, result };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
    
    return { success: false, error: 'No fix defined for this issue type' };
  }

  async reScan(step, context) {
    this.logger.info(`[N016] Re-scanning for issues`);
    
    // 模拟重新扫描
    // 实际实现应该调用全局自主决策流水线
    const { timeout = 60 } = step;
    
    try {
      // 这里可以调用实际的扫描器
      // const scanner = require('../../lto-core/global-auto-decision-pipeline');
      // const result = await scanner.runSingleCheck({ timeout });
      
      // 模拟结果：问题数量减少
      const newIssues = context.newIssues || [];
      
      return {
        action: 're_scan',
        success: true,
        previousIssues: context.fixableIssues || [],
        newIssues,
        timestamp: Date.now()
      };
    } catch (error) {
      return {
        action: 're_scan',
        success: false,
        error: error.message
      };
    }
  }

  async evaluate(step, context) {
    const { condition } = step;
    const { previousIssues, currentIssues } = context;
    
    const previousCount = previousIssues?.length || 0;
    const currentCount = currentIssues?.length || 0;
    
    let conditionMet = false;
    
    if (condition === 'new_issues.length < previous_issues.length') {
      conditionMet = currentCount < previousCount;
    } else if (condition === 'new_issues.length == 0') {
      conditionMet = currentCount === 0;
    } else {
      // 通用条件评估
      try {
        const conditionFn = new Function('context', `return ${condition}`);
        conditionMet = conditionFn(context);
      } catch (e) {
        this.logger.warn(`[N016] Failed to evaluate condition: ${condition}`);
      }
    }
    
    return {
      action: 'evaluate',
      success: conditionMet,
      condition,
      conditionMet,
      previousCount,
      currentCount,
      improved: currentCount < previousCount
    };
  }

  async checkExitConditions(conditions, context) {
    for (const condition of conditions) {
      if (condition === 'issues.length == 0') {
        if (context.currentIssues?.length === 0) {
          return true;
        }
      }
      
      if (condition === 'iteration >= max_iterations') {
        if (context.iteration >= context.max_iterations - 1) {
          return true;
        }
      }
    }
    
    return false;
  }

  async sendNotification(config, context) {
    const { isMaxIterations, iteration, max_iterations, fixedCount, remainingCount } = context;
    
    let notificationConfig;
    let level = 'info';
    
    if (isMaxIterations && remainingCount > 0) {
      notificationConfig = config.on_max_iterations;
      level = 'warning';
    } else {
      notificationConfig = config.on_complete;
    }
    
    if (!notificationConfig) return;
    
    const content = notificationConfig.content
      .replace('{fixed_count}', fixedCount)
      .replace('{remaining_count}', remainingCount)
      .replace('{iteration}', iteration)
      .replace('{max_iterations}', max_iterations);
    
    await this.notify(notificationConfig.channel || 'log', {
      level: notificationConfig.level || level,
      content
    });
  }

  getDefaultContent(filePath) {
    const ext = path.extname(filePath);
    
    const defaults = {
      '.json': '{}',
      '.js': '// Auto-generated\nmodule.exports = {};',
      '.md': '# Auto-generated\n',
      '.yml': '# Auto-generated',
      '.yaml': '# Auto-generated',
      '.txt': ''
    };
    
    return defaults[ext] || '';
  }

  escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

module.exports = { N016RepairLoopExecutor };
