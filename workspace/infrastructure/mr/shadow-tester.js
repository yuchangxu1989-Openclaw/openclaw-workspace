/**
 * Shadow Tester - 影子测试框架
 * 生产流量旁路到完整版MR，与MVP版结果对比
 * 
 * @version 1.0.0
 * @description Phase 2: 影子测试实现
 */

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const crypto = require('crypto');

// 配置路径
const CONFIG_PATH = path.join(__dirname, 'config', 'shadow-test.json');
const DEFAULT_REPORT_PATH = path.join(__dirname, 'shadow-test-report.json');

/**
 * 影子测试器主类
 */
class ShadowTester {
  constructor(configOverride = {}) {
    this.config = this.loadConfig(configOverride);
    this.reports = [];
    this.stats = {
      totalRequests: 0,
      shadowRequests: 0,
      bypassSuccess: 0,
      bypassFailed: 0,
      intentMatches: 0,
      modelMatches: 0,
      timeouts: 0,
      circuitOpen: false,
      consecutiveFailures: 0
    };
    this.circuitOpenedAt = null;
    this.mvpModule = null;
    this.fullRouter = null;
    this.flushTimer = null;
    
    // 初始化
    this.init();
  }

  /**
   * 加载配置
   */
  loadConfig(override) {
    try {
      const configContent = fs.readFileSync(CONFIG_PATH, 'utf-8');
      const fileConfig = JSON.parse(configContent);
      return { ...fileConfig, ...override };
    } catch (error) {
      console.warn('[ShadowTester] 配置文件加载失败，使用默认配置:', error.message);
      return {
        enabled: true,
        sampleRate: 0.01,
        comparisonDimensions: ['intent', 'modelChain', 'duration'],
        timeouts: { fullVersion: 5000, collection: 30000 },
        safety: { isolatedErrors: true, skipOnTimeout: true, maxConcurrentShadow: 10 },
        reporting: { outputPath: DEFAULT_REPORT_PATH, maxReportsInMemory: 1000 }
      };
    }
  }

  /**
   * 初始化模块
   */
  async init() {
    if (!this.config.enabled) {
      console.log('[ShadowTester] 影子测试已禁用');
      return;
    }

    try {
      // 加载MVP版
      this.mvpModule = require(this.config.mvpPath || './mr-router.mvp.js');
      console.log('[ShadowTester] MVP版加载成功');
    } catch (error) {
      console.error('[ShadowTester] MVP版加载失败:', error.message);
    }

    try {
      // 动态导入完整版 (ESM模块)
      const fullPath = path.resolve(__dirname, this.config.fullVersionPath || './dist/mr-router.js');
      const fullModule = await import(fullPath);
      const MRRouter = fullModule.MRRouter;
      this.fullRouter = new MRRouter({
        intentTemplatesPath: path.join(__dirname, 'intent-templates')
      });
      console.log('[ShadowTester] 完整版加载成功');
    } catch (error) {
      console.error('[ShadowTester] 完整版加载失败:', error.message);
    }

    // 启动定时刷新
    this.startFlushTimer();
  }

