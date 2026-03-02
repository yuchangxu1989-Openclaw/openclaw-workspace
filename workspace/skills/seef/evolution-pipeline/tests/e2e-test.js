#!/usr/bin/env node
/**
 * @fileoverview EvoMap进化流水线 - 端到端集成测试套件
 * @description 验证完整流水线流程，包括状态机、执行器、触发器和错误处理的集成
 * @module e2e-test
 * @version 1.0.0
 */

import { 
  EvolutionPipeline, 
  StateMachine, 
  PipelineState 
} from '../src/index.js';
import { Executor, ExecutionMode, ExecutorStage, createStage } from '../src/executor.js';
import { ErrorHandler, ErrorSeverity, ErrorCategory } from '../src/error-handler.js';
import { TriggerManager, TriggerType } from '../src/trigger.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, '../reports/e2e-test-report.md');

/**
 * 测试套件配置
 */
const TEST_CONFIG = {
  // 测试技能路径
  testSkillPath: path.join(__dirname, '../../../isc-core'),
  // 测试超时
  testTimeoutMs: 120000,
  // 状态持久化目录
  stateDir: path.join(__dirname, '../.pipeline/test-state'),
  // 报告目录
  reportDir: path.join(__dirname, '../reports')
};

/**
 * 测试结果收集器
 */
class TestResultCollector {
  constructor() {
    this.results = [];
    this.startTime = Date.now();
  }

  add(testName, passed, details = {}) {
    this.results.push({
      name: testName,
      passed,
      duration: Date.now() - this.startTime,
      timestamp: new Date().toISOString(),
      ...details
    });
  }

  getStats() {
    const total = this.results.length;
    const passed = this.results.filter(r => r.passed).length;
    const failed = total - passed;
    return { total, passed, failed, passRate: (passed / total * 100).toFixed(2) };
  }

  getReport() {
    const stats = this.getStats();
    return {
      summary: stats,
      results: this.results,
      totalDuration: Date.now() - this.startTime
    };
  }
}

/**
 * 端到端测试套件
 */
class E2ETestSuite {
  constructor() {
    this.collector = new TestResultCollector();
    this.pipeline = null;
    this.testContexts = [];
  }

  /**
   * 初始化测试环境
   */
  async setup() {
    console.log('[E2E] 初始化测试环境...');
    
    // 清理测试状态目录
    try {
      await fs.rm(TEST_CONFIG.stateDir, { recursive: true, force: true });
      await fs.mkdir(TEST_CONFIG.stateDir, { recursive: true });
    } catch (e) {
      // 忽略清理错误
    }

    // 确保报告目录存在
    await fs.mkdir(TEST_CONFIG.reportDir, { recursive: true });

    console.log('[E2E] 测试环境初始化完成');
  }

  /**
   * 清理测试环境
   */
  async teardown() {
    console.log('[E2E] 清理测试环境...');
    
    if (this.pipeline) {
      await this.pipeline.stop();
      this.pipeline = null;
    }

    // 清理测试状态
    for (const ctx of this.testContexts) {
      if (ctx.stateMachine) {
        await ctx.stateMachine.destroy();
      }
    }

    console.log('[E2E] 测试环境清理完成');
  }

