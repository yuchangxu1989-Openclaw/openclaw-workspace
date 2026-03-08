## 🧠 意图识别架构对齐（2026-03-07）

针对“LLM意图识别为评测主基座”已做强制对齐：

- **主判断链**：意图评测最终结果必须来自 LLM 语义识别结果。
- **辅助链**：关键词/正则只记录为 `auxiliaryCrossCheck`，仅用于交叉核验与debug，不得覆盖主判定。
- **Runner 对齐**：`executor.cjs` 在 `intentEvaluation=true` 时，强制走共享的 `intent-alignment.cjs`。
- **CRAS 对齐**：`skills/cras/intent-extractor.js` 的 `evaluateAccuracy()` 已改为调用同一套 LLM 主判定逻辑。
- **ISC 门禁**：`eval-quality-check.js` 新增 `intent-architecture-alignment` 检查，验证评测集、主判定实现、共享对齐模块是否存在。
- **环境约束**：以上改动全部为评测/校验路径，保持只读与沙盒安全，不会向生产事件总线新增写操作。

### Intent Evaluation Runner 示例

```javascript
const { EvaluationExecutor } = require('./executor.cjs');

const executor = new EvaluationExecutor();
const results = await executor.executeBatch([
  {
    type: 'prompt',
    intentEvaluation: true,
    chunk: '用户：把日志级别调成 debug，然后重启 gateway。',
    expected: [{ type: 'DIRECTIVE', target: '日志级别' }],
    intentExtractor: async () => [
      { type: 'DIRECTIVE', target: '日志级别', confidence: 0.95, summary: '用户要求执行操作' }
    ]
  }
]);
```

此时：
- `result.evaluation.llmPrimary` = 主判定
- `result.evaluation.auxiliaryCrossCheck` = 辅助信号
- `result.evaluation.policy` = `llm_primary_keyword_regex_auxiliary`


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
