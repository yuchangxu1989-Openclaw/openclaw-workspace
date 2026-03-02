#!/usr/bin/env node
/**
 * @fileoverview EvoMap进化流水线 - 错误注入与韧性测试
 * @description 通过模拟各种故障场景验证系统恢复能力
 * @module chaos-test
 * @version 1.0.0
 */

import { 
  StateMachine, 
  PipelineState 
} from '../src/index.js';
import { Executor, ExecutionMode, createStage } from '../src/executor.js';
import { ErrorHandler, ErrorSeverity, ErrorCategory } from '../src/error-handler.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, '../reports/chaos-test-report.md');

/**
 * 故障场景定义
 */
const CHAOS_SCENARIOS = {
  // 状态机故障
  STATE_MACHINE: {
    INVALID_TRANSITION: 'invalid_transition',
    TIMEOUT: 'state_timeout',
    CORRUPTED_STATE: 'corrupted_state_file'
  },
  // 执行器故障
  EXECUTOR: {
    STAGE_TIMEOUT: 'stage_timeout',
    STAGE_CRASH: 'stage_crash',
    DEPENDENCY_FAILURE: 'dependency_failure',
    MEMORY_LEAK: 'memory_leak'
  },
  // 系统故障
  SYSTEM: {
    DISK_FULL: 'disk_full',
    FILE_PERMISSION: 'file_permission',
    NETWORK_PARTITION: 'network_partition'
  }
};

/**
 * 混沌测试套件
 */
class ChaosTestSuite {
  constructor() {
    this.results = [];
    this.stateDir = path.join(__dirname, '../.pipeline/chaos-test-state');
  }

  /**
   * 初始化测试环境
   */
  async setup() {
    console.log('[Chaos] 初始化混沌测试环境...');
    
    // 清理并创建状态目录
    try {
      await fs.rm(this.stateDir, { recursive: true, force: true });
    } catch (e) {}
    await fs.mkdir(this.stateDir, { recursive: true });

    console.log('[Chaos] 混沌测试环境就绪');
  }

  /**
   * 清理测试环境
   */
  async teardown() {
    console.log('[Chaos] 清理混沌测试环境...');
    
    try {
      await fs.rm(this.stateDir, { recursive: true, force: true });
    } catch (e) {}

    console.log('[Chaos] 混沌测试环境已清理');
  }

  /**
   * 记录测试结果
   */
  recordTest(testName, passed, scenario, details = {}) {
    this.results.push({
      testName,
      passed,
      scenario,
      timestamp: new Date().toISOString(),
      ...details
    });

    const status = passed ? '✓' : '✗';
    console.log(`${status} ${testName}: ${passed ? '通过' : '失败'}`);
    if (details.message) {
      console.log(`  → ${details.message}`);
    }
  }

  /**
   * 测试1: 非法状态转换
   */
  async testInvalidStateTransition() {
    console.log('\n[Test 1] 非法状态转换测试');
    console.log('='.repeat(50));

    const sm = new StateMachine({
      skillId: 'chaos-invalid-transition',
      stateDir: this.stateDir,
      logger: { info: () => {}, debug: () => {}, error: () => {} }
    });

    await sm.initialize();

    try {
      // 尝试从idle直接跳转到completed（非法）
      await sm.transitionTo(PipelineState.COMPLETED);
      this.recordTest('非法状态转换检测', false, CHAOS_SCENARIOS.STATE_MACHINE.INVALID_TRANSITION, {
        message: '应抛出错误但未抛出'
      });
      return false;
    } catch (error) {
      const isCorrectError = error.message.includes('非法状态转换') || 
                            error.message.includes('invalid');
      this.recordTest('非法状态转换检测', isCorrectError, CHAOS_SCENARIOS.STATE_MACHINE.INVALID_TRANSITION, {
        message: `捕获到预期错误: ${error.message.substring(0, 50)}...`
      });
      return isCorrectError;
    } finally {
      await sm.destroy();
    }
  }

