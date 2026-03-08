/**
 * ISC-本地任务编排 握手执行器 (ISCDTOHandshakeExecutor)
 * 
 * 实现 ISC-本地任务编排 定期握手机制，每30分钟执行双向扫描对齐
 * 规则定义: rule.isc-dto-handshake-001.json
 * 
 * 功能概述:
 * 1. 定期扫描ISC规则目录，收集所有规则信息
 * 2. 定期扫描DTO订阅目录，收集所有订阅信息
 * 3. 双向对齐检查：验证每条规则是否有对应的订阅
 * 4. 自动修复：为缺失订阅的规则创建订阅
 * 5. 生成对齐报告，包含对齐率和修复状态
 * 6. 支持错误重试、熔断保护、详细日志记录
 * 
 * @module ISCDTOHandshakeExecutor
 * @version 1.0.0
 * @author LEP韧性执行中心
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

/**
 * ISC-DTO握手执行器类
 * 实现双向扫描对齐、错误重试、状态检查和日志记录
 */
class ISCDTOHandshakeExecutor extends EventEmitter {
  /**
   * 构造函数
   * @param {Object} options - 配置选项
   * @param {string} options.iscRulesPath - ISC规则目录路径
   * @param {string} options.dtoSubscriptionsPath - DTO订阅目录路径
   * @param {number} options.retryAttempts - 最大重试次数，默认3
   * @param {number} options.retryDelay - 重试延迟(毫秒)，默认1000
   * @param {number} options.circuitBreakerThreshold - 熔断阈值，默认5
   * @param {string} options.logLevel - 日志级别，默认'info'
   * @param {string} options.reportPath - 报告输出路径
   */
  constructor(options = {}) {
    super();
    
    // 初始化配置
    this.options = {
      // ISC规则目录路径，默认指向isc-core/rules
      iscRulesPath: options.iscRulesPath || path.join(__dirname, '../isc-core/rules'),
      // DTO订阅目录路径，默认指向dto-core/subscriptions
      dtoSubscriptionsPath: options.dtoSubscriptionsPath || path.join(__dirname, '../dto-core/subscriptions'),
      // 重试策略配置
      retryAttempts: options.retryAttempts || 3,
      retryDelay: options.retryDelay || 1000,
      retryBackoffMultiplier: options.retryBackoffMultiplier || 2,
      // 熔断器配置
      circuitBreakerThreshold: options.circuitBreakerThreshold || 5,
      circuitBreakerResetTimeout: options.circuitBreakerResetTimeout || 30000,
      // 日志和报告配置
      logLevel: options.logLevel || 'info',
      reportPath: options.reportPath || path.join(__dirname, './reports'),
      // 对齐阈值配置（低于此值触发告警）
      alignmentAlertThreshold: options.alignmentAlertThreshold || 0.90
    };
    
    // 初始化熔断器状态
    this.circuitBreaker = {
      state: 'CLOSED', // CLOSED(关闭), OPEN(打开), HALF_OPEN(半开)
      failureCount: 0,
      lastFailureTime: null,
      successCount: 0
    };
    
    // 执行状态缓存
    this.executionCache = new Map();
    
    // WAL日志目录
    this.walPath = path.join(__dirname, '.isc-dto-wal');
    this._initWAL();
    
    // 确保报告目录存在
    this._ensureReportDir();
    
    this.log('info', 'ISC-DTO握手执行器初始化完成');
  }

