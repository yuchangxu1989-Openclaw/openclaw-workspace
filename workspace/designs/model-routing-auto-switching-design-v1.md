# 模型路由自动切换机制设计方案 (MRAS)

## Model Routing Auto-Switching Design

> **版本**: v1.0.0  
> **状态**: 设计阶段 - 等待用户确认  
> **设计原则**: 符合全部7条核心约束

---

## 1. 方案概述

### 1.1 设计目标

构建一个**非侵入式、高韧性、可配置**的模型路由自动切换机制，实现：
- 子Agent按需动态调度最优模型
- 完全复用LEP韧性能力，不复刻降级逻辑
- 主Agent通信零阻塞，随时可接管
- 沙盒验证机制防止断连风险

### 1.2 核心约束回顾

| 约束ID | 约束内容 | 设计方案对应 |
|:---|:---|:---|
| C001 | 主模型逻辑不动 | 路由层完全独立于主Agent执行路径 |
| C002 | 通信通畅无阻 | 异步非阻塞架构，主Agent可随时中断路由 |
| C003 | 沙盒测试验证 | 三层沙盒：健康检查→影子测试→生产切换 |
| C004 | 子Agent多模型调度 | 每个子Agent独立配置模型偏好列表 |
| C005 | 韧性降级由LEP实现 | 零复刻，100%复用infrastructure/lep-core |
| C006 | 参考但不照搬 | 改进关键词匹配为语义意图识别 |
| C007 | 只设计方案不开发 | 本文档为完整设计，等待确认后开发 |

---

## 2. 架构设计

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              主Agent层 (Kimi K2.5)                           │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  主执行路径 (不受路由层阻塞)                                          │   │
│  │  ┌─────────┐    ┌─────────┐    ┌─────────┐                          │   │
│  │  │ 任务分发 │───→│ 直接执行 │───→│ 结果返回 │ (始终可用)              │   │
│  │  └─────────┘    └─────────┘    └─────────┘                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    │ 可选：任务可路由                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    MRAS 模型路由层 (子Agent侧)                        │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │  ① 意图识别引擎 (IntentClassifier)                           │   │   │
│  │  │  • 输入：任务描述 + 上下文                                     │   │   │
│  │  │  • 输出：任务类型 + 置信度 + 推荐模型列表                       │   │   │
│  │  │  • 改进：语义相似度 > 关键词匹配                               │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  │                              │                                      │   │
│  │                              ▼                                      │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │  ② 路由决策器 (RoutingDecision) - 配置驱动                     │   │   │
│  │  │  • 查询子Agent模型偏好配置                                     │   │   │
│  │  │  • 查询模型能力矩阵 (CapabilityAnchor)                         │   │   │
│  │  │  • 决策：目标模型 + 降级链                                     │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  │                              │                                      │   │
│  │                              ▼                                      │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │  ③ LEP韧性执行层 (复用infrastructure/lep-core)                │   │   │
│  │  │  • 熔断保护 (CircuitBreaker) - LEP原生                         │   │   │
│  │  │  • 失败重试 (RetryPolicy) - LEP原生                            │   │   │
│  │  │  • 降级执行 (Fallback) - LEP原生                               │   │   │
│  │  │  • 零复刻：MRAS不实现任何韧性逻辑，完全委托LEP                  │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  │                              │                                      │   │
│  │                              ▼                                      │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │  ④ 沙盒验证层 (SandboxValidator)                              │   │   │
│  │  │  • 健康检查 → 影子测试 → 生产切换                              │   │   │
│  │  │  • 断连防护：超时熔断 + 快速失败                               │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           多模型供应层 (可配置)                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ Kimi K2.5│  │ GLM-5    │  │ GLM-4V   │  │ GLM-OCR  │  │ 更多...  │       │
│  │ (主模型) │  │ (深度)   │  │ (多模态) │  │ (识别)   │  │          │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 与LEP集成关系

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         LEP-Core 韧性基础设施                            │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  infrastructure/lep-core/                                       │   │
│  │  ├─ CircuitBreaker (熔断器)                                     │   │
│  │  ├─ RetryPolicy (重试策略)                                      │   │
│  │  ├─ AgentPool (连接池)                                          │   │
│  │  ├─ Semaphore (并发控制)                                        │   │
│  │  └─ WAL日志 (执行追踪)                                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              ▲                                          │
│                              │ 委托调用                                  │
│  ┌───────────────────────────┼──────────────────────────────────────┐  │
│  │      MRAS Router           │  (零复刻韧性逻辑)                     │  │
│  │  ┌──────────────────────┐  │                                       │  │
│  │  │ 模型选择决策        │──┘                                       │  │
│  │  └──────────────────────┘                                          │  │
│  │           │                                                        │  │
│  │           ▼                                                        │  │
│  │  ┌──────────────────────┐                                          │  │
│  │  │ LEP.execute(model)   │ ──→ 完全复用LEP的熔断/重试/降级能力       │  │
│  │  └──────────────────────┘                                          │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.3 与多Agent体系集成

