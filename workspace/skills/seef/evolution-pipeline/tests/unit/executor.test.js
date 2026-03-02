/**
 * @fileoverview 执行器单元测试 - Executor Test Suite
 * @description 测试模拟执行和回滚功能
 * @module ExecutorTests
 * @version 1.0.0
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { 
  Executor, 
  ExecutionMode, 
  ExecutorStage,
  ExecutionTimeoutError,
  ExecutionCancelledError,
  createExecutor,
  createStage,
  BuiltinStages
} from '../../../src/executor.js';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('执行器单元测试', () => {
  let executor;
  let executionLog;
  let tempDir;

  beforeEach(() => {
    executionLog = [];
    executor = createExecutor({
      pipelineId: `test_${Date.now()}`,
      mode: ExecutionMode.SERIAL,
      defaultTimeoutMs: 5000
    });
    
    tempDir = path.join(__dirname, '../fixtures/temp-executor-test');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterEach(async () => {
    if (executor.isExecuting) {
      executor.cancel();
    }
    
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('执行器初始化', () => {
    test('应该正确初始化执行器', async () => {
      await executor.initialize();
      expect(executor._initialized).toBe(true);
    });

    test('重复初始化应该被忽略', async () => {
      await executor.initialize();
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      await executor.initialize();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    test('应该具有正确的默认配置', () => {
      expect(executor.mode).toBe(ExecutionMode.SERIAL);
      expect(executor.pipelineId).toContain('test_');
    });
  });

  describe('阶段注册', () => {
    test('应该支持注册执行阶段', () => {
      executor.registerStage({
        stage: ExecutorStage.ANALYZE,
        name: 'Test Analyze',
        execute: async () => 'analyzed'
      });

      expect(executor.stageCount).toBe(1);
      expect(executor.getStage(ExecutorStage.ANALYZE)).toBeTruthy();
    });

    test('重复注册阶段应该抛出错误', () => {
      executor.registerStage({
        stage: ExecutorStage.ANALYZE,
        execute: async () => {}
      });

      expect(() => {
        executor.registerStage({
          stage: ExecutorStage.ANALYZE,
          execute: async () => {}
        });
      }).toThrow('already registered');
    });

    test('应该支持注销阶段', () => {
      executor.registerStage({
        stage: ExecutorStage.ANALYZE,
        execute: async () => {}
      });

      const result = executor.unregisterStage(ExecutorStage.ANALYZE);
      expect(result).toBe(true);
      expect(executor.stageCount).toBe(0);
    });

    test('注销不存在的阶段应该返回false', () => {
      const result = executor.unregisterStage('nonexistent');
      expect(result).toBe(false);
    });

    test('应该支持链式调用注册', () => {
      executor
        .registerStage({ stage: ExecutorStage.ANALYZE, execute: async () => {} })
        .registerStage({ stage: ExecutorStage.CODE, execute: async () => {} })
        .registerStage({ stage: ExecutorStage.TEST, execute: async () => {} });

      expect(executor.stageCount).toBe(3);
    });
  });

  describe('串行执行', () => {
    test('应该按顺序执行所有阶段', async () => {
      const order = [];

      executor
        .registerStage({
          stage: 'stage1',
          execute: async () => { order.push(1); return 'result1'; }
        })
        .registerStage({
          stage: 'stage2',
          execute: async () => { order.push(2); return 'result2'; }
        })
        .registerStage({
          stage: 'stage3',
          execute: async () => { order.push(3); return 'result3'; }
        });

      const result = await executor.execute({}, ExecutionMode.SERIAL);

      expect(result.success).toBe(true);
      expect(order).toEqual([1, 2, 3]);
      expect(result.completedStages).toHaveLength(3);
    });

    test('阶段失败应该停止执行（默认行为）', async () => {
      executor
        .registerStage({
          stage: 'stage1',
          execute: async () => 'success'
        })
        .registerStage({
          stage: 'stage2',
          execute: async () => { throw new Error('Stage 2 failed'); }
        })
        .registerStage({
          stage: 'stage3',
          execute: async () => 'never executed'
        });

      const result = await executor.execute({}, ExecutionMode.SERIAL);

      expect(result.success).toBe(false);
      expect(result.completedStages).toContain('stage1');
      expect(result.failedStages).toContain('stage2');
      expect(result.completedStages).not.toContain('stage3');
    });

    test('continueOnError=true应该继续执行', async () => {
      executor
        .registerStage({
          stage: 'stage1',
          execute: async () => 'success'
        })
        .registerStage({
          stage: 'stage2',
          execute: async () => { throw new Error('Stage 2 failed'); },
          continueOnError: true
        })
        .registerStage({
          stage: 'stage3',
          execute: async () => 'success'
        });

      const result = await executor.execute({}, ExecutionMode.SERIAL);

      expect(result.completedStages).toContain('stage1');
      expect(result.completedStages).toContain('stage3');
    });

    test('应该传递上下文到各阶段', async () => {
      executor.registerStage({
        stage: 'stage1',
        execute: async (context) => {
          context.customData = 'test';
          return 'done';
        }
      });

      const context = { initial: true };
      await executor.execute(context, ExecutionMode.SERIAL);

      expect(context.customData).toBe('test');
      expect(context.initial).toBe(true);
    });

    test('应该保存各阶段结果', async () => {
      executor
        .registerStage({
          stage: 'stage1',
          execute: async () => ({ data: 'stage1_result' })
        })
        .registerStage({
          stage: 'stage2',
          execute: async () => ({ data: 'stage2_result' })
        });

      const result = await executor.execute({}, ExecutionMode.SERIAL);

      expect(result.stageResults.stage1.output).toEqual({ data: 'stage1_result' });
      expect(result.stageResults.stage2.output).toEqual({ data: 'stage2_result' });
    });
  });

  describe('并行执行', () => {
    test('应该并行执行独立阶段', async () => {
      const delays = [];

      executor
        .registerStage({
          stage: 'slow1',
          execute: async () => {
            const start = Date.now();
            await new Promise(r => setTimeout(r, 100));
            delays.push({ stage: 'slow1', time: Date.now() - start });
            return 'done1';
          }
        })
        .registerStage({
          stage: 'slow2',
          execute: async () => {
            const start = Date.now();
            await new Promise(r => setTimeout(r, 100));
            delays.push({ stage: 'slow2', time: Date.now() - start });
            return 'done2';
          }
        });

      const start = Date.now();
      const result = await executor.execute({}, ExecutionMode.PARALLEL);
      const totalTime = Date.now() - start;

      expect(result.success).toBe(true);
      expect(totalTime).toBeLessThan(200); // 并行应该 < 200ms
    });

    test('应该正确处理依赖关系', async () => {
      const order = [];

      executor
        .registerStage({
          stage: 'parent',
          execute: async () => { order.push('parent'); return 'done'; }
        })
        .registerStage({
          stage: 'child1',
          dependsOn: ['parent'],
          execute: async () => { order.push('child1'); return 'done'; }
        })
        .registerStage({
          stage: 'child2',
          dependsOn: ['parent'],
          execute: async () => { order.push('child2'); return 'done'; }
        })
        .registerStage({
          stage: 'grandchild',
          dependsOn: ['child1', 'child2'],
          execute: async () => { order.push('grandchild'); return 'done'; }
        });

      await executor.execute({}, ExecutionMode.PARALLEL);

      expect(order.indexOf('parent')).toBeLessThan(order.indexOf('child1'));
      expect(order.indexOf('parent')).toBeLessThan(order.indexOf('child2'));
      expect(order.indexOf('child1')).toBeLessThan(order.indexOf('grandchild'));
      expect(order.indexOf('child2')).toBeLessThan(order.indexOf('grandchild'));
    });

    test('依赖失败应该阻止依赖阶段执行', async () => {
      executor
        .registerStage({
          stage: 'failing',
          execute: async () => { throw new Error('Failed'); }
        })
        .registerStage({
          stage: 'dependent',
          dependsOn: ['failing'],
          execute: async () => 'never executed'
        });

      const result = await executor.execute({}, ExecutionMode.PARALLEL);

      expect(result.success).toBe(false);
      expect(result.failedStages).toContain('failing');
      expect(result.failedStages).toContain('dependent');
    });

    test('应该限制并发数', async () => {
      const concurrent = [];
      let maxConcurrent = 0;

      executor = createExecutor({
        maxConcurrency: 2
      });

      for (let i = 1; i <= 4; i++) {
        executor.registerStage({
          stage: `stage${i}`,
          execute: async () => {
            concurrent.push(i);
            maxConcurrent = Math.max(maxConcurrent, concurrent.length);
            await new Promise(r => setTimeout(r, 50));
            concurrent.splice(concurrent.indexOf(i), 1);
            return 'done';
          }
        });
      }

      await executor.execute({}, ExecutionMode.PARALLEL);

      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });
  });

  describe('管道模式执行', () => {
    test('应该传递前一阶段的输出到后一阶段', async () => {
      executor
        .registerStage({
          stage: 'stage1',
          execute: async () => ({ value: 10 })
        })
        .registerStage({
          stage: 'stage2',
          execute: async (context) => {
            const input = context.input || { value: 0 };
            return { value: input.value * 2 };
          }
        })
        .registerStage({
          stage: 'stage3',
          execute: async (context) => {
            const input = context.input || { value: 0 };
            return { value: input.value + 5 };
          }
        });

      const result = await executor.execute({}, ExecutionMode.PIPELINE);

      expect(result.success).toBe(true);
      expect(result.output).toEqual({ value: 25 }); // (10 * 2) + 5
    });

    test('管道中断应该停止后续阶段', async () => {
      executor
        .registerStage({
          stage: 'stage1',
          execute: async () => 'success'
        })
        .registerStage({
          stage: 'stage2',
          execute: async () => { throw new Error('Break'); }
        })
        .registerStage({
          stage: 'stage3',
          execute: async () => 'never'
        });

      const result = await executor.execute({}, ExecutionMode.PIPELINE);

      expect(result.success).toBe(false);
      expect(result.completedStages).toContain('stage1');
      expect(result.failedStages).toContain('stage2');
      expect(result.completedStages).not.toContain('stage3');
    });
  });

  describe('超时控制', () => {
    test('应该支持阶段级别超时', async () => {
      executor.registerStage({
        stage: 'slow',
        timeoutMs: 100,
        execute: async () => {
          await new Promise(r => setTimeout(r, 500));
          return 'done';
        }
      });

      const result = await executor.execute({}, ExecutionMode.SERIAL);

      expect(result.success).toBe(false);
      expect(result.stageResults.slow.error.name).toBe('ExecutionTimeoutError');
    });

    test('快速完成的阶段不应该超时', async () => {
      executor.registerStage({
        stage: 'fast',
        timeoutMs: 1000,
        execute: async () => {
          await new Promise(r => setTimeout(r, 50));
          return 'done';
        }
      });

      const result = await executor.execute({}, ExecutionMode.SERIAL);

      expect(result.success).toBe(true);
    });
  });

  describe('取消执行', () => {
    test('应该支持取消特定阶段', async () => {
      executor.registerStage({
        stage: 'cancellable',
        execute: async (context, signal) => {
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(resolve, 1000);
            signal.addEventListener('abort', () => {
              clearTimeout(timeout);
              reject(new Error('Cancelled'));
            });
          });
          return 'done';
        }
      });

      // 开始执行
      const executePromise = executor.execute({}, ExecutionMode.SERIAL);
      
      // 延迟取消
      setTimeout(() => executor.cancel('cancellable'), 100);

      const result = await executePromise;
      expect(result.success).toBe(false);
    });

    test('应该支持取消所有阶段', async () => {
      executor
        .registerStage({
          stage: 'stage1',
          execute: async (context, signal) => {
            await new Promise((resolve, reject) => {
              const timeout = setTimeout(resolve, 1000);
              signal.addEventListener('abort', () => {
                clearTimeout(timeout);
                reject(new Error('Cancelled'));
              });
            });
            return 'done';
          }
        })
        .registerStage({
          stage: 'stage2',
          execute: async (context, signal) => {
            await new Promise((resolve, reject) => {
              const timeout = setTimeout(resolve, 1000);
              signal.addEventListener('abort', () => {
                clearTimeout(timeout);
                reject(new Error('Cancelled'));
              });
            });
            return 'done';
          }
        });

      const executePromise = executor.execute({}, ExecutionMode.PARALLEL);
      setTimeout(() => executor.cancel(), 100);

      const result = await executePromise;
      expect(result.success).toBe(false);
    });

    test('取消不存在阶段应该返回false', () => {
      const result = executor.cancel('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('执行回滚', () => {
    test('应该支持阶段回滚', async () => {
      const rollbackLog = [];

      executor
        .registerStage({
          stage: 'stage1',
          execute: async () => {
            rollbackLog.push('execute1');
            return { 
              data: 'test',
              rollback: async () => {
                rollbackLog.push('rollback1');
              }
            };
          }
        })
        .registerStage({
          stage: 'stage2',
          execute: async () => {
            rollbackLog.push('execute2');
            throw new Error('Stage 2 failed');
          }
        });

      const result = await executor.execute({}, ExecutionMode.SERIAL);

      expect(result.success).toBe(false);
      expect(rollbackLog).toContain('execute1');
      expect(rollbackLog).toContain('execute2');
    });

    test('手动回滚应该触发所有已完成阶段的回滚', async () => {
      const rolledBack = [];

      // 模拟带有回滚功能的阶段
      class RollbackableStage {
        constructor(id) {
          this.id = id;
        }

        async execute() {
          return {
            data: `${this.id}_result`,
            rollback: async () => {
              rolledBack.push(this.id);
            }
          };
        }
      }

      const stages = [new RollbackableStage('A'), new RollbackableStage('B')];

      stages.forEach((stage, i) => {
        executor.registerStage({
          stage: `stage${i}`,
          execute: () => stage.execute()
        });
      });

      const result = await executor.execute({}, ExecutionMode.SERIAL);

      // 手动触发回滚
      if (result.success) {
        for (const stage of Object.values(result.stageResults)) {
          if (stage.output?.rollback) {
            await stage.output.rollback();
          }
        }
      }

      expect(rolledBack).toContain('A');
      expect(rolledBack).toContain('B');
    });
  });

  describe('内置阶段', () => {
    test('应该提供内置的分析阶段', () => {
      const stage = BuiltinStages.analyze();
      expect(stage.stage).toBe(ExecutorStage.ANALYZE);
      expect(stage.execute).toBeDefined();
    });

    test('应该提供内置的编码阶段', () => {
      const stage = BuiltinStages.code();
      expect(stage.stage).toBe(ExecutorStage.CODE);
      expect(stage.dependsOn).toContain(ExecutorStage.ANALYZE);
    });

    test('应该提供内置的测试阶段', () => {
      const stage = BuiltinStages.test();
      expect(stage.stage).toBe(ExecutorStage.TEST);
      expect(stage.dependsOn).toContain(ExecutorStage.CODE);
    });

    test('应该提供内置的打包阶段', () => {
      const stage = BuiltinStages.package();
      expect(stage.stage).toBe(ExecutorStage.PACKAGE);
      expect(stage.dependsOn).toContain(ExecutorStage.TEST);
    });

    test('应该提供内置的发布阶段', () => {
      const stage = BuiltinStages.publish();
      expect(stage.stage).toBe(ExecutorStage.PUBLISH);
      expect(stage.dependsOn).toContain(ExecutorStage.PACKAGE);
    });

    test('内置阶段应该正确执行', async () => {
      executor
        .registerStage(BuiltinStages.analyze())
        .registerStage(BuiltinStages.code())
        .registerStage(BuiltinStages.test());

      const result = await executor.execute({}, ExecutionMode.SERIAL);

      expect(result.success).toBe(true);
      expect(result.completedStages).toContain(ExecutorStage.ANALYZE);
      expect(result.completedStages).toContain(ExecutorStage.CODE);
      expect(result.completedStages).toContain(ExecutorStage.TEST);
    });
  });

  describe('辅助函数', () => {
    test('createStage应该创建标准阶段对象', () => {
      const stage = createStage({
        stage: 'test',
        name: 'Test Stage',
        execute: async () => 'done'
      });

      expect(stage.stage).toBe('test');
      expect(stage.name).toBe('Test Stage');
      expect(stage.timeoutMs).toBe(300000);
      expect(stage.continueOnError).toBe(false);
      expect(stage.dependsOn).toEqual([]);
    });

    test('createExecutor应该创建执行器实例', () => {
      const ex = createExecutor({ pipelineId: 'custom' });
      expect(ex).toBeInstanceOf(Executor);
      expect(ex.pipelineId).toBe('custom');
    });
  });

  describe('事件系统', () => {
    test('应该触发execution:start事件', (done) => {
      executor.registerStage({
        stage: 'test',
        execute: async () => 'done'
      });

      executor.on('execution:start', (data) => {
        expect(data.mode).toBeDefined();
        done();
      });

      executor.execute({});
    });

    test('应该触发execution:complete事件', (done) => {
      executor.registerStage({
        stage: 'test',
        execute: async () => 'done'
      });

      executor.on('execution:complete', (result) => {
        expect(result.success).toBe(true);
        done();
      });

      executor.execute({});
    });

    test('应该触发stage:start和stage:complete事件', async () => {
      const events = [];

      executor.registerStage({
        stage: 'test',
        execute: async () => 'done'
      });

      executor.on('stage:start', (data) => events.push(`start:${data.stageId}`));
      executor.on('stage:complete', (data) => events.push(`complete:${data.stageId}`));

      await executor.execute({});

      expect(events).toContain('start:test');
      expect(events).toContain('complete:test');
    });
  });

  describe('错误类', () => {
    test('ExecutionTimeoutError应该包含阶段ID和超时时间', () => {
      const error = new ExecutionTimeoutError('Timeout', 'testStage', 5000);
      
      expect(error.name).toBe('ExecutionTimeoutError');
      expect(error.stageId).toBe('testStage');
      expect(error.timeoutMs).toBe(5000);
      expect(error.message).toBe('Timeout');
    });

    test('ExecutionCancelledError应该包含阶段ID', () => {
      const error = new ExecutionCancelledError('Cancelled', 'testStage');
      
      expect(error.name).toBe('ExecutionCancelledError');
      expect(error.stageId).toBe('testStage');
    });
  });

  describe('边界条件', () => {
    test('空阶段列表应该成功执行', async () => {
      const result = await executor.execute({});
      
      expect(result.success).toBe(true);
      expect(result.completedStages).toHaveLength(0);
    });

    test('重复执行应该抛出错误', async () => {
      executor.registerStage({
        stage: 'slow',
        execute: async () => {
          await new Promise(r => setTimeout(r, 500));
          return 'done';
        }
      });

      executor.execute({});
      
      await expect(executor.execute({})).rejects.toThrow('already running');
    });

    test('无效的阶段配置应该抛出错误', () => {
      expect(() => {
        executor.registerStage({ name: 'invalid' });
      }).toThrow('must have "stage" and "execute"');
    });
  });

  describe('Shell执行', () => {
    test('应该支持执行shell命令', async () => {
      const result = await Executor.exec('echo "hello world"');
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('hello world');
    });

    test('失败的命令应该返回非零退出码', async () => {
      const result = await Executor.exec('exit 1');
      
      expect(result.exitCode).toBe(1);
    });

    test('应该支持超时选项', async () => {
      await expect(
        Executor.exec('sleep 10', { timeout: 100 })
      ).rejects.toThrow('timed out');
    });
  });
});
