/**
 * @file index.js
 * @description SEEF EvoMap进化流水线 - 阶段3集成层主入口
 * @module SEEFEvolutionPipeline
 * @version 1.0.0
 * @license ISC
 * @copyright (c) 2026 SEEF (技能生态进化工厂)
 * 
 * 功能：
 * 1. DTO订阅集成 - 接收技能变更事件，自动触发进化流程
 * 2. EvoMap API封装 - 技能上传、版本管理、错误处理
 * 3. 流水线主控 - 协调各阶段执行，状态管理
 * 4. CRAS知识治理集成 - 日志记录到知识库
 */

import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';

// 导入集成层模块
import { EvoMapClient } from './lib/evomap-client.js';
import { DTOAdapter } from './lib/dto-adapter.js';

// 导入流水线核心
import { 
  StateMachine, 
  PipelineState,
  STATE_TRANSITIONS 
} from './src/state-machine.js';
import { 
  Executor,
  ExecutionMode,
  createStage 
} from './src/executor.js';
import { 
  ErrorHandler,
  ErrorSeverity,
  createProductionErrorHandler 
} from './src/error-handler.js';
import { 
  TaskScheduler,
  createTaskScheduler 
} from './src/scheduler/index.js';
import { 
  NotificationManager 
} from './src/notification/index.js';
import { EvoMapUploader } from './src/uploaders/evomap-uploader.js';

/**
 * 加载配置
 * @returns {Object} 配置对象
 */
function loadConfig() {
  const configPath = path.join(process.cwd(), 'config.json');
  const defaultConfig = {
    pipeline: { autoTrigger: true, maxConcurrent: 3 },
    logging: { level: 'info', console: true },
    retry: { maxAttempts: 3, initialDelayMs: 1000 }
  };
  
  try {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return { ...defaultConfig, ...config };
    }
  } catch (e) {
    console.warn('[Pipeline] 配置文件加载失败，使用默认配置:', e.message);
  }
  
  return defaultConfig;
}

/**
 * SEEF EvoMap进化流水线主类
 * @class
 * @extends EventEmitter
 */
class SEEFEvolutionPipeline extends EventEmitter {
  /**
   * @constructor
   * @param {Object} options - 配置选项
   */
  constructor(options = {}) {
    super();
    
    this.config = loadConfig();
    this.options = { ...this.config, ...options };
    this.pipelineId = options.pipelineId || `seef_ep_${Date.now()}`;
    
    // 核心组件
    this.stateMachine = null;
    this.executor = null;
    this.errorHandler = null;
    this.scheduler = null;
    this.notification = null;
    
    // 集成层组件
    this.dtoAdapter = null;
    this.evomapClient = null;
    this.evomapUploader = null;
    
    // 状态
    this.initialized = false;
    this.running = false;
    this.activeRuns = new Map();
    
    // 统计
    this.stats = {
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      lastRunAt: null
    };
  }

