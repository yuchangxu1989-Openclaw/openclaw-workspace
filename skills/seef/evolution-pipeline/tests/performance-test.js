#!/usr/bin/env node
/**
 * @fileoverview EvoMap进化流水线 - 性能测试套件
 * @description 测试状态流转效率、执行器性能和资源使用情况
 * @module performance-test
 * @version 1.0.0
 */

import { 
  StateMachine, 
  PipelineState 
} from '../src/index.js';
import { Executor, ExecutionMode, createStage } from '../src/executor.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, '../reports/performance-test-report.md');

/**
 * 性能测试配置
 */
const PERF_CONFIG = {
  // 迭代次数
  iterations: 100,
  // 并发流水线数
  concurrentPipelines: 10,
  // 状态机测试数量
  stateMachineCount: 50,
  // 测试超时
  timeoutMs: 300000,
  // 状态目录
  stateDir: path.join(__dirname, '../.pipeline/perf-test-state')
};

/**
 * 性能计时器
 */
class PerformanceTimer {
  constructor() {
    this.measurements = [];
  }

  async measure(name, fn, iterations = 1) {
    const times = [];
    
    for (let i = 0; i < iterations; i++) {
      const start = process.hrtime.bigint();
      await fn();
      const end = process.hrtime.bigint();
      times.push(Number(end - start) / 1e6); // 转换为毫秒
    }

    const result = {
      name,
      iterations,
      avg: times.reduce((a, b) => a + b, 0) / times.length,
      min: Math.min(...times),
      max: Math.max(...times),
      median: times.sort((a, b) => a - b)[Math.floor(times.length / 2)],
      p95: times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)],
      p99: times.sort((a, b) => a - b)[Math.floor(times.length * 0.99)]
    };

    this.measurements.push(result);
    return result;
  }

  getReport() {
    return this.measurements;
  }
}

/**
 * 资源监控器
 */
class ResourceMonitor {
  constructor() {
    this.samples = [];
    this.interval = null;
  }

  start(sampleIntervalMs = 100) {
    this.samples = [];
    this.interval = setInterval(() => {
      const usage = process.memoryUsage();
      this.samples.push({
        timestamp: Date.now(),
        rss: usage.rss / 1024 / 1024, // MB
        heapUsed: usage.heapUsed / 1024 / 1024,
        heapTotal: usage.heapTotal / 1024 / 1024,
        external: usage.external / 1024 / 1024,
        cpu: process.cpuUsage()
      });
    }, sampleIntervalMs);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  getStats() {
    if (this.samples.length === 0) return null;

    const rssValues = this.samples.map(s => s.rss);
    const heapValues = this.samples.map(s => s.heapUsed);

    return {
      samples: this.samples.length,
      rss: {
        min: Math.min(...rssValues).toFixed(2),
        max: Math.max(...rssValues).toFixed(2),
        avg: (rssValues.reduce((a, b) => a + b, 0) / rssValues.length).toFixed(2)
      },
      heap: {
        min: Math.min(...heapValues).toFixed(2),
        max: Math.max(...heapValues).toFixed(2),
        avg: (heapValues.reduce((a, b) => a + b, 0) / heapValues.length).toFixed(2)
      }
    };
  }
}

/**
 * 性能测试套件
 */
class PerformanceTestSuite {
  constructor() {
    this.timer = new PerformanceTimer();
    this.monitor = new ResourceMonitor();
    this.results = [];
  }

  /**
   * 初始化测试环境
   */
  async setup() {
    console.log('[Perf] 初始化性能测试环境...');
    
    // 清理状态目录
    try {
      await fs.rm(PERF_CONFIG.stateDir, { recursive: true, force: true });
      await fs.mkdir(PERF_CONFIG.stateDir, { recursive: true });
    } catch (e) {
      // 忽略
    }

    // 获取系统信息
    this.systemInfo = {
      platform: os.platform(),
      arch: os.arch(),
      cpus: os.cpus().length,
      totalMemory: (os.totalmem() / 1024 / 1024 / 1024).toFixed(2) + ' GB',
      nodeVersion: process.version
    };

    console.log('[Perf] 系统信息:', this.systemInfo);
  }

  /**
   * 清理测试环境
   */
  async teardown() {
    console.log('[Perf] 清理测试环境...');
    this.monitor.stop();
    
    // 清理状态目录
    try {
      await fs.rm(PERF_CONFIG.stateDir, { recursive: true, force: true });
    } catch (e) {
      // 忽略
    }
  }

