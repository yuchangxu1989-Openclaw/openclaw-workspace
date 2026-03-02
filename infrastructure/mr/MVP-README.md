# MR MVP 使用指南

## 快速开始

```javascript
const mr = require('./infrastructure/mr/mr-router');

// 方式1: 完整调用
const result = await mr.routeAndExecute({
  description: "分析这段代码的性能问题",
  agentId: "agent-code-reviewer",
  systemMessage: "你是一个代码审查专家",
  timeout: 60000
});

console.log(result.content);
console.log('Used model:', result.usedModel);

// 方式2: 快速调用
const result = await mr.quickRoute(
  "优化这个数据库查询", 
  "agent-db-expert", 
  30000
);
```

## 意图分类规则

| 意图 | 触发关键词 |
|------|------------|
| reasoning | 分析, 推理, 架构, 设计, 代码, 算法, 优化, 研究 |
| multimodal | 图, 图片, 图像, 视觉, 视频, 音频, 识别 |
| general | 默认分类 |

## 配置文件

创建 `infrastructure/mr/config/{agent-id}.json`:

```json
{
  "agent_id": "agent-myagent",
  "model_preferences": {
    "primary": "{{MODEL_DEEP_THINKING}}",
    "fallbacks": ["{{MODEL_GENERAL}}"]
  }
}
```

## 依赖

- `infrastructure/lep-core` - LEP执行引擎

## 模型占位符

- `{{MODEL_GENERAL}}` - 通用模型
- `{{MODEL_DEEP_THINKING}}` - 深度思考模型
- `{{MODEL_VISION}}` - 视觉模型
- `{{MODEL_CODE_REVIEW}}` - 代码审查模型
