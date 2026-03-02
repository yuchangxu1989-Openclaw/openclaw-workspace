/**
 * @file executor.js
 * @description 执行器 - 执行决策计划中的各项操作，支持事务性回滚
 * @module EvolutionPipeline/Executor
 * @version 1.0.0
 * @license ISC
 * @copyright (c) 2026 SEEF (技能生态进化工厂)
 * @author SEEF Core Team
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';
import { OperationType, ExecutionStep } from './decision-engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 执行状态枚举
 * @readonly
 * @enum {string}
 */
export const ExecutionStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  ROLLING_BACK: 'rolling_back',
  ROLLED_BACK: 'rolled_back',
  CANCELLED: 'cancelled',
  TIMEOUT: 'timeout'
};

/**
 * 执行上下文类
 * @class ExecutionContext
 */
export class ExecutionContext {
  /**
   * @constructor
   * @param {Object} data - 上下文数据
   */
  constructor(data = {}) {
    this.planId = data.planId || '';
    this.skillId = data.skillId || '';
    this.skillPath = data.skillPath || '';
    this.startTime = data.startTime || Date.now();
    this.endTime = data.endTime || null;
    this.variables = data.variables || {}; // 变量存储
    this.results = data.results || {}; // 步骤结果
    this.errors = data.errors || []; // 错误列表
    this.metadata = data.metadata || {};
  }

  /**
   * 设置变量
   * @param {string} key - 变量名
   * @param {*} value - 变量值
   */
  setVariable(key, value) {
    this.variables[key] = value;
  }

  /**
   * 获取变量
   * @param {string} key - 变量名
   * @param {*} defaultValue - 默认值
   * @returns {*} 变量值
   */
  getVariable(key, defaultValue = undefined) {
    return this.variables[key] !== undefined ? this.variables[key] : defaultValue;
  }

  /**
   * 记录步骤结果
   * @param {string} stepId - 步骤ID
   * @param {*} result - 结果
   */
  recordStepResult(stepId, result) {
    this.results[stepId] = result;
  }

  /**
   * 获取步骤结果
   * @param {string} stepId - 步骤ID
   * @returns {*} 结果
   */
  getStepResult(stepId) {
    return this.results[stepId];
  }

  /**
   * 添加错误
   * @param {Error} error - 错误对象
   */
  addError(error) {
    this.errors.push({
      message: error.message,
      stack: error.stack,
      timestamp: Date.now()
    });
  }

  /**
   * 克隆上下文
   * @returns {ExecutionContext} 克隆的上下文
   */
  clone() {
    return new ExecutionContext({
      planId: this.planId,
      skillId: this.skillId,
      skillPath: this.skillPath,
      startTime: this.startTime,
      variables: { ...this.variables },
      results: { ...this.results },
      errors: [...this.errors],
      metadata: { ...this.metadata }
    });
  }
}

/**
 * 步骤执行结果类
 * @class StepExecutionResult
 */
export class StepExecutionResult {
  /**
   * @constructor
   * @param {Object} data - 结果数据
   */
  constructor(data = {}) {
    this.stepId = data.stepId || '';
    this.status = data.status || ExecutionStatus.PENDING;
    this.startTime = data.startTime || Date.now();
    this.endTime = data.endTime || null;
    this.duration = data.duration || 0;
    this.output = data.output || null;
    this.error = data.error || null;
    this.rollbackOutput = data.rollbackOutput || null;
    this.rollbackError = data.rollbackError || null;
  }

  /**
   * 转换为JSON
   * @returns {Object}
   */
  toJSON() {
    return {
      stepId: this.stepId,
      status: this.status,
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.duration,
      output: this.output,
      error: this.error?.message || this.error,
      rollbackOutput: this.rollbackOutput,
      rollbackError: this.rollbackError?.message || this.rollbackError
    };
  }
}

/**
 * 执行结果类
 * @class PlanExecutionResult
 */