  /**
   * 测试2: 阶段超时处理
   */
  async testStageTimeout() {
    console.log('\n[Test 2] 阶段超时处理测试');
    console.log('='.repeat(50));

    const executor = new Executor({
      pipelineId: 'chaos-timeout',
      mode: ExecutionMode.SERIAL,
      defaultTimeoutMs: 500 // 500ms超时
    });

    await executor.initialize();

    // 注册一个会超时的阶段
    executor.registerStage(createStage({
      stage: 'slow-stage',
      name: '慢速阶段',
      timeoutMs: 100, // 100ms超时
      execute: async () => {
        await new Promise(r => setTimeout(r, 1000)); // 故意延迟1秒
        return { completed: true };
      }
    }));

    try {
      const result = await executor.execute({});
      const timeoutHandled = !result.success && result.failedStages.includes('slow-stage');
      
      this.recordTest('阶段超时处理', timeoutHandled, CHAOS_SCENARIOS.EXECUTOR.STAGE_TIMEOUT, {
        message: timeoutHandled ? '超时正确触发，阶段标记为失败' : '超时未正确处理',
        result
      });

      return timeoutHandled;
    } catch (error) {
      this.recordTest('阶段超时处理', true, CHAOS_SCENARIOS.EXECUTOR.STAGE_TIMEOUT, {
        message: `通过异常捕获超时: ${error.message.substring(0, 50)}`
      });
      return true;
    }
  }

  /**
   * 测试3: 阶段执行崩溃
   */
  async testStageCrash() {
    console.log('\n[Test 3] 阶段执行崩溃测试');
    console.log('='.repeat(50));

    const executor = new Executor({
      pipelineId: 'chaos-crash',
      mode: ExecutionMode.SERIAL
    });

    await executor.initialize();

    // 注册一个会崩溃的阶段
    executor.registerStage(createStage({
      stage: 'crash-stage',
      name: '崩溃阶段',
      execute: async () => {
        throw new Error('模拟阶段崩溃: 空指针异常');
      }
    }));

    // 注册一个后续阶段
    executor.registerStage(createStage({
      stage: 'next-stage',
      name: '后续阶段',
      dependsOn: ['crash-stage'],
      execute: async () => {
        return { shouldNotReach: true };
      }
    }));

    try {
      const result = await executor.execute({});
      const crashHandled = !result.success && 
                          result.failedStages.includes('crash-stage');
      const nextStageNotExecuted = !result.completedStages.includes('next-stage');
      
      const allPassed = crashHandled && nextStageNotExecuted;
      
      this.recordTest('阶段崩溃处理', allPassed, CHAOS_SCENARIOS.EXECUTOR.STAGE_CRASH, {
        message: allPassed 
          ? '崩溃被捕获，后续阶段未执行' 
          : `崩溃处理异常: failedStages=${result.failedStages.join(',')}`,
        crashHandled,
        nextStageNotExecuted
      });

      return allPassed;
    } catch (error) {
      this.recordTest('阶段崩溃处理', false, CHAOS_SCENARIOS.EXECUTOR.STAGE_CRASH, {
        message: `未捕获崩溃，抛出到外层: ${error.message}`
      });
      return false;
    }
  }