  /**
   * 测试1: 状态转换性能
   */
  async testStateTransitionPerformance() {
    console.log('\n[Test 1] 状态转换性能测试');
    console.log('='.repeat(50));

    const sm = new StateMachine({
      skillId: 'perf-state-test',
      stateDir: PERF_CONFIG.stateDir,
      logger: { info: () => {}, debug: () => {}, error: console.error }
    });

    await sm.initialize();

    // 测试单次状态转换
    const singleResult = await this.timer.measure(
      '单次状态转换',
      async () => {
        await sm.reset();
        await sm.transitionTo(PipelineState.ANALYZING);
      },
      PERF_CONFIG.iterations
    );

    // 测试完整状态流转
    const fullFlowResult = await this.timer.measure(
      '完整状态流转(idle→completed)',
      async () => {
        await sm.reset();
        await sm.transitionTo(PipelineState.ANALYZING);
        await sm.transitionTo(PipelineState.CODING);
        await sm.transitionTo(PipelineState.TESTING);
        await sm.transitionTo(PipelineState.PACKAGING);
        await sm.transitionTo(PipelineState.PUBLISHING);
        await sm.transitionTo(PipelineState.COMPLETED);
      },
      20
    );

    await sm.destroy();

    console.log(`✓ 单次状态转换: ${singleResult.avg.toFixed(2)}ms (avg)`);
    console.log(`✓ 完整状态流转: ${fullFlowResult.avg.toFixed(2)}ms (avg)`);
    console.log(`✓ 每状态耗时: ${(fullFlowResult.avg / 6).toFixed(2)}ms`);

    return { single: singleResult, fullFlow: fullFlowResult };
  }

  /**
   * 测试2: 批量状态机性能
   */
  async testBulkStateMachines() {
    console.log('\n[Test 2] 批量状态机性能测试');
    console.log('='.repeat(50));

    const stateMachines = [];
    
    // 创建多个状态机
    for (let i = 0; i < PERF_CONFIG.stateMachineCount; i++) {
      const sm = new StateMachine({
        skillId: `perf-bulk-${i}`,
        stateDir: PERF_CONFIG.stateDir,
        logger: { info: () => {}, debug: () => {}, error: console.error }
      });
      await sm.initialize();
      stateMachines.push(sm);
    }

    // 测试批量初始化性能
    const initResult = await this.timer.measure(
      '批量状态机初始化',
      async () => {
        // 每次迭代前重置所有状态机
        await Promise.all(stateMachines.map(sm => sm.reset()));
        await Promise.all(
          stateMachines.map(sm => sm.transitionTo(PipelineState.ANALYZING))
        );
      },
      10
    );

    // 测试批量状态转换 - 先重置并进入 ANALYZING，然后转换到 CODING
    const transitionResult = await this.timer.measure(
      '批量状态转换(50个)',
      async () => {
        // 确保状态机处于 ANALYZING 状态，然后转换到 CODING
        await Promise.all([
          ...stateMachines.map(async (sm) => {
            const currentState = sm.getCurrentState();
            if (currentState !== PipelineState.ANALYZING) {
              await sm.reset();
              await sm.transitionTo(PipelineState.ANALYZING);
            }
            await sm.transitionTo(PipelineState.CODING);
          })
        ]);
      },
      5
    );

    // 清理
    await Promise.all(stateMachines.map(sm => sm.destroy()));

    console.log(`✓ 批量初始化: ${initResult.avg.toFixed(2)}ms (avg)`);
    console.log(`✓ 批量转换: ${transitionResult.avg.toFixed(2)}ms (avg)`);
    console.log(`✓ 每个状态机: ${(transitionResult.avg / PERF_CONFIG.stateMachineCount).toFixed(2)}ms`);

    return { init: initResult, transition: transitionResult };
  }

