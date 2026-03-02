# Model Router (MR) Phase 2 - Core Modules

模型路由自动切换机制 - Phase 2 核心模块实现

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                       MRRouter (主入口)                      │
├─────────────────────────────────────────────────────────────┤
│  ① IntentClassifier → 语义意图识别引擎                       │
│  ② PreferenceMerger → 子Agent偏好融合器                     │
│  ③ SandboxValidator → 三层沙盒验证                          │
│  ④ LEPDelegate      → LEP执行委托层                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────┐
              │  infrastructure/lep-core  │
              │  (100%复用，零复刻韧性)    │
              └───────────────────────────┘
```

## Modules

### 1. IntentClassifier (`src/intent-classifier.ts`)
- **功能**: 语义意图识别（vs 关键词匹配）
- **输出**: 5维意图向量 {taskCategory, complexity, input/output modality, domain, confidence}
- **特性**: 
  - 支持 reasoning/multimodal/general 三分类
  - 基于语义相似度的复杂度检测
  - 上下文感知增强

### 2. PreferenceMerger (`src/preference-merger.ts`)
- **功能**: 子Agent偏好与CapabilityAnchor能力矩阵融合
- **算法**: preference ∩ capability → candidate model chain
- **特性**:
  - 支持意图覆盖配置
  - 复杂度自适应排序
  - 零硬编码模型名称

### 3. SandboxValidator (`src/sandbox-validator.ts`)
- **功能**: 三层沙盒验证
- **层级**:
  - L1: 健康检查（50ms超时，内存缓存）
  - L2: 影子测试（1%采样，质量对比）
  - L3: 超时熔断（委托LEP原生）

### 4. LEPDelegate (`src/lep-delegate.ts`)
- **功能**: 100%复用LEP，零复刻韧性逻辑
- **委托内容**:
  - 熔断/重试/降级
  - WAL执行追踪
  - 模型链顺序执行

### 5. MRRouter (`src/mr-router.ts`)
- **功能**: 主入口，整合4个核心模块
- **API**: `routeAndExecute(request) → RouteResult`
- **特性**:
  - 非阻塞架构，支持取消
  - 详细阶段回调
  - 完整执行追踪

## Configuration

### Schema (`schema/mras-config-schema.json`)
N019/N020 compliant JSON Schema

### Intent Templates (`intent-templates/`)
- `reasoning-intents.json`: 推理型任务模板
- `multimodal-intents.json`: 多模态任务模板
- `general-intents.json`: 通用型任务模板

### Agent Config Example
```json
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

## Usage

```typescript
import { MRRouter, RouteRequest } from '@infrastructure/mr';

const router = new MRRouter();

const request: RouteRequest = {
  description: "分析这段代码的性能问题",
  agentConfig: {
    agentId: "agent-code-reviewer",
    version: "1.0.0",
    modelPreferences: {
      primary: "{{MODEL_CODE_REVIEW}}",
      fallbacks: ["{{MODEL_DEEP_THINKING}}", "{{MODEL_GENERAL}}"],
      strictMode: false
    }
  },
  options: {
    callbacks: {
      onIntentClassified: (intent) => console.log('Intent:', intent),
      onModelAttempt: (model) => console.log('Trying:', model)
    }
  }
};

const result = await router.routeAndExecute(request);
console.log('Used model:', result.usedModel);
console.log('Content:', result.content);
```

## ISC Compliance

- ✅ **N019**: Configuration-driven model selection
- ✅ **N020**: Zero hardcoded model names ({{MODEL_XXX}} placeholders)
- ✅ **N022**: ISC-compliant architecture documentation
- ✅ **100% LEP Reuse**: No resilience logic duplication

## Files Structure

```
infrastructure/mr/
├── src/
│   ├── index.ts              # 统一导出
│   ├── mr-router.ts          # 主入口 (780 lines)
│   ├── intent-classifier.ts  # 意图识别 (507 lines)
│   ├── preference-merger.ts  # 偏好融合 (556 lines)
│   ├── sandbox-validator.ts  # 沙盒验证 (485 lines)
│   └── lep-delegate.ts       # LEP委托 (392 lines)
├── schema/
│   └── mras-config-schema.json
├── intent-templates/
│   ├── reasoning-intents.json
│   ├── multimodal-intents.json
│   └── general-intents.json
├── package.json
└── tsconfig.json
```

## Model Placeholders

| Placeholder | Purpose |
|-------------|---------|
| `{{MODEL_GENERAL}}` | 通用对话模型 |
| `{{MODEL_DEEP_THINKING}}` | 深度思考模型 |
| `{{MODEL_VISION}}` | 视觉理解模型 |
| `{{MODEL_AUDIO}}` | 音频处理模型 |
| `{{MODEL_CODE_REVIEW}}` | 代码审查模型 |
| `{{MODEL_EMBEDDING}}` | 嵌入模型 |

## Next Steps

1. Install dependencies: `npm install`
2. Build: `npm run build`
3. Run tests: `npm test`
4. Integration with LEP core
