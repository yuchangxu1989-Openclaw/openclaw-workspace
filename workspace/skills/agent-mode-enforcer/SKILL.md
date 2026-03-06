# Agent Mode Enforcer

## 名称
`agent-mode-enforcer` — Agent 模式强制决策器

## 描述
强制检查任务是否需要多 Agent 模式执行，防止主 Agent 违规使用单 Agent 处理复杂任务（代码生成、架构设计、安全标准制定等）。依据 SOUL.md 规则 M001，对任务进行语义分析并输出模式决策（single / multi）。

## 触发条件
- 主 Agent 接到任务前，需评估执行模式时调用
- 任务描述包含：编写代码、开发脚本、架构设计、ISC 规则制定、复杂评估报告等关键词
- 需要判断某任务是否需要 `sessions_spawn` 子 Agent 时

## 输入
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| taskDescription | string | ✅ | 任务描述文字 |
| context | object | ❌ | 附加上下文（可选） |

**CLI 用法：**
```bash
node index.cjs "任务描述"
# 返回码: 0=允许单Agent, 1=强制多Agent
```

## 输出
```json
{
  "allowed": false,
  "mode": "multi",
  "mustSpawn": true,
  "error": "此任务必须使用多Agent模式！请使用 sessions_spawn 调用子Agent。"
}
```
或
```json
{
  "allowed": true,
  "mode": "single"
}
```

## 依赖
- `../shared/paths` (WORKSPACE 路径常量)
- Node.js 内置模块: `fs`, `path`
- 无外部 API 调用

## 触发规则（关键词）
| 类别 | 代表关键词 |
|------|-----------|
| 代码 | 编写/开发/实现/修复/重构/优化代码、生成脚本 |
| 架构 | 架构设计、系统设计、流程设计 |
| 标准 | ISC规则、安全标准、准入准出标准 |
| 分析 | 复杂分析、多维度评估、调研报告 |

## 豁免场景（直接返回 single）
- 纯对话回复（收到、了解、HEARTBEAT_OK）
- 任务描述中包含 `【豁免单Agent】` 标记

## 使用示例

**编程调用：**
```js
const { enforceCheck } = require('./skills/agent-mode-enforcer/index.cjs');

const result = enforceCheck('编写ISC安全规则v2.0');
if (!result.allowed) {
  // 必须 sessions_spawn 子Agent
  console.log(result.error);
}
```

**生成豁免声明：**
```bash
node index.cjs --exemption "对话场景"
# 输出: 【豁免声明】本任务为对话场景，使用单Agent
```

## 违规处理
- 记录违规日志到 `logs/agent-enforcer/violations-YYYY-MM-DD.jsonl`
- 触发 Council of Seven 审议（按 SOUL.md 规则）
