/**
 * @fileoverview 集成测试套件 - EvoMap进化流水线
 * @description 测试PipelineEngine、StateManager、StateMachine、Executor、ErrorHandler等核心模块
 * @module integration-tests
 * @version 1.0.0
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// 导入被测模块
import { StateManager, PIPELINE_STATES, STATE_TRANSITIONS } from '../src/state-manager.js';
import { 
  StateMachine, 
  PipelineState, 
  VALID_TRANSITIONS,
  STATE_METADATA 
} from '../src/state-machine.js';
import { 
  Executor, 
  ExecutionMode, 
  ExecutorStage,
  ExecutionTimeoutError,
  ExecutionCancelledError,
  createExecutor,
  createStage,
  BuiltinStages
} from '../src/executor.js';
import { 
  ErrorHandler, 
  ErrorSeverity,
  ErrorCategory,
  RetryExhaustedError,
  DEFAULT_RETRY_CONFIG,
  createErrorHandler,
  createProductionErrorHandler,
  createDevelopmentErrorHandler
} from '../src/error-handler.js';
import { PipelineEngine } from '../src/engine.js';
import { EvolutionPipeline } from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 测试配置
const TEST_CONFIG = {
  statePath: path.join(__dirname, '.test-state'),
  errorLogDir: path.join(__dirname, '.test-errors'),
  testSkillPath: path.join(__dirname, 'fixtures', 'test-skill')
};

/**
 * 测试工具类
 */
class TestUtils {
  static async cleanup() {
    try {
      await fs.rm(TEST_CONFIG.statePath, { recursive: true, force: true });
      await fs.rm(TEST_CONFIG.errorLogDir, { recursive: true, force: true });
    } catch (e) {
      // 忽略清理错误
    }
  }

  static async setupTestSkill() {
    const skillPath = TEST_CONFIG.testSkillPath;
    await fs.mkdir(skillPath, { recursive: true });
    
    const skillMd = `---
name: test-skill
description: 测试技能
version: "1.0.0"
status: active
---

# Test Skill

这是一个用于测试的技能。
`;
    
    await fs.writeFile(path.join(skillPath, 'SKILL.md'), skillMd, 'utf-8');
    return skillPath;
  }

  static async cleanupTestSkill() {
    try {
      await fs.rm(path.join(__dirname, 'fixtures'), { recursive: true, force: true });
    } catch (e) {
      // 忽略
    }
  }
}

/**
 * StateManager 集成测试套件
 */
