# 意图探针 v2 多模型横向评测报告

**生成时间**: 2026-03-08 23:08:52
**评测集**: 128 cases, 覆盖8种ISC场景
**模型数**: 3

## 1. 总览对比矩阵

| 指标 | glm-4-flash | glm-4-plus | claude-opus |
| --- | --- | --- | --- |
| Harvest准确率 | 83.5% | 93.8% | 94.6% |
| Intent准确率 | 70.1% | 87.5% | 76.6% |
| Precision | 0.816 | 0.987 | 0.947 |
| Recall | 0.964 | 0.916 | 0.973 |
| F1 | 0.884 | 0.950 | 0.960 |
| TP/FP/FN/TN | 80/18/3/26 | 76/1/7/44 | 71/4/2/34 |
| 平均延迟 | 1597ms | 698ms | 2556ms |
| P50延迟 | 1390ms | 661ms | 2441ms |
| P95延迟 | 2838ms | 951ms | 4259ms |
| Prompt Tokens | 51373 | 52287 | 85625 |
| Completion Tokens | 4019 | 3358 | 4339 |
| 估算成本(CNY) | ¥0.0055 | ¥2.7822 | ¥81.1339 |
| 错误数 | 1 | 0 | 17 |

## 2. 分场景对比

| 场景 | glm-4-flash (Acc/F1) | glm-4-plus (Acc/F1) | claude-opus (Acc/F1) |
| --- | --- | --- | --- |
| 纠偏类 | 92% / 0.95 | 92% / 0.94 | 100% / 1.00 |
| 反复未果类 | 92% / 0.95 | 100% / 1.00 | 92% / 0.95 |
| 头痛医头类 | 92% / 0.94 | 69% / 0.71 | 92% / 0.94 |
| 连锁跷跷板类 | 85% / 0.90 | 85% / 0.88 | 85% / 0.89 |
| 自主性缺失类 | 92% / 0.95 | 100% / 1.00 | 100% / 1.00 |
| 全局未对齐类 | 69% / 0.80 | 100% / 1.00 | 100% / 1.00 |
| 交付质量类 | 83% / 0.90 | 100% / 1.00 | 92% / 0.95 |
| 认知错误类 | 77% / 0.84 | 100% / 1.00 | 100% / 1.00 |
| 否定类 | 90% / 0.92 | 90% / 0.92 | 100% / 1.00 |
| 教学类 | 60% / 0.71 | 100% / 1.00 | 86% / 0.86 |
| 根因请求类 | 75% / 0.00 | 100% / 0.00 | 100% / 0.00 |

## 3. 失败Case分析

### glm-4-flash (21 failures)

| ID | 场景 | 类型 | 消息 | 期望 | 实际 | 分类 |
| --- | --- | --- | --- | --- | --- | --- |
| 13 | correction | negative | 帮我把这个函数重构一下 | False | True | teaching |
| 23 | repeated_failure | negative | 这个功能好像有个小bug | False | True | correction |
| 31 | head_treat_head | positive | 别只改症状，找到根因再改 | True | False | root_cause_request |
| 49 | seesaw | negative | 帮我再加一个导出按钮 | False | True | teaching |
| 51 | seesaw | negative | 这两个模块有依赖关系，注意一下 | False | True | autonomy_lack |
| 62 | autonomy_lack | negative | 帮我检查一下这段代码有没有bug | False | True | correction |
| 74 | global_misalign | boundary | 改完之后别忘了同步其他地方 | False | True | correction |
| 75 | global_misalign | negative | 前后端都帮我更新一下 | False | True | correction |
| 76 | global_misalign | negative | 请确保所有相关模块都同步修改 | False | True | teaching |
| 77 | global_misalign | negative | 帮我把文档也一起更新了 | False | True | correction |
| 88 | quality_issue | negative | 请用markdown格式输出结果 | False | True | correction |
| 90 | quality_issue | negative | 输出的时候注意格式规范 | False | True | correction |
| 96 | cognitive_error | positive | 我说的用户是指终端用户不是管理员 | True | False | normal |
| 101 | cognitive_error | negative | 我补充一下需求细节 | False | True | teaching |
| 102 | cognitive_error | negative | 我重新描述一下这个需求 | False | True | autonomy_lack |
| 111 | negation | boundary | 我不太确定这是不是最好的方式 | False | True | autonomy_lack |
| 118 | teaching | positive | 本质上这是一个分布式一致性问题 | True | False | root_cause_request |
| 121 | teaching | boundary | 我解释一下这个设计的考虑 | False | True | teaching |
| 122 | teaching | negative | 这个技术栈有什么优势 | False | True | teaching |
| 124 | teaching | negative | 介绍一下这个框架的设计理念 | False | True | teaching |
| 128 | root_cause_request | positive_no_harvest | 什么情况，突然就不行了 | False | True | root_cause_request |

### glm-4-plus (8 failures)

