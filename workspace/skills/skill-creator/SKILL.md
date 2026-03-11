---
name: skill-creator
description: >
  技能全生命周期管理工具。支持创建新技能骨架、评估技能触发准确率、
  迭代优化技能描述、打包分发技能文件，以及创建后自动注册到能力锚点和ISC路由。
  适用于需要新建技能、改进现有技能质量、或将脚本技能化的场景。
---

# skill-creator

技能全生命周期管理工具，覆盖从创建到评估、优化、打包、注册的完整流水线。

## 触发场景

- 用户要求"创建新技能"、"新建skill"、"技能化"
- 用户要求"评估技能"、"测试技能触发率"、"跑eval"
- 用户要求"优化技能描述"、"提升技能质量"、"improve skill"
- 用户要求"打包技能"、"导出skill"、"package skill"
- 自动技能发现流程检测到候选脚本需要技能化

## 功能模块

### 1. validate — 快速校验
校验技能目录结构是否合规（SKILL.md frontmatter格式、必填字段等）。

### 2. eval — 触发评估
用LLM模拟技能选择，测试一组query是否正确触发/不触发目标技能。
需要 `evals/evals.json` 定义测试集。

### 3. improve — 迭代优化
基于eval结果，调用LLM生成改进后的技能描述，支持train/test分割和多轮迭代。

### 4. package — 打包分发
将技能目录打包为 `.skill` 文件，排除 `__pycache__`、`node_modules`、`evals/` 等。

### 5. post-create — 创建后集成
技能创建/更新后自动执行：
- 注册到 `CAPABILITY-ANCHOR.md`
- 生成ISC意图路由规则
- 校验注册结果

## 输入

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| action | string | ✅ | 操作类型：validate / eval / improve / package / post-create |
| skillPath | string | ✅ | 目标技能目录的绝对路径 |
| maxIterations | number | ❌ | improve模式最大迭代次数，默认5 |
| holdout | number | ❌ | improve模式测试集比例，默认0.2 |
| model | string | ❌ | 覆盖默认模型 |
| outputDir | string | ❌ | package模式输出目录 |

## 输出

```json
{
  "ok": true,
  "action": "validate",
  "skillName": "example-skill",
  "result": { ... },
  "duration_ms": 1234
}
```

## 依赖

- Python 3.10+（scripts/目录下的核心脚本）
- anthropic Python SDK（eval/improve模式需要API Key）
- PyYAML（quick_validate需要）