describe('StateManager 集成测试', () => {
  let stateManager;

  beforeEach(async () => {
    await TestUtils.cleanup();
    stateManager = new StateManager({ statePath: TEST_CONFIG.statePath });
  });

  afterEach(async () => {
    await TestUtils.cleanup();
  });

  it('应该正确创建技能状态', async () => {
    const skillPath = await TestUtils.setupTestSkill();
    const state = stateManager.getOrCreateState(skillPath);

    expect(state).toBeDefined();
    expect(state.skillId).toBe('test-skill');
    expect(state.skillName).toBe('test-skill');
    expect(state.currentState).toBe(PIPELINE_STATES.DEVELOP);
    expect(state.version).toBe('1.0.0');
  });

  it('应该从SKILL.md解析元数据', async () => {
    const skillPath = await TestUtils.setupTestSkill();
    const state = stateManager.getOrCreateState(skillPath);

    expect(state.skillName).toBe('test-skill');
    expect(state.description).toBe('测试技能');
    expect(state.version).toBe('1.0.0');
  });

  it('应该正确处理状态流转', async () => {
    const skillPath = await TestUtils.setupTestSkill();
    stateManager.getOrCreateState(skillPath);

    const newState = stateManager.transitionState(
      'test-skill',
      PIPELINE_STATES.TEST,
      '测试触发',
      'test'
    );

    expect(newState.currentState).toBe(PIPELINE_STATES.TEST);
    expect(newState.previousState).toBe(PIPELINE_STATES.DEVELOP);
    expect(newState.stateHistory).toHaveLength(1);
    expect(newState.stateHistory[0].from).toBe(PIPELINE_STATES.DEVELOP);
    expect(newState.stateHistory[0].to).toBe(PIPELINE_STATES.TEST);
  });

  it('应该拒绝非法状态流转', async () => {
    const skillPath = await TestUtils.setupTestSkill();
    stateManager.getOrCreateState(skillPath);

    expect(() => {
      stateManager.transitionState(
        'test-skill',
        PIPELINE_STATES.ONLINE,
        '非法流转',
        'test'
      );
    }).toThrow(/非法状态流转/);
  });

  it('应该正确更新状态属性', async () => {
    const skillPath = await TestUtils.setupTestSkill();
    stateManager.getOrCreateState(skillPath);

    const updated = stateManager.updateState('test-skill', {
      iscScore: 85,
      syncStatus: 'syncing'
    });

    expect(updated.iscScore).toBe(85);
    expect(updated.syncStatus).toBe('syncing');
  });

  it('应该返回正确的状态统计', async () => {
    const skillPath = await TestUtils.setupTestSkill();
    stateManager.getOrCreateState(skillPath);

    const stats = stateManager.getStateStatistics();
    expect(stats.total).toBe(1);
    expect(stats.byState[PIPELINE_STATES.DEVELOP]).toBe(1);
  });

  it('应该支持状态文件持久化', async () => {
    const skillPath = await TestUtils.setupTestSkill();
    
    // 创建状态
    stateManager.getOrCreateState(skillPath);
    stateManager.transitionState('test-skill', PIPELINE_STATES.TEST, '测试', 'test');

    // 创建新的StateManager实例读取状态
    const newManager = new StateManager({ statePath: TEST_CONFIG.statePath });
    const loadedState = newManager.getOrCreateState(skillPath);

    expect(loadedState.currentState).toBe(PIPELINE_STATES.TEST);
    expect(loadedState.stateHistory).toHaveLength(1);
  });

  it('应该从文件系统重建损坏的状态', async () => {
    const skillPath = await TestUtils.setupTestSkill();
    
    // 创建初始状态
    stateManager.getOrCreateState(skillPath);
    
    // 写入损坏的状态文件
    const stateFile = path.join(TEST_CONFIG.statePath, 'test-skill.json');
    await fs.writeFile(stateFile, 'invalid json', 'utf-8');

    // 重新读取应该重建状态
    const rebuiltState = stateManager.getOrCreateState(skillPath);
    expect(rebuiltState.skillId).toBe('test-skill');
  });
});

/**
 * StateMachine 集成测试套件
 */