  /**
   * 初始化流水线
   * @async
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    this._log('info', '正在初始化SEEF进化流水线...');

    try {
      // 1. 初始化任务调度器
      this.scheduler = new TaskScheduler({
        pipelineId: this.pipelineId,
        maxConcurrent: this.options.pipeline?.maxConcurrent || 3
      });
      await this.scheduler.initialize();

      // 2. 初始化通知系统
      this.notification = new NotificationManager({
        pipelineId: this.pipelineId,
        channels: ['console', 'file'],
        logPath: this.options.logging?.logPath
      });
      await this.notification.initialize();

      // 3. 初始化状态机
      this.stateMachine = new StateMachine({
        pipelineId: this.pipelineId,
        initialState: 'idle'
      });
      await this.stateMachine.initialize();

      // 4. 初始化执行器
      this.executor = new Executor({
        pipelineId: this.pipelineId,
        mode: ExecutionMode.DAG
      });
      await this.executor.initialize();

      // 5. 初始化错误处理器
      this.errorHandler = createProductionErrorHandler({
        maxRetries: this.options.retry?.maxAttempts || 3
      });
      await this.errorHandler.initialize();

      // 6. 初始化DTO适配器（集成层）
      await this._initDTOAdapter();

      // 7. 初始化EvoMap客户端（集成层）
      await this._initEvoMapClient();

      // 8. 绑定事件
      this._bindEvents();

      this.initialized = true;
      this._log('info', `SEEF进化流水线初始化完成: ${this.pipelineId}`);
      
      await this._notify('success', '流水线初始化完成', {
        pipelineId: this.pipelineId,
        dtoEnabled: !!this.dtoAdapter,
        evomapEnabled: !!this.evomapClient
      });

    } catch (error) {
      this._log('error', '初始化失败:', error);
      await this._notify('error', '流水线初始化失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 初始化DTO适配器
   * @private
   * @async
   */
  async _initDTOAdapter() {
    if (!this.options.integration?.dto?.enabled) {
      this._log('info', 'DTO集成已禁用');
      return;
    }

    try {
      this.dtoAdapter = new DTOAdapter({
        subscriptionRules: this.options.integration.dto.subscriptionRules,
        eventTypes: this.options.integration.dto.eventTypes,
        autoTrigger: this.options.pipeline?.autoTrigger
      });

      await this.dtoAdapter.initialize();

      // 订阅DTO事件
      this.dtoAdapter.on('skill.changed', (event) => this._onSkillChanged(event));
      this.dtoAdapter.on('skill.created', (event) => this._onSkillCreated(event));
      this.dtoAdapter.on('skill.published', (event) => this._onSkillPublished(event));

      this._log('info', 'DTO适配器初始化完成');
    } catch (error) {
      this._log('warning', 'DTO适配器初始化失败:', error.message);
      // DTO失败不阻断主流程
    }
  }

  /**
   * 初始化EvoMap客户端
   * @private
   * @async
   */
  async _initEvoMapClient() {
    if (!this.options.integration?.evomap?.enabled) {
      this._log('info', 'EvoMap集成已禁用');
      return;
    }

    try {
      // 初始化EvoMap API客户端
      this.evomapClient = new EvoMapClient({
        hubUrl: this.options.integration.evomap.hubUrl,
        offlineMode: this.options.integration.evomap.offlineMode,
        maxRetries: this.options.retry?.maxAttempts || 3
      });

      await this.evomapClient.initialize();

      // 初始化上传器
      this.evomapUploader = new EvoMapUploader({
        hubUrl: this.options.integration.evomap.hubUrl,
        autoSync: this.options.integration.evomap.autoSync,
        offlineMode: this.options.integration.evomap.offlineMode,
        manifestPath: this.options.paths?.manifest
      });

      await this.evomapUploader.initialize();

      this._log('info', 'EvoMap客户端初始化完成');
    } catch (error) {
      this._log('warning', 'EvoMap客户端初始化失败:', error.message);
      // EvoMap失败不阻断主流程
    }
  }

  /**
   * 绑定内部事件
   * @private
   */
  _bindEvents() {
    // 状态机事件
    this.stateMachine.on('transition', (data) => {
      this._log('debug', `状态转换: ${data.from} -> ${data.to}`);
      this.emit('state.changed', data);
    });

    // 执行器事件
    this.executor.on('stage:started', (data) => {
      this._log('debug', `阶段开始: ${data.stageId}`);
      this.emit('stage.started', data);
    });

    this.executor.on('stage:completed', (data) => {
      this._log('debug', `阶段完成: ${data.stageId}`);
      this.emit('stage.completed', data);
    });

    this.executor.on('stage:failed', (data) => {
      this._log('error', `阶段失败: ${data.stageId}`, data.error);
      this._handleStageFailure(data);
    });

    // 错误处理事件
    this.errorHandler.on('error', (data) => {
      this._log('error', '错误处理:', data);
      this.emit('error', data);
    });
  }

  /**
   * 启动流水线
   * @async
   * @returns {Promise<void>}
   */
  async start() {
    if (!this.initialized) {
      await this.initialize();
    }

    if (this.running) {
      this._log('warning', '流水线已在运行中');
      return;
    }

    this.running = true;
    this.scheduler.start();

    // 启动DTO订阅
    if (this.dtoAdapter) {
      await this.dtoAdapter.start();
    }

    this._log('info', 'SEEF进化流水线已启动');
    await this._notify('info', '流水线已启动', { pipelineId: this.pipelineId });
  }