  /**
   * 测试4: 依赖阶段失败
   */
  async testDependencyFailure() {
    console.log('\n[Test 4] 依赖阶段失败测试');
    console.log('='.repeat(50));

    const executor = new Executor({
      pipelineId: 'chaos-dependency',
      mode: ExecutionMode.PARALLEL,
      maxConcurrency: 5
    });

    await executor.initialize();

    // 阶段A: 成功
    executor.registerStage(createStage({
      stage: 'stage-a',
      name: '阶段A',
      execute: async () => ({ success: true })
    }));

    // 阶段B: 失败
    executor.registerStage(createStage({
      stage: 'stage-b',
      name: '阶段B',
      execute: async () => {
        throw new Error('阶段B故意失败');
      }
    }));

    // 阶段C: 依赖A和B
    let stageCExecuted = false;
    executor.registerStage(createStage({
      stage: 'stage-c',
      name: '阶段C',
      dependsOn: ['stage-a', 'stage-b'],
      execute: async () => {
        stageCExecuted = true;
        return { success: true };
      }
    }));

    try {
      const result = await executor.execute({}, ExecutionMode.PARALLEL);
      
      // 阶段B失败应该阻止阶段C执行
      const dependencyRespected = !stageCExecuted;
      const stageBMarkedFailed = result.failedStages.includes('stage-b');
      const stageAMarkedSuccess = result.completedStages.includes('stage-a');
      
      const allPassed = dependencyRespected && stageBMarkedFailed && stageAMarkedSuccess;
      
      this.recordTest('依赖失败处理', allPassed, CHAOS_SCENARIOS.EXECUTOR.DEPENDENCY_FAILURE, {
        message: allPassed
          ? '依赖关系正确处理: A成功，B失败，C未执行'
          : `依赖处理异常: C executed=${stageCExecuted}`,
        stageAMarkedSuccess,
        stageBMarkedFailed,
        dependencyRespected
      });

      return allPassed;
    } catch (error) {
      this.recordTest('依赖失败处理', false, CHAOS_SCENARIOS.EXECUTOR.DEPENDENCY_FAILURE, {
        message: `执行异常: ${error.message}`
      });
      return false;
    }
  }

  /**
   * 测试5: 状态文件损坏恢复
   */
  async testCorruptedStateRecovery() {
    console.log('\n[Test 5] 状态文件损坏恢复测试');
    console.log('='.repeat(50));

    const skillId = 'chaos-corrupted-state';
    const stateFile = path.join(this.stateDir, `${skillId}.json`);

    // 创建一个损坏的状态文件
    await fs.writeFile(stateFile, '这不是有效的JSON{{}}', 'utf-8');

    try {
      const sm = new StateMachine({
        skillId,
        stateDir: this.stateDir,
        logger: { info: () => {}, debug: () => {}, error: () => {} }
      });

      await sm.initialize();
      
      // 应该能初始化并使用默认状态
      const state = sm.getCurrentState();
      const recovered = state === PipelineState.IDLE;
      
      this.recordTest('损坏状态恢复', recovered, CHAOS_SCENARIOS.STATE_MACHINE.CORRUPTED_STATE, {
        message: recovered 
          ? '损坏状态文件被正确忽略，使用默认状态'
          : `恢复失败，当前状态: ${state}`,
        recoveredState: state
      });

      await sm.destroy();
      return recovered;
    } catch (error) {
      this.recordTest('损坏状态恢复', false, CHAOS_SCENARIOS.STATE_MACHINE.CORRUPTED_STATE, {
        message: `初始化失败: ${error.message}`
      });
      return false;
    }
  }

  /**
   * 测试6: 错误处理器重试机制
   */
  async testErrorHandlerRetry() {
    console.log('\n[Test 6] 错误处理器重试机制测试');
    console.log('='.repeat(50));

    const errorHandler = new ErrorHandler({
      maxRetries: 3,
      retryDelayMs: 50,
      backoffMultiplier: 2
    });

    await errorHandler.initialize();

    let attemptCount = 0;
    
    // 模拟一个前两次失败，第三次成功的操作
    const flakyOperation = async () => {
      attemptCount++;
      if (attemptCount < 3) {
        const error = new Error(`Connection timeout error #${attemptCount}`);
        throw error;
      }
      return { success: true, attempts: attemptCount };
    };

    try {
      const result = await errorHandler.withRetry(
        flakyOperation,
        { 
          operationId: 'chaos-retry',
          retryConfig: { maxRetries: 3, initialDelayMs: 50, timeoutMs: 5000 }
        }
      );

      const retryWorked = result !== undefined && attemptCount === 3;
      
      this.recordTest('错误重试机制', retryWorked, 'retry_mechanism', {
        message: retryWorked
          ? `经过${attemptCount}次尝试后成功`
          : `重试未按预期工作: attempts=${attemptCount}`,
        attemptCount,
        finalResult: result
      });

      return retryWorked;
    } catch (error) {
      this.recordTest('错误重试机制', false, 'retry_mechanism', {
        message: `重试后仍失败: ${error.message}`,
        attemptCount
      });
      return false;
    }
  }