describe('StateMachine 集成测试', () => {
  let stateMachine;
  const testStateDir = path.join(TEST_CONFIG.statePath, 'state-machine');

  beforeEach(async () => {
    await fs.mkdir(testStateDir, { recursive: true });
    stateMachine = new StateMachine({
      skillId: 'test-skill',
      stateDir: testStateDir
    });
    await stateMachine.initialize();
  });

  afterEach(async () => {
    await stateMachine.destroy();
    await TestUtils.cleanup();
  });

  it('应该正确初始化状态机', async () => {
    expect(stateMachine.getCurrentState()).toBe(PipelineState.IDLE);
    expect(stateMachine.getStateMetadata()).toBeDefined();
  });

  it('应该正确执行状态转换', async () => {
    const result = await stateMachine.transitionTo(
      PipelineState.ANALYZING,
      { testData: 'value' },
      '测试转换'
    );

    expect(result).toBe(true);
    expect(stateMachine.getCurrentState()).toBe(PipelineState.ANALYZING);
  });

  it('应该拒绝非法状态转换', async () => {
    // IDLE -> CODING 是非法的
    await expect(
      stateMachine.transitionTo(PipelineState.CODING)
    ).rejects.toThrow(/非法状态转换/);
  });

  it('应该正确记录状态历史', async () => {
    await stateMachine.transitionTo(PipelineState.ANALYZING, {}, '开始分析');
    await stateMachine.transitionTo(PipelineState.CODING, {}, '开始编码');
    await stateMachine.transitionTo(PipelineState.TESTING, {}, '开始测试');

    const history = stateMachine.getStateHistory();
    expect(history).toHaveLength(3);
    expect(history[0].from).toBe(PipelineState.IDLE);
    expect(history[2].to).toBe(PipelineState.TESTING);
  });

  it('应该正确计算状态持续时间', async () => {
    await stateMachine.transitionTo(PipelineState.ANALYZING);
    
    // 等待一小段时间
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const duration = stateMachine.getStateDuration();
    expect(duration).toBeGreaterThanOrEqual(50);
  });

  it('应该正确检测状态超时', async () => {
    // ANALYZING 状态超时时间是 5 分钟
    await stateMachine.transitionTo(PipelineState.ANALYZING);
    expect(stateMachine.isStateTimeout()).toBe(false);
  });

  it('应该正确重置状态机', async () => {
    await stateMachine.transitionTo(PipelineState.ANALYZING);
    await stateMachine.transitionTo(PipelineState.CODING);
    
    await stateMachine.reset('测试重置');
    
    expect(stateMachine.getCurrentState()).toBe(PipelineState.IDLE);
    expect(stateMachine.getStateHistory()).toHaveLength(0);
  });

  it('应该正确生成状态快照', async () => {
    await stateMachine.transitionTo(PipelineState.ANALYZING, { key: 'value' });
    
    const snapshot = stateMachine.getSnapshot();
    expect(snapshot.skillId).toBe('test-skill');
    expect(snapshot.currentState).toBe(PipelineState.ANALYZING);
    expect(snapshot.context).toEqual({ key: 'value' });
    expect(snapshot.isTimeout).toBeDefined();
  });

  it('应该持久化状态到文件', async () => {
    await stateMachine.transitionTo(PipelineState.ANALYZING);
    
    // 创建新实例读取持久化状态
    const newMachine = new StateMachine({
      skillId: 'test-skill',
      stateDir: testStateDir
    });
    await newMachine.initialize();
    
    expect(newMachine.getCurrentState()).toBe(PipelineState.ANALYZING);
    await newMachine.destroy();
  });
});

/**
 * Executor 集成测试套件
 */