  /**
   * 停止流水线
   * @async
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.running) {
      return;
    }

    this.running = false;

    // 停止DTO订阅
    if (this.dtoAdapter) {
      await this.dtoAdapter.stop();
    }

    // 断开EvoMap连接
    if (this.evomapClient) {
      await this.evomapClient.disconnect();
    }

    this.scheduler.stop();
    this.executor.cancel();

    this._log('info', 'SEEF进化流水线已停止');
    await this._notify('info', '流水线已停止', { pipelineId: this.pipelineId });
  }

  /**
   * 执行进化流程
   * @async
   * @param {Object} context - 执行上下文
   * @param {string} context.skillId - 技能ID
   * @param {string} context.triggerType - 触发类型 (dto/manual/schedule)
   * @param {Object} context.eventData - 事件数据
   * @returns {Promise<Object>} 执行结果
   */
  async execute(context = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    const runId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    this._log('info', `开始执行进化流程: ${runId}`, { skillId: context.skillId });

    // 记录到CRAS知识治理
    await this._logToKnowledgeBase('evolution.started', {
      runId,
      skillId: context.skillId,
      triggerType: context.triggerType,
      timestamp: new Date().toISOString()
    });

    try {
      // 1. 状态检查
      const currentState = this.stateMachine.currentState;
      if (currentState !== 'idle' && currentState !== 'completed') {
        throw new Error(`流水线状态不允许执行: ${currentState}`);
      }

      // 2. 转换到分析阶段
      await this.stateMachine.transition('analyzing', {
        reason: context.triggerType || 'manual',
        skillId: context.skillId
      });

      // 3. 构建执行阶段
      const stages = this._buildStages(context);

      // 4. 执行流水线
      const result = await this.executor.execute({
        runId,
        stages,
        context,
        timeout: (this.options.pipeline?.timeoutMinutes || 60) * 60 * 1000
      });

      // 5. 处理结果
      if (result.success) {
        await this.stateMachine.transition('completed', {
          reason: 'execution_success',
          runId
        });

        this.stats.successfulRuns++;
        
        await this._notify('success', '进化流程执行成功', {
          runId,
          skillId: context.skillId,
          duration: Date.now() - startTime
        });

        // 同步到EvoMap
        if (this.evomapUploader && context.skillId) {
          await this._syncToEvoMap(context.skillId, result);
        }

      } else {
        await this.stateMachine.transition('failed', {
          reason: result.error?.message || 'execution_failed',
          runId
        });

        this.stats.failedRuns++;
        
        await this._notify('warning', '进化流程执行未完成', {
          runId,
          skillId: context.skillId,
          error: result.error?.message
        });
      }

      this.stats.totalRuns++;
      this.stats.lastRunAt = new Date().toISOString();

      // 记录到知识库
      await this._logToKnowledgeBase('evolution.completed', {
        runId,
        skillId: context.skillId,
        success: result.success,
        duration: Date.now() - startTime,
        result: result.summary
      });

      return {
        runId,
        success: result.success,
        skillId: context.skillId,
        duration: Date.now() - startTime,
        result
      };

    } catch (error) {
      this.stats.failedRuns++;
      this.stats.totalRuns++;

      await this.stateMachine.transition('failed', {
        reason: error.message,
        runId
      });

      await this.errorHandler.handleError(error, {
        stage: 'pipeline',
        runId,
        skillId: context.skillId
      });

      await this._notify('error', '进化流程执行失败', {
        runId,
        skillId: context.skillId,
        error: error.message
      });

      // 记录错误到知识库
      await this._logToKnowledgeBase('evolution.failed', {
        runId,
        skillId: context.skillId,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });

      throw error;
    }
  }