  /**
   * 生成请求ID
   */
  generateRequestId() {
    return `shadow_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * 是否应该采样
   */
  shouldSample() {
    if (!this.config.enabled) return false;
    if (this.stats.circuitOpen) {
      // 熔断器检查：超过重置时间则关闭
      if (this.circuitOpenedAt && (Date.now() - this.circuitOpenedAt > this.config.safety.circuitBreaker.resetTimeoutMs)) {
        this.stats.circuitOpen = false;
        this.stats.consecutiveFailures = 0;
        this.circuitOpenedAt = null;
        console.log('[ShadowTester] 熔断器重置');
      } else {
        return false;
      }
    }
    return Math.random() < this.config.sampleRate;
  }

  /**
   * 记录熔断器失败
   */
  recordFailure() {
    this.stats.consecutiveFailures++;
    if (this.stats.consecutiveFailures >= this.config.safety.circuitBreaker.failureThreshold) {
      this.stats.circuitOpen = true;
      this.circuitOpenedAt = Date.now();
      console.warn('[ShadowTester] 熔断器开启 - 过多连续失败');
    }
  }

  /**
   * 记录成功
   */
  recordSuccess() {
    this.stats.consecutiveFailures = 0;
  }

  /**
   * 包装MVP路由调用 - 主入口
   */
  async wrapMVPRoute(mvpRouteFn, request) {
    this.stats.totalRequests++;
    
    // 执行MVP版（主流程，必须成功）
    const mvpStartTime = Date.now();
    let mvpResult;
    try {
      mvpResult = await mvpRouteFn(request);
    } catch (error) {
      // MVP版错误直接抛出，不拦截
      throw error;
    }
    const mvpDuration = Date.now() - mvpStartTime;

    // 提取MVP结果
    const mvpOutput = {
      intent: mvpResult.intent || 'general',
      modelChain: mvpResult.modelChain || [],
      duration: mvpDuration,
      status: mvpResult.status || 'unknown'
    };

    // 判断是否进行影子测试
    if (this.shouldSample()) {
      this.stats.shadowRequests++;
      
      // 异步执行影子测试，不阻塞主流程
      this.executeShadowTest(request, mvpOutput).catch(error => {
        // 影子测试错误不影响主流程
        if (this.config.logLevel === 'debug') {
          console.debug('[ShadowTester] 影子测试错误:', error.message);
        }
      });
    }

    return mvpResult;
  }

  /**
   * 执行影子测试（异步，不阻塞）
   */
  async executeShadowTest(request, mvpOutput) {
    const requestId = this.generateRequestId();
    const timestamp = new Date().toISOString();
    
    // 准备报告对象
    const report = {
      requestId,
      timestamp,
      input: this.config.reporting.includeInput ? request.description : '[redacted]',
      mvpResult: mvpOutput,
      fullResult: null,
      match: false,
      diff: [],
      severity: 'low',
      error: null
    };

    try {
      // 检查完整版是否可用
      if (!this.fullRouter) {
        throw new Error('完整版MR未初始化');
      }

      // 构建完整版请求
      const fullRequest = {
        description: request.description,
        agentConfig: request.agentConfig || { agentId: request.agentId || 'default' },
        systemMessage: request.systemMessage,
        attachments: request.attachments,
        options: {
          timeoutMs: this.config.timeouts.fullVersion,
          enableSandbox: false,
          enforceCapabilityMatch: false
        }
      };

      // 执行完整版（带超时）
      const fullStartTime = Date.now();
      const fullResult = await this.executeWithTimeout(
        () => this.fullRouter.routeAndExecute(fullRequest),
        this.config.timeouts.fullVersion
      );
      const fullDuration = Date.now() - fullStartTime;

      // 提取完整版结果
      report.fullResult = {
        intent: fullResult.metadata?.intent?.taskCategory || 'general',
        modelChain: fullResult.modelChain || [],
        duration: fullDuration,
        status: fullResult.status || 'unknown',
        intentDetails: fullResult.metadata?.intent
      };

      // 对比结果
      const comparison = this.compareResults(mvpOutput, report.fullResult);
      report.match = comparison.match;
      report.diff = comparison.diff;
      report.severity = comparison.severity;

      // 更新统计
      this.stats.bypassSuccess++;
      if (comparison.intentMatch) this.stats.intentMatches++;
      if (comparison.modelMatch) this.stats.modelMatches++;
      this.recordSuccess();

    } catch (error) {
      // 影子测试失败不影响主流程
      this.stats.bypassFailed++;
      
      if (error.message.includes('timeout')) {
        this.stats.timeouts++;
        report.error = 'TIMEOUT';
      } else {
        report.error = error.message;
      }
      
      this.recordFailure();
      
      if (this.config.logLevel === 'debug') {
        console.debug(`[ShadowTester:${requestId}] 旁路失败:`, error.message);
      }
    }

    // 保存报告
    this.addReport(report);
  }

  /**
   * 带超时的执行
   */
  async executeWithTimeout(fn, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('timeout'));
      }, timeoutMs);

      Promise.resolve(fn())
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * 对比两个版本的结果
   */
  compareResults(mvp, full) {
    const diff = [];
    let intentMatch = true;
    let modelMatch = true;
    let severity = 'low';

    // 对比意图分类
    if (mvp.intent !== full.intent) {
      diff.push(`intent: ${mvp.intent} → ${full.intent}`);
      intentMatch = false;
      severity = 'medium';
    }

    // 对比模型链
    const mvpChainStr = JSON.stringify(mvp.modelChain);
    const fullChainStr = JSON.stringify(full.modelChain);
    if (mvpChainStr !== fullChainStr) {
      diff.push(`modelChain: ${mvpChainStr} → ${fullChainStr}`);
      modelMatch = false;
      severity = 'high';
    }

    // 对比执行时间（差异过大时记录）
    const durationDiff = Math.abs(mvp.duration - full.duration);
    if (durationDiff > 1000) { // 超过1秒差异
      diff.push(`duration: ${mvp.duration}ms → ${full.duration}ms (Δ${durationDiff}ms)`);
    }

    // 综合匹配判断
    const match = intentMatch && modelMatch;

    return { match, diff, intentMatch, modelMatch, severity };
  }

  /**
   * 添加报告到内存
   */
  addReport(report) {
    this.reports.push(report);
    
    // 限制内存中的报告数量
    if (this.reports.length > this.config.reporting.maxReportsInMemory) {
      this.reports.shift();
    }

    // 立即写入文件（异步）
    this.flushReports();
  }

  /**
   * 刷新报告到文件
   */
  async flushReports() {
    if (this.reports.length === 0) return;

    const outputPath = this.config.reporting.outputPath || DEFAULT_REPORT_PATH;
    
    try {
      const reportData = {
        summary: this.getSummary(),
        reports: this.reports,
        lastUpdated: new Date().toISOString()
      };

      fs.writeFileSync(outputPath, JSON.stringify(reportData, null, 2));
    } catch (error) {
      console.error('[ShadowTester] 报告写入失败:', error.message);
    }
  }

  /**
   * 启动定时刷新
   */
  startFlushTimer() {
    const interval = this.config.reporting.flushIntervalMs || 60000;
    this.flushTimer = setInterval(() => {
      this.flushReports();
    }, interval);
  }

  /**
   * 停止定时刷新
   */
  stopFlushTimer() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * 获取统计摘要
   */
  getSummary() {
    const total = this.stats.shadowRequests;
    return {
      totalRequests: this.stats.totalRequests,
      shadowRequests: this.stats.shadowRequests,
      bypassSuccess: this.stats.bypassSuccess,
      bypassFailed: this.stats.bypassFailed,
      bypassSuccessRate: total > 0 ? (this.stats.bypassSuccess / total) : 0,
      intentConsistency: total > 0 ? (this.stats.intentMatches / total) : 0,
      modelSelectionConsistency: total > 0 ? (this.stats.modelMatches / total) : 0,
      timeouts: this.stats.timeouts,
      circuitOpen: this.stats.circuitOpen,
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * 获取详细统计
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * 销毁资源
   */
  destroy() {
    this.stopFlushTimer();
    this.flushReports();
  }
}

// ============================================================================
// 便捷函数和导出
// ============================================================================

let defaultTester = null;

/**
 * 获取默认影子测试器实例
 */
function getShadowTester(config) {
  if (!defaultTester) {
    defaultTester = new ShadowTester(config);
  }
  return defaultTester;
}

/**
 * 创建MVP路由的包装器
 */
function createMVPRouterWrapper(mvpModule, config = {}) {
  const tester = getShadowTester(config);
  
  return {
    routeAndExecute: async (request) => {
      return tester.wrapMVPRoute(
        (req) => mvpModule.routeAndExecute(req),
        request
      );
    },
    classifyIntent: mvpModule.classifyIntent
  };
}

/**
 * 包装现有的MVP路由函数
 */
function wrapRouteAndExecute(originalFn, config = {}) {
  const tester = getShadowTester(config);
  return async (request) => tester.wrapMVPRoute(originalFn, request);
}

/**
 * 健康检查
 */
async function health() {
  const tester = getShadowTester();
  return {
    enabled: tester.config.enabled,
    initialized: !!tester.mvpModule && !!tester.fullRouter,
    circuitOpen: tester.stats.circuitOpen,
    stats: tester.getSummary()
  };
}

module.exports = {
  ShadowTester,
  getShadowTester,
  createMVPRouterWrapper,
  wrapRouteAndExecute,
  health
};