```
┌────────────────────────────────────────────────────────────────────────────┐
│                        多Agent并行体系 v3.0.1                               │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                    ParallelSubagentSpawner                           │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │  │
│  │  │ SubAgent-A  │  │ SubAgent-B  │  │ SubAgent-C  │  ...           │  │
│  │  │ ┌─────────┐ │  │ ┌─────────┐ │  │ ┌─────────┐ │                │  │
│  │  │ │MRAS Router│ │  │ │MRAS Router│ │  │ │MRAS Router│ │                │  │
│  │  │ │ ┌─────┐ │ │  │ │ ┌─────┐ │ │  │ │ ┌─────┐ │ │                │  │
│  │  │ │ │GLM-5│ │ │  │ │ │Kimi │ │ │  │ │ │GLM-4V│ │ │                │  │
│  │  │ │ └─────┘ │ │  │ │ └─────┘ │ │  │ │ └─────┘ │ │                │  │
│  │  │ └─────────┘ │  │ └─────────┘ │  │ └─────────┘ │                │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                │  │
│  │       模型A偏好         模型B偏好         模型C偏好                  │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                    ▲                                       │
│                                    │ 子Agent独立配置模型偏好                 │
│  ┌─────────────────────────────────┴─────────────────────────────────────┐│
│  │                      MRAS配置中心 (N019/N020模式)                      ││
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐       ││
│  │  │Agent-A配置 │  │Agent-B配置 │  │Agent-C配置 │  │ 全局默认   │       ││
│  │  │[GLM-5,    │  │[Kimi,      │  │[GLM-4V,    │  │[Kimi,      │       ││
│  │  │ Kimi]     │  │ GLM-5]     │  │ GLM-5]     │  │ GLM-5]     │       ││
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘       ││
│  └───────────────────────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 与另一AI方案对比分析

### 3.1 另一AI方案（关键词匹配路由）

```
┌─────────────────────────────────────────────────────────┐
│              关键词匹配方案（参考但不照搬）               │
├─────────────────────────────────────────────────────────┤
│  输入: "分析这张图片中的文字"                              │
│              ↓                                          │
│  关键词匹配:                                              │
│    • "图片" → 多模态任务 (+1分)                          │
│    • "分析" → 推理任务 (+0.5分)                          │
│    • "文字" → OCR任务 (+1分)                             │
│              ↓                                          │
│  任务分类: 多模态OCR (置信度: 2.5/3)                      │
│              ↓                                          │
│  模型映射: 多模态OCR → GLM-4V + GLM-OCR                  │
│              ↓                                          │
│  失败降级: GLM-4V失败 → 降级到Kimi                       │
└─────────────────────────────────────────────────────────┘

优点 ✅:
• 实现简单，关键词可配置
• 置信度计算直观
• 降级逻辑清晰

