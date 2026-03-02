# AEO Phase 2 - 双轨运营系统

## 📦 交付组件

| 组件 | 文件 | 功能 |
|------|------|------|
| 轨道选择器 | `selector.cjs` | 根据技能类型自动选择AI效果轨道或功能质量轨道 |
| AI效果评测器 | `ai-effect-evaluator.cjs` | 评测AI相关技能的输出质量、创造性 |
| 功能质量评测器 | `function-quality-evaluator.cjs` | 评测工具/工作流技能的准确性、性能 |
| 测试套件 | `test-dual-track.cjs` | 完整测试覆盖 |

## 🚀 快速开始

### 1. 轨道选择

```javascript
const { TrackSelector } = require('./selector.cjs');

const selector = new TrackSelector();

const result = selector.select({
  name: 'my-skill',
  type: 'llm',  // llm, chat, tool, workflow, hybrid, etc.
  description: '技能描述'
});

console.log(result.track);      // 'ai-effect' 或 'functional-quality'
console.log(result.confidence); // 置信度
```

### 2. AI效果评测

```javascript
const { AIEffectEvaluator } = require('./ai-effect-evaluator.cjs');

const evaluator = new AIEffectEvaluator();

const skill = {
  name: 'chat-bot',
  execute: async (input) => 'AI回复内容'
};

const testCases = [
  { input: '你好', expected: '友好回复' },
  { input: '讲个故事', expected: '有趣故事' }
];

const result = await evaluator.evaluate(skill, testCases);
console.log(result.overallScore);  // 总分
console.log(result.passed);        // 是否通过
```

### 3. 功能质量评测

```javascript
const { FunctionQualityEvaluator } = require('./function-quality-evaluator.cjs');

const evaluator = new FunctionQualityEvaluator({ iterations: 5 });

const skill = {
  name: 'api-client',
  execute: async (input) => {
    // 调用API
    return result;
  }
};

const result = await evaluator.evaluate(skill, testCases);
console.log(result.performanceReport);  // 性能报告
```

## 📊 评测维度

### AI效果轨道

| 维度 | 权重 | 阈值 | 说明 |
|------|------|------|------|
| 相关性 | 25% | 0.8 | 输出与需求匹配程度 |
| 连贯性 | 20% | 0.75 | 逻辑清晰、结构完整 |
| 有用性 | 25% | 0.8 | 对实际问题有帮助 |
| 创造性 | 15% | 0.6 | 内容新颖、有创意 |
| 安全性 | 15% | 0.9 | 无有害内容 |

### 功能质量轨道

| 维度 | 权重 | 阈值 | 说明 |
|------|------|------|------|
| 准确性 | 30% | 0.95 | 输出与预期一致 |
| 响应时间 | 20% | 0.9 | 执行速度 |
| 错误率 | 25% | 0.95 | 错误发生频率 |
| 兼容性 | 15% | 0.85 | 不同环境适配 |
| 稳定性 | 10% | 0.9 | 长时间可靠性 |

## 🔧 技能类型映射

```javascript
// 自动选择规则
'llm'        → AI效果轨道 (置信度0.95)
'chat'       → AI效果轨道 (置信度0.95)
'generation' → AI效果轨道 (置信度0.95)
'tool'       → 功能质量轨道 (置信度0.95)
'workflow'   → 功能质量轨道 (置信度0.95)
'hybrid'     → 混合轨道 (置信度0.8)
```

## 🧪 运行测试

```bash
cd /root/.openclaw/workspace/skills/aeo/src/evaluation
node test-dual-track.cjs
```

## 📈 测试结果

```
总测试数: 16
✅ 通过: 16
❌ 失败: 0
通过率: 100%
```

## 📝 CLI使用

```bash
# 选择轨道
node selector.cjs "skill-name" "llm" "技能描述"

# AI效果评测
node ai-effect-evaluator.cjs "skill-name"

# 功能质量评测
node function-quality-evaluator.cjs "skill-name"
```

---

**版本**: AEO Phase 2  
**状态**: ✅ 已交付并测试通过  
**交付时间**: 2026-02-26