  /**
   * 测试3: 执行器阶段性能
   */
  async testExecutorPerformance() {
    console.log('\n[Test 3] 执行器阶段性能测试');
    console.log('='.repeat(50));

    // 串行执行测试
    const serialExecutor = new Executor({
      pipelineId: 'perf-serial',
      mode: ExecutionMode.SERIAL,
      defaultTimeoutMs: 30000
    });

    await serialExecutor.initialize();

    // 注册5个轻量级阶段
    for (let i = 1; i <= 5; i++) {
      serialExecutor.registerStage(createStage({
        stage: `stage-${i}`,
        name: `阶段${i}`,
        execute: async () => {
          // 模拟10ms工作
          await new Promise(r => setTimeout(r, 10));
          return { stage: i };
        }
      }));
    }

    const serialResult = await this.timer.measure(
      '串行执行(5阶段)',
      async () => {
        await serialExecutor.execute({});
      },
      20
    );

    // 并行执行测试
    const parallelExecutor = new Executor({
      pipelineId: 'perf-parallel',
      mode: ExecutionMode.PARALLEL,
      maxConcurrency: 5,
      defaultTimeoutMs: 30000
    });

    await parallelExecutor.initialize();

    for (let i = 1; i <= 5; i++) {
      parallelExecutor.registerStage(createStage({
        stage: `stage-${i}`,
        name: `阶段${i}`,
        execute: async () => {
          await new Promise(r => setTimeout(r, 10));
          return { stage: i };
        }
      }));
    }

    const parallelResult = await this.timer.measure(
      '并行执行(5阶段)',
      async () => {
        await parallelExecutor.execute({}, ExecutionMode.PARALLEL);
      },
      20
    );

    const speedup = serialResult.avg / parallelResult.avg;

    console.log(`✓ 串行执行: ${serialResult.avg.toFixed(2)}ms (avg)`);
    console.log(`✓ 并行执行: ${parallelResult.avg.toFixed(2)}ms (avg)`);
    console.log(`✓ 加速比: ${speedup.toFixed(2)}x`);

    return { serial: serialResult, parallel: parallelResult, speedup };
  }

  /**
   * 测试4: 内存使用测试
   */
  async testMemoryUsage() {
    console.log('\n[Test 4] 内存使用测试');
    console.log('='.repeat(50));

    this.monitor.start(50); // 每50ms采样

    // 创建大量状态机
    const stateMachines = [];
    for (let i = 0; i < 100; i++) {
      const sm = new StateMachine({
        skillId: `mem-test-${i}`,
        stateDir: PERF_CONFIG.stateDir,
        logger: { info: () => {}, debug: () => {}, error: console.error }
      });
      await sm.initialize();
      stateMachines.push(sm);
    }

    // 执行一些状态转换
    for (let round = 0; round < 5; round++) {
      await Promise.all(
        stateMachines.map(async (sm) => {
          const currentState = sm.getCurrentState();
          if (currentState === PipelineState.IDLE) {
            await sm.transitionTo(PipelineState.ANALYZING);
          } else if (currentState === PipelineState.ANALYZING) {
            await sm.transitionTo(PipelineState.CODING);
          } else if (currentState === PipelineState.CODING) {
            await sm.reset(); // 使用 reset 回到 idle
          }
        })
      );
      await new Promise(r => setTimeout(r, 100));
    }

    // 销毁状态机
    await Promise.all(stateMachines.map(sm => sm.destroy()));

    this.monitor.stop();

    const memStats = this.monitor.getStats();

    console.log(`✓ RSS内存范围: ${memStats.rss.min} - ${memStats.rss.max} MB`);
    console.log(`✓ 堆内存范围: ${memStats.heap.min} - ${memStats.heap.max} MB`);
    console.log(`✓ 平均RSS: ${memStats.rss.avg} MB`);
    console.log(`✓ 采样点数: ${memStats.samples}`);

    return memStats;
  }

  /**
   * 测试5: 高并发流水线测试
   */
  async testHighConcurrency() {
    console.log('\n[Test 5] 高并发流水线测试');
    console.log('='.repeat(50));

    const runPipeline = async (id) => {
      const executor = new Executor({
        pipelineId: `concurrent-${id}`,
        mode: ExecutionMode.SERIAL,
        defaultTimeoutMs: 10000
      });

      await executor.initialize();

      executor.registerStage(createStage({
        stage: 'analyze',
        execute: async () => {
          await new Promise(r => setTimeout(r, 5));
          return { analyzed: true };
        }
      }));

      executor.registerStage(createStage({
        stage: 'code',
        dependsOn: ['analyze'],
        execute: async () => {
          await new Promise(r => setTimeout(r, 5));
          return { coded: true };
        }
      }));

      const result = await executor.execute({});
      return result.success;
    };

    const startTime = Date.now();
    
    // 并发执行多个流水线
    const results = await Promise.all(
      Array.from({ length: PERF_CONFIG.concurrentPipelines }, (_, i) => 
        runPipeline(i)
      )
    );

    const totalTime = Date.now() - startTime;
    const successCount = results.filter(r => r).length;
    const throughput = (PERF_CONFIG.concurrentPipelines / totalTime * 1000).toFixed(2);

    console.log(`✓ 并发流水线: ${PERF_CONFIG.concurrentPipelines} 个`);
    console.log(`✓ 成功数量: ${successCount}/${PERF_CONFIG.concurrentPipelines}`);
    console.log(`✓ 总耗时: ${totalTime}ms`);
    console.log(`✓ 吞吐量: ${throughput} 流水线/秒`);

    return {
      totalTime,
      successCount,
      throughput: parseFloat(throughput)
    };
  }