export class PlanExecutionResult {
  /**
   * @constructor
   * @param {Object} data - 结果数据
   */
  constructor(data = {}) {
    this.planId = data.planId || '';
    this.skillId = data.skillId || '';
    this.status = data.status || ExecutionStatus.PENDING;
    this.startTime = data.startTime || Date.now();
    this.endTime = data.endTime || null;
    this.duration = data.duration || 0;
    this.stepResults = data.stepResults || {}; // 步骤ID -> StepExecutionResult
    this.completedSteps = data.completedSteps || [];
    this.failedSteps = data.failedSteps || [];
    this.rolledBackSteps = data.rolledBackSteps || [];
    this.context = data.context || null;
  }

  /**
   * 添加步骤结果
   * @param {StepExecutionResult} result - 步骤结果
   */
  addStepResult(result) {
    this.stepResults[result.stepId] = result;
    
    if (result.status === ExecutionStatus.COMPLETED) {
      this.completedSteps.push(result.stepId);
    } else if (result.status === ExecutionStatus.FAILED) {
      this.failedSteps.push(result.stepId);
    } else if (result.status === ExecutionStatus.ROLLED_BACK) {
      this.rolledBackSteps.push(result.stepId);
    }
  }

  /**
   * 转换为JSON
   * @returns {Object}
   */
  toJSON() {
    return {
      planId: this.planId,
      skillId: this.skillId,
      status: this.status,
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.duration,
      stepResults: Object.fromEntries(
        Object.entries(this.stepResults).map(([k, v]) => [k, v.toJSON()])
      ),
      completedSteps: this.completedSteps,
      failedSteps: this.failedSteps,
      rolledBackSteps: this.rolledBackSteps
    };
  }
}

/**
 * 事务执行器类
 * @class TransactionalExecutor
 * @extends EventEmitter
 */
export class TransactionalExecutor extends EventEmitter {
  /**
   * @constructor
   * @param {Object} options - 配置选项
   * @param {boolean} [options.autoRollback=true] - 失败时自动回滚
   * @param {boolean} [options.continueOnError=false] - 错误时继续执行
   * @param {number} [options.defaultTimeout=300000] - 默认超时时间(毫秒)
   * @param {string} [options.backupDir] - 备份目录
   * @param {Object} [options.customHandlers] - 自定义操作处理器
   */
  constructor(options = {}) {
    super();

    this.autoRollback = options.autoRollback !== false;
    this.continueOnError = options.continueOnError || false;
    this.defaultTimeout = options.defaultTimeout || 300000;
    this.backupDir = options.backupDir || path.join(process.cwd(), '.backups');

    // 操作处理器映射
    this._handlers = new Map();
    this._rollbackHandlers = new Map();
    
    // 注册内置处理器
    this._registerBuiltinHandlers();
    
    // 注册自定义处理器
    if (options.customHandlers) {
      for (const [type, handler] of Object.entries(options.customHandlers)) {
        this.registerHandler(type, handler.execute, handler.rollback);
      }
    }

    // 执行状态
    this._running = false;
    this._cancelled = false;
    this._currentExecution = null;
  }

  /**
   * 注册操作处理器
   * @param {OperationType} type - 操作类型
   * @param {Function} handler - 执行处理器 (step, context) => Promise<any>
   * @param {Function} [rollbackHandler] - 回滚处理器 (step, context, result) => Promise<any>
   * @returns {TransactionalExecutor} this
   */
  registerHandler(type, handler, rollbackHandler = null) {
    this._handlers.set(type, handler);
    if (rollbackHandler) {
      this._rollbackHandlers.set(type, rollbackHandler);
    }
    return this;
  }

  /**
   * 检查执行器是否正在运行
   * @returns {boolean}
   */
  get isRunning() {
    return this._running;
  }

