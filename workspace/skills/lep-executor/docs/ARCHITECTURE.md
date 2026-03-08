# LEP（Local Execution Protocol）韧性执行中心 - 架构设计文档

**版本**: v1.0.0  
**日期**: 2026-02-26  
**作者**: GLM-5 深度思考模型  
**状态**: 设计完成，待实施

---

## 1. 执行摘要

### 1.1 核心目标
LEP（Local Execution Protocol）韧性执行中心是一个**统一韧性任务执行引擎**，旨在整合现有分散在各处的韧性能力，提供单一、可靠、可观测的执行入口。

### 1.2 设计哲学
```
┌─────────────────────────────────────────────────────────────────┐
│                    LEP 设计第一性原理                            │
├─────────────────────────────────────────────────────────────────┤
│ 1. 不重复造轮子 - 复用而非重写                                   │
│    └── parallel-subagent v3.0.1 的成熟重试/熔断/连接池机制       │
│                                                                 │
│ 2. 统一入口 - 单一真相来源                                       │
│    └── 所有韧性任务通过 LEP.execute() 执行                       │
│                                                                 │
│ 3. 声明式规则 - 配置优于代码                                     │
│    └── N016/N017/N018 规则作为声明式配置被执行                   │
│                                                                 │
│ 4. 深度集成 - 而非独立运行                                       │
│    └── 与ISC-本地任务编排、CRAS、流水线形成闭环                          │
│                                                                 │
│ 5. 可观测性 - 一切皆追踪                                         │
│    └── WAL + 指标 + 追踪三位一体的可观测体系                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. 现状分析

### 2.1 现有韧性能力盘点

| 组件 | 位置 | 能力 | 触发方式 | 状态 |
|:---|:---|:---|:---|:---:|
| **parallel-subagent** | `evolver/src/ops/` | 重试/熔断/连接池 | 子Agent内部 | 🟢 成熟 |
| **全局自主决策流水线** | `lto-core/global-auto-decision-pipeline.js` | 5分钟周期修复 | 定时触发 | 🟢 运行中 |
| **ISC-DTO握手** | `isc-core/handshake.js` | 30分钟对齐检查 | 定时触发 | 🟢 运行中 |
| **CRAS-B洞察** | `cras/index.js --insight` | 每2小时分析 | 定时触发 | 🟢 运行中 |
| **N016修复循环** | `isc-core/rules/` | 规则定义 | ❌ 未实现 | 🔴 待实现 |
| **N017重复问题根治** | `isc-core/rules/` | 规则定义 | ❌ 未实现 | 🔴 待实现 |
| **N018全局引用对齐** | `isc-core/rules/` | 规则定义 | ❌ 未实现 | 🔴 待实现 |

### 2.2 核心痛点

```
痛点1: 执行入口碎片化
├── 每个组件有自己的执行逻辑
├── 无法统一监控和追踪
├── 失败模式无法全局分析
└── 解决: 统一 LEP.execute() 入口

痛点2: 规则与执行分离
├── N016/N017/N018 只有规则定义
├── 无执行引擎消费这些规则
├── 规则成为"僵尸配置"
└── 解决: LEP 规则执行引擎

痛点3: 修复触发不一致
├── 流水线发现问题 → 触发修复
├── CRAS发现问题 → 无法自动修复
├── ISC发现问题 → 仅记录不修复
└── 解决: 统一修复触发机制

痛点4: 缺乏全局韧性视图
├── 各组件独立监控
├── 无法看到"端到端"韧性效果
├── 难以优化整体韧性策略
└── 解决: 全局韧性指标聚合
```

---

## 3. 架构设计

### 3.1 系统架构图

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              LEP 韧性执行中心 v1.0                                   │
│                          Local Execution Protocol                                    │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                         API Layer (统一入口)                                 │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │   │
│  │  │ execute()   │  │ schedule()  │  │ query()     │  │ health()            │  │   │
│  │  │ 同步执行    │  │ 定时调度    │  │ 状态查询    │  │ 健康检查            │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                         │                                            │
│                                         ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                      Orchestration Layer (编排层)                            │   │
│  │                                                                             │   │
│  │   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐        │   │
│  │   │  Rule Engine    │    │  Workflow       │    │  Event          │        │   │
│  │   │  规则执行引擎   │◄──►│  Orchestrator   │◄──►│  Router         │        │   │
│  │   │                 │    │  工作流编排器   │    │  事件路由器     │        │   │
│  │   └─────────────────┘    └─────────────────┘    └─────────────────┘        │   │
│  │            │                      │                      │                  │   │
│  │            ▼                      ▼                      ▼                  │   │
│  │   ┌─────────────────────────────────────────────────────────────┐          │   │
│  │   │              Execution Plan Builder (执行计划构建器)         │          │   │
│  │   │     将规则/任务转换为可执行计划（DAG形式）                  │          │   │
│  │   └─────────────────────────────────────────────────────────────┘          │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                         │                                            │
│                                         ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                     Execution Layer (执行层)                                 │   │
│  │                                                                             │   │
│  │   ┌───────────────────────────────────────────────────────────────┐        │   │
│  │   │              Resilience Core (复用 parallel-subagent)          │        │   │
│  │   │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │        │   │
│  │   │  │ Retry    │  │ Circuit  │  │ Timeout  │  │ Connection   │   │        │   │
│  │   │  │ Handler  │  │ Breaker  │  │ Manager  │  │ Pool         │   │        │   │
│  │   │  └──────────┘  └──────────┘  └──────────┘  └──────────────┘   │        │   │
│  │   └───────────────────────────────────────────────────────────────┘        │   │
│  │                                                                             │   │
│  │   ┌───────────────────────────────────────────────────────────────┐        │   │
│  │   │              N-Rule Executor (N规则专用执行器)                 │        │   │
│  │   │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐   │        │   │
│  │   │  │ N016: 修复循环 │  │ N017: 重复根治 │  │ N018: 引用对齐 │   │        │   │
│  │   │  └────────────────┘  └────────────────┘  └────────────────┘   │        │   │
│  │   └───────────────────────────────────────────────────────────────┘        │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                         │                                            │
│                                         ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                     Recovery Layer (恢复层)                                  │   │
│  │                                                                             │   │
│  │   ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐         │   │
│  │   │ Auto-Decision    │  │ ISC-本地任务编排          │  │ CRAS Insight     │         │   │
│  │   │ Pipeline Bridge  │  │ Handshake Bridge │  │ Action Bridge    │         │   │
│  │   │ (全局流水线桥接) │  │ (对齐检查桥接)   │  │ (洞察触发桥接)   │         │   │
│  │   └──────────────────┘  └──────────────────┘  └──────────────────┘         │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                         │                                            │
│                                         ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                     Observability Layer (可观测层)                           │   │
│  │                                                                             │   │
│  │   ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────────────┐   │   │
│  │   │ WAL Log    │  │ Metrics    │  │ Tracing    │  │ Alerting           │   │   │
│  │   │ 预写日志   │  │ 指标聚合   │  │ 分布式追踪 │  │ 告警通知           │   │   │
│  │   └────────────┘  └────────────┘  └────────────┘  └────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 核心组件详解

#### 3.2.1 API Layer（统一入口层）

```javascript
// LEP 统一执行接口
class LEPExecutor {
  /**
   * 同步执行任务（带完整韧性保障）
   * @param {ExecutionTask} task - 执行任务的配置
   * @returns {Promise<ExecutionResult>} 执行结果
   */
  async execute(task) {
    // 1. 生成执行ID
    // 2. 熔断检查
    // 3. 构建执行计划
    // 4. 执行（带重试）
    // 5. 记录结果
    // 6. 失败触发恢复
  }