describe('Executor 集成测试', () => {
  let executor;

  beforeEach(async () => {
    executor = createExecutor({
      pipelineId: 'test-pipeline',
      mode: ExecutionMode.SERIAL,
      defaultTimeoutMs: 5000
    });
    await executor.initialize();
  });

  afterEach(() => {
    // 清理
  });

  it('应该正确初始化执行器', async () => {
    expect(executor.pipelineId).toBe('test-pipeline');
    expect(executor.mode).toBe(ExecutionMode.SERIAL);
    expect(executor.isExecuting).toBe(false);
  });

  it('应该正确注册执行阶段', () => {
    const stage = createStage({
      stage: ExecutorStage.ANALYZE,
      name: 'Test Analyze',
      execute: async () => ({ result: 'analyzed' })
    });

    executor.registerStage(stage);
    expect(executor.stageCount).toBe(1);
    expect(executor.getStage(ExecutorStage.ANALYZE)).toBeDefined();
  });

  it('应该拒绝重复注册阶段', () => {
    const stage = createStage({
      stage: ExecutorStage.ANALYZE,
      execute: async () => ({ result: 'analyzed' })
    });

    executor.registerStage(stage);
    expect(() => executor.registerStage(stage)).toThrow(/already registered/);
  });

  it('应该串行执行所有阶段', async () => {
    const executionOrder = [];

    executor.registerStage(createStage({
      stage: 'stage1',
      execute: async () => {
        executionOrder.push('stage1');
        return { data: 1 };
      }
    }));

    executor.registerStage(createStage({
      stage: 'stage2',
      execute: async () => {
        executionOrder.push('stage2');
        return { data: 2 };
      }
    }));

    const result = await executor.execute({});

    expect(result.success).toBe(true);
    expect(executionOrder).toEqual(['stage1', 'stage2']);
    expect(result.completedStages).toEqual(['stage1', 'stage2']);
  });

  it('应该并行执行阶段', async () => {
    const parallelExecutor = createExecutor({
      mode: ExecutionMode.PARALLEL,
      maxConcurrency: 2
    });
    await parallelExecutor.initialize();

    const startTimes = {};

    parallelExecutor.registerStage(createStage({
      stage: 'parallel1',
      execute: async () => {
        startTimes.parallel1 = Date.now();
        await new Promise(resolve => setTimeout(resolve, 50));
        return {};
      }
    }));

    parallelExecutor.registerStage(createStage({
      stage: 'parallel2',
      execute: async () => {
        startTimes.parallel2 = Date.now();
        await new Promise(resolve => setTimeout(resolve, 50));
        return {};
      }
    }));

    await parallelExecutor.execute({});

    // 两个阶段应该几乎同时开始
    const timeDiff = Math.abs(startTimes.parallel1 - startTimes.parallel2);
    expect(timeDiff).toBeLessThan(30);
  });

  it('应该管道模式执行阶段', async () => {
    const pipelineExecutor = createExecutor({
      mode: ExecutionMode.PIPELINE
    });
    await pipelineExecutor.initialize();

    pipelineExecutor.registerStage(createStage({
      stage: 'stage1',
      execute: async (context) => ({
        data: context.input ? context.input.data + 1 : 1
      })
    }));

    pipelineExecutor.registerStage(createStage({
      stage: 'stage2',
      execute: async (context) => ({
        data: context.input.data + 10
      })
    }));

    const result = await pipelineExecutor.execute({});

    expect(result.success).toBe(true);
    expect(result.output).toEqual({ data: 11 });
  });

  it('应该在阶段失败时停止执行', async () => {
    executor.registerStage(createStage({
      stage: 'failStage',
      execute: async () => {
        throw new Error('阶段执行失败');
      }
    }));

    executor.registerStage(createStage({
      stage: 'skipStage',
      execute: async () => ({ success: true })
    }));

    const result = await executor.execute({});

    expect(result.success).toBe(false);
    expect(result.failedStages).toContain('failStage');
    expect(result.completedStages).toHaveLength(0);
  });

  it('应该在阶段失败时继续执行（如果配置）', async () => {
    executor.registerStage(createStage({
      stage: 'failStage',
      continueOnError: true,
      execute: async () => {
        throw new Error('阶段执行失败');
      }
    }));

    executor.registerStage(createStage({
      stage: 'continueStage',
      execute: async () => ({ success: true })
    }));

    const result = await executor.execute({});

    expect(result.failedStages).toContain('failStage');
    expect(result.completedStages).toContain('continueStage');
  });

  it('应该正确处理阶段超时', async () => {
    executor.registerStage(createStage({
      stage: 'timeoutStage',
      timeoutMs: 50,
      execute: async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return {};
      }
    }));

    const result = await executor.execute({});

    expect(result.success).toBe(false);
    expect(result.failedStages).toContain('timeoutStage');
    expect(result.stageResults.timeoutStage.error.message).toContain('timed out');
  });

  it('应该正确处理阶段依赖', async () => {
    const executionOrder = [];

    executor.registerStage(createStage({
      stage: 'dependentStage',
      dependsOn: ['baseStage'],
      execute: async () => {
        executionOrder.push('dependent');
        return {};
      }
    }));

    executor.registerStage(createStage({
      stage: 'baseStage',
      execute: async () => {
        executionOrder.push('base');
        return {};
      }
    }));

    // 并行模式会考虑依赖关系
    const parallelExecutor = createExecutor({
      mode: ExecutionMode.PARALLEL
    });
    await parallelExecutor.initialize();
    
    parallelExecutor.registerStage(executor.getStage('baseStage'));
    parallelExecutor.registerStage(executor.getStage('dependentStage'));

    await parallelExecutor.execute({});

    expect(executionOrder).toEqual(['base', 'dependent']);
  });

  it('应该正确取消执行', async () => {
    executor.registerStage(createStage({
      stage: 'longStage',
      execute: async (context, signal) => {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(resolve, 5000);
          signal.addEventListener('abort', () => {
            clearTimeout(timeout);
            reject(new Error('Cancelled'));
          });
        });
        return {};
      }
    }));

    const executionPromise = executor.execute({});
    
    // 延迟取消
    setTimeout(() => executor.cancel(), 10);

    const result = await executionPromise;
    expect(result.success).toBe(false);
  });

  it('应该正确触发事件', async () => {
    const events = [];

    executor.on('stage:start', (data) => events.push({ type: 'start', stage: data.stageId }));
    executor.on('stage:complete', (data) => events.push({ type: 'complete', stage: data.stageId }));

    executor.registerStage(createStage({
      stage: 'eventStage',
      execute: async () => ({ success: true })
    }));

    await executor.execute({});

    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('start');
    expect(events[1].type).toBe('complete');
  });
});