缺点 ❌:
• 关键词覆盖有限，无法处理新颖表达
• 多语言支持困难
• 上下文理解弱，"分析"一词多义
• 硬编码映射关系，扩展性差
• 未考虑模型实时状态
```

### 3.2 MRAS改进方案（语义意图识别）

```
┌─────────────────────────────────────────────────────────┐
│            MRAS语义意图识别方案（改进版）                 │
├─────────────────────────────────────────────────────────┤
│  输入: "分析这张图片中的文字"                              │
│              ↓                                          │
│  语义嵌入:                                                │
│    • 任务向量编码 (使用轻量级嵌入模型)                     │
│    • 意图空间相似度计算                                    │
│              ↓                                          │
│  多维度意图识别:                                          │
│    • 输入类型: 图片 (image)                               │
│    • 输出类型: 文本 (text)                                │
│    • 任务类型: 识别/提取 (recognition)                    │
│    • 复杂度: 中 (medium)                                  │
│              ↓                                          │
│  动态模型匹配:                                            │
│    • 查询CapabilityAnchor能力矩阵                          │
│    • 筛选支持[image→text]的模型                           │
│    • 按复杂度排序推荐                                     │
│    • 结果: [GLM-4V, GLM-OCR, Kimi]                        │
│              ↓                                          │
│  子Agent偏好融合:                                         │
│    • Agent-A偏好: [GLM-5, Kimi]                          │
│    • 交集: [GLM-5] 不支持image输入                        │
│    • 扩展: [GLM-4V, GLM-OCR] (CapabilityAnchor推荐)       │
│    • 最终: [GLM-4V, GLM-OCR, Kimi]                        │
│              ↓                                          │
│  LEP韧性执行:                                             │
│    • GLM-4V失败 → LEP自动重试 → LEP自动降级到GLM-OCR      │
│    • 降级逻辑100%由LEP实现，MRAS零复刻                    │
└─────────────────────────────────────────────────────────┘

改进点 🚀:
1. 语义相似度 > 关键词匹配 (更准确)
2. 多维度意图识别 (输入/输出/任务/复杂度)
3. 动态模型匹配 (CapabilityAnchor实时查询)
4. 子Agent个性化偏好 (非全局一刀切)
5. 完全复用LEP韧性 (不复刻降级逻辑)
6. 配置化模型偏好 (N019/N020模式)
```

### 3.3 对比总结

| 维度 | 关键词匹配方案 | MRAS改进方案 |
|:---|:---|:---|
| **识别方式** | 关键词匹配 | 语义意图识别 |
| **准确率** | 中 (依赖关键词覆盖) | 高 (语义理解) |
| **多语言** | 需单独维护 | 天然支持 |
| **上下文理解** | 弱 | 强 |
| **模型选择** | 硬编码映射 | 动态匹配+偏好融合 |
| **韧性降级** | 方案内自建 | 100%复用LEP |
| **子Agent个性化** | 不支持 | 独立配置 |
| **配置化** | 部分 | 完全 (N019/N020模式) |
| **扩展性** | 需改代码 | 配置即生效 |

---

## 4. 核心模块设计

### 4.1 意图识别引擎 (IntentClassifier)

```yaml
# 模块: IntentClassifier
# 职责: 将任务描述转化为结构化意图

输入:
  task_description: string          # 任务描述
  context: object                   # 上下文信息
  history: array                    # 历史任务记录

输出:
  intent:
    input_type: enum                 # [text|image|video|audio|pdf|mixed]
    output_type: enum                # [text|image|video|audio|code|json]
    task_category: enum              # [generation|analysis|reasoning|recognition|translation]
    complexity: enum                 # [low|medium|high|extreme]
    domain: string                   # 领域标签
  confidence: float                  # 0.0 - 1.0
  reasoning: string                  # 识别理由

实现策略:
  1. 轻量级本地嵌入模型 (如bge-small) 计算任务向量
  2. 与预设意图模板计算余弦相似度
  3. 使用ISC-本地任务编排 43规则作为意图库基础
  4. 历史任务反馈优化识别准确度

示例:
  输入: "生成一张太空猫的图片"
  输出:
    intent:
      input_type: text
      output_type: image
      task_category: generation
      complexity: medium
      domain: creative
    confidence: 0.95
    reasoning: "文本输入，图像生成，创意类任务"
```

### 4.2 路由决策器 (RoutingDecision)

```yaml
# 模块: RoutingDecision
# 职责: 基于意图和配置决策目标模型

输入:
  intent: object                    # 意图识别结果
  agent_config: object              # 子Agent模型偏好配置
  capability_anchor: object         # 系统能力锚点数据
  model_health: object              # 模型健康状态

