---
# 模型路由自动切换机制 (MR) - 架构设计v2
# 版本: 2.0.0
# 状态: 设计阶段 - 等待用户确认
# ISC规则: N022合规 | N019/N020配置化模式
---

## 1. 架构设计目标

构建一个**非侵入式、子Agent独立、高韧性**的模型路由系统，实现：
- 子Agent按需动态调度最优模型（非全局一刀切）
- 主Agent通信零阻塞，随时可接管
- 100%复用LEP韧性能力，不复刻降级逻辑
- 沙盒验证防止断连风险

---

## 2. 核心约束满足矩阵

| 约束ID | 约束内容 | 设计方案对应 |
|:---:|:---|:---|
| C001 | 主模型逻辑不动 | 主Agent通信路径完全独立于MR层 |
| C002 | 通信通畅无阻 | 异步非阻塞，主Agent可随时中断子Agent |
| C003 | 沙盒测试验证 | 三层沙盒：健康检查→影子测试→生产切换 |
| C004 | 子Agent多模型调度 | 每个子Agent独立配置模型偏好列表 |
| C005 | 韧性降级由LEP实现 | 零复刻，100%委托`infrastructure/lep-core` |
| C006 | 参考但不照搬 | 改进简单分类为语义意图识别 |
| C007 | 只设计方案不开发 | 本文档为完整设计，等待确认后开发 |

---

