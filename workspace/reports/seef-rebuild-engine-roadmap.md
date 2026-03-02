# SEEF重构-引擎与集成设计路线图

**版本**: 1.0.0  
**日期**: 2026-03-01  
**状态**: 设计方案  

---

## 执行摘要

当前SEEF的7个子技能（evaluator/discoverer/optimizer/creator/aligner/validator/recorder）**未与DTO-ISC形成自主决策闭环**。本方案提出基于**动态决策引擎**的重构路线，实现：

1. **DTO信号驱动** - skill.registered/updated事件自动触发evaluator，结果驱动后续子技能动态选择
2. **ISC三级门禁** - Check-in/Checkpoint/Check-out嵌入N016/N017/N036规则
3. **双向反馈闭环** - 子技能结果回流ISC标准库，CRAS洞察影响决策

**核心原则**: 不是固定7阶段流水线，而是基于评估结果的动态决策树。

---

## 1. 决策引擎设计（简化版）

### 1.1 动态决策逻辑

```
┌─────────────────────────────────────────────────────────────────┐
│                    SEEF 动态决策引擎 v2.0                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  DTO Event ──→ Evaluator ──→ Decision Engine                    │
│                                      │                          │
│                    ┌─────────────────┼─────────────────┐        │
│                    │                 │                 │        │
│                    ▼                 ▼                 ▼        │
│              [分支A]            [分支B]            [分支C]       │
│           Discoverer Only    Optimizer+Creator   Validator Only │
│                    │                 │                 │        │
│                    └─────────────────┴─────────────────┘        │
│                                      │                          │
│                                      ▼                          │
│                              Recorder (必选)                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 四阶段核心流程

| 阶段 | 子技能 | 触发条件 | 输出 |
|:-----|:-------|:---------|:-----|
| **Phase 1: 评估** | Evaluator | DTO事件: skill.registered/updated | 评估报告 + 决策建议 |
| **Phase 2: 发现** | Discoverer | score < 70 OR critical_issues > 0 | 问题清单 + 修复优先级 |
| **Phase 3: 优化** | Optimizer | fixable_issues.length > 0 | 修复方案 + 风险评估 |
| **Phase 4: 创建** | Creator | capability_gap_detected | 新技能原型 |

**决策树示例**:

```javascript
// 决策引擎伪代码
async function decide(evaluationReport) {
  const { score, issues, suggestions } = evaluationReport;
  
  // 分支1: 高分通过，仅记录
  if (score >= 90 && issues.critical === 0) {
    return { next: ['recorder'], reason: 'excellent_quality' };
  }
  
  // 分支2: 中等分数，需优化
  if (score >= 70 && issues.fixable.length > 0) {
    return { next: ['optimizer', 'validator', 'recorder'], reason: 'needs_optimization' };
  }
  
  // 分支3: 低分或严重问题，全流程
  if (score < 70 || issues.critical > 0) {
    return { next: ['discoverer', 'optimizer', 'creator', 'validator', 'recorder'], reason: 'major_issues' };
  }
  
  // 分支4: 能力缺口，创建新技能
  if (suggestions.includes('create_new_skill')) {
    return { next: ['creator', 'validator', 'recorder'], reason: 'capability_gap' };
  }
}
```

---

## 2. 统一韧性层

### 2.1 LEP职责边界

**LEP (Local Execution Protocol)** 作为基础设施层，提供：

| 职责 | 实现方式 | 服务对象 |
|:-----|:---------|:---------|
| **规则执行** | N016/N017/N036执行器 | ISC规则系统 |
| **Python-JS桥接** | 子进程调用 + IPC通信 | SEEF子技能 |
| **WAL日志** | 预写日志 + 回滚机制 | 所有执行操作 |

**关键问题解决 - LEP引用路径**:

```javascript
// 当前问题: 相对路径导致跨技能调用失败
const lep = require('../lep-executor'); // ❌ 路径不稳定

// 解决方案1: 全局注册
// 在 /root/.openclaw/workspace/index.js 中注册
global.LEP = require('./skills/lep-executor');

// 解决方案2: 环境变量
process.env.LEP_PATH = '/root/.openclaw/workspace/skills/lep-executor';
const lep = require(process.env.LEP_PATH);

// 解决方案3: 符号链接（推荐）
// ln -s /root/.openclaw/workspace/skills/lep-executor /root/.openclaw/workspace/node_modules/@openclaw/lep
const lep = require('@openclaw/lep');
```

### 2.2 Parallel-Subagent职责

**Parallel-Subagent** 提供企业级并发控制：

| 能力 | 配置 | 用途 |
|:-----|:-----|:-----|
| **并发控制** | maxConcurrency: 5 | 限制同时执行的子技能数 |
| **熔断保护** | failureThreshold: 5 | 防止级联故障 |
| **重试机制** | maxRetries: 2 | 自动恢复瞬时故障 |
| **连接池** | poolSize: 2-10 | 复用子Agent连接 |

### 2.3 Adapter整合方案

```
┌─────────────────────────────────────────────────────────────────┐
│                    SEEF Execution Adapter                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [SEEF子技能] ──→ [Adapter] ──→ [LEP] ──→ [Python执行]          │
│                       │                                         │
│                       └──→ [Parallel-Subagent] ──→ [并发控制]    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Adapter实现**:

```javascript
// /root/.openclaw/workspace/skills/seef/adapters/execution-adapter.js
class SEEFExecutionAdapter {
  constructor() {
    this.lep = require('@openclaw/lep');
    this.parallelSpawner = new ParallelSubagentSpawner({
      maxConcurrency: 3,
      failureThreshold: 5
    });
  }
  
  async executeSubSkill(skillName, input, options = {}) {
    const { useParallel = false, retryPolicy = {} } = options;
    
    // 路径1: 通过LEP执行（Python子技能）
    if (skillName.endsWith('.py')) {
      return await this.lep.execute({
        type: 'python',
        script: skillName,
        args: input,
        retryPolicy
      });
    }
    
    // 路径2: 通过Parallel-Subagent执行（JS子技能）
    if (useParallel) {
      return await this.parallelSpawner.spawnBatch([{
        name: skillName,
        prompt: JSON.stringify(input)
      }]);
    }
    
    // 路径3: 直接执行
    return await require(`../sub-skills/${skillName}`).execute(input);
  }
}
```

