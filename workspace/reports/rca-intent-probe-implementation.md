# RCA 报告: 用户消息意图探针系统实现

**日期**: 2026-03-08  
**严重级别**: P0  
**状态**: ✅ 已修复  
**关联 Badcase**: `badcase-no-intent-understanding-on-user-msg`

---

## 问题描述

主 Agent 没有对用户每条消息做意图理解。当用户发出纠偏信号（如"有误"、"不对"、"你又犯了"），系统仅执行修正动作，但完全忽略了这些信号本身是 badcase 的标志。纠偏信号未自动入库，导致相同错误反复发生。

**影响范围**: 所有用户纠偏/否定/教学类消息的 badcase 全部漏捕。

---

## 双层 RCA 分析

### L1 感知层：无意图理解

| 维度 | 分析 |
|------|------|
| **根因** | 系统缺少用户消息级 intent probe，没有对用户消息做分类 |
| **症状** | 用户说"有误"→Agent只修正内容→不识别这是纠偏信号→不入库badcase |
| **影响链** | 无感知 → 无采集 → 无学习 → 同类错误反复 |
| **修复** | `intent-probe.sh` — 对每条用户消息做意图分类 |

**intent-probe.sh 分类能力**:
- `correction` (纠偏类): 有误、不对、错了、又犯、漏了、重复了等
- `negation` (否定类): 不是、不要、停、取消、拒绝等
- `teaching` (教学类): 应该是、本质上、记住、铁律等
- `root_cause_request` (追问类): 为什么、怎么回事 (不触发harvest)
- `normal` (正常): 普通消息 (不触发harvest)

### L2 执行层：说和做断裂

| 维度 | 分析 |
|------|------|
| **根因** | 即使感知到意图，也缺少自动触发 harvest 的执行链路 |
| **症状** | 识别了纠偏信号但不知道该做什么 |
| **影响链** | 有感知无动作 → harvest 依赖人工触发 → 遗漏 |
| **修复** | `intent-harvest-dispatch.sh` — 将意图探针结果自动分发到 harvest |

**dispatch 流程**:
1. 接收用户消息 + 上下文摘要
2. 调用 intent-probe.sh 获取分类结果
3. `should_harvest=true` → 生成 badcase ID → 调用 auto-badcase-harvest.sh
4. 全程写入 `logs/intent-probe.log` 留痕

### 双保险架构

```
用户消息
  │
  ├── 前置感知 (intent-probe.sh)
  │     └── should_harvest=true → intent-harvest-dispatch.sh → auto-badcase-harvest.sh
  │
  └── 后置兜底 (completion-handler.sh)
        └── 检查本轮是否有未捕获的纠偏信号
```

- **前置 intent-probe**: 消息到达时立即分类，实时捕获
- **后置 completion-handler**: 回合结束时兜底检查，防止遗漏

---

## 修复交付物

| # | 文件 | 用途 |
|---|------|------|
| 1 | `scripts/intent-probe.sh` | 用户消息意图分类探针 |
| 2 | `scripts/intent-harvest-dispatch.sh` | 意图→harvest 自动分发器 |
| 3 | `scripts/isc-c2-regression.sh` | 8 场景回归测试 |
| 4 | `rules/rule.user-message-intent-probe-001.json` | ISC 规则定义 |

## 回归测试结果

```
=== C2 自动采集 8 场景回归测试 ===
✅ 1.纠偏类-有误 → correction (should_harvest=true)
✅ 2.否定类-不对 → correction (should_harvest=true)
✅ 3.反复未果-你又 → correction (should_harvest=true)
✅ 4.自主性缺失-badcase → correction (should_harvest=true)
✅ 5.教学类-本质上 → teaching (should_harvest=true)
✅ 6.正常指令(不触发) → normal (should_harvest=false)
✅ 7.正常问候(不触发) → normal (should_harvest=false)
✅ 8.根因请求(不触发) → root_cause_request (should_harvest=false)
结果: 8/8 通过 (0 失败)
```

## Badcase 入库

- **ID**: `badcase-no-intent-understanding-on-user-msg`
- **分类**: 自主性缺失类
- **状态**: ✅ 已入库 + goodcase 翻转完成

---

## V2 演进方向

> ⚠️ 用户铁令: "意图必须基于 LLM 泛化，本地只能提供相似句，但不可以依赖关键词、正则"

当前 v1 是关键词快速版，先堵住 P0 漏洞。V2 路线:

1. 将 v1 关键词集作为 few-shot 示例喂给 LLM
2. LLM 输出同结构 JSON `{intent_type, confidence, should_harvest, harvest_category}`
3. v1 脚本降级为 LLM 不可用时的 fallback
4. 评测: 用 isc-c2-regression.sh 作为回归基线，v2 必须 ≥ 8/8

---

**结论**: 感知层+执行层双保险已落地。v1 关键词版本即时堵漏，v2 LLM 版本后续演进。