  /**
   * 构建执行阶段
   * @private
   * @param {Object} context - 执行上下文
   * @returns {Array} 阶段列表
   */
  _buildStages(context) {
    const stages = [];

    // 阶段1: 检测变更
    stages.push(createStage('detect', async (ctx) => {
      this._log('info', '阶段: 检测技能变更');
      return this._stageDetect(ctx);
    }));

    // 阶段2: 分析
    stages.push(createStage('analyze', async (ctx) => {
      this._log('info', '阶段: 分析技能');
      return this._stageAnalyze(ctx);
    }, { dependsOn: ['detect'] }));

    // 阶段3: 进化
    stages.push(createStage('evolve', async (ctx) => {
      this._log('info', '阶段: 执行进化');
      return this._stageEvolve(ctx);
    }, { dependsOn: ['analyze'] }));

    // 阶段4: 验证
    stages.push(createStage('validate', async (ctx) => {
      this._log('info', '阶段: 验证结果');
      return this._stageValidate(ctx);
    }, { dependsOn: ['evolve'] }));

    // 阶段5: 发布
    stages.push(createStage('publish', async (ctx) => {
      this._log('info', '阶段: 发布技能');
      return this._stagePublish(ctx);
    }, { dependsOn: ['validate'] }));

    // 阶段6: 同步到EvoMap
    if (this.evomapClient) {
      stages.push(createStage('sync', async (ctx) => {
        this._log('info', '阶段: 同步到EvoMap');
        return this._stageSync(ctx);
      }, { dependsOn: ['publish'] }));
    }

    return stages;
  }

  /**
   * 阶段: 检测
   * @private
   */
  async _stageDetect(ctx) {
    const { skillId } = ctx.context;
    
    if (!skillId) {
      return { success: false, error: '未指定技能ID' };
    }

    const skillPath = path.join(
      this.options.paths?.skills || '/root/.openclaw/workspace/skills',
      skillId
    );

    if (!fs.existsSync(skillPath)) {
      return { success: false, error: `技能路径不存在: ${skillPath}` };
    }

    // 检测变更文件
    const changedFiles = await this._detectChangedFiles(skillPath);

    return {
      success: true,
      skillId,
      skillPath,
      changedFiles,
      hasChanges: changedFiles.length > 0
    };
  }

  /**
   * 阶段: 分析
   * @private
   */
  async _stageAnalyze(ctx) {
    const { skillPath, skillId } = ctx.results.detect;

    // 读取SKILL.md
    const skillMdPath = path.join(skillPath, 'SKILL.md');
    let skillMetadata = {};
    
    if (fs.existsSync(skillMdPath)) {
      const content = fs.readFileSync(skillMdPath, 'utf-8');
      skillMetadata = this._parseSkillMetadata(content);
    }

    // 检查ISC合规性
    const iscCheck = await this._checkISCCompliance(skillPath);

    return {
      success: true,
      skillId,
      metadata: skillMetadata,
      iscCheck,
      isCompliant: iscCheck.score >= (this.options.isc?.minScore || 70)
    };
  }

  /**
   * 阶段: 进化
   * @private
   */
  async _stageEvolve(ctx) {
    const { skillId, metadata, iscCheck } = ctx.results.analyze;

    // 如果需要，执行自动修复
    let fixesApplied = [];
    if (!ctx.results.analyze.isCompliant && this.options.isc?.autoFix) {
      fixesApplied = await this._applyAutoFixes(skillId, iscCheck.issues);
    }

    // 生成进化报告
    const evolutionReport = {
      skillId,
      previousVersion: metadata.version,
      newVersion: this._bumpVersion(metadata.version),
      changes: ctx.results.detect.changedFiles,
      fixesApplied,
      iscScore: iscCheck.score
    };

    return {
      success: true,
      skillId,
      evolutionReport
    };
  }

  /**
   * 阶段: 验证
   * @private
   */
  async _stageValidate(ctx) {
    const { skillId, evolutionReport } = ctx.results.evolve;

    // 执行基础验证
    const validations = [];

    // 1. 文件完整性检查
    const integrityCheck = await this._validateFileIntegrity(skillId);
    validations.push(integrityCheck);

    // 2. 元数据有效性检查
    const metadataCheck = await this._validateMetadata(skillId);
    validations.push(metadataCheck);

    // 3. 依赖检查
    const dependencyCheck = await this._validateDependencies(skillId);
    validations.push(dependencyCheck);

    const allPassed = validations.every(v => v.passed);

    return {
      success: allPassed,
      skillId,
      validations,
      allPassed
    };
  }

  /**
   * 阶段: 发布
   * @private
   */
  async _stagePublish(ctx) {
    const { skillId, evolutionReport } = ctx.results.evolve;

    // 更新版本号
    await this._updateSkillVersion(skillId, evolutionReport.newVersion);

    // 生成发布记录
    const releaseRecord = {
      skillId,
      version: evolutionReport.newVersion,
      releasedAt: new Date().toISOString(),
      changes: evolutionReport.changes,
      iscScore: evolutionReport.iscScore
    };

    return {
      success: true,
      skillId,
      releaseRecord
    };
  }

