---
name: aeo/pdca
description: PDCA持续改进引擎（AEO子模块）
version: "0.6.0"
status: active
parent: aeo
---

# PDCA执行引擎（AEO子模块）

distribution: internal

原 `skills/pdca-engine/`，现已整合为AEO的子模块。

## 功能

- **状态机**：init→plan→do→check→act→done 生命周期管理
- **8个门禁**：plan准入/准出、do准入/准出、check准入/准出、act准入/准出
- **角色分离**：ISC-EVAL-ROLE-SEPARATION-001 硬拦截
- **Check Loop**：度量采集→基准对比→差距分析→告警推送→趋势记录
- **评测集完整性检查**：扫描散落数据、V4字段覆盖率、北极星覆盖分布

## 使用

```bash
# Check Loop（由AEO统一cron调度）
node skills/aeo/pdca/check-loop.js

# 状态机API
node skills/aeo/pdca/index.js --advance <taskId> <phase>
node skills/aeo/pdca/index.js --state <taskId>
```