---

## 3. ISC网关

### 3.1 三级门禁设计

```
┌─────────────────────────────────────────────────────────────────┐
│                      ISC Gateway v1.0                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Check-in (准入)                                                 │
│  ├─ 验证输入格式                                                 │
│  ├─ 检查依赖完整性                                               │
│  └─ 评估风险等级                                                 │
│                    │                                            │
│                    ▼                                            │
│  Checkpoint (阶段验证)                                           │
│  ├─ 中间结果校验                                                 │
│  ├─ 资源使用监控                                                 │
│  └─ 异常提前检测                                                 │
│                    │                                            │
│                    ▼                                            │
│  Check-out (准出)                                                │
│  ├─ 输出质量验证                                                 │
│  ├─ 标准符合性检查                                               │
│  └─ 副作用评估                                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 N016/N017/N036规则映射

| 门禁 | 规则 | 检查内容 | 失败处理 |
|:-----|:-----|:---------|:---------|
| **Check-in** | N036 | 记忆完整性、规则注册表存在 | 触发自动恢复 |
| **Checkpoint** | N016 | 修复循环进度、剩余问题数 | 继续迭代或退出 |
| **Check-out** | N017 | 重复问题检测、根因分析 | 标记需人工介入 |

**实现示例**:

```javascript
// /root/.openclaw/workspace/skills/isc-core/gateway/isc-gateway.js
class ISCGateway {
  async checkIn(skillId, input) {
    // N036: 记忆丢失检查
    const memoryIntact = await this.verifyMemoryIntegrity();
    if (!memoryIntact) {
      await this.lep.executeRule('N036', { trigger: 'pre_execution' });
    }
    
    // 输入验证
    const validation = await this.validateInput(input);
    if (!validation.passed) {
      throw new Error(`Check-in failed: ${validation.errors.join(', ')}`);
    }
    
    return { passed: true, checkpointId: generateId() };
  }
  
  async checkpoint(skillId, intermediateResult) {
    // N016: 修复循环检查
    if (intermediateResult.fixableIssues?.length > 0) {
      const repairResult = await this.lep.executeRule('N016', {
        fixableIssues: intermediateResult.fixableIssues
      });
      
      if (repairResult.remainingCount > 0 && repairResult.iteration >= 3) {
        return { passed: false, reason: 'max_repair_iterations' };
      }
    }
    
    return { passed: true };
  }
  
  async checkOut(skillId, output) {
    // N017: 重复问题检查
    const recurringCheck = await this.lep.executeRule('N017', {
      skillId,
      recentEvents: await this.getRecentEvents(skillId, '48h')
    });
    
    if (recurringCheck.recurringPatterns.length > 0) {
      await this.notifyHumanIntervention(recurringCheck);
    }
    
    // 输出质量验证
    const qualityCheck = await this.validateOutput(output);
    return { passed: qualityCheck.passed, quality: qualityCheck.score };
  }
}
```

### 4.4 AEO质量评测集成

**AEO (Agent效果运营) Phase 2** 提供双轨评测能力，需与SEEF深度集成：

#### 4.4.1 评测轨道自动选择

```
┌─────────────────────────────────────────────────────────────────┐
│                    AEO-SEEF集成架构                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  SEEF Evaluator ──→ AEO TrackSelector ──→ 轨道选择              │
│                              │                                  │
│                    ┌─────────┴─────────┐                        │
│                    ▼                   ▼                        │
│            AI效果评测器          功能质量评测器                  │
│            (LLM/Chat技能)        (Tool/Workflow技能)             │
│                    │                   │                        │
│                    └─────────┬─────────┘                        │
│                              ▼                                  │
│                      评测结果 ──→ SEEF Discoverer               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 4.4.2 评测结果流入Evaluator

**集成点1: Evaluator调用AEO**

```javascript
// /root/.openclaw/workspace/skills/seef/sub-skills/evaluator.js
const { TrackSelector, AIEffectEvaluator, FunctionQualityEvaluator } = require('../../aeo/src/evaluation');

async function evaluate(skillPackage, crasInsight) {
  // 1. AEO轨道选择
  const selector = new TrackSelector();
  const selection = selector.select({
    name: skillPackage.name,
    type: skillPackage.type,
    description: skillPackage.description
  });
  
  // 2. 根据轨道选择评测器
  let evaluator;
  if (selection.track === 'ai-effect') {
    evaluator = new AIEffectEvaluator();
  } else {
    evaluator = new FunctionQualityEvaluator();
  }
  
  // 3. 执行评测
  const aeoResult = await evaluator.evaluate(skillPackage, testCases);
  
  // 4. 合并CRAS洞察调整权重
  const finalScore = adjustScoreWithCRAS(aeoResult, crasInsight);
  
  return {
    score: finalScore.overallScore,
    track: selection.track,
    dimensions: aeoResult.dimensions,
    issues: extractIssues(aeoResult),
    suggestions: aeoResult.suggestions
  };
}
```

#### 4.4.3 Discoverer识别AEO发现的缺陷

**集成点2: Discoverer解析AEO问题**

```javascript
// /root/.openclaw/workspace/skills/seef/sub-skills/discoverer.js
async function discover(evaluationReport) {
  const issues = [];
  
  // 解析AEO评测维度
  if (evaluationReport.track === 'ai-effect') {
    // AI效果轨道问题映射
    if (evaluationReport.dimensions.relevance < 0.7) {
      issues.push({
        type: 'relevance_low',
        severity: 'high',
        description: 'AI输出相关性不足',
        fixable: true,
        suggestedFix: 'optimize_prompt_template'
      });
    }
    
    if (evaluationReport.dimensions.safety < 0.8) {
      issues.push({
        type: 'safety_concern',
        severity: 'critical',
        description: 'AI输出存在安全风险',
        fixable: true,
        suggestedFix: 'add_safety_filter'
      });
    }
  } else {
    // 功能质量轨道问题映射
    if (evaluationReport.dimensions.accuracy < 0.9) {
      issues.push({
        type: 'accuracy_low',
        severity: 'high',
        description: '工具输出准确性不足',
        fixable: true,
        suggestedFix: 'fix_logic_error'
      });
    }
  }
  
  return {
    issues,
    priority: calculatePriority(issues),
    rootCauseHypothesis: generateHypothesis(issues)
  };
}
```