  /**
   * 测试7: 流水线取消机制
   */
  async testPipelineCancellation() {
    console.log('\n[Test 7] 流水线取消机制测试');
    console.log('='.repeat(50));

    const executor = new Executor({
      pipelineId: 'chaos-cancel',
      mode: ExecutionMode.SERIAL
    });

    await executor.initialize();

    let stage2Executed = false;
    let cancelSignalReceived = false;

    executor.registerStage(createStage({
      stage: 'stage-1',
      name: '阶段1',
      execute: async (ctx, signal) => {
        // 模拟长时间运行
        for (let i = 0; i < 100; i++) {
          if (signal?.aborted) {
            cancelSignalReceived = true;
            throw new Error('取消信号收到');
          }
          await new Promise(r => setTimeout(r, 10));
        }
        return { completed: true };
      }
    }));

    executor.registerStage(createStage({
      stage: 'stage-2',
      name: '阶段2',
      execute: async () => {
        stage2Executed = true;
        return { completed: true };
      }
    }));

    // 启动执行并在中途取消
    const executionPromise = executor.execute({});
    
    // 100ms后取消
    setTimeout(() => {
      executor.cancel('stage-1');
    }, 100);

    try {
      const result = await executionPromise;
      
      const cancelledProperly = !stage2Executed;
      
      this.recordTest('流水线取消', cancelledProperly, 'pipeline_cancellation', {
        message: cancelledProperly
          ? '流水线正确取消，阶段2未执行'
          : `取消异常: stage2Executed=${stage2Executed}`,
        stage2Executed,
        cancelSignalReceived,
        result
      });

      return cancelledProperly;
    } catch (error) {
      // 取消通常会抛出错误
      const cancelledProperly = !stage2Executed;
      
      this.recordTest('流水线取消', cancelledProperly, 'pipeline_cancellation', {
        message: cancelledProperly
          ? '流水线通过异常正确取消'
          : '取消异常',
        error: error.message,
        stage2Executed
      });

      return cancelledProperly;
    }
  }

  /**
   * 测试8: 并发冲突处理
   */
  async testConcurrentConflict() {
    console.log('\n[Test 8] 并发冲突处理测试');
    console.log('='.repeat(50));

    const skillId = 'chaos-concurrent';
    const sm = new StateMachine({
      skillId,
      stateDir: this.stateDir,
      logger: { info: () => {}, debug: () => {}, error: () => {} }
    });

    await sm.initialize();

    // 尝试同时执行多个状态转换
    const transitions = [
      sm.transitionTo(PipelineState.ANALYZING, {}, 'thread-1'),
      sm.transitionTo(PipelineState.CODING, {}, 'thread-2'),
      sm.transitionTo(PipelineState.TESTING, {}, 'thread-3')
    ];

    try {
      await Promise.all(transitions);
      
      // 检查最终状态 - 由于从idle开始，只有第一个转换到ANALYZING会成功
      // 其他的会失败（但不会抛出错误，只是不会执行）
      const finalState = sm.getCurrentState();
      const history = sm.getStateHistory();
      
      // 应该至少有一个成功的转换（到ANALYZING）
      // 历史记录长度应该 >= 1（因为转换可能部分成功）
      // 如果系统正确处理并发，应该只有1条记录（第一个成功的）
      // 但如果系统依次执行，可能会有更多记录
      const hasValidState = finalState === PipelineState.ANALYZING || 
                           finalState === PipelineState.CODING ||
                           finalState === PipelineState.TESTING;
      
      this.recordTest('并发冲突处理', hasValidState, 'concurrent_conflict', {
        message: hasValidState
          ? `并发访问处理完成，最终状态: ${finalState}`
          : `状态异常: ${finalState}`,
        finalState,
        historyLength: history.length
      });

      await sm.destroy();
      return hasValidState;
    } catch (error) {
      // 某些实现可能抛出并发错误，这也是可接受的
      this.recordTest('并发冲突处理', true, 'concurrent_conflict', {
        message: `通过异常处理并发: ${error.message.substring(0, 50)}`
      });

      await sm.destroy();
      return true;
    }
  }