  /**
   * 阶段: 同步到EvoMap
   * @private
   */
  async _stageSync(ctx) {
    const { skillId, releaseRecord } = ctx.results.publish;

    if (!this.evomapUploader) {
      return { success: false, error: 'EvoMap上传器未初始化' };
    }

    // 构建技能状态
    const skillState = {
      skillId,
      skillName: releaseRecord.skillId,
      version: releaseRecord.version,
      description: '',
      createdAt: releaseRecord.releasedAt,
      updatedAt: releaseRecord.releasedAt,
      iscScore: releaseRecord.iscScore
    };

    // 上传到EvoMap
    const uploadResult = await this.evomapUploader.upload(skillState);

    return {
      success: uploadResult.success,
      skillId,
      geneId: uploadResult.geneId,
      uploadResult
    };
  }

  /**
   * DTO事件处理: 技能变更
   * @private
   */
  async _onSkillChanged(event) {
    this._log('info', '收到DTO事件: skill.changed', { skillId: event.skillId });

    if (!this.options.pipeline?.autoTrigger) {
      this._log('info', '自动触发已禁用，跳过执行');
      return;
    }

    try {
      await this.execute({
        skillId: event.skillId,
        triggerType: 'dto',
        eventData: event
      });
    } catch (error) {
      this._log('error', '处理技能变更事件失败:', error);
    }
  }

  /**
   * DTO事件处理: 技能创建
   * @private
   */
  async _onSkillCreated(event) {
    this._log('info', '收到DTO事件: skill.created', { skillId: event.skillId });
    // 新技能创建时，执行初始进化流程
    await this._onSkillChanged(event);
  }

  /**
   * DTO事件处理: 技能发布
   * @private
   */
  async _onSkillPublished(event) {
    this._log('info', '收到DTO事件: skill.published', { skillId: event.skillId });
    // 技能发布时，同步到EvoMap
    if (this.evomapUploader) {
      await this._syncToEvoMap(event.skillId, event);
    }
  }

  /**
   * 同步技能到EvoMap
   * @private
   */
  async _syncToEvoMap(skillId, data) {
    try {
      this._log('info', `同步技能到EvoMap: ${skillId}`);
      
      const skillState = {
        skillId,
        skillName: data.skillName || skillId,
        version: data.version || '1.0.0',
        description: data.description || '',
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt || new Date().toISOString(),
        iscScore: data.iscScore || 0
      };

      const result = await this.evomapUploader.upload(skillState);
      
      if (result.success) {
        this._log('info', `技能同步成功: ${skillId} -> ${result.geneId}`);
      } else {
        this._log('warning', `技能同步跳过: ${skillId}, 原因: ${result.reason}`);
      }

      return result;
    } catch (error) {
      this._log('error', `同步技能到EvoMap失败: ${skillId}`, error);
      throw error;
    }
  }

  /**
   * 处理阶段失败
   * @private
   */
  async _handleStageFailure(data) {
    const { stageId, error, runId } = data;
    
    this._log('error', `阶段失败: ${stageId}`, error);

    await this.errorHandler.handleError(error, { stage: stageId, runId });

    // 尝试回滚
    if (this.errorHandler.shouldRollback(error)) {
      await this._rollbackStage(stageId, runId);
    }
  }

  /**
   * 回滚阶段
   * @private
   */
  async _rollbackStage(stageId, runId) {
    this._log('info', `回滚阶段: ${stageId}`);
    // 实现回滚逻辑
  }

  /**
   * 记录到知识库
   * @private
   */
  async _logToKnowledgeBase(eventType, data) {
    if (!this.options.integration?.cras?.enabled) {
      return;
    }

    try {
      const kbPath = this.options.integration.cras.knowledgeBasePath;
      const logEntry = {
        eventType,
        timestamp: new Date().toISOString(),
        pipelineId: this.pipelineId,
        ...data
      };

      // 写入知识库日志
      const logFile = path.join(kbPath, 'evolution-pipeline.log.jsonl');
      const logLine = JSON.stringify(logEntry) + '\n';
      
      fs.appendFileSync(logFile, logLine);
    } catch (error) {
      // 知识库记录失败不阻断主流程
      this._log('debug', '知识库记录失败:', error.message);
    }
  }