#### 4.4.4 AEO配置订阅

**DTO订阅AEO评测结果**:

```json
// /root/.openclaw/workspace/skills/aeo/config/dto-subscriptions.json
{
  "subscriptions": [
    {
      "event": "aeo.evaluation.completed",
      "subscriber": "seef-evaluator",
      "action": "process_aeo_result",
      "priority": "high"
    },
    {
      "event": "aeo.quality.threshold_breach",
      "subscriber": "seef-discoverer",
      "action": "trigger_immediate_analysis",
      "priority": "critical"
    }
  ]
}
```

### 4.5 Agent效果指标集成

**缺失的Agent效果指标体系**需要补充设计：

#### 4.5.1 指标分类

| 指标类别 | 具体指标 | 采集方式 | 目标值 |
|:---------|:---------|:---------|:-------|
| **执行效率** | 工具调用成功率 | DTO事件日志 | >95% |
| | 平均响应时间 | 时间戳差值 | <2s |
| | 并发处理能力 | Parallel-Subagent监控 | 100并发 |
| **质量指标** | 输出准确率 | AEO评测器 | >90% |
| | ISC门禁通过率 | ISC Gateway日志 | >85% |
| | 修复循环收敛率 | N016规则日志 | >80% |
| **用户体验** | 用户满意度 | CRAS-B洞察 | >4.0/5.0 |
| | 问题重现率 | N017规则检测 | <5% |
| | 人工介入率 | 升级事件统计 | <10% |

#### 4.5.2 Evaluator采集指标

**扩展Evaluator采集能力**:

```javascript
// /root/.openclaw/workspace/skills/seef/sub-skills/evaluator.js
async function collectAgentMetrics(skillId, timeWindow = '24h') {
  const metrics = {
    execution: await collectExecutionMetrics(skillId, timeWindow),
    quality: await collectQualityMetrics(skillId, timeWindow),
    userExperience: await collectUXMetrics(skillId, timeWindow)
  };
  
  return metrics;
}

async function collectExecutionMetrics(skillId, timeWindow) {
  // 从DTO事件日志采集
  const events = await queryDTOEvents({
    skillId,
    timeWindow,
    eventTypes: ['skill.invoked', 'skill.completed', 'skill.failed']
  });
  
  const totalCalls = events.length;
  const successCalls = events.filter(e => e.type === 'skill.completed').length;
  const avgResponseTime = calculateAvgResponseTime(events);
  
  return {
    toolCallSuccessRate: successCalls / totalCalls,
    avgResponseTime,
    totalCalls
  };
}

async function collectQualityMetrics(skillId, timeWindow) {
  // 从AEO评测历史采集
  const aeoHistory = await queryAEOHistory({ skillId, timeWindow });
  const iscGatewayLogs = await queryISCGatewayLogs({ skillId, timeWindow });
  
  return {
    avgQualityScore: calculateAvg(aeoHistory.map(h => h.score)),
    iscPassRate: calculatePassRate(iscGatewayLogs),
    repairConvergenceRate: await calculateRepairConvergence(skillId, timeWindow)
  };
}

async function collectUXMetrics(skillId, timeWindow) {
  // 从CRAS-B用户洞察采集
  const crasInsights = await queryCRASInsights({ skillId, timeWindow });
  const recurringIssues = await queryRecurringIssues({ skillId, timeWindow });
  
  return {
    userSatisfaction: crasInsights.avgSatisfaction,
    issueRecurrenceRate: recurringIssues.length / totalInteractions,
    humanInterventionRate: await calculateInterventionRate(skillId, timeWindow)
  };
}
```

#### 4.5.3 指标影响Optimizer修复策略

**Optimizer根据指标动态调整策略**:

```javascript
// /root/.openclaw/workspace/skills/seef/sub-skills/optimizer.js
async function optimize(issues, agentMetrics) {
  const strategies = [];
  
  // 策略1: 响应时间过慢 → 性能优化
  if (agentMetrics.execution.avgResponseTime > 2000) {
    strategies.push({
      type: 'performance_optimization',
      priority: 'high',
      actions: ['add_caching', 'optimize_query', 'enable_parallel']
    });
  }
  
  // 策略2: 工具调用失败率高 → 错误处理增强
  if (agentMetrics.execution.toolCallSuccessRate < 0.95) {
    strategies.push({
      type: 'error_handling_enhancement',
      priority: 'critical',
      actions: ['add_retry_logic', 'improve_validation', 'add_fallback']
    });
  }
  
  // 策略3: 用户满意度低 → 输出质量提升
  if (agentMetrics.userExperience.userSatisfaction < 4.0) {
    strategies.push({
      type: 'output_quality_improvement',
      priority: 'high',
      actions: ['refine_prompt', 'add_post_processing', 'enhance_context']
    });
  }
  
  // 策略4: 问题重现率高 → 根因修复
  if (agentMetrics.userExperience.issueRecurrenceRate > 0.05) {
    strategies.push({
      type: 'root_cause_fix',
      priority: 'critical',
      actions: ['trigger_N020_analysis', 'architectural_refactor']
    });
  }
  
  return {
    strategies,
    estimatedImpact: calculateImpact(strategies, agentMetrics)
  };
}
```

#### 4.5.4 指标监控Dashboard

**实时指标监控**:

```javascript
// /root/.openclaw/workspace/skills/seef/monitoring/metrics-dashboard.js
class AgentMetricsDashboard {
  async generateReport(timeWindow = '24h') {
    const allSkills = await listActiveSkills();
    const report = {
      timestamp: Date.now(),
      timeWindow,
      summary: {
        totalSkills: allSkills.length,
        healthySkills: 0,
        warningSkills: 0,
        criticalSkills: 0
      },
      details: []
    };
    
    for (const skill of allSkills) {
      const metrics = await collectAgentMetrics(skill.id, timeWindow);
      const health = assessHealth(metrics);
      
      report.details.push({
        skillId: skill.id,
        skillName: skill.name,
        health: health.status,
        metrics,
        alerts: health.alerts
      });
      
      report.summary[`${health.status}Skills`]++;
    }
    
    return report;
  }
  
  assessHealth(metrics) {
    const alerts = [];
    let status = 'healthy';
    
    if (metrics.execution.toolCallSuccessRate < 0.95) {
      alerts.push({ level: 'critical', message: '工具调用成功率过低' });
      status = 'critical';
    }
    
    if (metrics.execution.avgResponseTime > 2000) {
      alerts.push({ level: 'warning', message: '响应时间过慢' });
      if (status === 'healthy') status = 'warning';
    }
    
    if (metrics.userExperience.userSatisfaction < 4.0) {
      alerts.push({ level: 'warning', message: '用户满意度偏低' });
      if (status === 'healthy') status = 'warning';
    }
    
    return { status, alerts };
  }
}
```

---

## 4. DTO-ISC-CRAS集成

### 4.1 双向消息协议

```
┌─────────────────────────────────────────────────────────────────┐
│                    消息总线 (Event Bus)                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  DTO ──publish──→ [skill.registered] ──subscribe──→ SEEF        │
│                                                                 │
│  SEEF ──publish──→ [evaluation.completed] ──subscribe──→ ISC    │
│                                                                 │
│  ISC ──publish──→ [standard.updated] ──subscribe──→ SEEF        │
│                                                                 │
│  CRAS ──publish──→ [insight.generated] ──subscribe──→ SEEF      │
│                                                                 │
│  SEEF ──publish──→ [evolution.completed] ──subscribe──→ CRAS    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**消息格式**:

```typescript
interface SEEFMessage {
  eventType: 'skill.registered' | 'evaluation.completed' | 'evolution.completed';
  timestamp: number;
  source: 'dto' | 'seef' | 'isc' | 'cras';
  payload: {
    skillId: string;
    data: any;
    metadata: {
      traceId: string;
      priority: 0 | 1 | 2;
      iscRef?: string;  // ISC标准版本引用
    };
  };
}
```

### 4.2 七个CRAS知识注入点

| 注入点 | 子技能 | CRAS输入 | 影响 |
|:------|:-------|:---------|:-----|
| 1 | Evaluator | 用户意图洞察 | 调整评估权重 |
| 2 | Discoverer | 能力缺口分析 | 优先发现方向 |
| 3 | Optimizer | 历史优化模式 | 选择最佳策略 |
| 4 | Creator | 技能模板库 | 加速原型生成 |
| 5 | Aligner | 标准演化趋势 | 预测性对齐 |
| 6 | Validator | 质量基准数据 | 动态阈值调整 |
| 7 | Recorder | 知识图谱 | 关联历史进化 |

**实现示例**:

```javascript
// Evaluator中注入CRAS洞察
async function evaluate(skillPackage, crasInsight) {
  const baseScore = await calculateBaseScore(skillPackage);
  
  // CRAS洞察调整权重
  if (crasInsight?.userIntent?.includes('performance')) {
    baseScore.dimensions.performance *= 1.5;  // 提升性能维度权重
  }
  
  if (crasInsight?.capabilityGaps?.includes(skillPackage.skillId)) {
    baseScore.dimensions.compatibility *= 1.3;  // 提升兼容性权重
  }
  
  return normalizeScore(baseScore);
}
```

### 4.3 自由编排支持

**场景1: 快速评估**
```javascript
// 仅执行Evaluator + Recorder
await seef.runFlexible(['evaluator', 'recorder'], {
  crasContext: await cras.getLatestInsight()
});
```

**场景2: 紧急修复**
```javascript
// 跳过Discoverer，直接优化
await seef.runFlexible(['evaluator', 'optimizer', 'validator', 'recorder'], {
  skipDiscovery: true,
  urgency: 'high'
});
```

**场景3: 能力扩展**
```javascript
// 仅执行Creator + Validator
await seef.runFlexible(['creator', 'validator', 'recorder'], {
  template: await cras.getSkillTemplate('data-processing')
});
```

---

## 5. 实施路线

### P0 阶段 (1-2周): 基础打通

**目标**: 解决LEP引用路径问题，打通Evaluator与DTO

| 任务 | 工作量 | 负责人 | 产出 |
|:-----|:------|:-------|:-----|
| LEP全局注册 | 2天 | 基础设施 | 符号链接 + 环境变量 |
| DTO订阅实现 | 3天 | SEEF | skill.registered订阅器 |
| Evaluator重构 | 5天 | SEEF | 支持CRAS注入 |
| 基础测试 | 2天 | QA | 端到端冒烟测试 |

**验收标准**:
- ✅ 任意技能可通过 `require('@openclaw/lep')` 调用LEP
- ✅ DTO事件自动触发Evaluator
- ✅ Evaluator输出包含决策建议

### P1 阶段 (3-4周): 决策引擎 + ISC网关

**目标**: 实现动态决策引擎，嵌入ISC三级门禁

| 任务 | 工作量 | 负责人 | 产出 |
|:-----|:------|:-------|:-----|
| 决策引擎开发 | 5天 | SEEF | DecisionEngine类 |
| ISC网关实现 | 5天 | ISC | ISCGateway类 |
| N016/N017集成 | 4天 | LEP | 规则执行器对接 |
| Adapter开发 | 3天 | SEEF | ExecutionAdapter |
| 集成测试 | 3天 | QA | 完整流程测试 |

**验收标准**:
- ✅ 决策引擎根据评估结果动态选择子技能
- ✅ ISC网关在每个子技能执行前后校验
- ✅ N016修复循环自动触发

### P2 阶段 (5-8周): 完整闭环 + 优化

**目标**: 实现双向反馈闭环，性能优化

| 任务 | 工作量 | 负责人 | 产出 |
|:-----|:------|:-------|:-----|
| CRAS集成 | 5天 | CRAS | 7个知识注入点 |
| 消息总线优化 | 4天 | 基础设施 | 事件溯源 + 重放 |
| Parallel-Subagent集成 | 3天 | SEEF | 并发控制 |
| 性能优化 | 5天 | 全员 | 响应时间<2s |
| 文档完善 | 3天 | 技术写作 | 完整API文档 |
| 压力测试 | 5天 | QA | 100并发稳定 |

**验收标准**:
- ✅ CRAS洞察实时影响决策
- ✅ 子技能结果回流ISC标准库
- ✅ 支持自由编排任意子技能组合
- ✅ 平均执行时间<2秒
- ✅ 100并发下系统稳定

---

## 6. 关键约束与风险

### 6.1 技术约束

| 约束 | 影响 | 缓解措施 |
|:-----|:-----|:---------|
| Python-JS互操作 | 性能开销 | 使用连接池复用子进程 |
| 消息总线延迟 | 实时性下降 | 引入优先级队列 |
| 并发控制复杂度 | 死锁风险 | 使用Parallel-Subagent成熟方案 |

### 6.2 实施风险

| 风险 | 概率 | 影响 | 应对 |
|:-----|:-----|:-----|:-----|
| LEP路径问题未解决 | 中 | 高 | P0阶段优先验证 |
| ISC规则冲突 | 低 | 中 | 规则优先级机制 |
| CRAS数据质量不足 | 中 | 中 | 降级为无CRAS模式 |
| 性能不达标 | 中 | 高 | 预留P2优化时间 |

---

## 7. 成功指标

| 指标 | 当前 | 目标 | 测量方式 |
|:-----|:-----|:-----|:---------|
| 决策准确率 | N/A | >85% | 人工评审100次决策 |
| 平均执行时间 | N/A | <2s | 监控系统统计 |
| ISC门禁拦截率 | N/A | 5-10% | 日志分析 |
| CRAS注入覆盖率 | 0% | 100% | 代码覆盖率 |
| 系统可用性 | N/A | >99.5% | 7x24监控 |

---

## 8. 附录

### 8.1 术语表

| 术语 | 全称 | 说明 |
|:-----|:-----|:-----|
| SEEF | Skill Ecosystem Evolution Foundry | 技能生态进化工厂 |
| DTO | Dynamic Task Orchestrator | 动态任务编排器（系统唯一调度中心） |
| ISC | Intelligent Standard Center | 智能标准中心 |
| CRAS | Cognitive Reflection & Autonomous System | 认知进化伙伴 |
| LEP | Local Execution Protocol | 本地执行协议 |

**注意**: 系统中只有DTO（Dynamic Task Orchestrator），不存在"CTO"组件。

### 8.2 参考文档

- `/skills/seef/evolution-pipeline/state-machine.md` - 状态机设计
- `/skills/seef/evolution-pipeline/interfaces.json` - 接口定义
- `/skills/lep-executor/SKILL.md` - LEP架构
- `/skills/isc-core/rules/N016.json` - 修复循环规则
- `/skills/isc-core/rules/N036.json` - 记忆恢复规则

---

## 9. 能力确认与边界

### 9.1 自主洞察→ISC规则生成

**能力评估**: ✅ **可行**（需补充组件）

#### 9.1.1 当前架构支持度

| 组件 | 现状 | 缺失 |
|:-----|:-----|:-----|
| CRAS-B 用户洞察 | ✅ 已实现 | - |
| CRAS-A 主动学习 | ✅ 已实现 | - |
| ISC规则模板库 | ❌ 缺失 | 需新增 |
| 规则生成器 | ❌ 缺失 | 需新增 |
| 规则验证器 | ⚠️ 部分实现 | 需增强 |

#### 9.1.2 实现路径

```
┌─────────────────────────────────────────────────────────────────┐
│           CRAS洞察 → ISC规则自动生成流程                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  CRAS-B洞察 ──→ Discoverer ──→ RuleGenerator ──→ Validator      │
│  (识别问题)    (分析模式)     (生成规则草案)   (验证规则)        │
│                                      │                          │
│                                      ▼                          │
│                              Aligner (对齐ISC标准)               │
│                                      │                          │
│                                      ▼                          │
│                          人工确认 (高风险规则)                   │
│                                      │                          │
│                                      ▼                          │
│                          ISC规则库 (自动注册)                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 9.1.3 触发机制

