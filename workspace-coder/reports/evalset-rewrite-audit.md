# 评测集重写盘点报告

> 生成时间：2026-03-08 14:42
> 审计人：coder subagent (Opus Thinking)

---

## 一、现有评测集总览

### 1. 主评测目录 `tests/benchmarks/intent/`

| 文件 | 用例数 | 类型 |
|------|--------|------|
| intent-benchmark-dataset.json | 80 | 单轮意图分类（IC1-IC5） |
| multi-turn-eval-dataset.json | 42 | 多轮对话意图分类 |
| real-conversation-samples.json | 41 | 真实对话样本 |
| **小计** | **163** | |

### 2. AEO 技能评测集 `skills/aeo/evaluation-sets/`

| 统计项 | 值 |
|--------|-----|
| 评测集目录数 | 73 |
| 用例总数 | 371 |
| 平均每集 | 5.1 条 |
| 典型结构 | `{id, dimension, type:"prompt", description, expected:"通过"}` |

### 3. 全量合计

| 来源 | 用例数 |
|------|--------|
| tests/benchmarks/intent/ | 163 |
| skills/aeo/evaluation-sets/ | 371 |
| **总计** | **534** |

---

## 二、复杂度分布

### IC 难度分布（intent-benchmark-dataset.json, 80条）

| IC等级 | 数量 | 占比 |
|--------|------|------|
| IC1（情绪识别） | 21 | 26.3% |
| IC2（规则触发） | 15 | 18.8% |
| IC3（战略/复杂意图） | 16 | 20.0% |
| IC4（隐含/推理意图） | 17 | 21.3% |
| IC5（一句话多意图） | 11 | 13.8% |

### 难度标签分布

| 难度 | 数量 | 占比 |
|------|------|------|
| easy | 45 | 56.3% |
| medium | 19 | 23.8% |
| hard | 16 | 20.0% |

---

## 三、关键指标（现状 vs 目标）

| 维度 | 现状 | 目标 | 结论 |
|------|------|------|------|
| **C2（言出法随复杂度）用例** | **0 条 (0%)** | **≥500 条** | 🔴 严重缺失 |
| 有完整执行链的用例 | **0 条 (0%)** | **100%（C2必须）** | 🔴 完全空白 |
| 有 badcase 判定条件的用例 | **0 条 (0%)** | **100%（C2必须）** | 🔴 完全空白 |
| 有 pass_criteria 的用例 | **0 条 (0%)** | **100%（C2必须）** | 🔴 完全空白 |
| 多轮对话占比 | 76/163 = **46.6%** | **≥80%** | 🟡 不足 |
| 真实对话占比 | 83/163 = **50.9%** | **≥80%** | 🟡 不足 |
| AEO 技能评测集质量 | 371 条全部为占位符 | 有实际测试逻辑 | 🔴 空架子 |

---

## 四、核心问题诊断

### 问题 1：零执行链覆盖
534 条用例中没有一条包含 `expected_execution_chain` 字段。所有用例都是"输入→意图标签"的单步映射，完全无法评测"言出法随"级别的多步自主执行能力。

### 问题 2：AEO 评测集全部是空架子
73 个评测集的 371 条用例，结构统一为 `{id, dimension, type:"prompt", description, expected:"通过"}`，没有实际输入、没有期望输出、没有判定逻辑，是批量生成的占位符。

### 问题 3：复杂度偏低
- 56.3% 的用例标记为 easy
- IC1（纯情绪识别）占比最高（26.3%）
- 没有涉及"12步执行链""9步重构链"级别的复杂场景

### 问题 4：覆盖面窄
10 类"言出法随"场景（CRAS学术洞察、对话洞察、全仓库改名、交付自检、规则全链路、未知意图发现、数据诚实、超时收敛、空key扩列、元问题识别）的覆盖率为 **0%**。

---

## 五、处置方案

### 保留（升级为背景参考）
- `intent-benchmark-dataset.json`：80 条 IC1-IC5 分类用例，作为基础意图识别能力基线
- `multi-turn-eval-dataset.json`：42 条多轮用例，部分可升级补执行链
- `real-conversation-samples.json`：41 条真实对话，最有价值的原始素材

### 新建 C2 黄金评测集
- 输出目录：`tests/benchmarks/intent/c2-golden/`
- 10 个场景文件，每个 ≥50 条 C2 用例
- 总量目标：≥500 条 C2
- 每条必须包含：trigger、expected_execution_chain、badcase_conditions、pass_criteria、required_capabilities

### 归档/降权
- `skills/aeo/evaluation-sets/` 下 371 条占位符用例：标记为 `deprecated`，不计入有效评测集

---

## 六、预期产出

| 产物 | 路径 | 数量 |
|------|------|------|
| CRAS学术洞察→系统优化 | c2-golden/01-academic-insight.json | ≥50 |
| CRAS对话洞察→长效固化 | c2-golden/02-conversation-insight.json | ≥50 |
| 全仓库改名/重构 | c2-golden/03-global-rename.json | ≥50 |
| 交付质量自检 | c2-golden/04-delivery-selfcheck.json | ≥50 |
| 言出法随规则创建 | c2-golden/05-rule-fullchain.json | ≥50 |
| 未知意图发现 | c2-golden/06-unknown-intent.json | ≥50 |
| 数据诚实/汇报 | c2-golden/07-data-honesty.json | ≥50 |
| 超时自动收敛 | c2-golden/08-timeout-convergence.json | ≥50 |
| 空key自动扩列 | c2-golden/09-auto-expansion.json | ≥50 |
| 元问题识别 | c2-golden/10-meta-problem.json | ≥50 |
| **合计** | | **≥500** |