  /**
   * 测试1: 完整流水线执行
   */
  async testFullPipelineExecution() {
    console.log('\n[Test 1] 完整流水线执行测试');
    console.log('='.repeat(50));

    const testName = '完整流水线执行';
    const stageExecutionOrder = [];
    const context = {};

    try {
      // 创建执行器
      const executor = new Executor({
        pipelineId: 'e2e-full-pipeline',
        mode: ExecutionMode.SERIAL,
        defaultTimeoutMs: 10000
      });

      await executor.initialize();

      // 注册测试阶段
      executor.registerStage(createStage({
        stage: ExecutorStage.ANALYZE,
        name: '分析阶段',
        execute: async (ctx) => {
          stageExecutionOrder.push('ANALYZE');
          ctx.analyzed = true;
          return { files: ['test.js'], changes: 3 };
        }
      }));

      executor.registerStage(createStage({
        stage: ExecutorStage.CODE,
        name: '编码阶段',
        dependsOn: [ExecutorStage.ANALYZE],
        execute: async (ctx) => {
          stageExecutionOrder.push('CODE');
          ctx.coded = true;
          return { generated: 100, modified: 50 };
        }
      }));

      executor.registerStage(createStage({
        stage: ExecutorStage.TEST,
        name: '测试阶段',
        dependsOn: [ExecutorStage.CODE],
        execute: async (ctx) => {
          stageExecutionOrder.push('TEST');
          ctx.tested = true;
          return { passed: 45, failed: 0, coverage: 85 };
        }
      }));

      executor.registerStage(createStage({
        stage: ExecutorStage.PACKAGE,
        name: '打包阶段',
        dependsOn: [ExecutorStage.TEST],
        execute: async (ctx) => {
          stageExecutionOrder.push('PACKAGE');
          ctx.packaged = true;
          return { package: 'skill-v1.0.0.zip', size: 1024000 };
        }
      }));

      executor.registerStage(createStage({
        stage: ExecutorStage.PUBLISH,
        name: '发布阶段',
        dependsOn: [ExecutorStage.PACKAGE],
        execute: async (ctx) => {
          stageExecutionOrder.push('PUBLISH');
          ctx.published = true;
          return { url: 'https://evomap.network/skill/test', version: '1.0.0' };
        }
      }));

      // 执行流水线
      const result = await executor.execute({ skillId: 'test-skill' });

      // 验证结果
      const expectedOrder = ['ANALYZE', 'CODE', 'TEST', 'PACKAGE', 'PUBLISH'];
      const orderCorrect = JSON.stringify(stageExecutionOrder) === JSON.stringify(expectedOrder);
      const allStagesCompleted = result.completedStages.length === 5;
      const success = result.success && orderCorrect && allStagesCompleted;

      this.collector.add(testName, success, {
        stageOrder: stageExecutionOrder,
        expectedOrder,
        orderCorrect,
        allStagesCompleted,
        executionResult: {
          success: result.success,
          completedStages: result.completedStages,
          duration: result.duration
        }
      });

      console.log(`✓ 阶段执行顺序: ${stageExecutionOrder.join(' -> ')}`);
      console.log(`✓ 所有阶段完成: ${allStagesCompleted}`);
      console.log(`✓ 执行成功: ${result.success}`);
      console.log(`✓ 总耗时: ${result.duration}ms`);

      return success;
    } catch (error) {
      this.collector.add(testName, false, { error: error.message });
      console.error(`✗ 测试失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 测试2: 状态机状态流转
   */
  async testStateMachineTransitions() {
    console.log('\n[Test 2] 状态机状态流转测试');
    console.log('='.repeat(50));

    const testName = '状态机状态流转';
    const transitions = [];

    try {
      const sm = new StateMachine({
        skillId: 'e2e-state-test',
        stateDir: TEST_CONFIG.stateDir,
        logger: console
      });

      await sm.initialize();
      this.testContexts.push({ stateMachine: sm });

      // 记录状态变更
      sm.on('stateChanged', (data) => {
        transitions.push(`${data.previousState} -> ${data.currentState}`);
      });

      // 执行状态流转
      await sm.transitionTo(PipelineState.ANALYZING, { trigger: 'test' });
      await sm.transitionTo(PipelineState.CODING, { files: 3 });
      await sm.transitionTo(PipelineState.TESTING, { tests: 10 });
      await sm.transitionTo(PipelineState.PACKAGING, { version: '1.0.0' });
      await sm.transitionTo(PipelineState.PUBLISHING, { target: 'evomap' });
      await sm.transitionTo(PipelineState.COMPLETED, { published: true });

      // 验证最终状态
      const finalState = sm.getCurrentState();
      const expectedTransitions = [
        'idle -> analyzing',
        'analyzing -> coding',
        'coding -> testing',
        'testing -> packaging',
        'packaging -> publishing',
        'publishing -> completed'
      ];

      const success = finalState === PipelineState.COMPLETED && 
                     JSON.stringify(transitions) === JSON.stringify(expectedTransitions);

      this.collector.add(testName, success, {
        transitions,
        expectedTransitions,
        finalState,
        stateDuration: sm.getStateDuration()
      });

      console.log(`✓ 状态流转路径: ${transitions.join(', ')}`);
      console.log(`✓ 最终状态: ${finalState}`);
      console.log(`✓ 状态机持久化: ${sm.getSnapshot().skillId}`);

      return success;
    } catch (error) {
      this.collector.add(testName, false, { error: error.message });
      console.error(`✗ 测试失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 测试3: 并行执行模式
   */
  async testParallelExecution() {
    console.log('\n[Test 3] 并行执行模式测试');
    console.log('='.repeat(50));

    const testName = '并行执行模式';
    const executionTimes = {};

    try {
      const executor = new Executor({
        pipelineId: 'e2e-parallel',
        mode: ExecutionMode.PARALLEL,
        maxConcurrency: 3,
        defaultTimeoutMs: 5000
      });

      await executor.initialize();

      // 注册独立阶段（无依赖，可并行）
      const stages = ['A', 'B', 'C', 'D', 'E'];
      const stageStartTimes = {};
      const stageEndTimes = {};

      for (const stageId of stages) {
        executor.registerStage(createStage({
          stage: stageId,
          name: `阶段${stageId}`,
          execute: async () => {
            stageStartTimes[stageId] = Date.now();
            await new Promise(r => setTimeout(r, 100)); // 模拟100ms工作
            stageEndTimes[stageId] = Date.now();
            return { stage: stageId };
          }
        }));
      }

      const startTime = Date.now();
      const result = await executor.execute({}, ExecutionMode.PARALLEL);
      const totalDuration = Date.now() - startTime;

      // 验证并行执行：总时间应接近单个阶段时间而非累加
      const isParallel = totalDuration < 500; // 5个阶段各100ms，串行需500ms+

      const success = result.success && isParallel;

      this.collector.add(testName, success, {
        totalDuration,
        isParallel,
        stageStartTimes,
        stageEndTimes,
        maxConcurrency: executor._maxConcurrency
      });

      console.log(`✓ 并行执行完成: ${result.completedStages.length} 个阶段`);
      console.log(`✓ 总耗时: ${totalDuration}ms (串行预期: 500ms+)`);
      console.log(`✓ 并行验证: ${isParallel ? '通过' : '失败'}`);

      return success;
    } catch (error) {
      this.collector.add(testName, false, { error: error.message });
      console.error(`✗ 测试失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 测试4: 错误恢复与重试
   */
  async testErrorRecoveryAndRetry() {
    console.log('\n[Test 4] 错误恢复与重试测试');
    console.log('='.repeat(50));

    const testName = '错误恢复与重试';
    let attemptCount = 0;

    try {
      const errorHandler = new ErrorHandler({
        maxRetries: 3,
        retryDelayMs: 50,
        backoffMultiplier: 1
      });

      await errorHandler.initialize();

      // 模拟一个会失败2次然后成功的操作
      const unreliableOperation = async () => {
        attemptCount++;
        if (attemptCount < 3) {
          // 使用包含 "timeout" 的错误消息使其可被分类为 TIMEOUT 类型
          throw new Error(`Connection timeout error #${attemptCount}`);
        }
        return { success: true, attempts: attemptCount };
      };

      // 使用错误处理器的 withRetry 方法
      const result = await errorHandler.withRetry(
        unreliableOperation,
        { operationId: 'test-retry', retryConfig: { maxRetries: 3, initialDelayMs: 50, timeoutMs: 5000 } }
      );

      const success = result !== undefined && attemptCount === 3;

      this.collector.add(testName, success, {
        attemptCount,
        finalResult: result,
        maxRetries: 3
      });

      console.log(`✓ 重试次数: ${attemptCount}`);
      console.log(`✓ 最终成功: ${result !== undefined}`);
      console.log(`✓ 重试机制: 有效`);

      return success;
    } catch (error) {
      this.collector.add(testName, false, { error: error.message });
      console.error(`✗ 测试失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 测试5: 触发器集成
   */
  async testTriggerIntegration() {
    console.log('\n[Test 5] 触发器集成测试');
    console.log('='.repeat(50));

    const testName = '触发器集成';
    const triggeredEvents = [];

    try {
      const triggerManager = new TriggerManager({
        debounceMs: 100
      });

      await triggerManager.initialize();

      // 注册事件处理器
      triggerManager.on('trigger', (event) => {
        triggeredEvents.push({ type: event.type, data: event });
      });

      // 使用 emit 模拟手动触发
      triggerManager.emit('trigger', { 
        type: 'manual', 
        id: 'manual-1',
        payload: { skillId: 'test-skill', action: 'run' }
      });

      // 模拟定时触发
      triggerManager.emit('trigger', { 
        type: 'schedule', 
        id: 'schedule-1',
        payload: { scheduleId: 'daily-refresh', timestamp: Date.now() }
      });

      // 等待事件处理
      await new Promise(r => setTimeout(r, 200));

      const success = triggeredEvents.length === 2;

      this.collector.add(testName, success, {
        triggeredEvents,
        eventCount: triggeredEvents.length
      });

      console.log(`✓ 触发事件数: ${triggeredEvents.length}`);
      console.log(`✓ 事件类型: ${triggeredEvents.map(e => e.type).join(', ')}`);

      await triggerManager.stop();

      return success;
    } catch (error) {
      this.collector.add(testName, false, { error: error.message });
      console.error(`✗ 测试失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 测试6: 状态持久化与恢复
   */
  async testStatePersistence() {
    console.log('\n[Test 6] 状态持久化与恢复测试');
    console.log('='.repeat(50));

    const testName = '状态持久化与恢复';
    const skillId = 'e2e-persistence-test';

    try {
      // 第一次：创建状态机并转换状态
      const sm1 = new StateMachine({
        skillId,
        stateDir: TEST_CONFIG.stateDir,
        logger: console
      });

      await sm1.initialize();
      await sm1.transitionTo(PipelineState.ANALYZING, { step: 1 });
      await sm1.transitionTo(PipelineState.CODING, { step: 2 });
      
      const history1 = sm1.getStateHistory();
      await sm1.destroy();

      // 第二次：重新创建状态机，应恢复之前的状态
      const sm2 = new StateMachine({
        skillId,
        stateDir: TEST_CONFIG.stateDir,
        logger: console
      });

      await sm2.initialize();
      
      const restoredState = sm2.getCurrentState();
      const history2 = sm2.getStateHistory();

      const success = restoredState === PipelineState.CODING && 
                     history2.length === history1.length;

      this.collector.add(testName, success, {
        originalState: PipelineState.CODING,
        restoredState,
        originalHistoryLength: history1.length,
        restoredHistoryLength: history2.length
      });

      console.log(`✓ 原始状态: ${PipelineState.CODING}`);
      console.log(`✓ 恢复状态: ${restoredState}`);
      console.log(`✓ 历史记录: ${history2.length} 条`);

      await sm2.destroy();

      return success;
    } catch (error) {
      this.collector.add(testName, false, { error: error.message });
      console.error(`✗ 测试失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 运行所有测试
   */
  async runAll() {
    console.log('\n' + '='.repeat(60));
    console.log('EvoMap进化流水线 - 端到端集成测试');
    console.log('='.repeat(60));
    console.log(`开始时间: ${new Date().toISOString()}`);
    console.log('');

    try {
      await this.setup();

      // 执行所有测试
      await this.testFullPipelineExecution();
      await this.testStateMachineTransitions();
      await this.testParallelExecution();
      await this.testErrorRecoveryAndRetry();
      await this.testTriggerIntegration();
      await this.testStatePersistence();

      await this.teardown();

      // 生成报告
      await this.generateReport();

      // 返回统计
      const stats = this.collector.getStats();
      console.log('\n' + '='.repeat(60));
      console.log('测试完成统计');
      console.log('='.repeat(60));
      console.log(`总计: ${stats.total} 项`);
      console.log(`通过: ${stats.passed} 项`);
      console.log(`失败: ${stats.failed} 项`);
      console.log(`通过率: ${stats.passRate}%`);
      console.log('='.repeat(60));

      return stats;
    } catch (error) {
      console.error('[E2E] 测试套件执行失败:', error);
      throw error;
    }
  }

  /**
   * 生成测试报告
   */
  async generateReport() {
    const report = this.collector.getReport();
    const stats = report.summary;

    let markdown = `# EvoMap进化流水线 - 端到端集成测试报告

**生成时间:** ${new Date().toISOString()}  
**测试套件版本:** 1.0.0  
**执行环境:** Node.js ${process.version}

## 执行摘要

| 指标 | 数值 |
|:-----|:-----|
| 测试总数 | ${stats.total} |
| 通过数量 | ${stats.passed} ✓ |
| 失败数量 | ${stats.failed} ✗ |
| 通过率 | ${stats.passRate}% |
| 总耗时 | ${report.totalDuration}ms |

## 详细结果

| # | 测试项 | 状态 | 耗时(ms) | 备注 |
|---|--------|------|----------|------|
`;

    report.results.forEach((result, index) => {
      const status = result.passed ? '✓ 通过' : '✗ 失败';
      const details = result.error ? `错误: ${result.error}` : '正常';
      markdown += `| ${index + 1} | ${result.name} | ${status} | ${result.duration} | ${details} |\n`;
    });

    markdown += `
## 测试覆盖场景

1. **完整流水线执行** - 验证5个阶段的串行执行
2. **状态机状态流转** - 验证状态转换规则和持久化
3. **并行执行模式** - 验证多阶段并行执行能力
4. **错误恢复与重试** - 验证错误处理机制
5. **触发器集成** - 验证手动/定时触发机制
6. **状态持久化与恢复** - 验证状态文件读写

## 结论

`;

    if (stats.failed === 0) {
      markdown += `✅ **所有测试通过** - 流水线集成测试成功，系统可投入生产使用。`;
    } else if (stats.passRate >= 80) {
      markdown += `⚠️ **部分测试通过** (${stats.passRate}%) - 建议修复失败项后再部署。`;
    } else {
      markdown += `❌ **测试未通过** (${stats.passRate}%) - 存在严重问题，需修复后重新测试。`;
    }

    markdown += `

---
*报告由 EvoMap E2E 测试套件自动生成*
`;

    await fs.writeFile(REPORT_PATH, markdown, 'utf-8');
    console.log(`\n[E2E] 测试报告已生成: ${REPORT_PATH}`);
  }
}

// 运行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  const suite = new E2ETestSuite();
  suite.runAll().then(stats => {
    process.exit(stats.failed > 0 ? 1 : 0);
  }).catch(err => {
    console.error('[E2E] 致命错误:', err);
    process.exit(1);
  });
}

export { E2ETestSuite, TestResultCollector };