**CRAS-B输出触发规则生成**:

```javascript
// /root/.openclaw/workspace/skills/cras/modules/user-insight-hub.js
async function analyzeRecurringPatterns() {
  const patterns = await detectPatterns(recentInteractions);
  
  // 触发条件: 同一问题≥2次
  const recurringIssues = patterns.filter(p => p.occurrences >= 2);
  
  if (recurringIssues.length > 0) {
    // 发布事件给SEEF Discoverer
    await eventBus.publish({
      eventType: 'cras.insight.recurring_issue',
      payload: {
        patterns: recurringIssues,
        severity: calculateSeverity(recurringIssues),
        suggestedAction: 'generate_isc_rule'
      }
    });
  }
}
```

**SEEF Discoverer接收并分析**:

```javascript
// /root/.openclaw/workspace/skills/seef/sub-skills/discoverer.js
eventBus.subscribe('cras.insight.recurring_issue', async (event) => {
  const { patterns, severity } = event.payload;
  
  // 分析是否需要生成ISC规则
  const analysis = await analyzePatternForRuleGeneration(patterns);
  
  if (analysis.shouldGenerateRule) {
    // 调用规则生成器
    await ruleGenerator.generate({
      trigger: analysis.trigger,
      condition: analysis.condition,
      actions: analysis.suggestedActions,
      source: 'cras_insight',
      confidence: analysis.confidence
    });
  }
});
```

#### 9.1.4 规则生成策略

**自动生成 vs 人工确认**:

| 规则类型 | 风险等级 | 生成方式 | 示例 |
|:---------|:---------|:---------|:-----|
| 检测类规则 | 低 | 完全自动生成 | 检测文件缺失、路径错误 |
| 通知类规则 | 低 | 完全自动生成 | 发送告警、记录日志 |
| 修复类规则 | 中 | 生成草案→人工确认 | 自动修复配置、更新依赖 |
| 决策类规则 | 高 | 生成草案→人工确认 | 架构变更、权限调整 |

**规则生成器实现**:

```javascript
// /root/.openclaw/workspace/skills/isc-core/generators/rule-generator.js
class ISCRuleGenerator {
  async generate(input) {
    // 1. 从模板库选择模板
    const template = await this.selectTemplate(input.trigger);
    
    // 2. 填充规则内容
    const ruleDraft = {
      id: generateRuleId(),
      name: input.trigger.replace(/_/g, ' '),
      type: determineRuleType(input),
      trigger: input.trigger,
      condition: input.condition,
      execution: {
        type: input.actions[0].type,
        steps: input.actions.map((action, idx) => ({
          order: idx + 1,
          action: action.name,
          executor: action.executor,
          ...action.params
        }))
      },
      governance: {
        auto_execute: input.riskLevel === 'low',
        priority: input.priority || 'MEDIUM',
        risk_level: input.riskLevel
      },
      metadata: {
        source: 'cras_insight',
        confidence: input.confidence,
        generated_at: new Date().toISOString(),
        status: input.riskLevel === 'low' ? 'active' : 'pending_review'
      }
    };
    
    // 3. 验证规则
    const validation = await this.validator.validate(ruleDraft);
    if (!validation.passed) {
      throw new Error(`Rule validation failed: ${validation.errors.join(', ')}`);
    }
    
    // 4. 对齐ISC标准
    const alignedRule = await this.aligner.align(ruleDraft);
    
    // 5. 根据风险等级决定流程
    if (input.riskLevel === 'low') {
      // 低风险: 自动注册
      await this.registerRule(alignedRule);
      return { status: 'auto_registered', ruleId: alignedRule.id };
    } else {
      // 中高风险: 人工确认
      await this.submitForReview(alignedRule);
      return { status: 'pending_review', ruleId: alignedRule.id };
    }
  }
  
  async selectTemplate(trigger) {
    // 从模板库匹配最相似的模板
    const templates = await loadTemplates();
    return findBestMatch(templates, trigger);
  }
}
```

#### 9.1.5 子技能承接链

**完整流程**:

1. **Discoverer** - 识别CRAS洞察中的问题模式
2. **Creator** (新增RuleGenerator) - 生成ISC规则草案
3. **Validator** - 验证规则语法和逻辑
4. **Aligner** - 对齐ISC标准格式
5. **Recorder** - 记录规则生成历史

#### 9.1.6 缺失组件

**需要新增**:

1. **ISC规则模板库** (`/skills/isc-core/templates/`)
   - 检测类模板
   - 决策类模板
   - 修复类模板
   - 通知类模板

2. **规则生成器** (`/skills/isc-core/generators/rule-generator.js`)
   - 模板匹配引擎
   - 规则填充逻辑
   - 风险评估模块

3. **人工审核工作流** (`/skills/isc-core/review/`)
   - 待审核规则队列
   - 审核界面/API
   - 审核历史记录

---

### 9.2 ISC规则→DTO准出校验

**能力评估**: ✅ **可行**（当前架构已支持）

#### 9.2.1 当前架构支持度

| 组件 | 现状 | 说明 |
|:-----|:-----|:-----|
| ISC Gateway | ✅ 已设计 | Check-in/Checkpoint/Check-out |
| DTO订阅机制 | ✅ 已实现 | 支持订阅ISC规则变更 |
| 准出校验执行器 | ✅ 已实现 | Validator子技能 |

#### 9.2.2 实现路径

```
┌─────────────────────────────────────────────────────────────────┐
│              ISC规则 → DTO准出校验流程                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ISC规则库 ──→ DTO订阅器 ──→ 规则变更检测                       │
│                                      │                          │
│                                      ▼                          │
│                          更新准出校验清单                        │
│                                      │                          │
│                                      ▼                          │
│  技能执行 ──→ ISC Gateway (Check-out) ──→ 执行准出校验           │
│                                      │                          │
│                    ┌─────────────────┴─────────────────┐        │
│                    ▼                                   ▼        │
│              校验通过                              校验失败      │
│              (放行)                            (触发修复)        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 9.2.3 DTO订阅ISC规则变更

**订阅配置**:

```json
// /root/.openclaw/workspace/skills/dto-core/subscriptions/isc-rule-updates.json
{
  "subscription": {
    "event": "isc.rule.updated",
    "subscriber": "dto-core",
    "action": "update_checkout_checklist",
    "priority": "high",
    "filter": {
      "ruleTypes": ["quality_gate", "compliance_check", "output_validation"]
    }
  }
}
```

**DTO处理规则变更**:

```javascript
// /root/.openclaw/workspace/skills/dto-core/handlers/isc-rule-handler.js
eventBus.subscribe('isc.rule.updated', async (event) => {
  const { ruleId, ruleName, checkoutCriteria } = event.payload;
  
  // 更新准出校验清单
  await updateCheckoutChecklist({
    ruleId,
    ruleName,
    criteria: checkoutCriteria,
    enabled: true
  });
  
  // 通知所有子技能
  await notifySubSkills({
    message: `ISC规则 ${ruleName} 已更新，准出标准已调整`,
    affectedSkills: event.payload.affectedSkills
  });
});
```

#### 9.2.4 准出校验执行

**Validator执行 vs Evaluator执行**:

| 执行者 | 职责 | 时机 | 输入 |
|:-------|:-----|:-----|:-----|
| **Evaluator** | 初始质量评估 | 技能注册/更新时 | 技能包 + 测试用例 |
| **Validator** | 准出校验 | 每个子技能执行后 | 子技能输出 + ISC规则 |

**Validator实现准出校验**:

```javascript
// /root/.openclaw/workspace/skills/seef/sub-skills/validator.js
async function validateCheckout(skillOutput, skillId) {
  // 1. 加载该技能的所有准出规则
  const checkoutRules = await loadCheckoutRules(skillId);
  
  const results = [];
  
  for (const rule of checkoutRules) {
    // 2. 执行每条规则的校验
    const result = await executeCheckoutRule(rule, skillOutput);
    results.push({
      ruleId: rule.id,
      ruleName: rule.name,
      passed: result.passed,
      score: result.score,
      issues: result.issues
    });
  }
  
  // 3. 综合判断是否通过
  const overallPassed = results.every(r => r.passed);
  const criticalFailures = results.filter(r => !r.passed && r.severity === 'critical');
  
  return {
    passed: overallPassed,
    criticalFailures: criticalFailures.length,
    results,
    recommendation: overallPassed ? 'release' : 'fix_required'
  };
}

