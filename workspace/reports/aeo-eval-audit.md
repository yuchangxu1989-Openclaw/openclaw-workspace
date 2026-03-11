# AEO评测标准与Case审计报告

> 审计时间：2026-03-11 11:42 GMT+8
> 审计范围：V4评测标准、423条golden test set、评测runner、质量审计技能

---

## 一、总体结论：系统性空转

| 维度 | 评分 | 判定 |
|------|------|------|
| V4字段覆盖率 | 3/10 | 表面100%，实质空壳 |
| scoring_rubric质量 | 1/10 | 99.8%是expected_output的复制粘贴 |
| north_star同质化 | 2/10 | 423条case只有5个去重值 |
| 评测runner可用性 | 3/10 | run-eval.js测IC分类，不测C2行为 |
| quality-audit技能 | 0/10 | 确认空壳，index.js只有TODO |
| 端到端闭环 | 2/10 | 评测集→评测器→报告链路断裂 |

**综合评分：1.8/10** — 之前审计说"2.9/10"基本属实，甚至偏乐观。

---

## 二、423条Golden Test Set深度审计

### 2.1 V4字段覆盖率（表面数据）

| 字段 | 覆盖数 | 覆盖率 | 判定 |
|------|--------|--------|------|
| scoring_rubric | 423/423 | 100% | ⚠️ 虚假覆盖 |
| north_star_indicator | 423/423 | 100% | ⚠️ 严重同质化 |
| gate | 423/423 | 100% | ⚠️ 只有A/B两档 |
| complexity | 423/423 | 100% | ❌ 全部C2，零多样性 |
| execution_chain_steps | 413/423 | 97.6% | ✅ 唯一合格项 |
| gate_relevance | 0/423 | 0% | ❌ 完全缺失 |
| process_indicators | 0/423 | 0% | ❌ 完全缺失 |
| layer | 0/423 | 0% | ❌ 完全缺失 |

### 2.2 scoring_rubric — 最严重的坑

**核心发现：407条string类型rubric中，406条（99.8%）是expected_output的原文复制，仅加了"系统应执行: "前缀。**

这意味着评分标准 ≡ 预期答案，完全丧失了评分标准应有的功能：
- 没有分级（pass/partial/badcase）：仅4.4%有分级描述
- 没有量化指标：仅7.6%包含任何数字型标准
- 无法指导评委打分：评委看到的"标准"就是答案本身

16条object类型rubric中：
- 10条来自mined-from-memory.json，有pass_criteria/partial_criteria/fail_criteria结构，但没有pass/partial/badcase快捷键
- 6条来自mined-glm5-test.json，有完整的pass/partial/badcase三级结构 ← **唯一合格的6条**

**合格率：6/423 = 1.4%**

### 2.3 north_star_indicator — 严重同质化

423条case只有5个去重值：

| north_star_indicator | 数量 | 占比 |
|---------------------|------|------|
| 认知层真实代码覆盖率 | 123 | 29.1% |
| 根因分析覆盖率 | 96 | 22.7% |
| 自主闭环率 | 77 | 18.2% |
| 独立QA覆盖率 | 64 | 15.1% |
| 言出法随达成率 | 63 | 14.9% |

这些是通用的系统级指标，不是case级别的北极星。一个"修测试导致连锁回归"的case和一个"缺少项目管理文件"的case，不应该共享同一个north_star。

### 2.4 gate分布

| Gate | 数量 | 占比 |
|------|------|------|
| Gate-A | 196 | 46.3% |
| Gate-B | 227 | 53.7% |
| Gate-C | 0 | 0% |
| Gate-D | 0 | 0% |

只有两档门禁，缺乏梯度区分。

### 2.5 complexity — 零多样性

全部423条均为C2。没有C1（简单）、C3（复杂）、C4（极端）的梯度分布。评测集无法测试不同难度下的系统表现。

### 2.6 data_source

全部423条标记为`real_conversation`。按评测集注册标准，应有synthetic合成数据集作为规模化验证补充，目前完全缺失。

---

## 三、评测Runner审计

### 3.1 run-eval.js — 测错了东西

| 问题 | 详情 |
|------|------|
| 测试目标错位 | 测IC1-IC5意图分类，但golden test set是C2行为评测（纠偏类/认知错误类等8类） |
| 分类器是mock | 内置正则规则做IC分类，不是真正的LLM评测 |
| 最新报告结果 | 8/9类别准确率0%，仅"反复未果类"1/1=100% |
| 与golden set脱节 | golden set的category字段（纠偏类等）和runner的IC分类（IC1-IC5）是两套体系 |

### 3.2 eval-case-runner.js — 只输出模板

