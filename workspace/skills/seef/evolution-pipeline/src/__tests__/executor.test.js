/**
 * @fileoverview 执行器模块单元测试
 * @module __tests__/executor.test
 */

'use strict';

// 模拟测试框架
let passCount = 0;
let failCount = 0;

function describe(name, fn) {
  console.log(`\n📦 ${name}`);
  fn();
}

function it(name, fn) {
  try {
    fn();
    passCount++;
    console.log(`  ✅ ${name}`);
  } catch (error) {
    failCount++;
    console.log(`  ❌ ${name}: ${error.message}`);
  }
}

function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(`期望 ${expected}，实际 ${actual}`);
      }
    },
    toEqual(expected) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`不匹配`);
      }
    },
    toBeTruthy() {
      if (!actual) {
        throw new Error(`期望为真`);
      }
    },
    toBeFalsy() {
      if (actual) {
        throw new Error(`期望为假`);
      }
    },
    toContain(item) {
      if (!Array.isArray(actual) || !actual.includes(item)) {
        throw new Error(`期望数组包含 ${item}`);
      }
    }
  };
}

// 异步运行测试
async function runTests() {
  const { Executor, ExecutionMode, ExecutorStage, createExecutor, createStage, BuiltinStages } = await import('../executor.js');

  describe('Executor', () => {
    it('应该正确创建执行器', () => {
      const executor = new Executor({ mode: ExecutionMode.SERIAL });
      expect(executor).toBeTruthy();
      expect(executor.mode).toBe(ExecutionMode.SERIAL);
    });

    it('应该正确初始化', async () => {
      const executor = new Executor();
      await executor.initialize();
      expect(executor.isExecuting).toBeFalsy();
    });

    it('应该注册阶段', () => {
      const executor = new Executor();
      executor.registerStage({
        stage: ExecutorStage.ANALYZE,
        name: '分析阶段',
        execute: async (context) => ({ success: true })
      });
      expect(executor.stageCount).toBe(1);
    });

    it('应该注销阶段', () => {
      const executor = new Executor();
      executor.registerStage({
        stage: ExecutorStage.ANALYZE,
        name: '分析阶段',
        execute: async (context) => ({ success: true })
      });
      expect(executor.stageCount).toBe(1);
      
      const removed = executor.unregisterStage(ExecutorStage.ANALYZE);
      expect(removed).toBeTruthy();
      expect(executor.stageCount).toBe(0);
    });

    it('应该正确获取阶段', () => {
      const executor = new Executor();
      executor.registerStage({
        stage: ExecutorStage.ANALYZE,
        name: '分析阶段',
        execute: async (context) => ({ success: true })
      });
      
      const stage = executor.getStage(ExecutorStage.ANALYZE);
      expect(stage).toBeTruthy();
      expect(stage.name).toBe('分析阶段');
    });
  });

  describe('ExecutionMode', () => {
    it('应该有正确的执行模式', () => {
      expect(ExecutionMode.SERIAL).toBe('serial');
      expect(ExecutionMode.PARALLEL).toBe('parallel');
      expect(ExecutionMode.PIPELINE).toBe('pipeline');
    });
  });

  describe('ExecutorStage', () => {
    it('应该有正确的阶段', () => {
      expect(ExecutorStage.ANALYZE).toBe('analyze');
      expect(ExecutorStage.CODE).toBe('code');
      expect(ExecutorStage.TEST).toBe('test');
      expect(ExecutorStage.PACKAGE).toBe('package');
      expect(ExecutorStage.PUBLISH).toBe('publish');
    });
  });

  describe('createExecutor', () => {
    it('应该创建执行器实例', () => {
      const executor = createExecutor({ mode: ExecutionMode.PARALLEL });
      expect(executor).toBeTruthy();
      expect(executor instanceof Executor).toBeTruthy();
    });
  });

  describe('createStage', () => {
    it('应该创建阶段配置', () => {
      const stage = createStage({
        stage: ExecutorStage.TEST,
        name: '测试阶段',
        execute: async () => ({ tested: true })
      });
      expect(stage.stage).toBe(ExecutorStage.TEST);
      expect(stage.name).toBe('测试阶段');
      expect(typeof stage.execute).toBe('function');
    });
  });

  describe('BuiltinStages', () => {
    it('应该有预定义的分析阶段', () => {
      const stage = BuiltinStages.analyze();
      expect(stage.stage).toBe(ExecutorStage.ANALYZE);
      expect(typeof stage.execute).toBe('function');
    });

    it('应该有预定义的编码阶段', () => {
      const stage = BuiltinStages.code();
      expect(stage.stage).toBe(ExecutorStage.CODE);
      expect(stage.dependsOn).toContain(ExecutorStage.ANALYZE);
    });

    it('应该有预定义的测试阶段', () => {
      const stage = BuiltinStages.test();
      expect(stage.stage).toBe(ExecutorStage.TEST);
      expect(stage.dependsOn).toContain(ExecutorStage.CODE);
    });

    it('应该有预定义的打包阶段', () => {
      const stage = BuiltinStages.package();
      expect(stage.stage).toBe(ExecutorStage.PACKAGE);
      expect(stage.dependsOn).toContain(ExecutorStage.TEST);
    });

    it('应该有预定义的发布阶段', () => {
      const stage = BuiltinStages.publish();
      expect(stage.stage).toBe(ExecutorStage.PUBLISH);
      expect(stage.dependsOn).toContain(ExecutorStage.PACKAGE);
    });
  });
}

// 运行测试
console.log('🧪 运行 Executor 单元测试...');

runTests().then(() => {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`测试结果: 通过 ${passCount}, 失败 ${failCount}`);
  console.log('═══════════════════════════════════════════════════════════');
  process.exit(failCount > 0 ? 1 : 0);
}).catch(err => {
  console.error('测试运行失败:', err);
  process.exit(1);
});
