# D2 意图识别准确率分析报告

> 生成时间: 2026-03-05T07:47+08:00
> 分析范围: 14条真实测试数据 vs user-message-router.classifyIntent() regex引擎

## 系统架构说明

实际路由使用的是 `infrastructure/dispatcher/handlers/user-message-router.js` 中的 `classifyIntent()`，基于11条regex模式做 first-match 分类，映射到 IC0-IC5 → handler。

`infrastructure/intent-engine/intent-scanner.js` 是独立的 CRAS 意图扫描器（LLM+regex降级），**不参与实际路由**。其 FALLBACK_REGEX 仅覆盖 IC1/IC2 两类关键词。

intent-registry.json 定义了17个意图（IC1-IC5），但 **router 的 regex 与 registry 完全脱节** —— router 有自己的11条 pattern，未引用 registry。

---

## 逐条分析

| # | 输入 | Ground Truth (Router结果) | Expected Handler | 正确? | Miss根因 |
|---|------|--------------------------|------------------|-------|----------|
| 01 | "这个bug为什么反复出现" | IC3/engineering_defect → cras-knowledge-handler | cras-knowledge-handler | ✅ | — (但原benchmark标注为IC1情绪，存在标注歧义) |
| 02 | "太慢了而且方向也不对，先停下来重新规划" | IC0/unknown → cras-knowledge-handler (default fallback) | cras-knowledge-handler | ⚠️ | **复合意图无regex**。"太慢"不在IC1 pattern中，"方向不对"/"重新规划"无任何pattern。Handler碰巧正确（fallback=cras-knowledge），但意图识别本身错误 |
| 03 | "架构没问题，上线之前再加个监控告警模块" | IC0/unknown → cras-knowledge-handler (default fallback) | cras-knowledge-handler | ⚠️ | **认可+扩展复合意图无regex**。"架构没问题"不触发IC3（需要"缺陷/bug"），"监控告警"无pattern |
| 04 | "我们换个方向试试" | IC0/unknown → cras-knowledge-handler (default fallback) | cras-knowledge-handler | ⚠️ | **隐式拒绝无regex**。只有LLM能检测 |
| 05 | "帮我做一个股票数据分析工具…MACD…布林带…" | IC5/financial_analysis → analysis-handler | analysis-handler | ✅ | — |
| 06 | "200页行业白皮书PDF…提炼…知识卡片" | IC4/knowledge_extraction → dev-task-handler | dev-task-handler | ✅ | — |
| 07 | "对比…Agent和Manus、Devin…竞品…能力差异" | IC3/competitive_analysis → cras-knowledge-handler | cras-knowledge-handler | ✅ | — |
| 08 | "反复出现类似的bug…异步回调…缺陷模式" | IC3/engineering_defect → cras-knowledge-handler | cras-knowledge-handler | ✅ | — |
| 09 | "这规范写的不错，把流程标准化一下再发布上去" | IC0/unknown → cras-knowledge-handler (default fallback) | cras-knowledge-handler | ⚠️ | **认可+标准化复合意图无regex**。"不错"不在IC1 pattern（需完全匹配"很好"等），"标准化"/"发布"无pattern |
| 10 | "效率不高…工具用得不对…流程有问题…哪里出了问题" | IC3/problem_analysis → cras-knowledge-handler | cras-knowledge-handler | ✅ | — |
| 11 | "AI技术公众号…内容排期…推文草稿…封面图" | IC4/content_operation → dev-task-handler | dev-task-handler | ✅ | — |
| 12 | "论文的方法论有没有漏洞…样本选择…对照组" | IC3/academic_analysis → cras-knowledge-handler | cras-knowledge-handler | ✅ | — |
| 13 | "整体思路OK，但实现细节有问题，重新设计一下数据结构" | IC0/unknown (partial match possible on "出了问题") → cras-knowledge-handler | cras-knowledge-handler | ⚠️ | 实际上 "有问题" 可能匹配 IC3 pattern `/出了问题/`，但"有问题"≠"出了问题"，regex不够宽泛。即使匹配IC3也忽略了复合意图（反馈+重设计） |
| 14 | "从零做一个新技能…自动化的日报生成" | IC2/skill_creation → dev-task-handler | dev-task-handler | ✅ | — |

---

## 汇总统计

### 路由结果正确率

| 状态 | 数量 | 样本 |
|------|------|------|
| ✅ 意图+Handler均正确 | 9 | 01,05,06,07,08,10,11,12,14 |
| ⚠️ Handler碰巧正确但意图识别错误(fallback到IC0) | 5 | 02,03,04,09,13 |
| ❌ Handler错误 | 0 | — |