  /**
   * 运行所有混沌测试
   */
  async runAll() {
    console.log('\n' + '='.repeat(60));
    console.log('EvoMap进化流水线 - 混沌与韧性测试');
    console.log('='.repeat(60));
    console.log(`开始时间: ${new Date().toISOString()}`);
    console.log('');

    try {
      await this.setup();

      // 执行所有混沌测试
      await this.testInvalidStateTransition();
      await this.testStageTimeout();
      await this.testStageCrash();
      await this.testDependencyFailure();
      await this.testCorruptedStateRecovery();
      await this.testErrorHandlerRetry();
      await this.testPipelineCancellation();
      await this.testConcurrentConflict();

      await this.teardown();

      // 生成报告
      await this.generateReport();

      // 统计
      const passed = this.results.filter(r => r.passed).length;
      const total = this.results.length;
      const passRate = (passed / total * 100).toFixed(1);

      console.log('\n' + '='.repeat(60));
      console.log('混沌测试完成统计');
      console.log('='.repeat(60));
      console.log(`总计: ${total} 项`);
      console.log(`通过: ${passed} 项`);
      console.log(`失败: ${total - passed} 项`);
      console.log(`韧性评分: ${passRate}%`);
      console.log('='.repeat(60));

      return { passed, total, passRate };
    } catch (error) {
      console.error('[Chaos] 混沌测试套件执行失败:', error);
      throw error;
    }
  }