输出:
  routing_plan:
    primary_model: string           # 首选模型
    fallback_chain: array           # 降级链 [model1, model2, ...]
    routing_reason: string          # 决策理由

决策流程:
  1. 查询CapabilityAnchor，筛选支持intent的模型列表
  2. 过滤health状态不良的模型
  3. 与子Agent偏好配置取交集
  4. 按子Agent偏好排序 → 按CapabilityAnchor推荐排序
  5. 生成降级链 (偏好优先，系统推荐补充)

配置示例 (N019/N020模式):
  agent_models:
    agent_code_reviewer:
      preferences: ["glm-5-coder", "kimi-coding/k2p5"]
      allow_auto_extend: true       # 允许CapabilityAnchor扩展推荐
    agent_doc_writer:
      preferences: ["kimi-coding/k2p5"]
      allow_auto_extend: true
    agent_multimodal:
      preferences: ["glm-4v", "glm-image", "glm-ocr"]
      allow_auto_extend: false      # 严格限制多模态模型
```

### 4.3 LEP韧性执行委托

```javascript
// MRAS 完全不实现韧性逻辑，100%委托LEP

class MRASRouter {
  async routeAndExecute(task, agentConfig) {
    // 1. 意图识别
    const intent = await this.intentClassifier.classify(task);
    
    // 2. 路由决策
    const routingPlan = await this.routingDecision.decide(intent, agentConfig);
    
    // 3. 委托LEP执行 (零复刻韧性逻辑)
    return await this.lep.execute({
      task: task,
      targetModel: routingPlan.primary_model,
      fallbackChain: routingPlan.fallback_chain,
      // LEP原生提供：熔断、重试、降级、追踪
    });
  }
}

// LEP.execute 内部实现 (infrastructure/lep-core)
// MRAS不感知、不干预、不复刻以下逻辑：
// - CircuitBreaker状态管理
// - RetryPolicy指数退避
// - FallbackChain顺序执行
// - WAL日志记录
```

### 4.4 沙盒验证层 (SandboxValidator)

```yaml
# 模块: SandboxValidator
# 职责: 防止断连风险，确保模型可用性

三层沙盒机制:

┌─────────────────────────────────────────────────────────────┐
│ Layer 1: 健康检查 (HealthCheck)                              │
│ • 目标模型健康状态查询 (内存缓存，5秒TTL)                      │
│ • 熔断器状态检查 (CLOSED/OPEN/HALF_OPEN)                      │
│ • 快速失败：不健康模型直接跳过，不尝试连接                     │
│ • 超时：50ms，超时时视为不健康                               │
├─────────────────────────────────────────────────────────────┤
│ Layer 2: 影子测试 (ShadowTest)                               │
│ • 生产流量旁路1%到候选模型                                   │
│ • 对比主模型与候选模型输出质量                                │
│ • 质量偏差>10%时阻止切换                                     │
│ • 仅用于新模型上线验证，日常路由不启用                        │
├─────────────────────────────────────────────────────────────┤
│ Layer 3: 超时熔断 (TimeoutCircuit)                           │
│ • 连接超时：5秒                                              │
│ • 响应超时：60秒 (可配置)                                    │
│ • 失败计数器触发LEP熔断器                                    │
│ • 熔断后自动降级到fallback_chain下一模型                      │
└─────────────────────────────────────────────────────────────┘

断连防护策略:
  - 所有模型调用都经过LEP熔断器
  - 超时设置短于Agent整体超时，预留降级时间
  - 降级链必须包含本地可靠模型 (如Kimi)
  - 极端情况：全部模型不可用 → 返回明确错误，不无限等待
```

---

## 5. 主模型保活机制

### 5.1 设计原则

```
核心原则: 主Agent (Kimi) 通信路径完全独立于MRAS路由层

┌─────────────────────────────────────────────────────────────────────┐
│                         主Agent通信路径                              │
│  用户输入 ──→ 主Agent (Kimi) ──→ 直接响应 或 ──→ 子Agent (可选)      │
│                                            │                        │
│                                            ▼                        │
│                                     MRAS路由层 (子Agent内部)         │
└─────────────────────────────────────────────────────────────────────┘