- **Handler准确率: 14/14 = 100%**（因为fallback handler恰好正确）
- **意图识别准确率: 9/14 = 64.3%**（5条落入IC0/unknown）

### 核心问题

**所有5个miss都落入IC0 → cras-knowledge-handler(default)**，恰好与expected handler一致。这意味着：
1. 当前系统的"准确率"被fallback handler的巧合掩盖了
2. 一旦不同意图类型需要不同handler，这些case就会全部失败

---

## 缺失意图 & 需补充的Regex

### Router中缺失的意图类型

| 意图类型 | 描述 | 受影响样本 | 可否用Regex? |
|----------|------|------------|-------------|
| composite.feedback_redirect | 反馈+方向调整 | 02, 13 | 部分可：`/太慢\|方向.*不对\|重新.*规划\|停下来.*重新/` |
| composite.approval_extend | 认可+追加需求 | 03, 09 | 部分可：`/没问题.*加\|不错.*再\|可以.*顺便/` |
| implicit_rejection | 隐式拒绝 | 04 | 极难：`/换个方向\|先不.*了\|算了/` 但误判率高 |

### 现有Pattern需扩展

| Pattern | 当前 | 建议扩展 | 原因 |
|---------|------|---------|------|
| IC1 emotion | `/不满\|投诉\|太差\|…/` | 加: `太慢\|方向不对\|有问题` | "太慢了"是负面反馈但未被捕获 |
| IC3 problem | `/效率\|出了问题\|哪里.*问题/` | 加: `有问题\|问题在` | "有问题"比"出了问题"更常见 |

### 架构级问题

1. **Router和Registry完全脱节**：Registry定义了17个意图(IC1-IC5)，Router有11条自己的regex，两者无引用关系
2. **IntentScanner未参与路由**：Scanner有LLM能力但不被dispatcher调用，仅作CRAS感知用
3. **复合意图(IC5)无regex覆盖**：Router中没有任何IC5 pattern，registry中有IC5定义但Router不读取
4. **First-match策略**：`classifyIntent`返回第一个匹配，对复合意图天然不友好

---

## 具体建议

### 1. Registry新增意图（0个 — 已有足够定义）

Registry已包含 `composite.feedback_and_redirect`、`composite.approval_and_extend`、`implicit_rejection` 等意图定义。问题不在registry缺失，而在router不使用registry。

### 2. Router需新增的Regex Pattern

```javascript
// 在 INTENT_PATTERNS 中新增：

// IC5 — Composite: 反馈+方向调整
{ pattern: /太慢.*重新|方向.*不对|停下来.*重新|先停.*重新|做的不错.*方向错|进度.*砍掉/i, 
  category: 'IC5', name: 'feedback_redirect' },

// IC5 — Composite: 认可+扩展
{ pattern: /没问题.*再加|不错.*再|可以.*顺便|行.*另外|就这样.*对了/i, 
  category: 'IC5', name: 'approval_extend' },

// IC4 — Implicit rejection (高误判风险，建议低confidence)
{ pattern: /换个方向|换个思路|先不做|暂时搁置/i, 
  category: 'IC4', name: 'implicit_direction_change' },
```

**注意**：IC5 pattern必须放在IC1之前，否则first-match会先命中IC1的情绪关键词。

### 3. 架构建议（中期）

- **让Router引用Registry**：从registry.json加载pattern，而非硬编码
- **IntentScanner集成到路由**：对IC0 fallback case调用Scanner的LLM路径做二次判断
- **多意图返回**：classifyIntent返回所有匹配（带confidence），由路由层决策

### 4. 现有Pattern修复

```javascript
// IC1: 扩展情绪词
{ pattern: /不满|投诉|太差|太慢|很好|感谢|喜欢|讨厌|满意|失望|开心|生气|难过/i, ... },

// IC3: 扩展问题分析
{ pattern: /效率|出了问题|有问题|哪里.*问题/i, ... },
```

---

## 结论

**表面准确率100%（handler全对），实际意图识别准确率64.3%（5/14落入IC0）。**

这5个miss全部因为default fallback碰巧指向正确handler而被掩盖。系统的真正脆弱点是：
1. 复合意图(IC5)完全无regex覆盖
2. 隐式意图(IC4)只有registry定义没有router实现  
3. Router和Registry是两套独立系统，未整合
