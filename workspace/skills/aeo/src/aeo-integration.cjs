/**
 * AEO Integration Test - AEO系统集成测试
 * @description 将沙盒、仪表盘、自动整改闭环接入现有AEO系统
 */

const { ContainerPool } = require('./sandbox/container-pool.cjs');
const { ContainerPoolAdapter } = require('./sandbox/process-sandbox.cjs');
const { DashboardDataAPI } = require('./dashboard/data-api.cjs');
const { AutoRemediationLoop } = require('./remediation/auto-remediation-loop.cjs');
const { TrackSelector } = require('./evaluation/selector.cjs');
const { AIEffectEvaluator } = require('./evaluation/ai-effect-evaluator.cjs');
const { FunctionQualityEvaluator } = require('./evaluation/function-quality-evaluator.cjs');
const { NotificationSender } = require('./core/notification-sender.cjs');

const fs = require('fs');
const path = require('path');

// ============================================================================
// AEO集成器
// ============================================================================

class AEOIntegration {
  constructor(config = {}) {
    this.config = {
      workspacePath: config.workspacePath || '/root/.openclaw/workspace',
      enableSandbox: config.enableSandbox !== false,  // 默认启用
      enableRemediation: config.enableRemediation !== false,
      enableDashboard: config.enableDashboard !== false,
      sandboxPoolSize: config.sandboxPoolSize || 3,
      ...config
    };

    this.sandboxPool = null;
    this.dashboardAPI = null;
    this.remediationLoop = null;
    this.notificationSender = null;
    this.selector = new TrackSelector();
    
    this.initialized = false;
    this.stats = {
      evaluationsRun: 0,
      sandboxTasks: 0,
      remediationsTriggered: 0
    };
  }

  /**
   * 初始化所有组件
   */
  async initialize() {
    console.log('[AEOIntegration] Initializing...');

    // 0. 初始化通知发送器（优先初始化以接收后续通知）
    this.notificationSender = new NotificationSender({
      enabled: true,
      minLevel: 'warning'
    });
    console.log('[AEOIntegration] Notification sender ready');

    // 1. 初始化沙盒容器池
    if (this.config.enableSandbox) {
      console.log('[AEOIntegration] Starting sandbox container pool...');
      
      // 检测 Docker 是否可用
      const dockerAvailable = await this._checkDockerAvailable();
      
      if (dockerAvailable) {
        console.log('[AEOIntegration] Using Docker container sandbox');
        this.sandboxPool = new ContainerPool({
          poolSize: this.config.sandboxPoolSize,
          containerTimeout: 60000,
          cpuLimit: '0.5',
          memoryLimit: '512m'
        });
      } else {
        console.log('[AEOIntegration] Docker not available, using process sandbox');
        this.sandboxPool = new ContainerPoolAdapter({
          poolSize: this.config.sandboxPoolSize,
          timeout: 60000
        });
      }

      // 监听内存告警并通知用户
      this.sandboxPool.on('memoryCritical', async (data) => {
        console.error('[AEOIntegration] Memory critical:', data.message);
        await this.notificationSender.sendMemoryAlert('critical', data);
      });

      this.sandboxPool.on('memoryWarning', async (data) => {
        console.warn('[AEOIntegration] Memory warning:', data.message);
        await this.notificationSender.sendMemoryAlert('warning', {
          percentage: data.percentage,
          containers: data.containers,
          targetContainers: data.targetContainers
        });
      });

      this.sandboxPool.on('userNotification', async (data) => {
        await this.notificationSender.sendMemoryAlert('critical', {
          percentage: 90,
          message: data.message
        });
      });

      await this.sandboxPool.initialize();
      console.log('[AEOIntegration] Sandbox pool ready');
    }

    // 2. 初始化仪表盘
    if (this.config.enableDashboard) {
      console.log('[AEOIntegration] Initializing dashboard...');
      this.dashboardAPI = new DashboardDataAPI({
        cacheTtl: 30000
      });
      console.log('[AEOIntegration] Dashboard ready');
    }

    // 3. 初始化自动整改闭环
    if (this.config.enableRemediation) {
      console.log('[AEOIntegration] Starting remediation loop...');
      this.remediationLoop = new AutoRemediationLoop({
        autoExecute: false,  // 需要人工审批
        requireApproval: true,
        maxConcurrent: 2
      });
      this.remediationLoop.start();
      this._setupRemediationListeners();
      console.log('[AEOIntegration] Remediation loop ready');
    }

    this.initialized = true;
    console.log('[AEOIntegration] All components initialized');

    return this;
  }