## 3. 整体架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              主Agent层 (Kimi K2.5)                           │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  主执行路径 (完全独立，不受MR影响)                                  │   │
│  │  用户输入 ──→ 意图判断 ──→ 直接响应 或 ──→ 子Agent(可选)            │   │
│  │                                           │                        │   │
│  │                                           ▼                        │   │
│  │                              ┌──────────────────┐                  │   │
│  │                              │ 子Agent执行容器  │                  │   │
│  │                              │ (超时/取消可控)  │                  │   │
│  │                              └──────────────────┘                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    │ 子Agent内部使用MR                    │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    MR 模型路由层 (子Agent侧)                        │   │
│  │                                                                     │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │ ① 语义意图识别 (SemanticIntentClassifier)                    │   │   │
│  │  │   • 输入：任务描述 + 上下文                                   │   │   │
│  │  │   • 输出：{任务类型, 复杂度, 输入模态, 输出模态, 置信度}       │   │   │
│  │  │   • 改进：轻量级嵌入模型计算语义相似度（vs 关键词匹配）         │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  │                              │                                      │   │
│  │                              ▼                                      │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │ ② 子Agent模型偏好融合 (AgentPreferenceMerger)                │   │   │
│  │  │   • 查询子Agent的模型偏好配置                                 │   │   │
│  │  │   • 查询CapabilityAnchor能力矩阵                              │   │   │
│  │  │   • 融合：偏好 ∩ 能力 → 候选模型列表                          │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  │                              │                                      │   │
│  │                              ▼                                      │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │ ③ LEP韧性执行层 (100%委托，零复刻)                            │   │   │
│  │  │   • 调用：`lep.execute({modelChain, task, timeout})`          │   │   │
│  │  │   • LEP内部处理：熔断/重试/降级/日志                          │   │   │
│  │  │   • MR不感知、不干预、不复刻任何韧性逻辑                     │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  │                              │                                      │   │
│  │                              ▼                                      │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │ ④ 沙盒验证层 (SandboxValidator)                              │   │   │
│  │  │   • L1: 健康检查（50ms超时，内存缓存）                         │   │   │
│  │  │   • L2: 影子测试（1%旁路，质量对比）                          │   │   │
│  │  │   • L3: 超时熔断（LEP原生）                                   │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           多模型供应层 (CapabilityAnchor配置)                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ {{MODEL_│  │ {{MODEL_│  │ {{MODEL_│  │ {{MODEL_│  │ 更多...  │       │
│  │ GENERAL} │  │ DEEP_TH} │  │ VISION}  │  │ CODE}}   │  │          │       │
│  │ (主模型) │  │ (深度)   │  │ (视觉)   │  │ (编码)   │  │          │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
│  注：模型ID通过CapabilityAnchor配置，零硬编码                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. 任务分类体系（参考另一个AI方案改进）

### 4.1 三层任务分类（语义识别，非关键词匹配）

| 任务类别 | 语义特征 | 默认模型偏好 | 可替换 |
|:---:|:---|:---|:---:|
| **推理型** | 逻辑复杂、需深度思考、代码生成、架构设计 | `{{MODEL_DEEP_THINKING}}` | ✅ 配置可换 |
| **多模态** | 含图像/视频/音频输入 | `{{MODEL_VISION}}`/`{{MODEL_AUDIO}}` | ✅ 配置可换 |
| **通用型** | 简单对话、信息查询、快速响应 | `{{MODEL_GENERAL}}` | ✅ 配置可换 |

### 4.2 意图识别维度（5维向量）

```typescript
interface TaskIntent {
  taskCategory: 'reasoning' | 'multimodal' | 'general';
  complexity: 'low' | 'medium' | 'high' | 'extreme';
  inputModality: 'text' | 'image' | 'video' | 'audio' | 'mixed';
  outputModality: 'text' | 'image' | 'code' | 'json' | 'mixed';
  domain: string; // 领域标签
  confidence: number; // 0.0-1.0
}
```

### 4.3 与另一个AI方案的对比

| 维度 | 另一个AI方案 | MR改进 |
|:---:|:---|:---|
| **分类方式** | 关键词匹配 | 语义嵌入相似度 |
| **扩展性** | 需改代码加关键词 | 配置意图模板即可 |
| **多语言** | 需维护多语言关键词 | 语义向量天然支持 |
| **上下文** | 无 | 结合历史任务上下文 |

---

## 5. 子Agent独立配置（核心改进）

### 5.1 每个子Agent独立配置模型偏好

```json
// skills/agent-code-reviewer/mras-preference.json
{
  "agent_id": "agent-code-reviewer",
  "model_preferences": {
    "primary": "{{MODEL_CODE_REVIEW}}",
    "fallbacks": ["{{MODEL_DEEP_THINKING}}", "{{MODEL_GENERAL}}"],
    "strict_mode": false
  },
  "intent_overrides": {
    "code_review": {
      "preferred_model": "{{MODEL_CODE_REVIEW}}",
      "min_complexity": "medium"
    }
  },
  "sandbox_settings": {
    "health_check_timeout_ms": 50,
    "execution_timeout_ms": 120000
  }
}
```

```json
// skills/agent-doc-writer/mras-preference.json
{
  "agent_id": "agent-doc-writer",
  "model_preferences": {
    "primary": "{{MODEL_GENERAL}}",
    "fallbacks": ["{{MODEL_DEEP_THINKING}}"],
    "strict_mode": false
  }
}
```

### 5.2 多子Agent差异化示例

| 子Agent | 任务 | 意图识别结果 | 偏好融合后模型链 |
|:---|:---|:---|:---|
| CodeReviewer | 代码审查 | {reasoning, high, text, code} | `{{MODEL_CODE_REVIEW}}` → `{{MODEL_DEEP_THINKING}}` → `{{MODEL_GENERAL}}` |
| DocWriter | 文档生成 | {general, medium, text, text} | `{{MODEL_GENERAL}}` → `{{MODEL_DEEP_THINKING}}` |
| ImageAnalyzer | 图像分析 | {multimodal, medium, image, text} | `{{MODEL_VISION}}` → `{{MODEL_GENERAL}}` |
| Architect | 系统设计 | {reasoning, extreme, text, text} | `{{MODEL_DEEP_THINKING}}` → `{{MODEL_CODE_REVIEW}}` → `{{MODEL_GENERAL}}` |

**关键改进**：vs 另一个AI的全局硬编码`"reasoning": "zhipu/glm-5"`，MR实现**子Agent按需个性化**

---

## 6. LEP韧性100%复用设计

### 6.1 零复刻原则

```javascript
// MR Router - 只负责意图识别和模型选择
class MRRouter {
  async routeAndExecute(task, agentConfig) {
    // 1. 语义意图识别
    const intent = await this.intentClassifier.classify(task);
    
    // 2. 融合子Agent偏好
    const modelChain = await this.preferenceMerger.merge(intent, agentConfig);
    
    // 3. 委托LEP执行 - 零复刻韧性逻辑
    return await this.lep.execute({
      task: task,
      modelChain: modelChain, // ['{{MODEL_DEEP_THINKING}}', '{{MODEL_GENERAL}}']
      timeout: agentConfig.timeout || 60000,
      // LEP内部处理：熔断/重试/降级/WAL日志
    });
  }
}

// LEP.execute (infrastructure/lep-core) - MR不感知内部实现
// - CircuitBreaker状态管理
// - RetryPolicy指数退避
// - FallbackChain顺序执行
// - WAL执行追踪
```

### 6.2 与另一个AI方案的对比

| 韧性能力 | 另一个AI方案 | MR方案 |
|:---:|:---|:---|
| **降级实现** | 自建降级到`zhipu/glm-4.7` | 100%委托LEP，模型链可配置 |
| **熔断机制** | ❌ 未提及 | ✅ LEP原生 |
| **重试策略** | ❌ 未提及 | ✅ LEP原生 |
| **日志追踪** | 自建日志 | ✅ LEP WAL原生 |
| **代码复用** | 自建逻辑 | **零复刻，全委托** |

---

## 7. 沙盒测试机制

### 7.1 三层沙盒

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: 健康检查 (HealthCheck)                              │
│ • 模型健康状态查询（内存缓存，5秒TTL）                          │
│ • 熔断器状态检查（CLOSED/OPEN/HALF_OPEN）                     │
│ • 快速失败：不健康模型直接跳过                                │
│ • 超时：50ms                                                  │
├─────────────────────────────────────────────────────────────┤
│ Layer 2: 影子测试 (ShadowTest)                               │
│ • 生产流量旁路1%到候选模型                                    │
│ • 对比主模型与候选模型输出质量                                │
│ • 质量偏差>10%时阻止切换                                      │
│ • 仅用于新模型上线验证                                        │
├─────────────────────────────────────────────────────────────┤
│ Layer 3: 超时熔断 (TimeoutCircuit)                           │
│ • 连接超时：5秒                                               │
│ • 响应超时：60秒（可配置）                                    │
│ • 失败计数器触发LEP熔断器                                     │
│ • 熔断后自动降级到模型链下一模型                               │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 断连防护

- 所有模型调用都经过LEP熔断器
- 超时设置短于Agent整体超时，预留降级时间
- 降级链必须包含本地可靠模型（`{{MODEL_GENERAL}}`）
- 极端情况：全部模型不可用 → 返回明确错误，不无限等待

---

## 8. 主模型保活机制

### 8.1 设计原则

**核心原则**: 主Agent (Kimi) 通信路径完全独立于MR路由层

```
用户输入 ──→ 主Agent (Kimi) ──→ 直接响应
                          │
                          └────→ 子Agent (可选)
                                   │
                                   ▼
                            MR路由层 (子Agent内部)
```

### 8.2 非阻塞架构

| 场景 | 保障机制 |
|:---|:---|
| MR路由层故障 | 子Agent捕获异常，返回错误，主Agent可重新调度 |
| 模型全部不可用 | LEP返回明确错误，子Agent透传，主Agent决策 |
| 子Agent超时 | ParallelSubagentSpawner超时控制，主Agent可重新发起 |
| 主Agent需要接管 | 直接响应用户，子Agent执行结果可丢弃 |

---

## 9. 配置化设计 (N019/N020模式)

### 9.1 四层配置优先级

```
Layer 4: 子Agent个性化配置 (最高优先级)
  → skills/{agent-name}/mras-preference.json

Layer 3: 任务类型默认配置
  → skills/lto-core/subscriptions/isc-*-mras.json

Layer 2: 全局默认配置
  → infrastructure/mras/global-config.json

Layer 1: CapabilityAnchor能力锚点 (只读)
  → CAPABILITY-ANCHOR.md

合并策略: L4 > L3 > L2 > L1
```

### 9.2 CapabilityAnchor配置示例

```yaml
# CAPABILITY-ANCHOR.md 模型能力定义
models:
  MODEL_GENERAL:
    capabilities: [chat, simple_qa, info_retrieval]
    max_tokens: 8192
    latency_target: "fast"
    
  MODEL_DEEP_THINKING:
    capabilities: [reasoning, architecture, coding, research]
    max_tokens: 32768
    complexity: [medium, high, extreme]
    latency_target: "slow"
    
  MODEL_VISION:
    capabilities: [image_understanding, ocr]
    input_modality: [image]
    output_modality: [text]
    
  MODEL_CODE_REVIEW:
    capabilities: [code_review, bug_detection, optimization]
    domain: [software_engineering]
```

**零硬编码保证**: 所有模型ID通过`{{MODEL_XXX}}`占位符在CapabilityAnchor中配置，运行时解析。

---

## 10. 两个方案详细对比

### 10.1 架构对比图

| 维度 | 另一个AI方案 | MR v2 |
|:---:|:---|:---|
| **架构层级** | 全局单一路由器 | 子Agent独立路由层 |
| **模型选择** | 硬编码映射 | 语义识别+偏好融合+CapabilityAnchor |
| **韧性降级** | 自建降级逻辑 | **100%委托LEP** |
| **配置方式** | 简单JSON | N019/N020四层配置 |
| **主模型保护** | ❌ 无 | ✅ 通信路径完全独立 |
| **沙盒机制** | ❌ 无 | ✅ 三层沙盒 |
| **ISC合规** | ❌ Markdown文档 | ✅ N022 ISC规则格式 |
| **硬编码** | ❌ `zhipu/glm-5`写死 | ✅ `{{MODEL_XXX}}`占位符 |

### 10.2 优劣势对比

#### 另一个AI方案

**优势**:
- ✅ 实现简单，快速上线
- ✅ 使用接口直观易用
- ✅ 任务分类清单详细

**劣势**:
- ❌ 全局硬编码，无法子Agent个性化
- ❌ 自建降级，未复用LEP
- ❌ 无主模型保护，可能阻塞通信
- ❌ 无沙盒，上线风险高
- ❌ 非ISC格式，无法接入DTO
- ❌ 模型名写死，无法配置化更换

#### MR v2方案

**优势**:
- ✅ 子Agent独立配置，按需调度
- ✅ **100%委托LEP，零复刻韧性逻辑**
- ✅ 主Agent通信完全独立，零阻塞
- ✅ 三层沙盒，防止断连
- ✅ 语义意图识别，准确率高
- ✅ N019/N020配置化，模型可任意更换
- ✅ N022 ISC合规，自动审计
- ✅ 零硬编码，CapabilityAnchor驱动

**劣势**:
- ⚠️ 架构复杂度高（意图识别+偏好融合+LEP委托）
- ⚠️ 开发周期长（预估10天 vs 2天）
- ⚠️ 需要CapabilityAnchor预配置

---

## 11. 输出物清单（N022合规）

| 文件 | 路径 | 说明 |
|:---|:---|:---|
| 架构设计文档 | `designs/mras-v2/ARCHITECTURE.json` | ISC格式元数据 |
| 详细设计文档 | `designs/mras-v2/DESIGN.md` | 本文档 |
| 实现计划 | `designs/mras-v2/IMPLEMENTATION.md` | 实施步骤、风险、测试策略 |
| 接口契约 | `designs/mras-v2/API.md` | TypeScript接口定义 |
| 配置Schema | `designs/mras-v2/CONFIG-SCHEMA.json` | N019/N020配置校验 |

---

## 12. 等待确认项

**设计方案已完成，等待用户确认**:

1. ✅ 架构设计是否符合预期？
2. ✅ LEP 100%复用方案是否可接受？
3. ✅ 子Agent独立配置 vs 全局路由的权衡？
4. ✅ 语义意图识别复杂度 vs 简单分类的权衡？
5. ✅ 是否进入开发阶段？（预估10天）

---

*设计文档版本: 2.0.0*
*ISC合规: N022 | N019 | N020*
*零硬编码保证: 所有模型ID使用{{MODEL_XXX}}占位符*