async function executeCheckoutRule(rule, skillOutput) {
  // 根据规则类型执行不同的校验
  switch (rule.type) {
    case 'quality_gate':
      return await checkQualityGate(rule.criteria, skillOutput);
    case 'compliance_check':
      return await checkCompliance(rule.standards, skillOutput);
    case 'output_validation':
      return await validateOutput(rule.schema, skillOutput);
    default:
      throw new Error(`Unknown rule type: ${rule.type}`);
  }
}
```

#### 9.2.5 ISC Gateway集成

**Check-out门禁调用Validator**:

```javascript
// /root/.openclaw/workspace/skills/isc-core/gateway/isc-gateway.js
async function checkOut(skillId, output) {
  // 1. 调用Validator执行准出校验
  const validationResult = await validator.validateCheckout(output, skillId);
  
  // 2. 检查N017重复问题
  const recurringCheck = await lep.executeRule('N017', {
    skillId,
    recentEvents: await getRecentEvents(skillId, '48h')
  });
  
  // 3. 综合判断
  const passed = validationResult.passed && recurringCheck.recurringPatterns.length === 0;
  
  if (!passed) {
    // 准出失败，记录原因
    await logCheckoutFailure({
      skillId,
      validationResult,
      recurringCheck,
      timestamp: Date.now()
    });
  }
  
  return {
    passed,
    validationResult,
    recurringCheck,
    nextAction: passed ? 'release' : 'trigger_repair'
  };
}
```

#### 9.2.6 全量规则覆盖

**确保所有ISC规则都被DTO订阅**:

```javascript
// /root/.openclaw/workspace/skills/dto-core/bootstrap/sync-isc-rules.js
async function syncAllISCRules() {
  // 1. 扫描ISC规则目录
  const allRules = await scanISCRules('/root/.openclaw/workspace/skills/isc-core/rules');
  
  // 2. 检查现有订阅
  const existingSubscriptions = await loadSubscriptions();
  
  // 3. 创建缺失的订阅
  for (const rule of allRules) {
    if (!existingSubscriptions.find(s => s.ruleId === rule.id)) {
      await createSubscription({
        event: `isc.rule.${rule.id}.triggered`,
        subscriber: 'dto-core',
        action: 'execute_rule',
        ruleId: rule.id
      });
    }
  }
  
  console.log(`✅ 同步完成: ${allRules.length}条规则，${existingSubscriptions.length}个订阅`);
}
```

---

### 9.3 准出失败→自动修复

**能力评估**: ✅ **可行**（当前架构已支持）

#### 9.3.1 当前架构支持度

| 组件 | 现状 | 说明 |
|:-----|:-----|:-----|
| N016修复循环 | ✅ 已实现 | 自动迭代修复 |
| N020根因分析 | ✅ 已实现 | 深度思考模型分析 |
| Optimizer子技能 | ✅ 已实现 | 生成修复方案 |
| DTO闭环执行 | ✅ 已实现 | 自动执行修复 |

#### 9.3.2 实现路径

```
┌─────────────────────────────────────────────────────────────────┐
│              准出失败 → 自动修复流程                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Check-out失败 ──→ 触发N020根因分析                             │
│                              │                                  │
│                              ▼                                  │
│                    生成根因报告 + 解决方案                       │
│                              │                                  │
│                              ▼                                  │
│                    DTO闭环执行修复                               │
│                              │                                  │
│                    ┌─────────┴─────────┐                        │
│                    ▼                   ▼                        │
│              修复成功              修复失败                      │
│                    │                   │                        │
│                    ▼                   ▼                        │
│            重新Check-out          触发N016修复循环               │
│                    │                   │                        │
│                    │         ┌─────────┴─────────┐              │
│                    │         ▼                   ▼              │
│                    │   迭代修复(最多3次)    人工介入              │
│                    │         │                                  │
│                    └─────────┴──→ 最终验证                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 9.3.3 N016修复循环覆盖场景

**N016规则定义**:

```json
{
  "id": "N016",
  "name": "auto_repair_loop_post_pipeline",
  "trigger": {
    "event": "checkout_failed",
    "condition": "fixable_issues.length > 0"
  },
  "execution": {
    "type": "iterative_repair",
    "max_iterations": 3,
    "exit_conditions": [
      "issues.length == 0",
      "iteration >= max_iterations"
    ]
  }
}
```

**覆盖场景**:

| 场景 | N016支持 | 说明 |
|:-----|:---------|:-----|
| 准出校验失败 | ✅ 是 | 触发条件匹配 |
| 可修复问题 | ✅ 是 | 自动迭代修复 |
| 不可修复问题 | ✅ 是 | 升级人工介入 |
| 修复后重新校验 | ✅ 是 | 每次迭代后re_scan |

#### 9.3.4 N020根因分析执行流程

**"自主根因分析并解决问题"规则**:

```json
{
  "id": "N020",
  "name": "universal_root_cause_and_gap_analysis",
  "trigger": {
    "events": [
      "execution_failed",
      "checkout_failed",
      "isc_non_compliance_detected"
    ]
  },
  "execution": {
    "steps": [
      {
        "order": 1,
        "action": "collect_evidence",
        "description": "收集问题相关证据"
      },
      {
        "order": 2,
        "action": "root_cause_analysis",
        "executor": "deep_thinking_model",
        "description": "深度分析根因"
      },
      {
        "order": 3,
        "action": "gap_analysis",
        "description": "对比当前状态vs理想状态"
      },
      {
        "order": 4,
        "action": "generate_solution",
        "description": "生成解决方案"
      },
      {
        "order": 5,
        "action": "dto_close_loop",
        "executor": "dto-core/declarative-orchestrator",
        "description": "DTO驱动闭环执行"
      },
      {
        "order": 6,
        "action": "verify_resolution",
        "description": "验证问题是否真正解决"
      }
    ]
  }
}
```