  /**
   * 主执行入口 - 执行完整的ISC-DTO握手流程
   * 
   * 执行步骤:
   * 1. 熔断器检查
   * 2. ISC规则扫描
   * 3. DTO订阅扫描
   * 4. 双向对齐检查
   * 5. 自动修复
   * 6. 生成报告
   * 7. 状态通知
   * 
   * @returns {Promise<HandshakeResult>} 握手结果对象
   */
  async execute() {
    const executionId = this._generateExecutionId();
    const startTime = Date.now();
    
    this.log('info', `[${executionId}] 开始ISC-DTO握手流程`);
    
    // 构建执行上下文
    const context = {
      executionId,
      startTime,
      status: 'running',
      attempts: 0
    };
    
    try {
      // 步骤1: 熔断器状态检查
      if (!this._checkCircuitBreaker()) {
        throw new Error('熔断器处于打开状态，拒绝执行');
      }
      
      // 记录执行开始
      await this._writeWAL('execution_start', context);
      
      // 步骤2: ISC规则扫描（带重试）
      const iscScanResult = await this._executeWithRetry(
        () => this._scanISCRules(),
        'isc_rules_scan',
        context
      );
      
      // 步骤3: DTO订阅扫描（带重试）
      const dtoScanResult = await this._executeWithRetry(
        () => this._scanDTOSubscriptions(),
        'dto_subscriptions_scan',
        context
      );
      
      // 步骤4: 双向对齐检查
      const alignmentResult = await this._performAlignmentCheck(
        iscScanResult.rules,
        dtoScanResult.subscriptions
      );
      
      // 步骤5: 自动修复不对齐项
      let repairResult = null;
      if (alignmentResult.misaligned.length > 0) {
        repairResult = await this._autoRepair(alignmentResult.misaligned);
      }
      
      // 步骤6: 生成对齐报告
      const report = await this._generateReport({
        executionId,
        startTime,
        iscScanResult,
        dtoScanResult,
        alignmentResult,
        repairResult
      });
      
      // 步骤7: 检查对齐率告警阈值
      const alignmentRate = alignmentResult.alignmentRate;
      if (alignmentRate < this.options.alignmentAlertThreshold) {
        await this._triggerAlert('ALIGNMENT_RATE_LOW', {
          executionId,
          alignmentRate,
          threshold: this.options.alignmentAlertThreshold,
          misaligned: alignmentResult.misaligned
        });
      }
      
      // 更新执行状态为成功
      context.status = 'success';
      context.endTime = Date.now();
      context.duration = context.endTime - startTime;
      
      // 记录成功到熔断器
      this._recordCircuitBreakerSuccess();
      
      // 写入WAL成功日志
      await this._writeWAL('execution_success', {
        ...context,
        alignmentRate,
        misalignedCount: alignmentResult.misaligned.length
      });
      
      // 触发成功事件
      this.emit('handshake:success', {
        executionId,
        duration: context.duration,
        alignmentRate,
        reportPath: report.filePath
      });
      
      this.log('info', `[${executionId}] ISC-DTO握手完成，对齐率: ${(alignmentRate * 100).toFixed(2)}%`);
      
      return {
        status: 'success',
        executionId,
        duration: context.duration,
        alignmentRate,
        iscRulesCount: iscScanResult.count,
        dtoSubscriptionsCount: dtoScanResult.count,
        misalignedCount: alignmentResult.misaligned.length,
        repairedCount: repairResult ? repairResult.repaired.length : 0,
        report: report.summary,
        reportPath: report.filePath
      };
      
    } catch (error) {
      // 处理执行失败
      context.status = 'failed';
      context.endTime = Date.now();
      context.duration = context.endTime - startTime;
      context.error = error.message;
      
      // 记录失败到熔断器
      this._recordCircuitBreakerFailure();
      
      // 写入WAL失败日志
      await this._writeWAL('execution_failure', {
        ...context,
        error: error.message,
        stack: error.stack
      });
      
      // 触发失败事件
      this.emit('handshake:failure', {
        executionId,
        error: error.message,
        duration: context.duration
      });
      
      this.log('error', `[${executionId}] ISC-DTO握手失败: ${error.message}`);
      
      throw error;
    }
  }

  /**
   * 扫描ISC规则目录
   * 收集所有规则文件并提取关键信息
   * 
   * @returns {Promise<ISCRulesScanResult>} ISC规则扫描结果
   * @private
   */
  async _scanISCRules() {
    this.log('info', '开始扫描ISC规则目录...');
    
    const rulesPath = this.options.iscRulesPath;
    
    // 检查目录是否存在
    if (!fs.existsSync(rulesPath)) {
      throw new Error(`ISC规则目录不存在: ${rulesPath}`);
    }
    
    // 读取目录下所有JSON文件
    const files = fs.readdirSync(rulesPath).filter(f => f.endsWith('.json'));
    
    const rules = [];
    const errors = [];
    
    for (const file of files) {
      const filePath = path.join(rulesPath, file);
      
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const rule = JSON.parse(content);
        
        // 提取规则关键信息
        const ruleInfo = {
          id: rule.id || this._extractIdFromFilename(file),
          file: file,
          path: filePath,
          name: rule.name || null,
          domain: rule.domain || null,
          type: rule.type || 'rule',
          version: rule.version || '1.0.0',
          requiresSubscription: this._checkRequiresSubscription(rule),
          // 规范化规则ID用于匹配
          normalizedId: this._normalizeRuleId(rule.id || this._extractIdFromFilename(file))
        };
        
        rules.push(ruleInfo);
        
      } catch (error) {
        errors.push({
          file: file,
          error: error.message
        });
        this.log('warn', `解析规则文件失败 ${file}: ${error.message}`);
      }
    }
    