  /**
   * 执行计划
   * @async
   * @param {ExecutionPlan} plan - 执行计划
   * @param {ExecutionContext} [context] - 执行上下文
   * @returns {Promise<PlanExecutionResult>} 执行结果
   */
  async execute(plan, context = null) {
    if (this._running) {
      throw new Error('执行器正在运行其他计划');
    }

    this._running = true;
    this._cancelled = false;

    const result = new PlanExecutionResult({
      planId: plan.id,
      skillId: plan.skillId,
      status: ExecutionStatus.RUNNING,
      startTime: Date.now()
    });

    const execContext = context || new ExecutionContext({
      planId: plan.id,
      skillId: plan.skillId,
      skillPath: plan.skillPath
    });

    result.context = execContext;
    this._currentExecution = { plan, result, context: execContext };

    this.emit('execution:started', { planId: plan.id, skillId: plan.skillId });

    try {
      const completedStepIds = new Set();
      const stepQueue = [...plan.steps];

      while (stepQueue.length > 0 && !this._cancelled) {
        // 获取可执行的步骤
        const executableSteps = stepQueue.filter(step => 
          !completedStepIds.has(step.id) &&
          step.dependsOn.every(depId => completedStepIds.has(depId))
        );

        if (executableSteps.length === 0) {
          // 检查是否还有未完成的步骤
          const remaining = stepQueue.filter(s => !completedStepIds.has(s.id));
          if (remaining.length > 0) {
            // 可能存在循环依赖或依赖缺失
            throw new Error(`存在无法执行的步骤: ${remaining.map(s => s.id).join(', ')}`);
          }
          break;
        }

        // 执行当前可执行的步骤
        for (const step of executableSteps) {
          if (this._cancelled) break;

          const stepResult = await this._executeStep(step, execContext);
          result.addStepResult(stepResult);

          if (stepResult.status === ExecutionStatus.COMPLETED) {
            completedStepIds.add(step.id);
            this.emit('step:completed', { stepId: step.id, planId: plan.id });
          } else {
            // 步骤失败
            execContext.addError(new Error(stepResult.error?.message || '步骤执行失败'));
            
            if (!this.continueOnError) {
              // 触发回滚
              if (this.autoRollback) {
                await this._rollback(completedStepIds, plan, execContext, result);
              }
              
              result.status = ExecutionStatus.FAILED;
              result.endTime = Date.now();
              result.duration = result.endTime - result.startTime;
              
              this.emit('execution:failed', { 
                planId: plan.id, 
                error: stepResult.error,
                rolledBack: this.autoRollback
              });
              
              this._running = false;
              this._currentExecution = null;
              return result;
            }
          }

          // 从队列中移除
          const index = stepQueue.findIndex(s => s.id === step.id);
          if (index > -1) {
            stepQueue.splice(index, 1);
          }
        }
      }

      // 检查是否被取消
      if (this._cancelled) {
        if (this.autoRollback) {
          await this._rollback(completedStepIds, plan, execContext, result);
        }
        result.status = ExecutionStatus.CANCELLED;
        this.emit('execution:cancelled', { planId: plan.id });
      } else {
        result.status = ExecutionStatus.COMPLETED;
        this.emit('execution:completed', { planId: plan.id, duration: Date.now() - result.startTime });
      }

    } catch (error) {
      execContext.addError(error);
      result.status = ExecutionStatus.FAILED;
      this.emit('execution:error', { planId: plan.id, error });
    }

    result.endTime = Date.now();
    result.duration = result.endTime - result.startTime;
    
    this._running = false;
    this._currentExecution = null;
    
    return result;
  }