  /**
   * 定时调度任务
   * @param {string} cron - cron表达式
   * @param {ExecutionTask} task - 执行任务的配置
   * @returns {string} 调度ID
   */
  schedule(cron, task) {
    // 注册定时任务
  }

  /**
   * 查询执行状态
   * @param {string} executionId - 执行ID
   */
  async query(executionId) {
    // 查询执行状态和结果
  }

  /**
   * 健康检查
   */
  async health() {
    // 返回LEP自身健康状态
  }
}
```

#### 3.2.2 Orchestration Layer（编排层）

**Rule Engine（规则执行引擎）**:
```javascript
// ISC规则执行引擎
class ISCRuleEngine {
  /**
   * 执行ISC规则
   * @param {string} ruleId - 规则ID (如 N016, N017, N018)
   * @param {Object} context - 执行上下文
   */
  async executeRule(ruleId, context) {
    const rule = await this.loadRule(ruleId);
    
    // 1. 检查触发条件
    if (!this.checkTrigger(rule.trigger, context)) {
      return { status: 'skipped', reason: 'trigger_not_met' };
    }
    
    // 2. 检查治理策略
    if (!this.checkGovernance(rule.governance, context)) {
      return { status: 'skipped', reason: 'governance_check_failed' };
    }
    
    // 3. 构建执行计划
    const plan = this.buildExecutionPlan(rule.execution);
    
    // 4. 执行计划
    return await this.executePlan(plan, context);
  }
}
```

**Workflow Orchestrator（工作流编排器）**:
```javascript
// 工作流编排器 - 支持DAG形式的执行计划
class WorkflowOrchestrator {
  /**
   * 执行工作流
   * @param {ExecutionPlan} plan - 执行计划（DAG）
   */
  async executeWorkflow(plan) {
    const dag = this.buildDAG(plan.steps);
    const results = new Map();
    
    // 拓扑排序执行
    for (const batch of dag.getBatches()) {
      // 同批次并行执行
      const batchResults = await Promise.all(
        batch.map(step => this.executeStep(step, results))
      );
      
      // 检查是否有失败
      const failures = batchResults.filter(r => r.status === 'failed');
      if (failures.length > 0 && plan.failFast) {
        return { status: 'failed', failures };
      }
      
      // 保存结果供后续步骤使用
      batch.forEach((step, i) => {
        results.set(step.id, batchResults[i]);
      });
    }
    
    return { status: 'success', results };
  }
}
```

#### 3.2.3 Execution Layer（执行层）

**Resilience Core（韧性核心 - 复用 parallel-subagent）**:
```javascript
// 复用现有成熟实现
const { 
  RetryHandler, 
  CircuitBreaker, 
  TimeoutManager,
  ConnectionPool 
} = require('../parallel-subagent/src/resilience');

// LEP包装层 - 提供统一接口
class ResilienceWrapper {
  constructor(options) {
    this.retry = new RetryHandler(options.retry);
    this.circuitBreaker = new CircuitBreaker(options.circuitBreaker);
    this.timeout = new TimeoutManager(options.timeout);
  }

  async executeWithResilience(fn, context) {
    // 1. 熔断检查
    if (!this.circuitBreaker.canExecute(context.taskType)) {
      throw new CircuitBreakerOpenError();
    }

    // 2. 执行（带重试和超时）
    const result = await this.retry.execute(
      () => this.timeout.execute(fn, context.timeout)
    );

    // 3. 记录成功/失败
    if (result.success) {
      this.circuitBreaker.recordSuccess(context.taskType);
    } else {
      this.circuitBreaker.recordFailure(context.taskType);
    }

    return result;
  }
}
```

**N-Rule Executor（N规则专用执行器）**:
```javascript
// N016 - 修复循环执行器
class N016RepairLoopExecutor {
  async execute(rule, context) {
    const { max_iterations, exit_conditions, steps } = rule.execution;
    
    for (let iteration = 0; iteration < max_iterations; iteration++) {
      // 执行修复步骤
      for (const step of steps) {
        await this.executeStep(step, context);
      }
      
      // 检查退出条件
      if (await this.checkExitConditions(exit_conditions, context)) {
        return { status: 'completed', iterations: iteration + 1 };
      }
    }
    
    return { status: 'max_iterations_reached', iterations: max_iterations };
  }
}

// N017 - 重复问题根治执行器
class N017RecurringPatternExecutor {
  async execute(rule, context) {
    // 1. 分析重复模式
    const patterns = await this.analyzeRecurringPatterns(rule, context);
    
    // 2. 自动解决
    const resolved = [];
    for (const pattern of patterns) {
      const fix = await this.findFixStrategy(pattern, rule.execution.strategies);
      if (fix) {
        await this.applyFix(fix, pattern);
        resolved.push(pattern);
      }
    }
    
    // 3. 标记已解决
    await this.markResolved(resolved);
    
    return { status: 'completed', resolved_count: resolved.length };
  }
}