    // 过滤掉不需要订阅的规则（如常量规则、配置规则等）
    const actionableRules = rules.filter(r => r.requiresSubscription);
    
    this.log('info', `ISC规则扫描完成: 发现 ${rules.length} 条规则，其中 ${actionableRules.length} 条需要订阅`);
    
    return {
      count: rules.length,
      actionableCount: actionableRules.length,
      rules: actionableRules,
      errors: errors,
      scanTime: new Date().toISOString()
    };
  }

  /**
   * 扫描DTO订阅目录
   * 收集所有订阅文件并提取关键信息
   * 
   * @returns {Promise<DTOSubscriptionsScanResult>} DTO订阅扫描结果
   * @private
   */
  async _scanDTOSubscriptions() {
    this.log('info', '开始扫描DTO订阅目录...');
    
    const subscriptionsPath = this.options.dtoSubscriptionsPath;
    
    // 订阅目录可能不存在（首次运行）
    if (!fs.existsSync(subscriptionsPath)) {
      this.log('warn', `DTO订阅目录不存在，将创建: ${subscriptionsPath}`);
      fs.mkdirSync(subscriptionsPath, { recursive: true });
      
      return {
        count: 0,
        subscriptions: [],
        errors: [],
        scanTime: new Date().toISOString()
      };
    }
    
    // 读取目录下所有JSON文件
    const files = fs.readdirSync(subscriptionsPath).filter(f => f.endsWith('.json'));
    
    const subscriptions = [];
    const errors = [];
    
    for (const file of files) {
      const filePath = path.join(subscriptionsPath, file);
      
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const subscription = JSON.parse(content);
        
        // 提取订阅关键信息
        const subInfo = {
          id: subscription.subscription_id || subscription.id || this._extractIdFromFilename(file),
          file: file,
          path: filePath,
          ruleId: subscription.rule_id || null,
          ruleIds: subscription.rule_ids || [], // 支持多规则订阅
          status: subscription.status || 'active',
          trigger: subscription.trigger || null,
          createdAt: subscription.created_at || null,
          updatedAt: subscription.updated_at || null,
          // 规范化规则ID用于匹配
          normalizedRuleId: this._normalizeRuleId(subscription.rule_id || '')
        };
        
        subscriptions.push(subInfo);
        
      } catch (error) {
        errors.push({
          file: file,
          error: error.message
        });
        this.log('warn', `解析订阅文件失败 ${file}: ${error.message}`);
      }
    }
    
    this.log('info', `DTO订阅扫描完成: 发现 ${subscriptions.length} 条订阅`);
    
    return {
      count: subscriptions.length,
      subscriptions: subscriptions,
      errors: errors,
      scanTime: new Date().toISOString()
    };
  }

  /**
   * 执行双向对齐检查
   * 验证每条ISC规则是否有对应的DTO订阅
   * 
   * @param {Array} rules - ISC规则列表
   * @param {Array} subscriptions - DTO订阅列表
   * @returns {Promise<AlignmentResult>} 对齐检查结果
   * @private
   */
  async _performAlignmentCheck(rules, subscriptions) {
    this.log('info', '开始执行双向对齐检查...');
    
    // 构建订阅映射，便于快速查找
    const subscriptionMap = new Map();
    for (const sub of subscriptions) {
      // 单规则订阅
      if (sub.normalizedRuleId) {
        subscriptionMap.set(sub.normalizedRuleId, sub);
      }
      // 多规则订阅
      for (const ruleId of sub.ruleIds) {
        subscriptionMap.set(this._normalizeRuleId(ruleId), sub);
      }
    }
    
    const aligned = [];
    const misaligned = [];
    
    // 检查每条规则
    for (const rule of rules) {
      const subscription = subscriptionMap.get(rule.normalizedId);
      
      if (subscription) {
        // 已对齐
        aligned.push({
          rule: rule,
          subscription: subscription,
          status: 'aligned'
        });
      } else {
        // 未对齐（缺少订阅）
        misaligned.push({
          rule: rule,
          missing: 'subscription',
          status: 'misaligned'
        });
      }
    }
    
    // 计算对齐率
    const totalRules = rules.length;
    const alignedCount = aligned.length;
    const alignmentRate = totalRules > 0 ? alignedCount / totalRules : 1;
    
    // 检查多余的订阅（订阅了不存在的规则）
    const orphanedSubscriptions = [];
    const ruleIdSet = new Set(rules.map(r => r.normalizedId));
    
    for (const sub of subscriptions) {
      if (sub.normalizedRuleId && !ruleIdSet.has(sub.normalizedRuleId)) {
        orphanedSubscriptions.push({
          subscription: sub,
          missing: 'rule',
          status: 'orphaned'
        });
      }
    }
    
    this.log('info', `对齐检查完成: ${alignedCount}/${totalRules} 条规则对齐，对齐率 ${(alignmentRate * 100).toFixed(2)}%`);
    
    if (misaligned.length > 0) {
      this.log('warn', `发现 ${misaligned.length} 条未对齐规则需要修复`);
    }
    
    if (orphanedSubscriptions.length > 0) {
      this.log('warn', `发现 ${orphanedSubscriptions.length} 条孤儿订阅`);
    }
    
    return {
      totalRules,
      alignedCount,
      misalignedCount: misaligned.length,
      alignmentRate,
      aligned,
      misaligned,
      orphanedSubscriptions,
      checkTime: new Date().toISOString()
    };
  }

  /**
   * 自动修复不对齐项
   * 为缺失订阅的规则创建默认订阅
   * 
   * @param {Array} misaligned - 未对齐项列表
   * @returns {Promise<RepairResult>} 修复结果
   * @private
   */
  async _autoRepair(misaligned) {
    this.log('info', `开始自动修复 ${misaligned.length} 条未对齐规则...`);
    
    const repaired = [];
    const failed = [];
    
    for (const item of misaligned) {
      try {
        const rule = item.rule;
        
        // 创建默认订阅配置
        const subscription = this._createDefaultSubscription(rule);
        
        // 保存订阅文件
        const subFileName = `sub-${rule.normalizedId}.json`;
        const subFilePath = path.join(this.options.dtoSubscriptionsPath, subFileName);
        
        fs.writeFileSync(subFilePath, JSON.stringify(subscription, null, 2), 'utf8');
        
        repaired.push({
          rule: rule,
          subscriptionFile: subFileName,
          subscriptionPath: subFilePath,
          status: 'repaired'
        });
        
        this.log('info', `已创建规则 ${rule.id} 的订阅: ${subFileName}`);
        
      } catch (error) {
        failed.push({
          rule: item.rule,
          error: error.message
        });
        
        this.log('error', `修复规则 ${item.rule.id} 失败: ${error.message}`);
      }
    }
    
    this.log('info', `自动修复完成: ${repaired.length} 成功, ${failed.length} 失败`);
    
    return {
      total: misaligned.length,
      repaired: repaired,
      failed: failed,
      repairTime: new Date().toISOString()
    };
  }

  /**
   * 生成对齐报告
   * 将握手结果保存为JSON报告文件
   * 
   * @param {Object} data - 报告数据
   * @returns {Promise<ReportResult>} 报告结果
   * @private
   */
  async _generateReport(data) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportFileName = `isc-dto-handshake-report-${timestamp}.json`;
    const reportFilePath = path.join(this.options.reportPath, reportFileName);
    
    // 构建报告内容
    const report = {
      metadata: {
        reportType: 'ISC-本地任务编排-Handshake',
        version: '1.0.0',
        generatedAt: new Date().toISOString(),
        executionId: data.executionId
      },
      summary: {
        duration: data.iscScanResult.scanTime ? 
          new Date(data.alignmentResult.checkTime) - new Date(data.iscScanResult.scanTime) : 0,
        iscRulesCount: data.iscScanResult.count,
        iscActionableCount: data.iscScanResult.actionableCount,
        dtoSubscriptionsCount: data.dtoScanResult.count,
        alignmentRate: data.alignmentResult.alignmentRate,
        alignedCount: data.alignmentResult.alignedCount,
        misalignedCount: data.alignmentResult.misalignedCount,
        orphanedCount: data.alignmentResult.orphanedSubscriptions.length,
        repairedCount: data.repairResult ? data.repairResult.repaired.length : 0
      },
      details: {
        iscScan: {
          rules: data.iscScanResult.rules.map(r => ({
            id: r.id,
            name: r.name,
            domain: r.domain,
            type: r.type
          })),
          errors: data.iscScanResult.errors
        },
        dtoScan: {
          subscriptions: data.dtoScanResult.subscriptions.map(s => ({
            id: s.id,
            ruleId: s.ruleId,
            status: s.status
          })),
          errors: data.dtoScanResult.errors
        },
        alignment: {
          aligned: data.alignmentResult.aligned.map(a => ({
            ruleId: a.rule.id,
            subscriptionId: a.subscription.id
          })),
          misaligned: data.alignmentResult.misaligned.map(m => ({
            ruleId: m.rule.id,
            reason: m.missing
          })),
          orphaned: data.alignmentResult.orphanedSubscriptions.map(o => ({
            subscriptionId: o.subscription.id,
            reason: o.missing
          }))
        },
        repair: data.repairResult ? {
          repaired: data.repairResult.repaired.map(r => ({
            ruleId: r.rule.id,
            subscriptionFile: r.subscriptionFile
          })),
          failed: data.repairResult.failed.map(f => ({
            ruleId: f.rule.id,
            error: f.error
          }))
        } : null
      },
      raw: data
    };
    
    // 保存报告文件
    fs.writeFileSync(reportFilePath, JSON.stringify(report, null, 2), 'utf8');
    
    this.log('info', `对齐报告已生成: ${reportFilePath}`);
    
    return {
      fileName: reportFileName,
      filePath: reportFilePath,
      summary: report.summary
    };
  }

  /**
   * 触发告警通知
   * 当对齐率低于阈值时触发告警
   * 
   * @param {string} alertType - 告警类型
   * @param {Object} context - 告警上下文
   * @private
   */
  async _triggerAlert(alertType, context) {
    this.log('error', `⚠️ 告警触发: ${alertType} - 对齐率 ${(context.alignmentRate * 100).toFixed(2)}% 低于阈值 ${(context.threshold * 100).toFixed(2)}%`);
    
    // 触发告警事件
    this.emit('alert', {
      type: alertType,
      level: 'error',
      message: `ISC-DTO对齐率异常: ${(context.alignmentRate * 100).toFixed(2)}%`,
      context: context
    });
    
    // 可以在此处扩展更多告警渠道（邮件、飞书、短信等）
  }

  /**
   * 带重试机制的执行包装器
   * 
   * @param {Function} fn - 要执行的函数
   * @param {string} operationName - 操作名称
   * @param {Object} context - 执行上下文
   * @returns {Promise<any>} 执行结果
   * @private
   */
  async _executeWithRetry(fn, operationName, context) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.options.retryAttempts; attempt++) {
      context.attempts = attempt;
      
      try {
        this.log('debug', `[${operationName}] 执行尝试 ${attempt}/${this.options.retryAttempts}`);
        
        const result = await fn();
        
        if (attempt > 1) {
          this.log('info', `[${operationName}] 重试成功 (尝试 ${attempt})`);
        }
        
        return result;
        
      } catch (error) {
        lastError = error;
        
        this.log('warn', `[${operationName}] 尝试 ${attempt} 失败: ${error.message}`);
        
        // 如果不是最后一次尝试，等待后重试
        if (attempt < this.options.retryAttempts) {
          const delay = this._calculateRetryDelay(attempt);
          this.log('debug', `[${operationName}] ${delay}ms 后重试...`);
          await this._sleep(delay);
        }
      }
    }
    
    // 所有重试都失败了
    throw new Error(`[${operationName}] 执行失败，已重试 ${this.options.retryAttempts} 次: ${lastError.message}`);
  }

  /**
   * 检查熔断器状态
   * @returns {boolean} 是否允许执行
   * @private
   */
  _checkCircuitBreaker() {
    const { state, failureCount, lastFailureTime } = this.circuitBreaker;
    
    if (state === 'CLOSED') {
      return true;
    }
    
    if (state === 'OPEN') {
      // 检查是否可以进入半开状态
      const now = Date.now();
      if (now - lastFailureTime > this.options.circuitBreakerResetTimeout) {
        this.circuitBreaker.state = 'HALF_OPEN';
        this.log('info', '熔断器进入半开状态，允许试探性执行');
        return true;
      }
      return false;
    }
    
    if (state === 'HALF_OPEN') {
      return true;
    }
    
    return true;
  }

  /**
   * 记录熔断器成功
   * @private
   */
  _recordCircuitBreakerSuccess() {
    const cb = this.circuitBreaker;
    
    if (cb.state === 'HALF_OPEN') {
      cb.successCount++;
      // 连续成功达到一定次数后关闭熔断器
      if (cb.successCount >= 3) {
        cb.state = 'CLOSED';
        cb.failureCount = 0;
        cb.successCount = 0;
        this.log('info', '熔断器关闭');
      }
    } else {
      cb.failureCount = 0;
    }
  }

  /**
   * 记录熔断器失败
   * @private
   */
  _recordCircuitBreakerFailure() {
    const cb = this.circuitBreaker;
    
    cb.failureCount++;
    cb.lastFailureTime = Date.now();
    
    if (cb.state === 'HALF_OPEN') {
      // 半开状态下失败，重新打开
      cb.state = 'OPEN';
      this.log('error', '熔断器重新打开');
    } else if (cb.failureCount >= this.options.circuitBreakerThreshold) {
      // 失败次数达到阈值，打开熔断器
      cb.state = 'OPEN';
      this.log('error', `熔断器打开 (连续失败 ${cb.failureCount} 次)`);
    }
  }

  /**
   * 计算重试延迟
   * @param {number} attempt - 当前尝试次数
   * @returns {number} 延迟毫秒数
   * @private
   */
  _calculateRetryDelay(attempt) {
    const baseDelay = this.options.retryDelay;
    const multiplier = this.options.retryBackoffMultiplier;
    
    // 指数退避
    const delay = baseDelay * Math.pow(multiplier, attempt - 1);
    
    // 添加随机抖动，避免惊群效应
    const jitter = delay * 0.1 * (Math.random() - 0.5);
    
    return Math.floor(delay + jitter);
  }

  /**
   * 创建默认订阅配置
   * @param {Object} rule - 规则信息
   * @returns {Object} 订阅配置对象
   * @private
   */
  _createDefaultSubscription(rule) {
    const now = new Date().toISOString();
    
    return {
      subscription_id: `sub-${rule.normalizedId}`,
      rule_id: rule.id,
      rule_name: rule.name,
      status: 'active',
      trigger: {
        type: 'event',
        source: `isc.${rule.domain || 'general'}.${rule.name || 'unknown'}`,
        condition: 'automatic'
      },
      actions: [
        {
          type: 'execute',
          target: 'lep-executor',
          command: `execute-rule ${rule.id}`
        }
      ],
      created_at: now,
      updated_at: now,
      auto_created: true,
      created_by: 'isc-dto-handshake'
    };
  }

  /**
   * 检查规则是否需要订阅
   * @param {Object} rule - 规则对象
   * @returns {boolean} 是否需要订阅
   * @private
   */
  _checkRequiresSubscription(rule) {
    // 检查规则属性，判断是否需要DTO订阅
    
    // 如果有明确的订阅标记
    if (rule.dto_subscription === false) {
      return false;
    }
    
    if (rule.dto_subscription === true) {
      return true;
    }
    
    // 检查执行策略
    if (rule.governance) {
      // 如果需要自动执行或理事会审批，通常需要订阅
      if (rule.governance.auto_execute || rule.governance.councilRequired) {
        return true;
      }
    }
    
    // 检查是否有执行步骤
    if (rule.execution || rule.steps || rule.phases) {
      return true;
    }
    
    // 检查规则类型
    const actionableTypes = ['rule', 'standard', 'detection', 'decision'];
    if (actionableTypes.includes(rule.type)) {
      return true;
    }
    
    // 默认需要订阅
    return true;
  }

  /**
   * 规范化规则ID
   * @param {string} id - 原始ID
   * @returns {string} 规范化后的ID
   * @private
   */
  _normalizeRuleId(id) {
    if (!id) return '';
    
    return id
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * 从文件名提取ID
   * @param {string} filename - 文件名
   * @returns {string} 提取的ID
   * @private
   */
  _extractIdFromFilename(filename) {
    return filename.replace(/\.json$/, '');
  }

  /**
   * 生成执行ID
   * @returns {string} 唯一执行ID
   * @private
   */
  _generateExecutionId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    return `isc-dto-${timestamp}-${random}`;
  }

  /**
   * 初始化WAL目录
   * @private
   */
  _initWAL() {
    if (!fs.existsSync(this.walPath)) {
      fs.mkdirSync(this.walPath, { recursive: true });
    }
  }

  /**
   * 确保报告目录存在
   * @private
   */
  _ensureReportDir() {
    if (!fs.existsSync(this.options.reportPath)) {
      fs.mkdirSync(this.options.reportPath, { recursive: true });
    }
  }

  /**
   * 写入WAL日志
   * @param {string} type - 日志类型
   * @param {Object} data - 日志数据
   * @private
   */
  async _writeWAL(type, data) {
    const entry = {
      type,
      timestamp: Date.now(),
      data
    };
    
    const walFile = path.join(this.walPath, `handshake-${new Date().toISOString().split('T')[0]}.wal`);
    
    try {
      fs.appendFileSync(walFile, JSON.stringify(entry) + '\n', 'utf8');
    } catch (error) {
      console.error('WAL写入失败:', error.message);
    }
  }

  /**
   * 日志记录
   * @param {string} level - 日志级别
   * @param {string} message - 日志消息
   */
  log(level, message) {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    
    if (levels[level] >= levels[this.options.logLevel]) {
      const timestamp = new Date().toISOString();
      const prefix = `[ISC-本地任务编排][${level.toUpperCase()}]`;
      console.log(`${timestamp} ${prefix} ${message}`);
    }
  }

  /**
   * 休眠函数
   * @param {number} ms - 休眠毫秒数
   * @returns {Promise<void>}
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取执行器状态
   * @returns {Object} 状态信息
   */
  getStatus() {
    return {
      circuitBreaker: { ...this.circuitBreaker },
      options: { ...this.options },
      uptime: Date.now()
    };
  }

  /**
   * 查询最近执行历史
   * @param {number} limit - 返回记录数限制
   * @returns {Array} 执行历史记录
   */
  async getExecutionHistory(limit = 10) {
    try {
      const files = fs.readdirSync(this.walPath)
        .filter(f => f.endsWith('.wal'))
        .sort()
        .reverse();
      
      const history = [];
      
      for (const file of files.slice(0, 3)) { // 只读取最近3个文件
        const content = fs.readFileSync(path.join(this.walPath, file), 'utf8');
        const lines = content.split('\n').filter(Boolean).reverse();
        
        for (const line of lines.slice(0, limit)) {
          try {
            const entry = JSON.parse(line);
            if (entry.type === 'execution_success' || entry.type === 'execution_failure') {
              history.push(entry);
              if (history.length >= limit) break;
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
        
        if (history.length >= limit) break;
      }
      
      return history;
    } catch (error) {
      this.log('error', `查询执行历史失败: ${error.message}`);
      return [];
    }
  }
}

/**
 * CLI 执行入口
 * 支持命令行直接执行
 */
async function main() {
  console.log('========================================');
  console.log('  ISC-本地任务编排 握手执行器 v1.0.0');
  console.log('========================================\n');
  
  const executor = new ISCDTOHandshakeExecutor({
    logLevel: process.env.LOG_LEVEL || 'info'
  });
  
  // 监听事件
  executor.on('handshake:success', (data) => {
    console.log('\n✅ 握手成功!');
    console.log(`   执行ID: ${data.executionId}`);
    console.log(`   耗时: ${data.duration}ms`);
    console.log(`   对齐率: ${(data.alignmentRate * 100).toFixed(2)}%`);
  });
  
  executor.on('handshake:failure', (data) => {
    console.log('\n❌ 握手失败!');
    console.log(`   执行ID: ${data.executionId}`);
    console.log(`   错误: ${data.error}`);
  });
  
  executor.on('alert', (alert) => {
    console.log('\n⚠️ 告警!');
    console.log(`   类型: ${alert.type}`);
    console.log(`   消息: ${alert.message}`);
  });
  
  try {
    const result = await executor.execute();
    
    console.log('\n----------------------------------------');
    console.log('执行结果:');
    console.log('----------------------------------------');
    console.log(JSON.stringify(result, null, 2));
    console.log('----------------------------------------\n');
    
    process.exit(result.status === 'success' ? 0 : 1);
    
  } catch (error) {
    console.error('\n致命错误:', error.message);
    process.exit(1);
  }
}

// 如果是直接运行此文件，执行main函数
if (require.main === module) {
  main();
}

// 导出模块
module.exports = {
  ISCDTOHandshakeExecutor
};