/**
 * ErrorHandler 集成测试套件
 */
describe('ErrorHandler 集成测试', () => {
  let errorHandler;

  beforeEach(async () => {
    await TestUtils.cleanup();
    errorHandler = createErrorHandler({
      errorLogDir: TEST_CONFIG.errorLogDir,
      enablePersistence: true,
      maxErrorHistory: 100
    });
    await errorHandler.initialize();
  });

  afterEach(async () => {
    await TestUtils.cleanup();
  });

  it('应该正确初始化错误处理器', () => {
    expect(errorHandler.config).toBeDefined();
    expect(errorHandler.errorHistory).toEqual([]);
    expect(errorHandler.statistics.total).toBe(0);
  });

  it('应该正确处理错误', async () => {
    const testError = new Error('测试错误');
    
    const record = await errorHandler.handleError(testError, {
      stage: 'test',
      metadata: { key: 'value' }
    });

    expect(record).toBeDefined();
    expect(record.message).toBe('测试错误');
    expect(record.stage).toBe('test');
    expect(record.category).toBeDefined();
    expect(record.severity).toBeDefined();
    expect(record.timestamp).toBeDefined();
  });

  it('应该自动分类错误', async () => {
    const networkError = new Error('Network timeout: connection refused');
    const record = await errorHandler.handleError(networkError, { stage: 'test' });
    
    expect(record.category).toBe(ErrorCategory.NETWORK);
  });

  it('应该自动分类超时错误', async () => {
    const timeoutError = new Error('Operation timed out after 5000ms');
    const record = await errorHandler.handleError(timeoutError, { stage: 'test' });
    
    expect(record.category).toBe(ErrorCategory.TIMEOUT);
  });

  it('应该自动分类验证错误', async () => {
    const validationError = new Error('Invalid input: validation failed');
    const record = await errorHandler.handleError(validationError, { stage: 'test' });
    
    expect(record.category).toBe(ErrorCategory.VALIDATION);
  });

  it('应该正确记录错误历史', async () => {
    await errorHandler.handleError(new Error('错误1'), { stage: 'stage1' });
    await errorHandler.handleError(new Error('错误2'), { stage: 'stage2' });
    await errorHandler.handleError(new Error('错误3'), { stage: 'stage3' });

    expect(errorHandler.errorHistory).toHaveLength(3);
    expect(errorHandler.statistics.total).toBe(3);
  });

  it('应该限制历史记录数量', async () => {
    const handler = createErrorHandler({
      maxErrorHistory: 3
    });
    await handler.initialize();

    await handler.handleError(new Error('错误1'));
    await handler.handleError(new Error('错误2'));
    await handler.handleError(new Error('错误3'));
    await handler.handleError(new Error('错误4'));

    expect(handler.errorHistory).toHaveLength(3);
  });

  it('应该支持重试机制', async () => {
    let attemptCount = 0;
    const operation = async () => {
      attemptCount++;
      if (attemptCount < 3) {
        const error = new Error('Transient error: network failed');
        throw error;
      }
      return 'success';
    };

    const result = await errorHandler.withRetry(operation, {
      operationId: 'test-op',
      retryConfig: {
        maxRetries: 3,
        initialDelayMs: 10,
        exponentialBackoff: true
      }
    });

    expect(result).toBe('success');
    expect(attemptCount).toBe(3);
  });

  it('应该在重试耗尽时抛出错误', async () => {
    const operation = async () => {
      throw new Error('Persistent error');
    };

    await expect(
      errorHandler.withRetry(operation, {
        operationId: 'failing-op',
        retryConfig: {
          maxRetries: 2,
          initialDelayMs: 10
        }
      })
    ).rejects.toThrow(RetryExhaustedError);
  });

  it('应该正确注册和执行回滚', async () => {
    const rollbackCalled = [];

    errorHandler.registerRollbackHandler('stage1', async (context) => {
      rollbackCalled.push('stage1');
      return { rolledBack: true };
    });

    errorHandler.registerRollbackHandler('stage2', async (context) => {
      rollbackCalled.push('stage2');
      return { rolledBack: true };
    });

    const result = await errorHandler.rollbackMultiple(['stage1', 'stage2']);

    expect(result.success).toBe(true);
    expect(rollbackCalled).toEqual(['stage2', 'stage1']);
  });

  it('应该正确标记错误为已恢复', async () => {
    const error = new Error('Recoverable error');
    const record = await errorHandler.handleError(error);

    expect(record.recovered).toBe(false);

    const marked = errorHandler.markRecovered(record.id);
    expect(marked).toBe(true);
    expect(errorHandler.errorHistory[0].recovered).toBe(true);
  });

  it('应该生成错误报告', async () => {
    await errorHandler.handleError(new Error('网络错误'), { stage: 'network' });
    await errorHandler.handleError(new Error('超时错误'), { stage: 'timeout' });
    
    const report = errorHandler.getErrorReport();

    expect(report.total).toBe(2);
    expect(report.byCategory).toBeDefined();
    expect(report.recent).toHaveLength(2);
    expect(report.summary.total).toBe(2);
  });

  it('应该持久化错误到文件', async () => {
    await errorHandler.handleError(new Error('持久化测试'), { stage: 'test' });

    const files = await fs.readdir(TEST_CONFIG.errorLogDir);
    expect(files.length).toBeGreaterThan(0);
    expect(files[0]).toMatch(/^err_/);
  });

  it('应该支持导出错误日志', async () => {
    await errorHandler.handleError(new Error('导出测试'), { stage: 'test' });

    const exportPath = await errorHandler.exportLogs();
    const content = await fs.readFile(exportPath, 'utf-8');
    const data = JSON.parse(content);

    expect(data.statistics).toBeDefined();
    expect(data.errors).toHaveLength(1);
  });

  it('应该触发告警事件', async () => {
    const alerts = [];
    errorHandler.on('alert', (alert) => alerts.push(alert));

    // 触发一个严重错误
    const fatalError = new Error('Critical system failure');
    fatalError.name = 'FatalError';
    await errorHandler.handleError(fatalError, { stage: 'system' });

    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0].level).toBe(ErrorSeverity.FATAL);
  });
});