关键设计:
1. 主Agent到用户的通信路径不经过MRAS
2. 子Agent调用MRAS是子Agent内部行为
3. 主Agent可随时中断子Agent执行
4. 子Agent超时由ParallelSubagentSpawner控制，独立于MRAS
```

### 5.2 非阻塞架构

```javascript
// 主Agent调用子Agent - 完全非阻塞
class MainAgent {
  async handleUserRequest(request) {
    // 直接处理，不经过MRAS
    const canHandleDirectly = this.assess(request);
    if (canHandleDirectly) {
      return await this.execute(request);
    }
    
    // 委托子Agent - 异步执行
    const subAgentPromise = this.spawnSubAgent(request);
    
    // 主Agent保持响应能力，可随时取消
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('用户取消')), 300000)
    );
    
    // 竞争等待
    return await Promise.race([subAgentPromise, timeoutPromise]);
  }
}

// 子Agent内部使用MRAS - 不影响主Agent
class SubAgent {
  async execute(task) {
    // MRAS路由在子Agent内部，主Agent无感知
    const mras = new MRASRouter(this.config);
    return await mras.routeAndExecute(task);
  }
}
```

### 5.3 通信通畅保障

| 场景 | 保障机制 |
|:---|:---|
| MRAS路由层故障 | 子Agent捕获异常，返回错误，主Agent可重新调度 |
| 模型全部不可用 | LEP返回明确错误，子Agent透传，主Agent决策 |
| 子Agent超时 | ParallelSubagentSpawner超时控制，主Agent可重新发起 |
| 主Agent需要接管 | 直接响应用户，子Agent执行结果可丢弃 |

---

## 6. 子Agent多模型调度流程

### 6.1 调度流程图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        子Agent多模型调度流程                             │
│                                                                         │
│  ① 子Agent启动                                                          │
│       │                                                                 │
│       ▼                                                                 │
│  ② 加载个性化配置 (N019/N020模式)                                        │
│       ├─ agent_config.json # 本Agent的模型偏好                          │
│       └─ capability_anchor.json # 系统能力锚点 (只读)                    │
│       │                                                                 │
│       ▼                                                                 │
│  ③ 接收任务                                                             │
│       │                                                                 │
│       ▼                                                                 │
│  ④ 意图识别 ──→ IntentClassifier.classify()                            │
│       │         • 输入类型、输出类型、任务类别、复杂度                    │
│       │         • 返回意图对象 + 置信度                                   │
│       ▼                                                                 │
│  ⑤ 路由决策 ──→ RoutingDecision.decide()                                │
│       │         • 查询CapabilityAnchor筛选可用模型                        │
│       │         • 与Agent偏好取交集                                       │
│       │         • 生成 [primary, fallback1, fallback2, ...]               │
│       ▼                                                                 │
│  ⑥ 沙盒验证 ──→ SandboxValidator.validate()                             │
│       │         • 健康检查：primary_model状态                            │
│       │         • 不健康则跳过，尝试fallback                              │
│       ▼                                                                 │
│  ⑦ LEP韧性执行 ──→ lep.execute()                                        │
│       │         • 完全复用LEP的熔断、重试、降级能力                       │
│       │         • MRAS不干预执行过程                                      │
│       ▼                                                                 │
│  ⑧ 返回结果                                                             │
│       └─ 成功：返回模型输出                                              │
│       └─ 失败：LEP已尝试全部fallback，返回最终错误                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.2 子Agent独立配置示例

```json
{
  "agent_id": "code-reviewer-v2",
  "agent_name": "代码审查Agent",
  "mras_config": {
    "model_preferences": {
      "primary": "glm-5-coder",
      "fallbacks": ["kimi-coding/k2p5", "glm-4-flash"],
      "strict_mode": false
    },
    "intent_rules": {
      "task_category": "code_review",
      "complexity_threshold": "medium"
    },
    "sandbox_settings": {
      "health_check_timeout_ms": 50,
      "execution_timeout_ms": 60000,
      "max_retries": 2
    }
  },
  "capability_anchor_sync": {
    "enabled": true,
    "refresh_interval_sec": 300
  }
}
```

### 6.3 多子Agent差异化调度

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      多子Agent差异化调度示例                             │
│                                                                         │
│  SubAgent-A: 代码架构师                                                  │
│    偏好: [GLM-5, Kimi]                                                  │
│    任务: 复杂代码架构设计 → Intent: [code, text, architecture, high]    │
│    路由: GLM-5 (primary) → Kimi (fallback)                              │
│                                                                         │
│  SubAgent-B: 文档生成器                                                  │
│    偏好: [Kimi]                                                         │
│    任务: 技术文档撰写 → Intent: [text, text, generation, medium]        │
│    路由: Kimi (primary) → GLM-5 (CapabilityAnchor扩展)                  │
│                                                                         │
│  SubAgent-C: 多模态分析器                                                │
│    偏好: [GLM-4V, GLM-OCR]                                              │
│    任务: 图片文字识别 → Intent: [image, text, recognition, low]         │
│    路由: GLM-4V (primary) → GLM-OCR (fallback) → Kimi (last resort)     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 7. LEP韧性复用方案

### 7.1 复用原则

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    LEP韧性复用原则：零复刻、全委托                        │
│                                                                         │
│  MRAS不实现以下逻辑：                                                    │
│    ❌ 熔断器状态管理 (CircuitBreaker)                                    │
│    ❌ 重试策略计算 (RetryPolicy)                                         │
│    ❌ 降级链执行逻辑 (FallbackChain)                                     │
│    ❌ 连接池管理 (AgentPool)                                             │
│    ❌ 并发控制 (Semaphore)                                               │
│    ❌ 执行日志记录 (WAL)                                                 │
│                                                                         │
│  MRAS只负责：                                                            │
│    ✅ 意图识别 (Intent Classification)                                   │
│    ✅ 模型选择决策 (Model Selection)                                     │
│    ✅ 生成降级链建议 (Fallback Suggestion)                               │
│    ✅ 调用LEP.execute()并传入必要参数                                     │
│                                                                         │
│  LEP负责全部韧性逻辑：                                                   │
│    ✅ 执行传入的模型链                                                   │
│    ✅ 熔断判断与状态管理                                                 │
│    ✅ 失败重试与指数退避                                                 │
│    ✅ 降级执行与错误透传                                                 │
│    ✅ 全链路追踪与日志                                                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.2 LEP接口契约

```javascript
// LEP.execute 接口 (infrastructure/lep-core)