  /**
   * 执行完整评测流程
   */
  async evaluateSkill(skillInfo) {
    if (!this.initialized) {
      throw new Error('AEOIntegration not initialized');
    }
    
    console.log(`\n[AEOIntegration] Evaluating skill: ${skillInfo.name}`);
    
    const startTime = Date.now();
    
    // 1. 选择轨道
    const selection = this.selector.select(skillInfo);
    console.log(`[AEOIntegration] Selected track: ${selection.track}`);
    
    // 2. 根据轨道选择评测器
    let evaluator;
    let testCases;
    
    switch (selection.track) {
      case 'ai-effect':
        evaluator = new AIEffectEvaluator();
        testCases = this._loadAITestCases(skillInfo);
        break;
      case 'functional-quality':
        evaluator = new FunctionQualityEvaluator();
        testCases = this._loadFunctionalTestCases(skillInfo);
        break;
      default:
        evaluator = new AIEffectEvaluator();
        testCases = [];
    }
    
    // 3. 执行评测（沙盒中或本地）
    let evaluationResult;
    if (this.config.enableSandbox && selection.track === 'functional-quality') {
      // 功能质量评测使用沙盒
      evaluationResult = await this._evaluateInSandbox(skillInfo, testCases);
    } else {
      // AI效果评测直接执行
      evaluationResult = await evaluator.evaluate(skillInfo, testCases);
    }
    
    // 4. 保存评测结果
    await this._saveEvaluationResult(skillInfo, selection, evaluationResult);
    
    // 5. 检查是否需要自动整改
    if (this.config.enableRemediation && !evaluationResult.passed) {
      await this._triggerRemediation(skillInfo, evaluationResult);
    }
    
    // 6. 更新仪表盘缓存
    if (this.dashboardAPI) {
      this.dashboardAPI.clearCache();
    }
    
    this.stats.evaluationsRun++;
    
    return {
      skillName: skillInfo.name,
      track: selection.track,
      result: evaluationResult,
      duration: Date.now() - startTime,
      timestamp: Date.now()
    };
  }

  /**
   * 在沙盒中执行评测
   */
  async _evaluateInSandbox(skillInfo, testCases) {
    console.log(`[AEOIntegration] Running in sandbox: ${skillInfo.name}`);
    
    // 准备沙盒任务
    const task = {
      id: `eval-${skillInfo.name}-${Date.now()}`,
      type: 'test',
      testFiles: testCases.map(tc => tc.file),
      coverage: true
    };
    
    // 将任务写入共享目录
    const taskPath = path.join('/tmp/aeo-sandbox-tasks', `${task.id}.json`);
    fs.mkdirSync(path.dirname(taskPath), { recursive: true });
    fs.writeFileSync(taskPath, JSON.stringify(task, null, 2));
    
    // 在沙盒中执行
    const sandboxTask = {
      code: `
        const fs = require('fs');
        const task = JSON.parse(fs.readFileSync('/input/${task.id}.json', 'utf8'));
        
        // 复制任务文件到工作目录
        fs.copyFileSync('/input/${task.id}.json', '/workspace/task.json');
        
        // 执行沙盒运行时
        require('/workspace/sandbox-runtime.js')('/workspace/task.json');
        
        // 读取结果
        const result = JSON.parse(fs.readFileSync('/workspace/task-result.json', 'utf8'));
        console.log(JSON.stringify(result));
      `,
      input: { taskId: task.id }
    };
    
    const result = await this.sandboxPool.execute(sandboxTask);
    this.stats.sandboxTasks++;
    
    // 解析沙盒输出
    try {
      const sandboxResult = JSON.parse(result.stdout);
      return {
        passed: sandboxResult.status === 'success',
        score: this._calculateScoreFromTests(sandboxResult),
        details: sandboxResult,
        sandbox: true
      };
    } catch (e) {
      return {
        passed: false,
        error: 'Sandbox execution failed',
        output: result.stdout,
        stderr: result.stderr
      };
    }
  }