/**
 * PipelineEngine 集成测试套件
 */
describe('PipelineEngine 集成测试', () => {
  let engine;

  beforeEach(async () => {
    await TestUtils.cleanup();
    engine = new PipelineEngine({
      storage: { statePath: TEST_CONFIG.statePath },
      isc: { minScore: 70 },
      evomap: { offlineMode: true, autoSync: false }
    });
  });

  afterEach(async () => {
    await engine.shutdown();
    await TestUtils.cleanup();
    await TestUtils.cleanupTestSkill();
  });

  it('应该正确初始化引擎', async () => {
    await engine.initialize();
    expect(engine.stateManager).toBeDefined();
    expect(engine.iscValidator).toBeDefined();
    expect(engine.evomapUploader).toBeDefined();
  });

  it('应该正确递增版本号', () => {
    expect(engine.incrementVersion('1.0.0')).toBe('1.0.1');
    expect(engine.incrementVersion('1.0.99')).toBe('1.1.0');
    expect(engine.incrementVersion('1.99.99')).toBe('2.0.0');
    expect(engine.incrementVersion('invalid')).toBe('0.0.1');
  });

  it('应该返回正确的统计信息', async () => {
    await engine.initialize();
    const stats = engine.getStats();

    expect(stats.jobsProcessed).toBeDefined();
    expect(stats.jobsFailed).toBeDefined();
    expect(stats.startTime).toBeDefined();
    expect(stats.stateDistribution).toBeDefined();
  });

  it('应该正确处理技能状态流转', async () => {
    await engine.initialize();
    const skillPath = await TestUtils.setupTestSkill();

    // 初始状态应该是DEVELOP
    const initialState = engine.stateManager.getOrCreateState(skillPath);
    expect(initialState.currentState).toBe(PIPELINE_STATES.DEVELOP);

    // 模拟处理技能
    await engine.processSkill(skillPath);

    // 由于ISC校验可能会失败，状态可能回到DEVELOP或进入TEST
    const finalState = engine.stateManager.getOrCreateState(skillPath);
    expect([PIPELINE_STATES.DEVELOP, PIPELINE_STATES.TEST]).toContain(finalState.currentState);
  });
});