interface LEPExecuteRequest {
  // MRAS传入
  task: Task;                           // 任务定义
  routingPlan: {
    primaryModel: string;               // 首选模型
    fallbackChain: string[];            // 降级链
  };
  timeout?: number;                     // 超时时间(秒)
  
  // LEP内部使用，MRAS不感知
  tracing?: {
    execId: string;
    parentExecId?: string;
  };
}

interface LEPExecuteResponse {
  success: boolean;
  result?: any;                         // 成功结果
  error?: {
    code: string;
    message: string;
    failedModels: string[];             // 尝试过的模型
  };
  metadata: {
    executedModel: string;              // 最终执行的模型
    attempts: number;                   // 尝试次数
    duration: number;                   // 执行耗时
    fallbackUsed: boolean;              // 是否使用了降级
  };
}

// 使用示例
const result = await lep.execute({
  task: { prompt: "分析代码", context: {...} },
  routingPlan: {
    primaryModel: "glm-5-coder",
    fallbackChain: ["kimi-coding/k2p5", "glm-4-flash"]
  },
  timeout: 60
});

// MRAS不处理result.error，直接透传给子Agent
// LEP已完成所有降级尝试，MRAS无额外逻辑
```

### 7.3 韧性边界划分

| 韧性能力 | 实现位置 | MRAS角色 |
|:---|:---|:---|
| 健康检查 | LEP | 调用前可选预检 |
| 熔断判断 | LEP | 无感知 |
| 失败重试 | LEP | 无感知 |
| 降级执行 | LEP | 提供降级链建议 |
| 超时控制 | LEP | 传递timeout参数 |
| 连接池 | LEP | 无感知 |
| 并发控制 | LEP | 无感知 |
| 日志追踪 | LEP | 无感知 |

---

## 8. 配置化设计 (N019/N020模式)

### 8.1 配置分层架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      配置分层 (N019/N020设计模式)                         │
│                                                                         │
│  Layer 4: 子Agent个性化配置 (最高优先级)                                  │
│    路径: skills/{agent-name}/config/mras-config.json                     │
│    内容: 本Agent专用的模型偏好、意图规则、沙盒设置                         │
│    示例: agent_code_reviewer偏好GLM-5，agent_doc_writer偏好Kimi           │
│                                                                         │
│  Layer 3: 任务类型默认配置                                               │
│    路径: skills/dto-core/subscriptions/isc-*-mras.json                   │
│    内容: 按任务类型(代码/文档/多模态)的默认模型映射                        │
│    示例: code_review任务默认优先GLM-5                                    │
│                                                                         │
│  Layer 2: 全局默认配置                                                   │
│    路径: infrastructure/mras/global-config.json                          │
│    内容: 系统级默认值、健康检查参数、超时设置                              │
│    示例: 默认超时60秒，健康检查TTL 5秒                                   │
│                                                                         │
│  Layer 1: CapabilityAnchor能力锚点 (只读)                                │
│    路径: CAPABILITY-ANCHOR.md (自动生成)                                 │
│    内容: 各模型的能力矩阵、触发条件、优先级                                │
│    示例: GLM-4V支持image输入，GLM-5支持high复杂度                         │
│                                                                         │
│  合并策略: Layer 4 > Layer 3 > Layer 2 > Layer 1                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 8.2 配置Schema定义

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "mras-config-schema",
  "title": "MRAS Configuration Schema",
  "description": "模型路由自动切换机制配置 (N019/N020模式)",
  
  "definitions": {
    "ModelPreference": {
      "type": "object",
      "properties": {
        "primary": {
          "type": "string",
          "description": "首选模型ID"
        },
        "fallbacks": {
          "type": "array",
          "items": { "type": "string" },
          "description": "降级链模型列表"
        },
        "strict_mode": {
          "type": "boolean",
          "default": false,
          "description": "严格模式：true时不允许CapabilityAnchor扩展"
        }
      },
      "required": ["primary"]
    },
    
    "IntentRule": {
      "type": "object",
      "properties": {
        "input_type": {
          "type": "string",
          "enum": ["text", "image", "video", "audio", "pdf", "mixed"]
        },
        "output_type": {
          "type": "string",
          "enum": ["text", "image", "video", "audio", "code", "json"]
        },
        "task_category": {
          "type": "string",
          "enum": ["generation", "analysis", "reasoning", "recognition", "translation"]
        },
        "complexity": {
          "type": "string",
          "enum": ["low", "medium", "high", "extreme"]
        }
      }
    },
    
    "SandboxSettings": {
      "type": "object",
      "properties": {
        "health_check_timeout_ms": {
          "type": "integer",
          "default": 50,
          "minimum": 10,
          "maximum": 1000
        },
        "execution_timeout_ms": {
          "type": "integer",
          "default": 60000,
          "minimum": 5000
        },
        "max_retries": {
          "type": "integer",
          "default": 2,
          "minimum": 0,
          "maximum": 5
        }
      }
    }
  },
  
  "type": "object",
  "properties": {
    "agent_id": { "type": "string" },
    "agent_name": { "type": "string" },
    "version": { "type": "string" },
    "mras_config": {
      "type": "object",
      "properties": {
        "model_preferences": { "$ref": "#/definitions/ModelPreference" },
        "intent_rules": { "$ref": "#/definitions/IntentRule" },
        "sandbox_settings": { "$ref": "#/definitions/SandboxSettings" }
      }
    },
    "capability_anchor_sync": {
      "type": "object",
      "properties": {
        "enabled": { "type": "boolean", "default": true },
        "refresh_interval_sec": { "type": "integer", "default": 300 }
      }
    }
  },
  "required": ["agent_id", "mras_config"]
}
```