| ID | 场景 | 类型 | 消息 | 期望 | 实际 | 分类 |
| --- | --- | --- | --- | --- | --- | --- |
| 6 | correction | positive | 怎么能把生产环境的配置删了 | True | False | normal |
| 27 | head_treat_head | positive | 你只是把报错压下去了，根本问题没解决 | True | False | root_cause_request |
| 29 | head_treat_head | positive | 这是治标不治本 | True | False | root_cause_request |
| 31 | head_treat_head | positive | 别只改症状，找到根因再改 | True | False | root_cause_request |
| 35 | head_treat_head | boundary | 这样改下去后面维护成本会很高 | True | False | normal |
| 43 | seesaw | positive | 改了接口之后，前端调用全报错了 | True | False | normal |
| 46 | seesaw | positive | 升级依赖后三个测试用例都挂了 | True | False | normal |
| 113 | negation | negative | 暂时先不做这个功能 | False | True | negation |

### claude-opus (6 failures)

| ID | 场景 | 类型 | 消息 | 期望 | 实际 | 分类 |
| --- | --- | --- | --- | --- | --- | --- |
| 23 | repeated_failure | negative | 这个功能好像有个小bug | False | True | quality_issue |
| 29 | head_treat_head | positive | 这是治标不治本 | True | False | root_cause_request |
| 46 | seesaw | positive | 升级依赖后三个测试用例都挂了 | True | False | quality_issue |
| 51 | seesaw | negative | 这两个模块有依赖关系，注意一下 | False | True | teaching |
| 90 | quality_issue | negative | 输出的时候注意格式规范 | False | True | quality_issue |
| 121 | teaching | boundary | 我解释一下这个设计的考虑 | False | True | teaching |

## 4. V1→V2 升级对比

| 维度 | V1 (关键词/正则) | V2 (LLM分类器) |
| --- | --- | --- |
| 分类引擎 | grep + 正则匹配 | LLM (GLM-4/Claude) |
| 泛化能力 | ❌ 仅匹配固定词 | ✅ 语义理解，覆盖隐含意图 |
| 场景覆盖 | 4类 (纠偏/否定/教学/追问) | 8类 (全部ISC场景) |
| 准确率 | ~70% (边界case差) | 见上表 |
| 延迟 | <1ms | 见上表 (100-2000ms) |
| 成本 | ¥0 | 见上表 |
| Fallback | N/A | 自动降级到V1关键词版 |

## 5. LLM调用方式

### 智谱GLM (glm-4-flash / glm-4-plus)
```
POST https://open.bigmodel.cn/api/paas/v4/chat/completions
Authorization: Bearer $ZHIPU_API_KEY
Model: glm-4-flash (低成本) / glm-4-plus (高精度)
Temperature: 0.1
```

### Claude Opus 4.6
```
POST $CLAUDE_BASE/v1/messages
x-api-key: $CLAUDE_KEY
Model: claude-opus-4-6
Temperature: 0.1
```

## 6. Fallback机制

```
用户消息
  │
  ├─ API Key存在? ─── 否 ──→ V1关键词Fallback
  │       │
  │      是
  │       │
  │  ┌────▼────┐
  │  │ LLM调用  │
  │  └────┬────┘
  │       │
  │  响应有效? ─── 否 ──→ V1关键词Fallback
  │       │
  │      是
  │       │
  │  JSON合法? ─── 否 ──→ V1关键词Fallback
  │       │
  │      是
  │       ▼
  └─→ V2 LLM结果输出
```

## 7. 推荐 & 生产选型

### 三模型雷达图

| 维度 | glm-4-flash | glm-4-plus | claude-opus | 权重 |
| --- | --- | --- | --- | --- |
| F1 | 0.884 | **0.950** | **0.960** | 40% |
| 延迟 | 1597ms | **698ms** | 2556ms | 25% |
| 成本/128call | **¥0.006** | ¥2.78 | ¥81.13 | 20% |
| 错误率 | 0.8% | **0%** | 13.3% | 15% |

### 生产决策

**✅ 推荐默认引擎: `glm-4-plus`**

理由:
- **F1=0.950** (仅低于Claude 0.01，但Claude有13.3%解析错误率)
- **延迟最低** (698ms，仅Claude的1/4、Flash的1/2)
- **零错误** (Claude因输出格式不稳定有17次解析失败)
- **成本可控** (¥0.02/条消息，每天1000条消息≈¥20)
- **Precision=0.987** (几乎无误报，避免正常消息被错误harvest)

Fallback链: `glm-4-plus → glm-4-flash(keyword) → v1-keyword`

### 回归测试结果

```
快速回归 (isc-c2-regression.sh): 16/16 ✅ 全部通过
完整评测 (benchmark_runner.py):   128 cases × 3 模型 已完成
```

## 8. 文件清单

| 文件 | 说明 |
| --- | --- |
| `scripts/intent-probe.sh` | v2意图探针 (LLM主+v1 fallback) |
| `scripts/isc-c2-regression.sh` | 16case快速回归测试 |
| `tests/benchmarks/intent/intent-probe-regression-100.json` | 128case完整评测集 |
| `tests/benchmarks/intent/benchmark_runner.py` | 三模型benchmark runner |
| `tests/benchmarks/intent/results/` | 各模型原始评测结果 |
| `skills/isc-core/rules/rule.user-message-intent-probe-001.json` | ISC规则 (已更新为v2) |
| `reports/intent-probe-v2-model-comparison.md` | 本报告 |