// N018 - 全局引用对齐执行器
class N018GlobalAlignmentExecutor {
  async execute(rule, context) {
    const { phases } = rule.execution;
    
    for (const phase of phases) {
      const result = await this.executePhase(phase, context);
      if (!result.success && rule.execution.rollback_on_failure) {
        await this.rollback(phase);
        return { status: 'failed', phase: phase.name };
      }
    }
    
    return { status: 'completed' };
  }
}
```

#### 3.2.4 Recovery Layer（恢复层）

```javascript
// 与现有系统的桥接器

class AutoDecisionPipelineBridge {
  async triggerAutoFix(context) {
    const pipeline = require('../lto-core/global-auto-decision-pipeline');
    await pipeline.triggerAutoFix({
      taskType: context.taskType,
      error: context.error,
      executionId: context.executionId,
      timestamp: Date.now()
    });
  }
}

class ISCDTOHandshakeBridge {
  async requestAlignmentCheck(context) {
    const handshake = require('../isc-core/handshake');
    return await handshake.performCheck({
      scope: context.scope,
      rules: context.rules
    });
  }
}

class CRASInsightBridge {
  async triggerInsightAction(context) {
    const cras = require('../cras/index');
    return await cras.executeInsightAction({
      pattern: context.pattern,
      action: context.action
    });
  }
}
```

#### 3.2.5 Observability Layer（可观测层）

```javascript
// WAL（Write-Ahead Logging）- 保证不丢失
class WALLogger {
  async append(event) {
    const entry = {
      ...event,
      timestamp: Date.now(),
      sequence: await this.getNextSequence()
    };
    
    // 同步写入磁盘，保证不丢失
    fs.appendFileSync(this.walPath, JSON.stringify(entry) + '\n');
    
    // 异步复制到长期存储
    this.asyncReplicate(entry);
  }
}

// 指标聚合
class MetricsAggregator {
  record(taskType, result, duration) {
    // 记录到内存
    this.metrics[taskType] = this.metrics[taskType] || {
      total: 0,
      success: 0,
      failure: 0,
      totalDuration: 0
    };
    
    this.metrics[taskType].total++;
    this.metrics[taskType][result.status]++;
    this.metrics[taskType].totalDuration += duration;
  }
  
  getDashboard() {
    // 返回聚合后的指标看板数据
  }
}

// 分布式追踪
class DistributedTracer {
  startSpan(name, parentSpan) {
    return {
      id: generateTraceId(),
      parent: parentSpan?.id,
      name,
      startTime: Date.now()
    };
  }
  
  endSpan(span, result) {
    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    span.result = result;
    this.storeSpan(span);
  }
}
```

---

## 4. 数据流设计

### 4.1 标准执行数据流

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Client  │────►│  LEP     │────►│  Rule    │────►│  Exec    │────►│  Target  │
│  调用方  │     │  Gateway │     │  Engine  │     │  Engine  │     │  目标系统 │
└──────────┘     └──────────┘     └──────────┘     └──────────┘     └──────────┘
     │                │                │                │                │
     │ 1. execute()   │                │                │                │
     │───────────────►│                │                │                │
     │                │                │                │                │
     │                │ 2. WAL记录     │                │                │
     │                │─[WAL]─────────►│                │                │
     │                │                │                │                │
     │                │ 3. 规则匹配    │                │                │
     │                │───────────────►│                │                │
     │                │                │                │                │
     │                │                │ 4. 执行计划    │                │
     │                │                │───────────────►│                │
     │                │                │                │                │
     │                │                │                │ 5. 实际执行    │
     │                │                │                │───────────────►│
     │                │                │                │                │
     │                │                │                │ 6. 返回结果    │
     │                │                │                │◄───────────────│
     │                │                │                │                │
     │                │                │ 7. 记录结果    │                │
     │                │◄───────────────│                │                │
     │                │                │                │                │
     │ 8. 返回结果    │                │                │                │
     │◄───────────────│                │                │                │
     │                │                │                │                │
```

### 4.2 失败恢复数据流

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Exec    │────►│  LEP     │────►│  Recovery│────►│  Pipeline│
│  Engine  │     │  Core    │     │  Layer   │     │  /ISC/   │
│  执行失败 │     │          │     │          │     │  CRAS    │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
     │                │                │                │
     │ 1. 执行失败    │                │                │
     │───────────────►│                │                │
     │                │                │                │
     │                │ 2. 记录失败    │                │
     │                │─[WAL]─────────►│                │
     │                │                │                │
     │                │ 3. 触发恢复    │                │
     │                │───────────────►│                │
     │                │                │                │
     │                │                │ 4a. N016触发  │
     │                │                │───────────────►│ [Pipeline]
     │                │                │                │
     │                │                │ 4b. N017触发  │
     │                │                │───────────────►│ [CRAS]
     │                │                │                │
     │                │                │ 4c. N018触发  │
     │                │                │───────────────►│ [ISC-本地任务编排]
     │                │                │                │
     │                │ 5. 恢复结果    │                │
     │                │◄───────────────│                │
     │                │                │                │
```

### 4.3 定时调度数据流

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Cron    │────►│  LEP     │────►│  Rule    │────►│  Target  │
│  Scheduler│    │  Scheduler│    │  Engine  │     │  System  │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
     │                │                │                │
     │ 1. 定时触发    │                │                │
     │───────────────►│                │                │
     │                │                │                │
     │                │ 2. 查询规则    │                │
     │                │───────────────►│                │
     │                │                │                │
     │                │                │ 3. 条件检查    │
     │                │                │────[条件满足?]─┤
     │                │                │                │
     │                │                │ 4. 执行规则    │
     │                │                │───────────────►│
     │                │                │                │
```

---

## 5. 与现有系统的集成方案

### 5.1 集成矩阵

| 现有系统 | 集成方式 | LEP角色 | 数据流向 |
|:---|:---|:---|:---|
| **parallel-subagent** | 复用韧性核心 | 消费者 | LEP → parallel-subagent |
| **全局自主决策流水线** | 桥接触发 | 触发器 | LEP → Pipeline |
| **ISC-DTO握手** | 桥接检查 | 协调器 | LEP ↔ ISC-本地任务编排 |
| **CRAS-B洞察** | 事件订阅 | 执行器 | CRAS → LEP |
| **N016/N017/N018** | 规则引擎 | 执行器 | LEP → 规则 → 执行 |