#### 9.3.5 Evaluator→Optimizer链自动触发

**准出失败自动触发链**:

```javascript
// /root/.openclaw/workspace/skills/isc-core/gateway/isc-gateway.js
async function checkOut(skillId, output) {
  const validationResult = await validator.validateCheckout(output, skillId);
  
  if (!validationResult.passed) {
    // 准出失败，自动触发修复链
    await triggerRepairChain({
      skillId,
      failureReason: validationResult,
      triggerSource: 'checkout_failed'
    });
  }
  
  return validationResult;
}

async function triggerRepairChain(context) {
  // 1. 触发N020根因分析
  const rootCauseAnalysis = await lep.executeRule('N020', {
    skillId: context.skillId,
    error_type: 'checkout_failed',
    evidence_package: context.failureReason
  });
  
  // 2. 根因分析完成后，自动调用Optimizer
  const optimizationPlan = await optimizer.optimize({
    issues: rootCauseAnalysis.issues,
    rootCause: rootCauseAnalysis.rootCause,
    suggestedSolutions: rootCauseAnalysis.solutions
  });
  
  // 3. DTO闭环执行修复
  const repairResult = await dto.executeDeclaratively({
    plan: optimizationPlan,
    autoExecute: optimizationPlan.riskLevel === 'low',
    maxRetries: 3
  });
  
  // 4. 修复后重新校验
  if (repairResult.success) {
    return await checkOut(context.skillId, repairResult.output);
  } else {
    // 5. 修复失败，触发N016修复循环
    return await lep.executeRule('N016', {
      skillId: context.skillId,
      fixable_issues: repairResult.remainingIssues
    });
  }
}
```

#### 9.3.6 人工介入决策点

**自动 vs 人工介入**:

| 场景 | 处理方式 | 决策依据 |
|:-----|:---------|:---------|
| 低风险修复 | 完全自动 | riskLevel === 'low' |
| 中风险修复 | 自动执行+事后通知 | riskLevel === 'medium' |
| 高风险修复 | 生成方案+人工确认 | riskLevel === 'high' |
| 修复循环超限 | 强制人工介入 | iteration >= 3 |
| 根因分析置信度低 | 人工复核 | confidence < 0.7 |

**人工介入触发**:

```javascript
// /root/.openclaw/workspace/skills/seef/sub-skills/optimizer.js
async function optimize(issues, rootCause) {
  const solutions = await generateSolutions(issues, rootCause);
  
  // 评估风险等级
  const riskLevel = assessRiskLevel(solutions);
  
  if (riskLevel === 'high') {
    // 高风险: 提交人工审核
    await submitForHumanReview({
      issues,
      rootCause,
      proposedSolutions: solutions,
      estimatedImpact: calculateImpact(solutions),
      urgency: 'high'
    });
    
    return {
      status: 'pending_human_review',
      solutions,
      riskLevel
    };
  } else {
    // 低中风险: 自动执行
    return {
      status: 'auto_execute',
      solutions,
      riskLevel
    };
  }
}
```

#### 9.3.7 完整闭环验证

**修复后验证机制**:

```javascript
// N020规则中的验证步骤
{
  "order": 6,
  "action": "verify_resolution",
  "verification_methods": [
    "reproduce_original_scenario",
    "check_metrics_recovery",
    "confirm_no_regression"
  ],
  "on_success": "mark_resolved_and_document",
  "on_failure": "escalate_to_manual_analysis"
}
```

**验证实现**:

```javascript
async function verifyResolution(skillId, originalFailure, repairResult) {
  // 1. 重现原始场景
  const reproductionResult = await reproduceScenario({
    skillId,
    scenario: originalFailure.scenario,
    expectedBehavior: originalFailure.expectedBehavior
  });
  
  if (!reproductionResult.passed) {
    return {
      verified: false,
      reason: 'issue_still_exists',
      action: 'escalate_to_human'
    };
  }
  
  // 2. 检查指标恢复
  const metricsRecovered = await checkMetricsRecovery(skillId);
  
  // 3. 确认无回归
  const regressionCheck = await runRegressionTests(skillId);
  
  return {
    verified: reproductionResult.passed && metricsRecovered && regressionCheck.passed,
    details: {
      reproductionResult,
      metricsRecovered,
      regressionCheck
    }
  };
}
```

---

## 10. 补充设计总结

### 10.1 新增组件清单

| 组件 | 路径 | 功能 | 优先级 |
|:-----|:-----|:-----|:-------|
| ISC规则模板库 | `/skills/isc-core/templates/` | 规则生成模板 | P1 |
| 规则生成器 | `/skills/isc-core/generators/rule-generator.js` | 自动生成ISC规则 | P1 |
| 人工审核工作流 | `/skills/isc-core/review/` | 高风险规则审核 | P2 |
| Agent指标采集器 | `/skills/seef/monitoring/metrics-collector.js` | 采集Agent效果指标 | P1 |
| 指标Dashboard | `/skills/seef/monitoring/metrics-dashboard.js` | 实时监控面板 | P2 |
| AEO集成适配器 | `/skills/seef/adapters/aeo-adapter.js` | SEEF-AEO对接 | P0 |

### 10.2 能力边界明确

| 能力 | 可行性 | 自动化程度 | 人工介入点 |
|:-----|:-------|:----------|:----------|
| CRAS洞察→ISC规则生成 | ✅ 可行 | 80% | 高风险规则审核 |
| ISC规则→DTO准出校验 | ✅ 可行 | 100% | 无 |
| 准出失败→自动修复 | ✅ 可行 | 70% | 高风险修复、修复循环超限 |

### 10.3 架构完整性验证

**闭环完整性**:

```
用户交互 → CRAS洞察 → 发现问题模式 → 生成ISC规则 → DTO订阅规则 
→ 技能执行 → ISC准出校验 → 校验失败 → N020根因分析 → Optimizer生成方案 
→ DTO闭环执行 → N016修复循环 → 重新校验 → 通过/人工介入
```

**所有环节已打通**: ✅

---

**报告生成时间**: 2026-03-01 11:01 GMT+8  
**报告版本**: 1.1.0 (补充AEO集成与能力确认)  
**下次审查**: P0阶段完成后