/**
 * EvolutionPipeline 集成测试套件
 */
describe('EvolutionPipeline 集成测试', () => {
  let pipeline;

  beforeEach(async () => {
    await TestUtils.cleanup();
    pipeline = new EvolutionPipeline({
      pipelineId: 'test-evolution-pipeline',
      stateMachine: { stateDir: TEST_CONFIG.statePath },
      executor: { mode: ExecutionMode.SERIAL },
      errorHandler: { enablePersistence: false, enableAlerts: false }
    });
  });

  afterEach(async () => {
    if (pipeline.isRunning) {
      await pipeline.stop();
    }
    await TestUtils.cleanup();
  });

  it('应该正确初始化流水线', async () => {
    await pipeline.initialize();

    expect(pipeline.pipelineId).toBe('test-evolution-pipeline');
    expect(pipeline.stateMachine).toBeDefined();
    expect(pipeline.triggerManager).toBeDefined();
    expect(pipeline.executor).toBeDefined();
    expect(pipeline.errorHandler).toBeDefined();
  });

  it('应该正确启动和停止', async () => {
    await pipeline.initialize();
    
    await pipeline.start();
    expect(pipeline.isRunning).toBe(true);

    await pipeline.stop();
    expect(pipeline.isRunning).toBe(false);
  });

  it('应该执行单次流水线', async () => {
    await pipeline.initialize();

    // 注册一个测试阶段
    pipeline.executor.registerStage(createStage({
      stage: 'test',
      execute: async () => ({ success: true })
    }));

    const result = await pipeline.runOnce({ test: true });

    expect(result).toBeDefined();
    expect(pipeline.stateMachine.getCurrentState()).toBeDefined();
  });
});

/**
 * 端到端集成测试
 */