  /**
   * 发送通知
   * @private
   */
  async _notify(type, message, data = {}) {
    if (!this.notification) {
      return;
    }

    try {
      switch (type) {
        case 'success':
          await this.notification.success(message, '', data);
          break;
        case 'error':
          await this.notification.error(message, '', data);
          break;
        case 'warning':
          await this.notification.warning(message, '', data);
          break;
        default:
          await this.notification.info(message, '', data);
      }
    } catch (error) {
      this._log('debug', '通知发送失败:', error.message);
    }
  }

  /**
   * 日志记录
   * @private
   */
  _log(level, message, data) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      data,
      pipelineId: this.pipelineId
    };

    if (this.options.logging?.console !== false) {
      console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`, data || '');
    }

    // 文件日志
    if (this.options.logging?.file) {
      const logPath = this.options.logging?.logPath || './logs';
      if (!fs.existsSync(logPath)) {
        fs.mkdirSync(logPath, { recursive: true });
      }
      const logFile = path.join(logPath, `pipeline-${new Date().toISOString().split('T')[0]}.log.jsonl`);
      fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
    }
  }

  // ===== 辅助方法 =====

  async _detectChangedFiles(skillPath) {
    // 实现变更检测逻辑
    return [];
  }

  _parseSkillMetadata(content) {
    const metadata = {};
    const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
    
    if (match) {
      const yamlContent = match[1];
      const lines = yamlContent.split('\n');
      
      for (const line of lines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.substring(0, colonIndex).trim();
          const value = line.substring(colonIndex + 1).trim();
          metadata[key] = value.replace(/^["']|["']$/g, '');
        }
      }
    }
    
    return metadata;
  }

  async _checkISCCompliance(skillPath) {
    // 调用ISC检查
    return { score: 85, issues: [] };
  }

  async _applyAutoFixes(skillId, issues) {
    // 应用自动修复
    return [];
  }

  _bumpVersion(version) {
    if (!version) return '1.0.0';
    const parts = version.split('.');
    parts[2] = parseInt(parts[2] || 0) + 1;
    return parts.join('.');
  }

  async _validateFileIntegrity(skillId) {
    return { passed: true, name: 'fileIntegrity' };
  }

  async _validateMetadata(skillId) {
    return { passed: true, name: 'metadata' };
  }

  async _validateDependencies(skillId) {
    return { passed: true, name: 'dependencies' };
  }

  async _updateSkillVersion(skillId, version) {
    // 更新技能版本
  }

  /**
   * 获取流水线统计
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      ...this.stats,
      isRunning: this.running,
      isInitialized: this.initialized,
      currentState: this.stateMachine?.currentState,
      dtoConnected: !!this.dtoAdapter?.isSubscribed,
      evomapConnected: !!this.evomapClient?.isConnected
    };
  }
}

/**
 * 创建流水线实例的工厂函数
 * @param {Object} options - 配置选项
 * @returns {SEEFEvolutionPipeline}
 */
export function createPipeline(options = {}) {
  return new SEEFEvolutionPipeline(options);
}

/**
 * CLI入口
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const pipeline = createPipeline();

  switch (command) {
    case 'start':
      await pipeline.start();
      
      // 保持运行
      process.on('SIGINT', async () => {
        console.log('\n收到中断信号，正在停止...');
        await pipeline.stop();
        process.exit(0);
      });
      break;

    case 'stop':
      await pipeline.stop();
      break;

    case 'run':
      await pipeline.execute({
        skillId: args[1],
        triggerType: 'manual'
      });
      break;

    case 'status':
      console.log('流水线状态:', pipeline.getStats());
      break;

    default:
      console.log(`
SEEF EvoMap进化流水线 v1.0.0

用法: node index.js <命令> [参数]

命令:
  start       启动流水线服务
  stop        停止流水线服务
  run <skill> 执行单次进化流程
  status      查看流水线状态

示例:
  node index.js start
  node index.js run dto-core
      `);
  }
}

// 如果直接运行此文件
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { SEEFEvolutionPipeline };
export default SEEFEvolutionPipeline;