### 5.2 parallel-subagent 集成

```javascript
// skills/parallel-subagent/index.js - 改造后

const { LEPExecutor } = require('../lep-executor');

class ParallelSubagent {
  constructor(options) {
    // 不再自己管理重试/熔断
    // this.retry = new RetryHandler(options.retry);
    // this.circuitBreaker = new CircuitBreaker(options.circuitBreaker);
    
    // 改为使用LEP
    this.lep = new LEPExecutor({
      retryPolicy: options.retry,
      circuitBreaker: options.circuitBreaker,
      // 其他配置...
    });
  }

  async spawnSubagent(task) {
    // 使用LEP执行
    return await this.lep.execute({
      type: 'subagent_spawn',
      payload: task,
      // 继承parallel-subagent的调度策略
      priority: task.priority,
      timeout: task.timeout
    });
  }
}
```

### 5.3 全局自主决策流水线集成

```javascript
// skills/lto-core/global-auto-decision-pipeline.js - 增强

const { LEPExecutor } = require('../lep-executor');

class GlobalAutoDecisionPipeline {
  constructor() {
    this.lep = new LEPExecutor();
  }

  async run() {
    // 1. 发现问题
    const findings = await this.discoverIssues();
    
    // 2. 对于可修复的问题，通过LEP执行N016
    if (findings.fixableIssues.length > 0) {
      await this.lep.execute({
        type: 'isc_rule',
        ruleId: 'N016',
        context: {
          fixableIssues: findings.fixableIssues,
          source: 'global_auto_decision_pipeline'
        }
      });
    }
    
    return findings;
  }

  // LEP触发的外部入口
  async triggerAutoFix(context) {
    // 由LEP调用，执行修复
    return await this.executeFix(context);
  }
}
```

### 5.4 CRAS-B洞察集成

```javascript
// skills/cras/index.js - 增强

const { LEPExecutor } = require('../lep-executor');

class CRASInsight {
  constructor() {
    this.lep = new LEPExecutor();
  }

  async analyzeRecurringPatterns() {
    const patterns = await this.detectPatterns();
    
    // 发现重复模式后，通过LEP执行N017
    if (patterns.length > 0) {
      const result = await this.lep.execute({
        type: 'isc_rule',
        ruleId: 'N017',
        context: {
          recurringPatterns: patterns,
          source: 'cras_insight'
        }
      });
      
      // 记录洞察执行结果
      await this.recordInsight({
        patterns,
        resolution: result
      });
    }
    
    return patterns;
  }
}
```

### 5.5 ISC-DTO握手集成

```javascript
// skills/isc-core/handshake.js - 增强

const { LEPExecutor } = require('../lep-executor');

class ISCDTOHandshake {
  constructor() {
    this.lep = new LEPExecutor();
  }

  async performAlignmentCheck() {
    const misalignments = await this.checkAlignments();
    
    // 发现不对齐时，通过LEP协调修复
    for (const issue of misalignments) {
      if (issue.requiresN018) {
        await this.lep.execute({
          type: 'isc_rule',
          ruleId: 'N018',
          context: {
            alignmentIssue: issue,
            source: 'isc_dto_handshake'
          }
        });
      }
    }
    
    return misalignments;
  }
}
```

---

## 6. N规则执行实现

### 6.1 N016 - 修复循环执行实现

```javascript
// skills/lep-executor/src/executors/n016-repair-loop.js

const { BaseExecutor } = require('./base');

/**
 * N016: 修复循环执行器
 * 规则定义: decision-auto-repair-loop-post-pipeline-016.json
 */
class N016RepairLoopExecutor extends BaseExecutor {
  static RULE_ID = 'N016';
  static RULE_NAME = 'auto_repair_loop_post_pipeline';

  async execute(context) {
    const rule = await this.loadRule(this.constructor.RULE_ID);
    const { max_iterations, exit_conditions, steps } = rule.execution;
    
    const executionLog = [];
    let iteration = 0;
    
    this.logger.info(`[N016] 开始修复循环，最大迭代次数: ${max_iterations}`);
    
    for (iteration = 0; iteration < max_iterations; iteration++) {
      this.logger.info(`[N016] 第 ${iteration + 1}/${max_iterations} 轮迭代`);
      
      const iterationResult = await this.executeIteration(steps, context, iteration);
      executionLog.push(iterationResult);
      
      // 检查退出条件
      const shouldExit = await this.checkExitConditions(exit_conditions, {
        iteration,
        max_iterations,
        iterationResult,
        context
      });
      
      if (shouldExit) {
        this.logger.info(`[N016] 满足退出条件，提前结束`);
        break;
      }
    }
    
    // 发送通知
    await this.sendNotification(rule.notification, {
      iteration,
      max_iterations,
      executionLog,
      context
    });
    
    return {
      status: iteration >= max_iterations ? 'max_iterations_reached' : 'completed',
      iterations: iteration + 1,
      executionLog
    };
  }

  async executeIteration(steps, context, iteration) {
    const results = [];
    
    for (const step of steps) {
      this.logger.info(`[N016] 执行步骤 ${step.order}: ${step.action}`);
      
      const result = await this.executeStep(step, context);
      results.push(result);
      
      // 如果步骤失败且不是可继续的，提前结束本轮
      if (!result.success && step.on_failure === 'exit_loop') {
        this.logger.warn(`[N016] 步骤 ${step.action} 失败，退出循环`);
        break;
      }
    }
    
    return { iteration, results };
  }

  async executeStep(step, context) {
    switch (step.action) {
      case 'execute_fixes':
        return await this.executeFixes(step, context);
        
      case 're_scan':
        return await this.reScan(step, context);
        
      case 'evaluate':
        return await this.evaluate(step, context);
        
      default:
        throw new Error(`[N016] 未知的步骤类型: ${step.action}`);
    }
  }

  async executeFixes(step, context) {
    const executor = require(`../../${step.executor}`);
    
    const fixes = context.fixableIssues || [];
    const results = [];
    
    for (const issue of fixes) {
      try {
        const result = await executor.executeFix(issue);
        results.push({ issue, result, success: true });
      } catch (error) {
        results.push({ issue, error: error.message, success: false });
      }
    }
    
    return {
      action: 'execute_fixes',
      success: results.every(r => r.success),
      results
    };
  }

  async reScan(step, context) {
    const executor = require(`../../${step.executor}`);
    const timeout = step.timeout || 60;
    
    const newIssues = await executor.runSingleCheck({ timeout });
    
    return {
      action: 're_scan',
      success: true,
      newIssues: newIssues.fixableIssues || [],
      previousIssues: context.fixableIssues || []
    };
  }

  async evaluate(step, context) {
    const newCount = context.newIssues?.length || 0;
    const previousCount = context.previousIssues?.length || 0;
    
    const improved = newCount < previousCount;
    
    return {
      action: 'evaluate',
      success: improved,
      improved,
      newCount,
      previousCount
    };
  }

  async checkExitConditions(conditions, context) {
    for (const condition of conditions) {
      if (condition === 'issues.length == 0') {
        const issues = context.newIssues || context.iterationResult?.newIssues || [];
        if (issues.length === 0) return true;
      }
      
      if (condition === 'iteration >= max_iterations') {
        if (context.iteration >= context.max_iterations - 1) return true;
      }
    }
    
    return false;
  }

  async sendNotification(config, context) {
    const { iteration, max_iterations, executionLog } = context;
    const lastResult = executionLog[executionLog.length - 1];
    const remainingCount = lastResult?.newIssues?.length || 0;
    const fixedCount = context.context.fixableIssues?.length - remainingCount || 0;
    
    const isMaxIterations = iteration >= max_iterations - 1;
    const notificationConfig = isMaxIterations ? config.on_max_iterations : config.on_complete;
    
    const content = notificationConfig.content
      .replace('{fixed_count}', fixedCount)
      .replace('{remaining_count}', remainingCount);
    
    await this.notify(notificationConfig.channel, {
      level: notificationConfig.level || 'info',
      content
    });
  }
}

module.exports = { N016RepairLoopExecutor };
```