  /**
   * 触发自动整改
   */
  async _triggerRemediation(skillInfo, evaluationResult) {
    console.log(`[AEOIntegration] Triggering remediation for: ${skillInfo.name}`);
    
    // 构建问题描述
    const issue = {
      skillName: skillInfo.name,
      type: this._mapToIssueType(evaluationResult),
      severity: evaluationResult.score < 0.4 ? 'critical' : 
                evaluationResult.score < 0.6 ? 'high' : 'medium',
      score: evaluationResult.score,
      details: evaluationResult.details,
      timestamp: Date.now()
    };
    
    const remediation = await this.remediationLoop.submit(issue);
    this.stats.remediationsTriggered++;
    
    console.log(`[AEOIntegration] Remediation submitted: ${remediation.id}`);
    
    return remediation;
  }

  /**
   * 获取集成状态
   */
  getStatus() {
    const sandboxStatus = this.sandboxPool ? this.sandboxPool.getStatus() : null;
    
    return {
      initialized: this.initialized,
      components: {
        sandbox: sandboxStatus,
        dashboard: this.dashboardAPI ? 'ready' : 'disabled',
        remediation: this.remediationLoop ? this.remediationLoop.getStatus() : null,
        notifications: this.notificationSender ? this.notificationSender.getStats() : null
      },
      memory: sandboxStatus?.memory || null,
      recentAlerts: sandboxStatus?.recentAlerts || [],
      stats: { ...this.stats }
    };
  }

  /**
   * 获取仪表盘数据
   */
  async getDashboardData(view = 'overview') {
    if (!this.dashboardAPI) {
      throw new Error('Dashboard not enabled');
    }
    
    switch (view) {
      case 'realtime':
        return await this.dashboardAPI.getRealtimeMetrics();
      case 'health':
        return await this.dashboardAPI.getSystemHealth();
      case 'alerts':
        return await this.dashboardAPI.getAlerts();
      case 'rankings':
        return await this.dashboardAPI.getSkillRankings();
      default:
        return {
          realtime: await this.dashboardAPI.getRealtimeMetrics(),
          health: await this.dashboardAPI.getSystemHealth(),
          rankings: await this.dashboardAPI.getSkillRankings({ limit: 10 })
        };
    }
  }

  /**
   * 关闭所有组件
   */
  async shutdown() {
    console.log('[AEOIntegration] Shutting down...');
    
    if (this.sandboxPool) {
      await this.sandboxPool.shutdown();
    }
    
    if (this.remediationLoop) {
      this.remediationLoop.stop();
    }
    
    this.initialized = false;
    console.log('[AEOIntegration] Shutdown complete');
  }

  // ==========================================================================
  // 私有方法
  // ==========================================================================

  _loadAITestCases(skillInfo) {
    // 从统一评测用例集加载
    const testCasePath = path.join(
      __dirname, 
      '../unified-evaluation-sets/ai-effect-tests',
      `${skillInfo.name}-cases.json`
    );
    
    if (fs.existsSync(testCasePath)) {
      return JSON.parse(fs.readFileSync(testCasePath, 'utf8'));
    }
    
    // 返回默认用例
    return [
      { input: '测试输入1', expected: '期望输出1' },
      { input: '测试输入2', expected: '期望输出2' }
    ];
  }

  _loadFunctionalTestCases(skillInfo) {
    const testCasePath = path.join(
      __dirname,
      '../unified-evaluation-sets/function-tests',
      `${skillInfo.name}-cases.json`
    );
    
    if (fs.existsSync(testCasePath)) {
      return JSON.parse(fs.readFileSync(testCasePath, 'utf8'));
    }
    
    return [];
  }

  async _saveEvaluationResult(skillInfo, selection, result) {
    const resultsDir = path.join(__dirname, '../../data/evaluation-results');
    fs.mkdirSync(resultsDir, { recursive: true });
    
    const resultFile = path.join(
      resultsDir,
      `${skillInfo.name}-${Date.now()}.json`
    );
    
    const record = {
      skillName: skillInfo.name,
      skillType: skillInfo.type,
      track: selection.track,
      timestamp: Date.now(),
      overallScore: result.score || 0,
      passed: result.passed,
      dimensions: result.dimensions || {},
      details: result
    };
    
    fs.writeFileSync(resultFile, JSON.stringify(record, null, 2));
  }