  /**
   * 执行单个步骤
   * @private
   * @async
   * @param {ExecutionStep} step - 执行步骤
   * @param {ExecutionContext} context - 执行上下文
   * @returns {Promise<StepExecutionResult>} 步骤执行结果
   */
  async _executeStep(step, context) {
    const result = new StepExecutionResult({
      stepId: step.id,
      status: ExecutionStatus.RUNNING,
      startTime: Date.now()
    });

    this.emit('step:started', { stepId: step.id, type: step.type });

    try {
      // 检查执行条件
      if (step.condition && !this._evaluateCondition(step.condition, context)) {
        result.status = ExecutionStatus.COMPLETED;
        result.output = { skipped: true, reason: '条件不满足' };
        result.endTime = Date.now();
        result.duration = 0;
        return result;
      }

      // 获取处理器
      const handler = this._handlers.get(step.type);
      if (!handler) {
        throw new Error(`未找到操作类型的处理器: ${step.type}`);
      }

      // 设置超时
      const timeoutMs = step.timeout || this.defaultTimeout;
      
      // 执行
      const output = await this._executeWithTimeout(handler, step, context, timeoutMs);
      
      result.status = ExecutionStatus.COMPLETED;
      result.output = output;
      result.endTime = Date.now();
      result.duration = result.endTime - result.startTime;

      // 记录到上下文
      context.recordStepResult(step.id, output);

    } catch (error) {
      result.status = ExecutionStatus.FAILED;
      result.error = {
        message: error.message,
        stack: error.stack
      };
      result.endTime = Date.now();
      result.duration = result.endTime - result.startTime;
      
      this.emit('step:failed', { stepId: step.id, error: error.message });
    }

    return result;
  }