  /**
   * 运行所有性能测试
   */
  async runAll() {
    console.log('\n' + '='.repeat(60));
    console.log('EvoMap进化流水线 - 性能测试套件');
    console.log('='.repeat(60));
    console.log(`开始时间: ${new Date().toISOString()}`);
    console.log(`迭代次数: ${PERF_CONFIG.iterations}`);
    console.log('');

    try {
      await this.setup();

      // 执行所有性能测试
      const statePerf = await this.testStateTransitionPerformance();
      const bulkPerf = await this.testBulkStateMachines();
      const execPerf = await this.testExecutorPerformance();
      const memPerf = await this.testMemoryUsage();
      const concurrentPerf = await this.testHighConcurrency();

      await this.teardown();

      // 保存结果
      this.results = {
        statePerf,
        bulkPerf,
        execPerf,
        memPerf,
        concurrentPerf
      };

      // 生成报告
      await this.generateReport();

      return this.results;
    } catch (error) {
      console.error('[Perf] 性能测试失败:', error);
      throw error;
    }
  }

  /**
   * 生成性能测试报告
   */
  async generateReport() {
    const measurements = this.timer.getReport();
    const r = this.results;

    let markdown = `# EvoMap进化流水线 - 性能测试报告

**生成时间:** ${new Date().toISOString()}  
**测试环境:** Node.js ${this.systemInfo.nodeVersion}  
**系统信息:** ${this.systemInfo.platform} ${this.systemInfo.arch}, ${this.systemInfo.cpus} CPU, ${this.systemInfo.totalMemory}

## 执行摘要

| 测试项 | 平均耗时 | P95 | P99 | 状态 |
|:-------|:---------|:----|:----|:-----|
`;

    measurements.forEach(m => {
      const status = m.avg < 100 ? '✓ 优秀' : m.avg < 500 ? '○ 良好' : '△ 需优化';
      markdown += `| ${m.name} | ${m.avg.toFixed(2)}ms | ${m.p95.toFixed(2)}ms | ${m.p99.toFixed(2)}ms | ${status} |\n`;
    });

    markdown += `
## 详细结果

### 1. 状态转换性能

| 指标 | 单次转换 | 完整流转(6状态) |
|:-----|:---------|:----------------|
| 平均耗时 | ${r.statePerf.single.avg.toFixed(2)}ms | ${r.statePerf.fullFlow.avg.toFixed(2)}ms |
| 最小耗时 | ${r.statePerf.single.min.toFixed(2)}ms | ${r.statePerf.fullFlow.min.toFixed(2)}ms |
| 最大耗时 | ${r.statePerf.single.max.toFixed(2)}ms | ${r.statePerf.fullFlow.max.toFixed(2)}ms |
| P95 | ${r.statePerf.single.p95.toFixed(2)}ms | ${r.statePerf.fullFlow.p95.toFixed(2)}ms |
| P99 | ${r.statePerf.single.p99.toFixed(2)}ms | ${r.statePerf.fullFlow.p99.toFixed(2)}ms |

### 2. 批量状态机性能

| 指标 | 初始化(50个) | 批量转换 |
|:-----|:-------------|:---------|
| 平均耗时 | ${r.bulkPerf.init.avg.toFixed(2)}ms | ${r.bulkPerf.transition.avg.toFixed(2)}ms |
| 每状态机 | ${(r.bulkPerf.init.avg / 50).toFixed(2)}ms | ${(r.bulkPerf.transition.avg / 50).toFixed(2)}ms |

### 3. 执行器性能对比

| 执行模式 | 平均耗时 | 说明 |
|:---------|:---------|:-----|
| 串行执行(5阶段) | ${r.execPerf.serial.avg.toFixed(2)}ms | 阶段依次执行 |
| 并行执行(5阶段) | ${r.execPerf.parallel.avg.toFixed(2)}ms | 5阶段同时执行 |
| **加速比** | **${r.execPerf.speedup.toFixed(2)}x** | 并行 vs 串行 |

### 4. 内存使用情况

| 指标 | 最小值 | 最大值 | 平均值 |
|:-----|:-------|:-------|:-------|
| RSS内存 | ${r.memPerf.rss.min} MB | ${r.memPerf.rss.max} MB | ${r.memPerf.rss.avg} MB |
| 堆内存 | ${r.memPerf.heap.min} MB | ${r.memPerf.heap.max} MB | ${r.memPerf.heap.avg} MB |
| 采样点数 | ${r.memPerf.samples} | - | - |

### 5. 高并发吞吐量

| 指标 | 数值 |
|:-----|:-----|
| 并发流水线数 | ${PERF_CONFIG.concurrentPipelines} |
| 成功数 | ${r.concurrentPerf.successCount} |
| 总耗时 | ${r.concurrentPerf.totalTime}ms |
| **吞吐量** | **${r.concurrentPerf.throughput} 流水线/秒** |

## 性能基准

### 状态流转效率要求

| 场景 | 目标值 | 实测值 | 状态 |
|:-----|:-------|:-------|:-----|
| 单次状态转换 | < 50ms | ${r.statePerf.single.avg.toFixed(2)}ms | ${r.statePerf.single.avg < 50 ? '✓ 通过' : '✗ 未通过'} |
| 完整流水线(6状态) | < 300ms | ${r.statePerf.fullFlow.avg.toFixed(2)}ms | ${r.statePerf.fullFlow.avg < 300 ? '✓ 通过' : '✗ 未通过'} |
| 串行执行(5阶段) | < 200ms | ${r.execPerf.serial.avg.toFixed(2)}ms | ${r.execPerf.serial.avg < 200 ? '✓ 通过' : '✗ 未通过'} |
| 内存占用 | < 100MB | ${r.memPerf.rss.max} MB | ${parseFloat(r.memPerf.rss.max) < 100 ? '✓ 通过' : '✗ 未通过'} |

### 吞吐能力

- **设计目标**: 10 流水线/秒
- **实测能力**: ${r.concurrentPerf.throughput} 流水线/秒
- **评估**: ${r.concurrentPerf.throughput >= 10 ? '✓ 满足设计目标' : '△ 低于设计目标'}

## 优化建议

`;

    if (r.statePerf.single.avg > 50) {
      markdown += `1. **状态转换优化** - 单次状态转换耗时较高，建议优化文件I/O操作\n`;
    }
    if (parseFloat(r.memPerf.rss.max) > 100) {
      markdown += `2. **内存优化** - 内存占用较高，建议检查状态机缓存策略\n`;
    }
    if (r.concurrentPerf.throughput < 10) {
      markdown += `3. **并发优化** - 吞吐量低于目标，建议优化资源竞争\n`;
    }

    markdown += `
## 结论

`;

    const allPassed = 
      r.statePerf.single.avg < 50 &&
      r.statePerf.fullFlow.avg < 300 &&
      r.execPerf.serial.avg < 200 &&
      parseFloat(r.memPerf.rss.max) < 100;

    if (allPassed) {
      markdown += `✅ **性能测试全部通过** - 系统满足性能要求，可投入生产使用。`;
    } else {
      markdown += `⚠️ **部分性能指标未达标** - 请参考优化建议进行调整。`;
    }

    markdown += `

---
*报告由 EvoMap 性能测试套件自动生成*
`;

    await fs.writeFile(REPORT_PATH, markdown, 'utf-8');
    console.log(`\n[Perf] 性能测试报告已生成: ${REPORT_PATH}`);
  }
}

// 运行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  const suite = new PerformanceTestSuite();
  suite.runAll().then(() => {
    console.log('\n[Perf] 性能测试完成');
    process.exit(0);
  }).catch(err => {
    console.error('[Perf] 测试失败:', err);
    process.exit(1);
  });
}

export { PerformanceTestSuite, PerformanceTimer, ResourceMonitor };