  _mapToIssueType(evaluationResult) {
    if (evaluationResult.details?.coverage !== undefined) {
      return 'test_coverage';
    }
    if (evaluationResult.details?.lintErrors) {
      return 'code_quality';
    }
    if (evaluationResult.details?.performance) {
      return 'performance';
    }
    return 'general';
  }

  _calculateScoreFromTests(sandboxResult) {
    if (!sandboxResult.result || !sandboxResult.result.tests) {
      return 0;
    }
    
    const tests = sandboxResult.result.tests;
    if (tests.failures === 0) return 1.0;
    
    const total = tests.passes + tests.failures + tests.pending;
    return total > 0 ? tests.passes / total : 0;
  }

  _setupRemediationListeners() {
    this.remediationLoop.on('completed', async (r) => {
      console.log(`[AEOIntegration] Remediation completed: ${r.id}`);
      await this.notificationSender.sendRemediationCompleted(r);
    });

    this.remediationLoop.on('failed', async (r) => {
      console.log(`[AEOIntegration] Remediation failed: ${r.id}`);
      await this.notificationSender.sendRemediationCompleted(r);
    });

    this.remediationLoop.on('awaiting_approval', (r) => {
      console.log(`[AEOIntegration] Remediation awaiting approval: ${r.id}`);
      // 可以在这里发送审批请求通知
    });
  }
}

// ============================================================================
// 测试运行器
// ============================================================================

async function runIntegrationTest() {
  console.log('========================================');
  console.log('AEO Integration Test');
  console.log('========================================\n');
  
  const aeo = new AEOIntegration({
    enableSandbox: true,
    enableRemediation: true,
    enableDashboard: true,
    sandboxPoolSize: 2
  });
  
  try {
    // 1. 初始化
    await aeo.initialize();
    console.log('\n✅ Initialization complete\n');
    
    // 2. 测试技能评测（AI效果轨道）
    console.log('--- Test 1: AI Effect Evaluation ---');
    const aiSkill = {
      name: 'test-chat-bot',
      type: 'chat',
      description: 'AI对话机器人'
    };
    const aiResult = await aeo.evaluateSkill(aiSkill);
    console.log(`Result: ${aiResult.result.passed ? 'PASSED' : 'FAILED'}`);
    console.log(`Track: ${aiResult.track}`);
    console.log(`Duration: ${aiResult.duration}ms\n`);
    
    // 3. 测试技能评测（功能质量轨道 + 沙盒）
    console.log('--- Test 2: Functional Quality Evaluation (Sandbox) ---');
    const funcSkill = {
      name: 'test-tool',
      type: 'tool',
      description: '文件处理工具'
    };
    const funcResult = await aeo.evaluateSkill(funcSkill);
    console.log(`Result: ${funcResult.result.passed ? 'PASSED' : 'FAILED'}`);
    console.log(`Track: ${funcResult.track}`);
    console.log(`Sandbox: ${funcResult.result.sandbox ? 'YES' : 'NO'}`);
    console.log(`Duration: ${funcResult.duration}ms\n`);
    
    // 4. 获取仪表盘数据
    console.log('--- Test 3: Dashboard Data ---');
    const dashboard = await aeo.getDashboardData('overview');
    console.log(`Evaluations: ${dashboard.realtime.evaluations.total}`);
    console.log(`Health: ${dashboard.health.overall.status}`);
    console.log(`Top Skill: ${dashboard.rankings[0]?.name || 'N/A'}\n`);
    
    // 5. 获取集成状态
    console.log('--- Integration Status ---');
    const status = aeo.getStatus();
    console.log(`Stats:`, status.stats);
    console.log(`Sandbox: ${status.components.sandbox ? 'Running' : 'N/A'}`);
    console.log(`Remediation: ${status.components.remediation ? 'Running' : 'N/A'}`);
    
    console.log('\n========================================');
    console.log('All tests completed successfully!');
    console.log('========================================');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    await aeo.shutdown();
  }
}

// ============================================================================
// 导出和CLI
// ============================================================================

module.exports = {
  AEOIntegration,
  runIntegrationTest
};

// 直接运行测试
if (require.main === module) {
  runIntegrationTest();
}