### 6.2 N017 - 重复问题根治执行实现

```javascript
// skills/lep-executor/src/executors/n017-recurring-pattern.js

const { BaseExecutor } = require('./base');

/**
 * N017: 重复问题根治执行器
 * 规则定义: detection-cras-recurring-pattern-auto-resolve-017.json
 */
class N017RecurringPatternExecutor extends BaseExecutor {
  static RULE_ID = 'N017';
  static RULE_NAME = 'cras_recurring_pattern_auto_resolve';

  async execute(context) {
    const rule = await this.loadRule(this.constructor.RULE_ID);
    
    this.logger.info(`[N017] 开始重复问题模式分析`);
    
    // 步骤1: 分析重复模式
    const patterns = await this.analyzeRecurringPatterns(rule, context);
    
    if (patterns.length === 0) {
      this.logger.info(`[N017] 未发现重复模式，跳过`);
      return { status: 'skipped', reason: 'no_patterns_found' };
    }
    
    this.logger.info(`[N017] 发现 ${patterns.length} 个重复模式`);
    
    // 步骤2: 自动解决
    const resolved = await this.autoResolvePatterns(patterns, rule, context);
    
    // 步骤3: 标记已解决
    await this.markResolved(resolved);
    
    // 发送通知
    await this.sendNotification(rule.notification, { resolved_count: resolved.length });
    
    return {
      status: 'completed',
      patterns_found: patterns.length,
      resolved_count: resolved.length,
      resolved
    };
  }

  async analyzeRecurringPatterns(rule, context) {
    const { pattern_matching } = rule.detection;
    const { time_window, threshold } = pattern_matching;
    
    // 从CRAS获取最近的事件
    const cras = require('../../cras/index');
    const events = await cras.getRecentEvents({ 
      window: time_window,
      fields: pattern_matching.fields
    });
    
    // 聚类分析
    const clusters = this.clusterEvents(events, pattern_matching.fields);
    
    // 筛选超过阈值的重复模式
    return clusters
      .filter(cluster => cluster.count >= threshold)
      .map(cluster => ({
        pattern_id: cluster.id,
        count: cluster.count,
        fields: cluster.fields,
        samples: cluster.samples,
        first_seen: cluster.firstSeen,
        last_seen: cluster.lastSeen
      }));
  }

  clusterEvents(events, fields) {
    const clusters = new Map();
    
    for (const event of events) {
      const key = fields.map(f => event[f]).join('|');
      
      if (!clusters.has(key)) {
        clusters.set(key, {
          id: `pattern_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          count: 0,
          fields: {},
          samples: [],
          firstSeen: event.timestamp,
          lastSeen: event.timestamp
        });
      }
      
      const cluster = clusters.get(key);
      cluster.count++;
      cluster.fields = Object.fromEntries(fields.map(f => [f, event[f]]));
      cluster.samples.push(event);
      cluster.lastSeen = event.timestamp;
    }
    
    return Array.from(clusters.values());
  }

  async autoResolvePatterns(patterns, rule, context) {
    const { strategies } = rule.execution;
    const resolved = [];
    
    for (const pattern of patterns) {
      this.logger.info(`[N017] 处理模式: ${pattern.pattern_id}`);
      
      // 匹配策略
      const strategy = this.matchStrategy(pattern, strategies);
      
      if (!strategy) {
        this.logger.warn(`[N017] 未找到匹配策略: ${pattern.pattern_id}`);
        continue;
      }
      
      try {
        // 执行修复
        const fixResult = await this.executeFix(strategy, pattern, context);
        
        if (fixResult.success) {
          resolved.push({
            pattern,
            strategy,
            fixResult
          });
          this.logger.info(`[N017] 成功修复: ${pattern.pattern_id}`);
        } else {
          this.logger.warn(`[N017] 修复失败: ${pattern.pattern_id}`);
        }
      } catch (error) {
        this.logger.error(`[N017] 修复异常: ${pattern.pattern_id}, ${error.message}`);
      }
    }
    
    return resolved;
  }

  matchStrategy(pattern, strategies) {
    // 根据模式特征匹配策略
    for (const strategy of strategies) {
      const patternField = strategy.pattern; // 如 'file_not_found'
      
      // 检查模式是否匹配
      if (this.patternMatches(pattern, patternField)) {
        return strategy;
      }
    }
    
    return null;
  }

  patternMatches(pattern, patternField) {
    const errorType = pattern.fields.error_type || '';
    const errorMessage = pattern.fields.error_message_keyword || '';
    
    // 简单的模式匹配逻辑
    const matchers = {
      'file_not_found': () => errorType.includes('ENOENT') || errorMessage.includes('file not found'),
      'path_mismatch': () => errorType.includes('path') || errorMessage.includes('path'),
      'skill_not_loaded': () => errorType.includes('skill') || errorMessage.includes('not loaded')
    };
    
    const matcher = matchers[patternField];
    return matcher ? matcher() : false;
  }

  async executeFix(strategy, pattern, context) {
    switch (strategy.fix) {
      case 'auto_create_file':
        return await this.fixAutoCreateFile(pattern);
        
      case 'auto_update_reference':
        return await this.fixAutoUpdateReference(pattern);
        
      case 'trigger_skill_reload':
        return await this.fixTriggerSkillReload(pattern);
        
      default:
        return { success: false, error: `未知的修复类型: ${strategy.fix}` };
    }
  }

  async fixAutoCreateFile(pattern) {
    const { failed_skill, error_message_keyword } = pattern.fields;
    
    // 解析错误信息中的文件路径
    const filePath = this.extractFilePath(error_message_keyword);
    if (!filePath) {
      return { success: false, error: '无法提取文件路径' };
    }
    
    // 创建文件
    const fs = require('fs');
    const path = require('path');
    
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(filePath, '', 'utf8');
      
      return { success: true, action: 'created_file', path: filePath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async fixAutoUpdateReference(pattern) {
    const { path_mismatch_info } = pattern.fields;
    
    // 解析路径不匹配信息
    const { oldPath, newPath, files } = this.parsePathMismatch(path_mismatch_info);
    
    const results = [];
    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        const updated = content.replace(new RegExp(oldPath, 'g'), newPath);
        fs.writeFileSync(file, updated, 'utf8');
        results.push({ file, success: true });
      } catch (error) {
        results.push({ file, success: false, error: error.message });
      }
    }
    
    return {
      success: results.every(r => r.success),
      results
    };
  }

  async fixTriggerSkillReload(pattern) {
    const { failed_skill } = pattern.fields;
    
    // 触发技能重载
    const skillManager = require('../../skill-manager');
    await skillManager.reload(failed_skill);
    
    return { success: true, action: 'reload_skill', skill: failed_skill };
  }

  async markResolved(resolved) {
    const cras = require('../../cras/index');
    
    for (const item of resolved) {
      await cras.markPatternResolved(item.pattern.pattern_id);
    }
  }

  extractFilePath(errorMessage) {
    const match = errorMessage.match(/['"]([^'"]+)['"]/);
    return match ? match[1] : null;
  }

  parsePathMismatch(info) {
    // 解析路径不匹配信息
    try {
      return JSON.parse(info);
    } catch {
      return { oldPath: '', newPath: '', files: [] };
    }
  }
}

