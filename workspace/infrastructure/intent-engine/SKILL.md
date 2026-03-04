# IntentScanner 意图识别引擎

- **name**: intent-scanner
- **description**: L3意图识别扫描器，CRAS快通道核心组件。LLM优先+正则降级双路径，扫描对话切片识别意图并emit事件。
- **version**: 1.0.0

## 核心API

### `new IntentScanner(options?)`
继承自EventEmitter。

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `options.registryPath` | string | `intent-registry.json` | 意图注册表路径 |
| `options.logDir` | string | `logs/` | 扫描日志目录 |
| `options.zhipuKey` | string | 自动加载 | 智谱API密钥 |
| `options.zhipuUrl` | string | 智谱官方地址 | API端点 |
| `options.zhipuModel` | string | `glm-5` | 模型名称 |
| `options.timeout` | number | 30000 | API超时(ms) |

### `scanner.scan(conversationSlice) → Promise<{intents, decision_logs, skipped, method}>`
主入口：扫描对话切片，识别意图。

**参数**: `conversationSlice` — `Array<{role: string, content: string, timestamp?: string}>`

**返回**:
```js
{
  intents: [{ intent_id, confidence, evidence, alternatives }],
  decision_logs: [{ what, why, confidence, alternatives, method, timestamp }],
  skipped: boolean,
  method: 'llm' | 'regex_fallback',
  reason?: string  // skipped时的原因
}
```

**执行路径**:
1. Feature flag检查 → ZHIPU_API_KEY检查
2. LLM路径：构建prompt → 调用智谱GLM-5 → 解析JSON响应
3. 降级路径（无key或LLM失败）：IC1/IC2正则匹配（IC3-IC5不可用）

## 依赖关系

```js
const EventBus = require('../event-bus/bus-adapter');           // 事件总线
const { log: decisionLog } = require('../decision-log/decision-logger');  // 审计日志
// 外部: 智谱GLM-5 API (https)
```

API密钥加载顺序：`process.env.ZHIPU_API_KEY` → `/root/.openclaw/.secrets/zhipu-keys.env` → null(降级)

## 事件

### Emit
- `intent.detected` → EventBus（文件级，跨模块）：`{intent_id, confidence, evidence, timestamp}`
- `intent.detected` → EventEmitter（进程内，向后兼容）
- `system.capability.degraded` → EventEmitter（LLM不可用时）

### Listen
- 通过Pipeline对话类事件触发（`user.message.*`, `conversation.*`, `chat.*`, `dialog.*`）

## Feature Flag 控制

| 环境变量 | 默认 | 说明 |
|----------|------|------|
| `INTENT_SCANNER_ENABLED` | true | false时scan()直接skip |
| `L3_INTENTSCANNER_ENABLED` | true | Pipeline层面开关 |

## 使用示例

```js
const { IntentScanner } = require('./infrastructure/intent-engine/intent-scanner');

const scanner = new IntentScanner();
const result = await scanner.scan([
  { role: 'user', content: '这个方案太差了，重做', timestamp: '2026-03-05T01:00:00Z' }
]);
// result.intents → [{ intent_id: 'IC1', confidence: 0.5, evidence: 'regex matched: [太差, 重做]' }]
```