### 8.3 配置热更新机制

```javascript
// 配置热更新 - 不重启服务

class MRASConfigManager {
  constructor() {
    this.configs = new Map();
    this.watchers = new Map();
  }
  
  // 加载Agent配置
  async loadAgentConfig(agentId) {
    const configPath = `skills/${agentId}/config/mras-config.json`;
    const config = await this.loadAndValidate(configPath);
    this.configs.set(agentId, config);
    return config;
  }
  
  // 监听配置变更
  watchConfig(agentId) {
    const watcher = fs.watch(configPath, async () => {
      console.log(`[MRAS] Config changed for ${agentId}, reloading...`);
      await this.loadAgentConfig(agentId);
    });
    this.watchers.set(agentId, watcher);
  }
  
  // 获取配置 (自动合并多层配置)
  getMergedConfig(agentId, intent) {
    const agentConfig = this.configs.get(agentId) || {};
    const globalConfig = this.loadGlobalConfig();
    const capabilityAnchor = this.loadCapabilityAnchor();
    
    // 合并策略: Agent > TaskType > Global > CapabilityAnchor
    return this.mergeConfigs(agentConfig, globalConfig, capabilityAnchor, intent);
  }
}
```

---

## 9. 实施建议

### 9.1 开发阶段划分

| 阶段 | 内容 | 工作量 | 依赖 |
|:---|:---|:---|:---|
| Phase 1 | 意图识别引擎 | 3天 | ISC-DTO规则 |
| Phase 2 | 路由决策器 + 配置化 | 3天 | N019/N020模式 |
| Phase 3 | LEP集成 + 沙盒层 | 2天 | infrastructure/lep-core |
| Phase 4 | 多Agent集成测试 | 2天 | parallel-subagent v3.0.1 |
| **总计** | | **10天** | |

