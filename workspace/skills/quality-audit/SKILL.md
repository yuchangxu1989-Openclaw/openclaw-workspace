---
name: quality-audit
description: >
  子Agent完成任务后的自动质量审计技能。覆盖五大维度：需求满足度、代码质量、
  研发标准符合性、V4评测标准对齐、交付完整性。输出结构化JSON审计报告，
  支持事件总线集成和cron全局扫描。
allowed-tools: sessions_spawn, exec, read
metadata:
  version: "3.0.0"
  status: active
---

# quality-audit v3.0.0

子Agent完成开发任务后的自动质量审计。五大维度全覆盖，输出结构化JSON报告。

## 触发场景

- 子Agent完成任务后自动触发质量审计
- 用户要求"审计质量"、"quality audit"、"QA检查"
- cron定时全局质量扫描
- 事件总线收到 `subagent.completion` 事件
- 用户要求"检查代码质量"、"审计交付物"

## 五大审计维度

### 1. 需求满足度（Requirement Fulfillment）
- task描述 vs 实际交付对比
- 遗漏项检测（task要求但未实现）
- 多余项检测（task未要求但修改了无关文件）
- 评分：满足比例

### 2. 代码质量（Code Quality）
- 空壳/TODO/FIXME/PLACEHOLDER检测
- JS/JSON/Shell语法错误扫描
- hardcode检测（绝对路径、magic number、密钥泄露）
- 文件大小异常检测（空文件、超大文件）

### 3. 研发标准符合性（Dev Standards Compliance）
- ISC规则五层展开检查（意图→事件→规划→执行→验真）
- Handler存在性验证
- V4字段覆盖率（必填/推荐/扩展）
- 命名规范（kebab-case目录、驼峰变量）
- 是否走了skill-creator流水线（有SKILL.md frontmatter）

### 4. V4评测标准对齐（V4 Eval Alignment）
- 必要字段完整性：scoring_rubric / north_star_indicator / gate
- 端到端可评测性：有evals/evals.json且非空
- 评测集质量：正例/反例均衡、覆盖边界场景

### 5. 交付完整性（Delivery Completeness）
- 遗留TODO/FIXME扫描
- 文档更新检查（SKILL.md与代码同步）
- commit状态（已commit、已push、commit消息质量）
- 禁止文件修改检测（openclaw.json等）

## 使用方式

### CLI
```bash
# 全量审计（默认，五大维度）
node skills/quality-audit/index.js

# 指定模式
node skills/quality-audit/index.js full
node skills/quality-audit/index.js auto-qa --agent=<id> --task=<label>
node skills/quality-audit/index.js isc-audit
node skills/quality-audit/index.js scan --path=<dir>

# JSON输出
node skills/quality-audit/index.js full --json
```

### 程序调用
```javascript
const audit = require('./skills/quality-audit');
const result = await audit({ mode: 'full' }, { logger: console });
// result.verdict: 'pass' | 'partial' | 'fail'
// result.dimensions: { requirement, codeQuality, devStandards, v4Alignment, delivery }
```

### 事件总线集成
审计完成后自动发布 `quality.audit.completed` 事件到事件总线。

## 输出格式

```json
{
  "mode": "full",
  "verdict": "partial",
  "score": 7,
  "dimensions": {
    "requirement":   { "score": 8, "verdict": "pass", "issues": [] },
    "codeQuality":   { "score": 6, "verdict": "partial", "issues": [...] },
    "devStandards":  { "score": 7, "verdict": "partial", "issues": [...] },
    "v4Alignment":   { "score": 5, "verdict": "partial", "issues": [...] },
    "delivery":      { "score": 9, "verdict": "pass", "issues": [] }
  },
  "summary": "...",
  "fixSuggestions": [...],
  "reportPath": "reports/quality-audit/full-2026-03-12T..."
}
```

## 关联
- **ISC核心**：`skills/isc-core/` — 规则和handler存储
- **报告目录**：`reports/quality-audit/`
- **事件总线**：`quality.audit.completed`