- 不执行任何评测，只生成executor/evaluator的任务描述JSON
- 注释写着"实际的Agent调用由eval-engine.sh通过OpenClaw sessions_spawn完成"
- 但eval-engine.sh不存在
- 角色分离设计（coder执行 + reviewer评测）是正确的，但未实现

### 3.3 e2e-eval.js — 最接近可用

- 双模型架构（test-model + judge-model），设计合理
- 支持L1意图 + L2决策路径评测
- 有fallback链（glm-5 → glm-4-0520 → glm-4-flash）
- **但**：没有找到成功运行的报告输出（reports/e2e-eval-results/目录不存在或为空）
- 未验证是否能端到端跑通

### 3.4 双轨评测器（selector/ai-effect/function-quality）

三个CJS文件代码量合计1663行，无placeholder，逻辑完整。但：
- 评测的是**技能质量**（相关性/连贯性/准确性/响应时间）
- 不评测**C2行为质量**（纠偏响应/自主闭环/根因分析）
- 与golden test set的评测目标完全不对齐

---

## 四、quality-audit技能审计 — 确认空壳

### 4.1 index.js — 纯骨架

```javascript
async function run(input, context) {
  // TODO: 实现 quality-audit 的核心逻辑
  return {
    ok: true,
    message: 'quality-audit 执行完成（骨架）',
  };
}
```

**任何调用都返回ok:true，不做任何实际审计。**

### 4.2 SKILL.md — 文档描述了三个组件，但全在别的技能里

| 组件 | 实际位置 | quality-audit自身实现 |
|------|---------|---------------------|
| Auto-QA | isc-core/handlers/auto-qa-on-completion.js | ❌ 无 |
| ISC规则审计 | isc-core/bin/audit-rules.sh | ❌ 无 |
| 架构评审 | architecture-review-pipeline/ | ❌ 无 |

quality-audit是一个**纯文档壳**，声称整合三大组件但自身代码为零。它的价值仅在于SKILL.md作为索引文档指向其他技能。

---

## 五、根因分析

| 根因 | 影响 |
|------|------|
| V4字段批量填充时用expected_output填scoring_rubric | 99.8%的评分标准无效 |
| north_star从固定5选1列表中选取 | 无法区分case级别的核心指标 |
| 评测runner和评测集分属两套体系 | IC1-5 vs 8类C2行为，无法对接 |
| 缺少评测闭环验证 | 没人跑过完整评测来发现这些问题 |
| quality-audit作为"整合技能"被交付 | 实际只是文档索引，无执行能力 |

---

## 六、修复优先级

### P0（阻断性）

1. **重写scoring_rubric**：423条case全部需要重写为三级结构（pass/partial/badcase），每级给出具体可判定的行为描述，禁止复制expected_output
2. **north_star去同质化**：每条case定义case级别的北极星指标，而非从5个通用指标中选
3. **评测runner对齐golden set**：e2e-eval.js需要适配C2行为评测的8类category，而非IC1-5

### P1（严重）

4. **补充gate_relevance/process_indicators/layer**：3个V4字段覆盖率0%
5. **补充complexity梯度**：增加C1/C3/C4难度case，当前全部C2
6. **quality-audit实现**：要么实现真正的整合调度逻辑，要么删除这个空壳技能
7. **补充synthetic数据集**：当前只有real_conversation，缺少合成数据的规模化验证

### P2（改进）

8. **eval-case-runner.js补全执行层**：实现sessions_spawn调用，而非只输出模板
9. **Gate扩展到C/D档**：当前只有Gate-A/B
10. **评测报告标准化**：统一run-eval.js和e2e-eval.js的输出格式

---

## 七、抽样证据

### 典型bad rubric（99.8%的case都是这样）

```json
{
  "scoring_rubric": "系统应执行: 应先做根因定位（main被禁派发 + provider命名约束 + 测试语义变化），再最小化修改测试夹具与断言；一次形成可复现修复链并验证全量相关测试通过，避免盲目全局sed造成连锁回归。"
}
```
↑ 这不是评分标准，这是expected_output的复制。评委无法据此区分pass/partial/badcase。

### 合格rubric示例（仅6条）

```json
{
  "scoring_rubric": {
    "pass": "立即识别为基础设施级缺失，创建PROJECT-TRACKER.md+写入MEMORY规则+git提交，全程自动无需用户催促",
    "partial": "创建了跟踪文件但规则未固化到MEMORY/ISC，或需要用户确认才推进",
    "badcase": "只回复'好的我会注意'而未创建任何持久化文件；或等用户具体说要创建什么文件"
  }
}
```
↑ 这才是可执行的评分标准。

---

*审计完成。核心结论：评测体系存在系统性空转——字段覆盖率的表面数据掩盖了内容质量的全面塌方。*