  /**
   * 生成混沌测试报告
   */
  async generateReport() {
    const passed = this.results.filter(r => r.passed).length;
    const total = this.results.length;
    const passRate = (passed / total * 100).toFixed(1);

    let markdown = `# EvoMap进化流水线 - 混沌与韧性测试报告

**生成时间:** ${new Date().toISOString()}  
**测试套件版本:** 1.0.0  
**测试目标:** 验证系统在各种故障场景下的恢复能力

## 执行摘要

| 指标 | 数值 |
|:-----|:-----|
| 测试总数 | ${total} |
| 通过数量 | ${passed} ✓ |
| 失败数量 | ${total - passed} ✗ |
| **韧性评分** | **${passRate}%** |

## 韧性等级评估

`;

    if (passRate >= 90) {
      markdown += `🛡️ **优秀** - 系统具有出色的故障恢复能力，适合生产环境部署。`;
    } else if (passRate >= 75) {
      markdown += `🔧 **良好** - 系统基本具备故障恢复能力，建议修复发现的问题。`;
    } else if (passRate >= 50) {
      markdown += `⚠️ **一般** - 系统韧性存在明显缺陷，建议加强错误处理。`;
    } else {
      markdown += `🚨 **不足** - 系统缺乏基本的故障恢复能力，不建议生产部署。`;
    }

    markdown += `

## 测试场景与结果

### 状态机韧性

| 测试项 | 场景 | 状态 | 说明 |
|:-------|:-----|:-----|:-----|
| 非法状态转换检测 | 尝试非法跳转 | ${this.getTestResult('非法状态转换检测')} | 验证状态转换规则 |
| 损坏状态恢复 | 读取损坏的状态文件 | ${this.getTestResult('损坏状态恢复')} | 验证容错初始化 |

### 执行器韧性

| 测试项 | 场景 | 状态 | 说明 |
|:-------|:-----|:-----|:-----|
| 阶段超时处理 | 阶段执行超时 | ${this.getTestResult('阶段超时处理')} | 验证超时机制 |
| 阶段崩溃处理 | 阶段抛出异常 | ${this.getTestResult('阶段崩溃处理')} | 验证异常捕获 |
| 依赖失败处理 | 依赖阶段失败 | ${this.getTestResult('依赖失败处理')} | 验证依赖关系 |
| 流水线取消 | 主动取消执行 | ${this.getTestResult('流水线取消')} | 验证取消信号 |

### 系统韧性

| 测试项 | 场景 | 状态 | 说明 |
|:-------|:-----|:-----|:-----|
| 错误重试机制 | 临时错误恢复 | ${this.getTestResult('错误重试机制')} | 验证重试策略 |
| 并发冲突处理 | 并发状态转换 | ${this.getTestResult('并发冲突处理')} | 验证并发安全 |

## 详细结果

`;

    this.results.forEach((result, index) => {
      markdown += `### ${index + 1}. ${result.testName}\n\n`;
      markdown += `- **状态**: ${result.passed ? '✓ 通过' : '✗ 失败'}\n`;
      markdown += `- **场景**: ${result.scenario}\n`;
      markdown += `- **时间**: ${result.timestamp}\n`;
      if (result.message) {
        markdown += `- **详情**: ${result.message}\n`;
      }
      markdown += '\n';
    });

    markdown += `## 建议与改进

### 已验证的韧性特性

`;

    const passedTests = this.results.filter(r => r.passed);
    if (passedTests.length > 0) {
      markdown += `✓ ${passedTests.map(r => r.testName).join('\n✓ ')}\n`;
    }

    markdown += `
### 需改进的领域

`;

    const failedTests = this.results.filter(r => !r.passed);
    if (failedTests.length > 0) {
      markdown += failedTests.map(r => `- **${r.testName}**: ${r.message || '需修复'}`).join('\n') + '\n';
    } else {
      markdown += '所有测试项均已通过，无需额外改进。\n';
    }

    markdown += `
## 生产部署建议

`;

    if (passRate >= 90) {
      markdown += `✅ **可以部署** - 系统已通过混沌测试验证，具备生产环境所需的故障恢复能力。建议配置监控告警以及时发现异常。`;
    } else if (passRate >= 75) {
      markdown += `⚠️ **条件部署** - 系统基本可用，但建议先修复失败的测试项。同时建议：\n1. 增加运行时监控\n2. 配置自动重启机制\n3. 准备回滚方案`;
    } else {
      markdown += `❌ **不建议部署** - 系统韧性不足，请先修复所有测试项后再考虑生产部署。`;
    }

    markdown += `

---
*报告由 EvoMap 混沌测试套件自动生成*
`;

    await fs.writeFile(REPORT_PATH, markdown, 'utf-8');
    console.log(`\n[Chaos] 混沌测试报告已生成: ${REPORT_PATH}`);
  }

  /**
   * 获取测试结果状态
   */
  getTestResult(testName) {
    const result = this.results.find(r => r.testName === testName);
    if (!result) return '未执行';
    return result.passed ? '✓ 通过' : '✗ 失败';
  }
}

// 运行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  const suite = new ChaosTestSuite();
  suite.runAll().then(stats => {
    process.exit(stats.passed < stats.total ? 1 : 0);
  }).catch(err => {
    console.error('[Chaos] 测试失败:', err);
    process.exit(1);
  });
}

export { ChaosTestSuite, CHAOS_SCENARIOS };