### 9.2 风险评估

| 风险 | 影响 | 缓解措施 |
|:---|:---|:---|
| LEP接口变更 | 高 | 与LEP维护者确认接口稳定性 |
| 意图识别准确度 | 中 | 渐进式上线，收集反馈优化 |
| 配置复杂度 | 低 | 提供配置模板和验证工具 |
| 性能开销 | 低 | 轻量级嵌入模型，缓存机制 |

### 9.3 验收标准

- [ ] 主Agent可随时接管，不受MRAS阻塞
- [ ] 子Agent可按需配置独立模型偏好
- [ ] 沙盒三层机制正常运行，无断连风险
- [ ] LEP韧性能力完全复用，无复刻代码
- [ ] 模型可配置化，不写死在代码中
- [ ] 意图识别准确度 > 85%
- [ ] 降级成功率 > 99%

---

## 10. 附录

### 附录A: 术语表

| 术语 | 英文 | 说明 |
|:---|:---|:---|
| MRAS | Model Routing Auto-Switching | 模型路由自动切换机制 |
| LEP | Lightweight Execution Platform | 轻量级执行平台 (韧性基础设施) |
| ISC | Intelligent Standard Center | 智能标准中心 |
| 本地任务编排 | 本地任务编排 | 声明式任务编排 |
| CapabilityAnchor | 能力锚点 | 系统能力矩阵文档 |
| Intent | 意图 | 任务的结构化描述 |
| Fallback | 降级 | 主模型失败时切换到备用模型 |

### 附录B: 参考文档

- parallel-subagent v3.0.1 SKILL.md
- dto-core v3.0.6 SKILL.md  
- infrastructure/lep-core/
- CAPABILITY-ANCHOR.md
- isc-N019.json / isc-N020.json

---

**文档状态**: 设计完成，等待用户确认  
**下一步**: 用户确认后进入开发阶段

## 目标

> TODO: 请补充目标内容

## 方案

> TODO: 请补充方案内容

## 风险

> TODO: 请补充风险内容

## 验收

> TODO: 请补充验收内容

---

## 📋 架构评审清单 (自动生成)

**文档**: model-routing-auto-switching-design-v1
**生成时间**: 2026-03-06T13:01:12.508Z
**状态**: 待评审

### ⚠️ 缺失章节
- [ ] 补充「目标」章节
- [ ] 补充「方案」章节
- [ ] 补充「风险」章节
- [ ] 补充「验收」章节

### 评审检查项
- [ ] 方案可行性评估
- [ ] 技术风险已识别
- [ ] 依赖关系已明确
- [ ] 回滚方案已准备
- [ ] 性能影响已评估

### 审核门
审核门: 待通过

> 评审完成后，将上方「待通过」改为「通过」即可放行。