  /**
   * 带超时执行
   * @private
   * @async
   * @param {Function} handler - 处理器函数
   * @param {ExecutionStep} step - 执行步骤
   * @param {ExecutionContext} context - 执行上下文
   * @param {number} timeoutMs - 超时时间
   * @returns {Promise<any>}
   */
  async _executeWithTimeout(handler, step, context, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`步骤执行超时: ${step.id} (${timeoutMs}ms)`));
      }, timeoutMs);

      Promise.resolve(handler(step, context))
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * 回滚已执行的步骤
   * @private
   * @async
   * @param {Set<string>} completedStepIds - 已完成步骤ID
   * @param {ExecutionPlan} plan - 执行计划
   * @param {ExecutionContext} context - 执行上下文
   * @param {PlanExecutionResult} result - 执行结果
   */
  async _rollback(completedStepIds, plan, context, result) {
    this.emit('rollback:started', { planId: plan.id, stepCount: completedStepIds.size });

    const rollbackSteps = plan.getRollbackSteps(completedStepIds);

    for (const step of rollbackSteps) {
      try {
        const rollbackHandler = this._rollbackHandlers.get(step.type);
        if (rollbackHandler) {
          const stepResult = result.stepResults[step.id];
          const rollbackOutput = await rollbackHandler(step, context, stepResult?.output);
          
          if (stepResult) {
            stepResult.rollbackOutput = rollbackOutput;
          }
          
          this.emit('step:rolled_back', { stepId: step.id });
        }
      } catch (error) {
        this.emit('rollback:error', { stepId: step.id, error: error.message });
        
        if (stepResult) {
          stepResult.rollbackError = error;
        }
      }
    }

    result.status = ExecutionStatus.ROLLED_BACK;
    this.emit('rollback:completed', { planId: plan.id });
  }

  /**
   * 评估条件
   * @private
   * @param {string|Function} condition - 条件表达式或函数
   * @param {ExecutionContext} context - 执行上下文
   * @returns {boolean}
   */
  _evaluateCondition(condition, context) {
    if (typeof condition === 'function') {
      return condition(context);
    }
    
    if (typeof condition === 'string') {
      // 简单的变量检查: "variableName"
      return !!context.getVariable(condition);
    }
    
    return true;
  }

  /**
   * 取消执行
   */
  cancel() {
    if (this._running) {
      this._cancelled = true;
      this.emit('execution:cancel:requested', { planId: this._currentExecution?.plan?.id });
    }
  }

  /**
   * 注册内置处理器
   * @private
   */
  _registerBuiltinHandlers() {
    // UPDATE_VERSION
    this.registerHandler(
      OperationType.UPDATE_VERSION,
      this._handleUpdateVersion.bind(this),
      this._rollbackUpdateVersion.bind(this)
    );

    // GENERATE_DOC
    this.registerHandler(
      OperationType.GENERATE_DOC,
      this._handleGenerateDoc.bind(this),
      this._rollbackGenerateDoc.bind(this)
    );

    // FIX_DEPENDENCIES
    this.registerHandler(
      OperationType.FIX_DEPENDENCIES,
      this._handleFixDependencies.bind(this),
      this._rollbackFixDependencies.bind(this)
    );

    // GIT_COMMIT
    this.registerHandler(
      OperationType.GIT_COMMIT,
      this._handleGitCommit.bind(this),
      this._rollbackGitCommit.bind(this)
    );

    // GIT_TAG
    this.registerHandler(
      OperationType.GIT_TAG,
      this._handleGitTag.bind(this),
      this._rollbackGitTag.bind(this)
    );

    // EVOMAP_UPLOAD
    this.registerHandler(
      OperationType.EVOMAP_UPLOAD,
      this._handleEvoMapUpload.bind(this)
    );

    // NOTIFY
    this.registerHandler(
      OperationType.NOTIFY,
      this._handleNotify.bind(this)
    );

    // BACKUP
    this.registerHandler(
      OperationType.BACKUP,
      this._handleBackup.bind(this)
    );

    // REFACTOR_CODE
    this.registerHandler(
      OperationType.REFACTOR_CODE,
      this._handleRefactorCode.bind(this),
      this._rollbackRefactorCode.bind(this)
    );
  }

  // ============== 内置操作处理器 ==============

  /**
   * 处理版本更新
   * @private
   */
  async _handleUpdateVersion(step, context) {
    const { bumpType = 'patch' } = step.params;
    const skillPath = context.skillPath;
    const packageJsonPath = path.join(skillPath, 'package.json');

    if (!fs.existsSync(packageJsonPath)) {
      throw new Error('package.json不存在');
    }

    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const currentVersion = pkg.version || '0.0.0';
    const parts = currentVersion.split('.').map(Number);

    switch (bumpType) {
      case 'major':
        parts[0]++;
        parts[1] = 0;
        parts[2] = 0;
        break;
      case 'minor':
        parts[1]++;
        parts[2] = 0;
        break;
      case 'patch':
      default:
        parts[2]++;
    }

    const newVersion = parts.join('.');
    pkg.version = newVersion;

    // 保存原版本用于回滚
    context.setVariable('previousVersion', currentVersion);

    fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n');

    return { previousVersion: currentVersion, newVersion };
  }

  /**
   * 回滚版本更新
   * @private
   */
  async _rollbackUpdateVersion(step, context, result) {
    const skillPath = context.skillPath;
    const packageJsonPath = path.join(skillPath, 'package.json');
    const previousVersion = context.getVariable('previousVersion');

    if (previousVersion && fs.existsSync(packageJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      pkg.version = previousVersion;
      fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n');
    }

    return { restoredVersion: previousVersion };
  }

  /**
   * 处理文档生成
   * @private
   */
  async _handleGenerateDoc(step, context) {
    const { outputPath, content } = step.params;
    const skillPath = context.skillPath;
    const filePath = path.join(skillPath, outputPath);

    // 保存原文件用于回滚
    if (fs.existsSync(filePath)) {
      const originalContent = fs.readFileSync(filePath, 'utf-8');
      context.setVariable(`original_${outputPath}`, originalContent);
    }

    fs.writeFileSync(filePath, content || '', 'utf-8');

    return { filePath, generated: true };
  }

  /**
   * 回滚文档生成
   * @private
   */
  async _rollbackGenerateDoc(step, context, result) {
    const { outputPath } = step.params;
    const skillPath = context.skillPath;
    const filePath = path.join(skillPath, outputPath);
    const originalContent = context.getVariable(`original_${outputPath}`);

    if (originalContent !== undefined) {
      fs.writeFileSync(filePath, originalContent, 'utf-8');
      return { restored: true };
    } else {
      // 删除新创建的文件
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return { deleted: true };
    }
  }

  /**
   * 处理依赖修复
   * @private
   */
  async _handleFixDependencies(step, context) {
    const skillPath = context.skillPath;
    const packageJsonPath = path.join(skillPath, 'package.json');

    // 保存原package.json
    if (fs.existsSync(packageJsonPath)) {
      const originalContent = fs.readFileSync(packageJsonPath, 'utf-8');
      context.setVariable('original_package_json', originalContent);
    }

    // 运行npm update
    return new Promise((resolve, reject) => {
      const npm = spawn('npm', ['update'], { cwd: skillPath });
      
      let output = '';
      npm.stdout.on('data', (data) => { output += data; });
      npm.stderr.on('data', (data) => { output += data; });
      
      npm.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, output });
        } else {
          reject(new Error(`npm update 失败: ${output}`));
        }
      });
    });
  }

  /**
   * 回滚依赖修复
   * @private
   */
  async _rollbackFixDependencies(step, context, result) {
    const skillPath = context.skillPath;
    const packageJsonPath = path.join(skillPath, 'package.json');
    const originalContent = context.getVariable('original_package_json');

    if (originalContent) {
      fs.writeFileSync(packageJsonPath, originalContent, 'utf-8');
      
      // 恢复node_modules
      return new Promise((resolve) => {
        const npm = spawn('npm', ['install'], { cwd: skillPath });
        npm.on('close', () => resolve({ restored: true }));
      });
    }

    return { restored: false };
  }

  /**
   * 处理Git提交
   * @private
   */
  async _handleGitCommit(step, context) {
    const { message, include = [] } = step.params;
    const skillPath = context.skillPath;

    // 获取当前commit hash用于回滚
    const getHash = () => new Promise((resolve) => {
      const git = spawn('git', ['rev-parse', 'HEAD'], { cwd: skillPath });
      let hash = '';
      git.stdout.on('data', (data) => hash += data);
      git.on('close', () => resolve(hash.trim()));
    });

    const previousHash = await getHash();
    context.setVariable('previousCommitHash', previousHash);

    // 添加文件
    const addFiles = include.length > 0 ? ['add', ...include] : ['add', '.'];
    await this._execGit(skillPath, addFiles);

    // 提交
    const commitResult = await this._execGit(skillPath, ['commit', '-m', message]);

    return { 
      success: true, 
      previousHash,
      ...commitResult 
    };
  }

  /**
   * 回滚Git提交
   * @private
   */
  async _rollbackGitCommit(step, context, result) {
    const skillPath = context.skillPath;
    const previousHash = context.getVariable('previousCommitHash');

    if (previousHash) {
      await this._execGit(skillPath, ['reset', '--soft', previousHash]);
      return { resetTo: previousHash };
    }

    return { reset: false };
  }

  /**
   * 处理Git标签
   * @private
   */
  async _handleGitTag(step, context) {
    const { tagName, message = '' } = step.params;
    const skillPath = context.skillPath;

    await this._execGit(skillPath, ['tag', '-a', tagName, '-m', message || `Tag ${tagName}`]);

    return { tagName };
  }

  /**
   * 回滚Git标签
   * @private
   */
  async _rollbackGitTag(step, context, result) {
    const skillPath = context.skillPath;
    const { tagName } = step.params;

    await this._execGit(skillPath, ['tag', '-d', tagName]);

    return { deleted: tagName };
  }

  /**
   * 处理EvoMap上传
   * @private
   */
  async _handleEvoMapUpload(step, context) {
    const { skillPath } = step.params;
    
    // 这里调用evomap-a2a上传器
    // 简化实现，实际应该调用真实上传器
    this.emit('evomap:upload:started', { skillPath });

    // 模拟上传
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ 
          success: true, 
          geneId: `gene_${Date.now()}`,
          uploadedAt: new Date().toISOString()
        });
      }, 1000);
    });
  }

  /**
   * 处理通知
   * @private
   */
  async _handleNotify(step, context) {
    const { type = 'info', message, details = [] } = step.params;
    
    const notification = {
      type,
      message,
      details,
      timestamp: new Date().toISOString(),
      skillId: context.skillId
    };

    // 输出到控制台
    const prefix = type === 'error' ? '❌' : type === 'warning' ? '⚠️' : type === 'success' ? '✅' : 'ℹ️';
    console.log(`${prefix} [${type.toUpperCase()}] ${message}`);
    if (details.length > 0) {
      details.forEach(d => console.log(`   - ${d}`));
    }

    this.emit('notification:sent', notification);

    return notification;
  }

  /**
   * 处理备份
   * @private
   */
  async _handleBackup(step, context) {
    const { files = [], backupPath, includeAll = false } = step.params;
    const skillPath = context.skillPath;
    const timestamp = Date.now();
    
    // 创建备份目录
    const backupDir = backupPath 
      ? path.join(skillPath, backupPath)
      : path.join(this.backupDir, `${context.skillId}_${timestamp}`);

    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const backedUpFiles = [];

    if (includeAll) {
      // 备份整个技能目录（除了node_modules）
      const copyDir = (src, dest) => {
        const entries = fs.readdirSync(src, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
          
          const srcPath = path.join(src, entry.name);
          const destPath = path.join(dest, entry.name);
          
          if (entry.isDirectory()) {
            if (!fs.existsSync(destPath)) {
              fs.mkdirSync(destPath, { recursive: true });
            }
            copyDir(srcPath, destPath);
          } else {
            fs.copyFileSync(srcPath, destPath);
            backedUpFiles.push(entry.name);
          }
        }
      };
      copyDir(skillPath, backupDir);
    } else {
      // 备份指定文件
      for (const file of files) {
        const srcPath = path.join(skillPath, file);
        const destPath = path.join(backupDir, file);
        
        if (fs.existsSync(srcPath)) {
          fs.copyFileSync(srcPath, destPath);
          backedUpFiles.push(file);
        }
      }
    }

    context.setVariable('backupDir', backupDir);

    return { backupDir, files: backedUpFiles };
  }

  /**
   * 处理代码重构
   * @private
   */
  async _handleRefactorCode(step, context) {
    const { targetFile, refactorType } = step.params;
    const skillPath = context.skillPath;
    const filePath = path.join(skillPath, targetFile);

    // 保存原文件
    if (fs.existsSync(filePath)) {
      const originalContent = fs.readFileSync(filePath, 'utf-8');
      context.setVariable(`refactor_original_${targetFile}`, originalContent);
    }

    // 简化实现：实际应调用代码重构工具
    // 这里只是标记已处理
    return { file: targetFile, refactored: true, type: refactorType };
  }

  /**
   * 回滚代码重构
   * @private
   */
  async _rollbackRefactorCode(step, context, result) {
    const { targetFile } = step.params;
    const skillPath = context.skillPath;
    const filePath = path.join(skillPath, targetFile);
    const originalContent = context.getVariable(`refactor_original_${targetFile}`);

    if (originalContent !== undefined) {
      fs.writeFileSync(filePath, originalContent, 'utf-8');
      return { restored: true };
    }

    return { restored: false };
  }

  /**
   * 执行Git命令
   * @private
   */
  _execGit(cwd, args) {
    return new Promise((resolve, reject) => {
      const git = spawn('git', args, { cwd });
      let stdout = '';
      let stderr = '';

      git.stdout.on('data', (data) => stdout += data);
      git.stderr.on('data', (data) => stderr += data);

      git.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr, code });
        } else {
          reject(new Error(`Git命令失败: git ${args.join(' ')}\n${stderr}`));
        }
      });
    });
  }
}

/**
 * 创建事务执行器的工厂函数
 * @param {Object} options - 配置选项
 * @returns {TransactionalExecutor}
 */
export function createExecutor(options = {}) {
  return new TransactionalExecutor(options);
}

export default TransactionalExecutor;