module.exports = { N017RecurringPatternExecutor };
```

### 6.3 N018 - 全局引用对齐执行实现

```javascript
// skills/lep-executor/src/executors/n018-global-alignment.js

const { BaseExecutor } = require('./base');

/**
 * N018: 全局引用对齐执行器
 * 规则定义: detection-skill-rename-global-alignment-018.json
 */
class N018GlobalAlignmentExecutor extends BaseExecutor {
  static RULE_ID = 'N018';
  static RULE_NAME = 'skill_rename_global_reference_alignment';

  async execute(context) {
    const rule = await this.loadRule(this.constructor.RULE_ID);
    const { phases, rollback_on_failure } = rule.execution;
    
    this.logger.info(`[N018] 开始全局引用对齐`);
    this.logger.info(`[N018] 旧名称: ${context.oldName} → 新名称: ${context.newName}`);
    
    const executionLog = [];
    let backupPath = null;
    
    try {
      for (const phase of phases) {
        this.logger.info(`[N018] 执行阶段: ${phase.name}`);
        
        const result = await this.executePhase(phase, context);
        executionLog.push({ phase: phase.name, result });
        
        // 保存备份路径
        if (phase.phase === 2) {
          backupPath = result.backupPath;
        }
        
        // 检查阶段执行结果
        if (!result.success) {
          this.logger.error(`[N018] 阶段 ${phase.name} 失败`);
          
          if (rollback_on_failure && backupPath) {
            this.logger.info(`[N018] 开始回滚`);
            await this.rollback(backupPath);
          }
          
          await this.sendNotification(rule.notification.on_failure, {
            phase: phase.name,
            error: result.error
          });
          
          return {
            status: 'failed',
            failed_phase: phase.name,
            executionLog
          };
        }
      }
      
      // 所有阶段成功
      await this.sendNotification(rule.notification.on_complete, {
        affected_count: executionLog.find(l => l.phase === 'scan_and_identify')?.result?.affectedCount || 0
      });
      
      return {
        status: 'completed',
        executionLog
      };
      
    } catch (error) {
      this.logger.error(`[N018] 执行异常: ${error.message}`);
      
      if (rollback_on_failure && backupPath) {
        await this.rollback(backupPath);
      }
      
      throw error;
    }
  }

  async executePhase(phase, context) {
    switch (phase.action) {
      case 'scan_all_targets':
        return await this.phaseScanAndIdentify(phase, context);
        
      case 'create_backup':
        return await this.phaseCreateBackup(phase, context);
        
      case 'batch_update':
        return await this.phaseBatchUpdate(phase, context);
        
      case 'run_integrity_checks':
        return await this.phaseVerifyIntegrity(phase, context);
        
      default:
        return { success: false, error: `未知的阶段动作: ${phase.action}` };
    }
  }