describe('端到端集成测试', () => {
  beforeAll(async () => {
    await TestUtils.cleanup();
  });

  afterAll(async () => {
    await TestUtils.cleanup();
    await TestUtils.cleanupTestSkill();
  });

  it('应该完成完整的流水线生命周期', async () => {
    // 创建测试技能
    const skillPath = await TestUtils.setupTestSkill();

    // 初始化所有组件
    const stateManager = new StateManager({ statePath: TEST_CONFIG.statePath });
    const stateMachine = new StateMachine({
      skillId: 'test-skill',
      stateDir: TEST_CONFIG.statePath
    });
    const executor = createExecutor({ mode: ExecutionMode.SERIAL });
    const errorHandler = createErrorHandler({ enablePersistence: false });

    await stateMachine.initialize();
    await executor.initialize();
    await errorHandler.initialize();

    // 阶段1: 技能状态初始化
    const skillState = stateManager.getOrCreateState(skillPath);
    expect(skillState.currentState).toBe(PIPELINE_STATES.DEVELOP);

    // 阶段2: 状态机转换
    await stateMachine.transitionTo(PipelineState.ANALYZING, {}, '开始分析');
    expect(stateMachine.getCurrentState()).toBe(PipelineState.ANALYZING);

    // 阶段3: 执行器分析阶段
    executor.registerStage(createStage({
      stage: 'analyze',
      execute: async () => ({ analyzed: true, timestamp: Date.now() })
    }));

    const analyzeResult = await executor.execute({ skillPath });
    expect(analyzeResult.success).toBe(true);

    // 阶段4: 状态流转到TEST
    stateManager.transitionState('test-skill', PIPELINE_STATES.TEST, '分析完成', 'system');
    expect(stateManager.getOrCreateState(skillPath).currentState).toBe(PIPELINE_STATES.TEST);

    // 阶段5: 错误处理测试
    const testError = new Error('测试错误');
    const errorRecord = await errorHandler.handleError(testError, { stage: 'test' });
    expect(errorRecord).toBeDefined();

    // 清理
    await stateMachine.destroy();
  });

  it('应该正确处理并发流水线执行', async () => {
    const results = await Promise.allSettled([
      (async () => {
        const sm = new StateMachine({
          skillId: 'skill-1',
          stateDir: path.join(TEST_CONFIG.statePath, 'concurrent')
        });
        await sm.initialize();
        await sm.transitionTo(PipelineState.ANALYZING);
        await sm.destroy();
        return 'skill-1-complete';
      })(),
      (async () => {
        const sm = new StateMachine({
          skillId: 'skill-2',
          stateDir: path.join(TEST_CONFIG.statePath, 'concurrent')
        });
        await sm.initialize();
        await sm.transitionTo(PipelineState.ANALYZING);
        await sm.destroy();
        return 'skill-2-complete';
      })(),
      (async () => {
        const sm = new StateMachine({
          skillId: 'skill-3',
          stateDir: path.join(TEST_CONFIG.statePath, 'concurrent')
        });
        await sm.initialize();
        await sm.transitionTo(PipelineState.ANALYZING);
        await sm.destroy();
        return 'skill-3-complete';
      })()
    ]);

    expect(results.every(r => r.status === 'fulfilled')).toBe(true);
  });

  it('应该从错误中恢复并继续执行', async () => {
    const errorHandler = createErrorHandler({
      retry: { maxRetries: 2, initialDelayMs: 10 },
      enablePersistence: false
    });
    await errorHandler.initialize();

    let attemptCount = 0;
    const result = await errorHandler.withRetry(
      async () => {
        attemptCount++;
        if (attemptCount < 2) {
          throw new Error('Temporary failure');
        }
        return { recovered: true };
      },
      { operationId: 'recovery-test' }
    );

    expect(result.recovered).toBe(true);
    expect(attemptCount).toBe(2);
  });
});

// 导出测试配置供其他测试使用
export { TEST_CONFIG, TestUtils };
