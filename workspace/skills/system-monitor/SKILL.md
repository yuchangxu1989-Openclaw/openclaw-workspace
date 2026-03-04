---
name: skill-health-dashboard
description: 技能健康度评估仪表盘 - 自动化扫描所有技能，评估完整性、活跃度、依赖健康度，生成可视化报告
version: "1.0.3"
status: active
tags: [system, monitoring, health, dashboard, skill-assessment]
author: OpenClaw
---

# Skill Health Dashboard

技能健康度评估仪表盘，自动化扫描所有技能并生成健康报告。

## 功能

- **完整性评估**: SKILL.md、package.json、入口文件等必要文件检查
- **活跃度评估**: 基于Git历史计算技能活跃度
- **依赖健康度**: 检查依赖声明和本地依赖有效性
- **可视化报告**: 生成JSON和HTML格式报告

## 使用

```bash
# 扫描所有技能并生成报告
node skill-health-dashboard.js

# 输出详细JSON
node skill-health-dashboard.js --json

# 生成HTML报告
node skill-health-dashboard.js --html

# 指定输出目录
node skill-health-dashboard.js --output ./reports
```