  async phaseScanAndIdentify(phase, context) {
    const rule = await this.loadRule(this.constructor.RULE_ID);
    const { scan_targets } = rule;
    
    const affectedReferences = [];
    
    for (const target of scan_targets) {
      this.logger.info(`[N018] 扫描目标: ${target.type}`);
      
      const references = await this.scanTarget(target, context);
      affectedReferences.push(...references);
    }
    
    // 去重
    const uniqueReferences = this.deduplicateReferences(affectedReferences);
    
    this.logger.info(`[N018] 发现 ${uniqueReferences.length} 处受影响引用`);
    
    // 保存到上下文供后续使用
    context.affectedReferences = uniqueReferences;
    
    return {
      success: true,
      affectedCount: uniqueReferences.length,
      references: uniqueReferences
    };
  }

  async scanTarget(target, context) {
    const { oldName, newName } = context;
    const references = [];
    
    // 使用glob查找文件
    const glob = require('glob');
    const files = glob.sync(target.location, { cwd: process.cwd() });
    
    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        
        // 检查是否包含旧名称引用
        if (content.includes(oldName)) {
          // 查找具体位置
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(oldName)) {
              references.push({
                file,
                line: i + 1,
                content: lines[i].trim(),
                type: target.type
              });
            }
          }
        }
      } catch (error) {
        this.logger.warn(`[N018] 扫描文件失败: ${file}, ${error.message}`);
      }
    }
    
    return references;
  }

  async phaseCreateBackup(phase, context) {
    const { affectedReferences } = context;
    
    // 创建备份
    const backupDir = path.join(process.cwd(), '.backups', `n018_${Date.now()}`);
    fs.mkdirSync(backupDir, { recursive: true });
    
    const uniqueFiles = [...new Set(affectedReferences.map(r => r.file))];
    
    for (const file of uniqueFiles) {
      const backupPath = path.join(backupDir, path.relative(process.cwd(), file));
      fs.mkdirSync(path.dirname(backupPath), { recursive: true });
      fs.copyFileSync(file, backupPath);
    }
    
    // 保存备份清单
    const manifest = {
      timestamp: Date.now(),
      files: uniqueFiles,
      context
    };
    fs.writeFileSync(path.join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    
    this.logger.info(`[N018] 备份创建完成: ${backupDir}`);
    
    return {
      success: true,
      backupPath: backupDir,
      fileCount: uniqueFiles.length
    };
  }

  async phaseBatchUpdate(phase, context) {
    const { affectedReferences, oldName, newName } = context;
    const { order, verification_each } = phase;
    
    const results = [];
    
    // 按顺序处理
    for (const type of order) {
      const refsOfType = affectedReferences.filter(r => r.type === type);
      
      if (refsOfType.length === 0) continue;
      
      this.logger.info(`[N018] 更新类型: ${type}, 数量: ${refsOfType.length}`);
      
      for (const ref of refsOfType) {
        try {
          const content = fs.readFileSync(ref.file, 'utf8');
          const updated = content.replace(new RegExp(this.escapeRegExp(oldName), 'g'), newName);
          fs.writeFileSync(ref.file, updated, 'utf8');
          
          results.push({ file: ref.file, type, success: true });
          
          // 如果需要每个都验证
          if (verification_each) {
            const verifyResult = await this.verifyFile(ref.file);
            if (!verifyResult.valid) {
              return {
                success: false,
                error: `验证失败: ${ref.file}, ${verifyResult.error}`
              };
            }
          }
        } catch (error) {
          results.push({ file: ref.file, type, success: false, error: error.message });
        }
      }
    }
    
    const success = results.every(r => r.success);
    
    return {
      success,
      results
    };
  }

  async phaseVerifyIntegrity(phase, context) {
    const { checks } = phase;
    
    const results = [];
    
    for (const check of checks) {
      this.logger.info(`[N018] 运行检查: ${check}`);
      
      const result = await this.runIntegrityCheck(check, context);
      results.push({ check, ...result });
    }
    
    const success = results.every(r => r.passed);
    
    return {
      success,
      results
    };
  }

  async runIntegrityCheck(check, context) {
    switch (check) {
      case 'no_broken_cron_references':
        return await this.checkCronReferences();
        
      case 'no_import_errors':
        return await this.checkImportErrors();
        
      case 'dto_subscriptions_aligned':
        return await this.checkDTOSubscriptions();
        
      case 'isc_dto_handshake_pass':
        return await this.checkISCDTOHandshake();
        
      default:
        return { passed: false, error: `未知的检查项: ${check}` };
    }
  }

  async checkCronReferences() {
    // 检查cron job引用是否有效
    try {
      const cronConfig = JSON.parse(fs.readFileSync('.openclaw/cron/jobs.json', 'utf8'));
      // 简单验证：确保所有script_path存在
      for (const job of cronConfig.jobs || []) {
        if (job.script_path && !fs.existsSync(job.script_path)) {
          return { passed: false, error: `Cron job引用不存在: ${job.script_path}` };
        }
      }
      return { passed: true };
    } catch (error) {
      return { passed: false, error: error.message };
    }
  }

  async checkImportErrors() {
    // 检查是否有导入错误
    try {
      // 尝试require所有skills
      const skills = fs.readdirSync('skills');
      for (const skill of skills) {
        const indexPath = path.join('skills', skill, 'index.js');
        if (fs.existsSync(indexPath)) {
          try {
            delete require.cache[require.resolve(indexPath)];
            require(indexPath);
          } catch (error) {
            return { passed: false, error: `导入错误: ${skill}, ${error.message}` };
          }
        }
      }
      return { passed: true };
    } catch (error) {
      return { passed: false, error: error.message };
    }
  }

  async checkDTOSubscriptions() {
    // 检查DTO订阅是否正确
    try {
      const subscriptions = require('../../lto-core/subscriptions');
      const result = await subscriptions.validateAll();
      return { passed: result.valid, error: result.error };
    } catch (error) {
      return { passed: false, error: error.message };
    }
  }

  async checkISCDTOHandshake() {
    // 运行ISC-DTO握手检查
    try {
      const handshake = require('../../isc-core/handshake');
      const result = await handshake.performCheck();
      return { passed: result.success, error: result.error };
    } catch (error) {
      return { passed: false, error: error.message };
    }
  }

  async rollback(backupPath) {
    this.logger.info(`[N018] 开始回滚: ${backupPath}`);
    
    const manifest = JSON.parse(fs.readFileSync(path.join(backupPath, 'manifest.json'), 'utf8'));
    
    for (const file of manifest.files) {
      const backupFile = path.join(backupPath, path.relative(process.cwd(), file));
      fs.copyFileSync(backupFile, file);
    }
    
    this.logger.info(`[N018] 回滚完成`);
  }

  deduplicateReferences(references) {
    const seen = new Set();
    return references.filter(r => {
      const key = `${r.file}:${r.line}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

module.exports = { N018GlobalAlignmentExecutor };
```

---

## 7. 实施路线图

### 7.1 阶段划分

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         LEP 实施路线图 v1.0                                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Phase 1: 核心基础设施 (Week 1)                                                  │
│  ├── Day 1-2: 项目结构搭建                                                       │
│  │   ├── skills/lep-executor/ 目录结构                                          │
│  │   ├── package.json 依赖配置                                                  │
│  │   └── 基础类定义 (BaseExecutor, LEPExecutor)                                 │
│  │                                                                             │
│  ├── Day 3-4: 统一执行接口实现                                                   │
│  │   ├── LEPExecutor.execute()                                                  │
│  │   ├── WAL日志系统                                                            │
│  │   └── 基础监控指标                                                           │
│  │                                                                             │
│  └── Day 5-7: 韧性核心复用                                                      │
│      ├── 整合 parallel-subagent 重试/熔断逻辑                                   │
│      ├── ResilienceWrapper 实现                                                 │
│      └── 单元测试覆盖                                                           │
│                                                                                  │
│  Phase 2: 规则引擎实现 (Week 2)                                                  │
│  ├── Day 8-10: N016 修复循环                                                   │
│  │   ├── N016RepairLoopExecutor 完整实现                                       │
│  │   ├── 与全局自主决策流水线集成                                               │
│  │   └── 端到端测试                                                            │
│  │                                                                             │
│  ├── Day 11-12: N017 重复问题根治                                               │
│  │   ├── N017RecurringPatternExecutor 实现                                     │
│  │   ├── CRAS-B集成测试                                                        │
│  │   └── 模式匹配策略验证                                                      │
│  │                                                                             │
│  └── Day 13-14: N018 全局引用对齐                                               │
│      ├── N018GlobalAlignmentExecutor 实现                                      │
│      ├── 备份/回滚机制验证                                                     │
│      └── ISC-DTO握手集成测试                                                   │
│                                                                                  │
│  Phase 3: 系统集成 (Week 3)                                                      │
│  ├── Day 15-17: parallel-subagent 改造                                         │
│  │   ├── 替换内部重试逻辑为 LEP                                                 │
│  │   ├── 向后兼容测试                                                          │
│  │   └── 性能基准测试                                                          │
│  │                                                                             │
│  ├── Day 18-19: DTO流水线集成                                                  │
│  │   ├── Pipeline触发N016                                                      │
│  │   └── 修复循环闭环验证                                                      │
│  │                                                                             │
│  └── Day 20-21: CRAS洞察集成                                                   │
│      ├── CRAS-B自动触发N017                                                    │
│      └── 重复问题解决验证                                                      │
│                                                                                  │
│  Phase 4: 监控与优化 (Week 4)                                                    │
│  ├── Day 22-24: 可观测性完善                                                   │
│  │   ├── 全局韧性指标看板                                                      │
│  │   ├── 失败模式分析                                                          │
│  │   └── 告警规则配置                                                          │
│  │                                                                             │
│  ├── Day 25-26: 性能优化                                                       │
│  │   ├── 执行计划缓存                                                          │
│  │   └── 熔断器参数调优                                                        │
│  │                                                                             │
│  └── Day 27-28: 文档与上线                                                     │
│      ├── 完整API文档                                                           │
│      ├── 运维手册                                                              │
│      └── 生产环境部署                                                          │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 关键里程碑

| 里程碑 | 日期 | 交付物 | 验收标准 |
|:---|:---|:---|:---|
| M1 | Week 1 结束 | LEP核心基础设施 | `lep.execute()` 可正常执行，WAL记录完整 |
| M2 | Week 2 结束 | N016/N017/N018 完整实现 | 三个规则均可通过LEP执行，测试通过 |
| M3 | Week 3 结束 | 系统集成完成 | parallel-subagent/本地任务编排/CRAS 均使用LEP |
| M4 | Week 4 结束 | 生产就绪 | 监控看板上线，文档完善，无P0问题 |

### 7.3 风险与缓解

| 风险 | 可能性 | 影响 | 缓解措施 |
|:---|:---:|:---:|:---|
| parallel-subagent 改造引入回归 | 中 | 高 | 1. 完整单元测试覆盖<br>2. 灰度发布<br>3. 快速回滚机制 |
| N规则执行性能不达标 | 低 | 中 | 1. 执行计划缓存<br>2. 异步批量处理<br>3. 超时控制 |
| 与现有系统冲突 | 中 | 高 | 1. 渐进式集成<br>2. 开关控制<br>3. 独立部署 |
| 规则配置格式不兼容 | 低 | 中 | 1. 适配层设计<br>2. 配置验证<br>3. 自动迁移工具 |

---

## 8. 总结

LEP（Local Execution Protocol）韧性执行中心是一个**基于现有架构、整合分散能力、声明式规则驱动**的韧性任务执行引擎。

### 核心设计决策

1. **不重复造轮子** - 复用 parallel-subagent 成熟的重试/熔断/连接池实现
2. **统一入口** - 所有韧性任务通过 `LEP.execute()` 执行，形成单一真相来源
3. **声明式规则** - N016/N017/N018 作为ISC规则声明，LEP提供执行引擎
4. **深度集成** - 与ISC-本地任务编排、CRAS、流水线形成闭环，而非独立运行
5. **可观测性** - WAL + 指标 + 追踪三位一体的可观测体系

### 预期收益

| 指标 | 当前 | 目标 | 提升 |
|:---|:---|:---|:---:|
| 韧性任务执行入口数 | 5+ | 1 | -80% |
| N规则执行代码覆盖率 | 0% | 100% | ∞ |
| 失败恢复触发一致性 | 不一致 | 统一 | - |
| 全局韧性可观测性 | 无 | 完整看板 | - |
| 人工干预频率 | 高 | 低 | -60% |

---

**文档版本**: v1.0.0  
**最后更新**: 2026-02-26  
**状态**: 设计完成，等待实施
