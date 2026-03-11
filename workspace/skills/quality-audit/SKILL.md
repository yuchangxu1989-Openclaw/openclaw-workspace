---
name: quality-audit
description: 统一质量审计技能，整合auto-QA、ISC规则审计、completion review三大组件
version: "2.0.0"
status: active
allowed-tools: sessions_spawn, exec, read
---

# 质量审计（Quality Audit）v2.0.0

统一质量审计入口，四大模式覆盖ISC规则合规、子Agent产出、回顾性审计。

## 四大模式

### 1. isc-audit（默认）— ISC规则合规审计
- **五层覆盖率扫描**：意图→事件→规划→执行→验真
- **Handler存在性验证**：检查handler文件是否实际存在于磁盘
- **V4字段覆盖率**：必填(id/description/trigger/action/handler/enforcement)、推荐(name/version/fullchain_status/enforcement_tier/priority)、扩展(plan/verification)
- **孤儿Handler检测**：handler文件存在但无规则引用
- **输出**：合规报告JSON + 不合规项清单

### 2. auto-qa — 子Agent完成时自动审计
- **触发**：`subagent.completion` 事件
- **检查项**：文件变更、最近commit、语法错误、占位符残留、禁止文件修改、push状态
- **输出**：QA报告 + pass/partial/fail判定

### 3. completion-review — 回顾性审计
- **触发**：手动 or cron定时
- **检查项**：commit数量、未commit变更、未push、commit消息质量、空转commit、关键文件完整性
- **输出**：回顾报告JSON

### 4. full — 全量审计
- 组合 isc-audit + completion-review，综合评分

## 使用方式

### CLI（cron可调用）
```bash
# ISC规则审计（默认）
node skills/quality-audit/index.js

# 指定模式
node skills/quality-audit/index.js isc-audit
node skills/quality-audit/index.js auto-qa
node skills/quality-audit/index.js completion-review
node skills/quality-audit/index.js full

# JSON输出（适合管道处理）
node skills/quality-audit/index.js isc-audit --json
```

### 程序调用
```javascript
const audit = require('./skills/quality-audit');
const result = await audit({ mode: 'isc-audit' }, { logger: console });
```

## 输出示例（isc-audit）
```
判定: partial  评分: 6/10
五层覆盖: 意图95% 事件98% 规划89% 执行99% 验真71% | 全通62%
V4覆盖: 必填97% 推荐61% 扩展7% | 总体69%
```

## 关联
- **ISC核心**：`skills/isc-core/` — 规则和handler存储
- **报告目录**：`reports/quality-audit/` — 审计报告JSON
