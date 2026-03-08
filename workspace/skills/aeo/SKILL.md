---
name: aeo
description: 智能体效果运营系统 - Phase 2 双轨运营
version: "2.0.15"
status: active
layer: infrastructure
tags: [aeo, quality, evaluation, dual-track]
---

# AEO Phase 2 - 智能体效果运营系统（双轨运营版）

distribution: both


## 简介

AEO Phase 2 是双轨运营实战系统，实现AI效果轨道和功能质量轨道的自动选择与实际运行。

## 核心组件

| 组件 | 文件路径 | 功能 |
|------|----------|------|
| 轨道选择器 | `src/evaluation/selector.cjs` | 根据技能类型自动选择轨道 |
| AI效果评测器 | `src/evaluation/ai-effect-evaluator.cjs` | 评测AI技能的输出质量 |
| 功能质量评测器 | `src/evaluation/function-quality-evaluator.cjs` | 评测工具技能的准确性和性能 |

## 快速使用

### 1. 轨道自动选择

```javascript
const { TrackSelector } = require('./src/evaluation/selector.cjs');

const selector = new TrackSelector();
const selection = selector.select({
  name: 'my-chat-bot',
  type: 'llm',
  description: 'AI对话机器人'
});

console.log(selection.track);      // 'ai-effect'
console.log(selection.evaluator);  // './ai-effect-evaluator.cjs'
```

### 2. 执行评测

```javascript
const { AIEffectEvaluator } = require('./src/evaluation/ai-effect-evaluator.cjs');

const evaluator = new AIEffectEvaluator();
const result = await evaluator.evaluate(skill, testCases);

console.log(result.overallScore);  // 0.85
console.log(result.passed);        // true/false
console.log(result.suggestions);   // 改进建议
```

## 评测维度

### AI效果轨道
- **相关性** (25%) - 输出与需求匹配度
- **连贯性** (20%) - 逻辑清晰度
- **有用性** (25%) - 实际帮助程度
- **创造性** (15%) - 内容新颖度
- **安全性** (15%) - 内容安全性

### 功能质量轨道
- **准确性** (30%) - 输出正确性
- **响应时间** (20%) - 执行速度
- **错误率** (25%) - 稳定性
- **兼容性** (15%) - 环境适配
- **稳定性** (10%) - 长期可靠性

### 全局决策流水线轨道（核心指标）
- **意图识别准确率** — 用户表达→L3语义意图事件提取的正确率（黄金评测集+合成数据集双验证）
- **规则匹配准确率** — 事件→ISC规则匹配命中正确规则的比率
- **任务执行准确率** — handler执行结果与预期结果的一致率
- **端到端跑通率** — 事件触发→规则匹配→handler执行→最终结果，全链路成功率

**数据集要求：**
- 黄金评测集：真实场景数据，准出门禁，data_source=real
- 合成数据集：锚定黄金评测集质量标准的规模化验证，data_source=synthetic
- 两个数据集共用同一套评测指标，格式/分布/标注规范对齐

## 技能类型映射

| 技能类型 | 轨道 | 置信度 |
|----------|------|--------|
| llm, chat, generation | AI效果 | 0.95 |
| tool, workflow, automation | 功能质量 | 0.95 |
| hybrid, agent | 混合 | 0.8 |

## 测试

```bash
node src/evaluation/test-dual-track.cjs
```

测试结果：16/16 通过 (100%)

## 文件结构

```
skills/aeo/
├── aeo.cjs                          # Phase 1 MVP入口
├── check.cjs                        # 基础检查脚本
├── config/
│   ├── aeo-config.json             # 系统配置
│   ├── checklist.json              # 准入检查清单
│   └── lto-subscriptions.json      # DTO订阅
├── src/evaluation/
│   ├── selector.cjs                # ✅ 轨道选择器
│   ├── ai-effect-evaluator.cjs     # ✅ AI效果评测器
│   ├── function-quality-evaluator.cjs # ✅ 功能质量评测器
│   ├── test-dual-track.cjs         # ✅ 测试套件
│   └── README.md                   # 使用文档
└── SKILL.md                        # 本文件
```

## Phase 2 交付清单

- [x] selector.cjs - 轨道自动选择
- [x] ai-effect-evaluator.cjs - AI效果评测
- [x] function-quality-evaluator.cjs - 功能质量评测
- [x] 测试通过 (16/16)

---

**版本**: 2.0.0 Phase 2  
**状态**: active  
**更新时间**: 2026-02-26


## 权限声明

> 风险等级: 🔴 CRITICAL

| 维度 | 需要 | 说明 |
|------|------|------|
| Filesystem | ✅ | 文件系统读写 |
| Network | ✅ | 网络请求 |
| Shell | ✅ | 命令执行 |
| Credential | ✅ | 密钥/凭证访问 |
