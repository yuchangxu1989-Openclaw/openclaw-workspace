# 评测集 V4 对齐核查报告

> 审计日期：2026-03-10 | 审计人：analyst subagent
> V4标准文档：`JxhNdoc7ko7ZLwxJUJHcWyeDnYd`（评测标准与基线V4）

---

## 一、总览

| 维度 | V4要求 | 当前状态 | 达标 |
|------|--------|----------|------|
| 评测用例总数 | ≥ 500条 | 1,304条 | ✅ |
| C2占比 | ≥ 80% | ~69%（901/1304） | ❌ |
| 真实对话占比 | ≥ 80% | ~73%（955/1304） | ❌ |
| 多轮对话占比 | ≥ 80% | 待精确统计（估计~65%） | ⚠️ |
| 北极星指标全覆盖 | 5项均有case | 3强2弱 | ❌ |
| Gate门禁case | Pre-Gate/Gate-A/Gate-B | 无专项case | ❌ |
| 评分标准 | Pass/Partial/Badcase | 部分数据集有，多数缺失 | ❌ |

---

## 二、评测集结构清单

| 数据集 | 路径 | Case数 | 难度 | 来源 |
|--------|------|--------|------|------|
| intent-benchmark | `intent/intent-benchmark-dataset.json` | 80 | easy/medium/hard | 混合 |
| multi-turn | `intent/multi-turn-eval-dataset.json` | 42会话/136轮 | 混合 | 真实对话 |
| probe-regression | `intent/intent-probe-regression-100.json` | 128 | 混合 | 混合 |
| real-conversation | `intent/real-conversation-samples.json` | 54 | 混合 | 真实对话 |
| auto-generated | `intent/auto-generated-from-corrections.json` | 49 | C2 | 纠偏采集 |
| c2-golden | `intent/c2-golden/*.json`（非archive） | 852 | 全C2 | 真实对话 |
| scenario-benchmark | `scenarios/scenario-benchmark-dataset.json` | 14 | 混合 | 混合 |
| scenario-individual | `scenarios/scenario-*.json` | 47个文件 | 混合 | 混合 |
| pipeline | `pipeline/pipeline-benchmark-dataset.json` | 38 | easy/mixed | 合成 |
| **合计** | | **1,304** | | |

---

## 三、北极星指标覆盖矩阵

| 北极星指标 | V4阈值 | 有无专项Case | Case分布 | 覆盖评估 |
|-----------|--------|-------------|----------|----------|
| 言出法随达成率 | ≥90% | 无专项 | c2-golden中零散引用（~18次），无独立测试集 | ⚠️ 弱覆盖 |
| 自主闭环率 | ≥95% | 无专项 | "自主性缺失类"73条（c2-golden），real-conversation 1处引用 | ⚠️ 间接覆盖 |
| 认知层真实代码覆盖率 | 100% | 无专项 | c2-golden仅1处引用"代码覆盖" | ❌ 严重缺失 |
| 独立QA覆盖率 | 100% | 无专项 | c2-golden中~50次引用，分布在多个文件 | ⚠️ 中等覆盖 |
| 根因分析覆盖率 | 100% | 无专项 | c2-golden中~100+次引用，覆盖最广 | ✅ 较好覆盖 |

### 关键发现

1. **无任何数据集包含 `north_star_indicator` 字段** — 北极星指标与case之间缺乏结构化映射，只能通过文本内容间接关联
2. **"认知层真实代码覆盖率"几乎无case覆盖** — 这是V4要求100%达标的指标，但评测集中仅有1处文本引用
3. **"言出法随"覆盖薄弱** — 作为V4首要指标（≥90%），缺少专门验证ISC规则全链路即时生效的case
4. **"自主闭环"靠间接覆盖** — "自主性缺失类"73条case测试的是缺陷场景，但缺少正向验证自主闭环能力的case

---

## 四、过程指标（7大类）覆盖分析

| 过程指标类别 | V4子指标数 | 评测集覆盖情况 |
|-------------|-----------|---------------|
| 感知层 | 5项（意图召回≥98%等） | ✅ intent-benchmark(80) + probe-regression(128) + c2-golden覆盖意图识别 |
| 认知层 | 3项（代码遍历100%等） | ❌ 无专项case测试认知映射是否读真实代码 |
| 规划层 | 4项（执行链规划≥95%等） | ⚠️ pipeline(38)部分覆盖执行链，scenario部分覆盖任务拆分 |
| 执行层 | 7项（执行成功率≥99%等） | ⚠️ pipeline(38)覆盖部分，缺少空跑率/并行利用率专项 |
| 验真层 | 9项（效果验真≥90%等） | ❌ 无专项case，c2-golden中有零散引用 |
| 治理层 | 10项（Badcase归档≥99%等） | ⚠️ auto-generated(49)体现纠偏转规则，但多数治理指标无case |
| 工具可信层 | 4项（审计回收率100%等） | ❌ 完全无覆盖 |

---

## 五、Gate门禁覆盖分析

| Gate | V4定义 | 评测集覆盖 |
|------|--------|-----------|
| Pre-Gate（基础完整性前置门禁） | ISC规则创建后的基础完整性检查 | ❌ 无专项case |
| Gate-A（审计工具可信门） | 审计工具自身的可信度验证 | ❌ 无专项case |
| Gate-B（标准-脚本绑定门） | 评测标准与执行脚本的绑定验证 | ❌ 无专项case |
| 四门模型整体 | Pre-Gate + 基础设施 + 功能 + 全局自治 | ❌ 无端到端Gate流程case |

scenario文件中有2处提及"Gate"（conditional-branching、os-interaction），但仅为场景描述中的关键词，非Gate门禁专项测试。

---

## 六、评分标准对齐分析

V4要求的评分体系：**Pass / Partial / Badcase**（三级）

| 数据集 | 评分字段 | 与V4对齐度 |
|--------|---------|-----------|
| c2-golden/goodcases-from-badcases | `scoring_rubric`, `negative_example`, `root_cause_to_avoid` | ✅ 最接近V4标准 |
| c2-golden/mined-* | `expected_output`, `execution_chain_steps` | ⚠️ 有期望输出但无显式评分等级 |
| intent-benchmark | `expected_ic`, `expected_intents` | ❌ 仅有期望分类，无Pass/Partial/Badcase |
| multi-turn | `expected_ic`, `expected_confidence` | ❌ 无评分标准 |
| probe-regression | `expected_harvest`, `expected_intent` | ❌ 无评分标准 |
| real-conversation | `expected_intent_class`, `expected_confidence` | ❌ 无评分标准 |
| scenario-* | `assertions`（部分） | ⚠️ 有断言但非Pass/Partial/Badcase体系 |
| pipeline | `expected_rules_matched_min/max`, `expected_circuit_break` | ⚠️ 数值断言，非三级评分 |

### 关键问题

- **仅goodcases-from-badcases（426条）有完整评分框架**，占总量的33%
- 其余67%的case缺乏V4要求的Pass/Partial/Badcase评分标准
- V4附录B明确要求每个case必须有"判定标准编写（Pass/Partial/Badcase）"

---

## 七、V4治理层硬性要求对照

| V4治理要求 | 当前状态 | 达标 |
|-----------|---------|------|
| 评测用例总数 ≥ 500条 | 1,304条 | ✅ |
| 真实对话占比 ≥ 80% | ~73%（c2-golden 852 + real-conv 54 + auto 49 ≈ 955） | ❌ 差7% |
| 多轮对话占比 ≥ 80% | c2-golden多数标记multi_turn:true，但intent-benchmark/probe-regression多为单轮 | ⚠️ 需精确统计 |
| C2占比 ≥ 80% | c2-golden 852 + auto 49 = 901 C2 / 1304 total ≈ 69% | ❌ 差11% |
| C2评测用例8类自动采集率 ≥ 90% | c2-golden有8类分类（交付质量/全局未对齐/反复未果/头痛医头/纠偏/自主性缺失/认知错误/连锁跷跷板） | ⚠️ 分类存在但采集率未可测 |
| Case唯一编号 | 各数据集有id字段 | ✅ |
| Case来源标注 | c2-golden有source/data_source字段 | ⚠️ 部分数据集缺失 |

---

## 八、缺口清单（按优先级排序）

### P0 — 阻塞性缺口

1. **认知层真实代码覆盖率：无专项case**
   - V4要求100%，当前评测集几乎无法测量此指标
   - 需新增：验证Agent是否用grep/find读真实代码而非文档摘要的case（建议≥20条）

2. **Gate门禁：完全无覆盖**
   - Pre-Gate/Gate-A/Gate-B均无专项测试case
   - 需新增：四门模型端到端验证case（建议每Gate≥10条，共≥40条）

3. **评分标准未统一**
   - 67%的case缺乏Pass/Partial/Badcase评分标准
   - 需为所有现有case补充scoring_rubric字段

### P1 — 重要缺口

4. **C2占比不足（69% vs 80%要求）**
   - 缺口：需额外~180条C2 case，或将现有C1 case升级
   - 建议：将probe-regression和intent-benchmark中的hard case重新标注为C2

5. **真实对话占比不足（73% vs 80%要求）**
   - 缺口：需额外~100条真实对话case，或减少合成case
   - 建议：从真实会话日志中继续挖掘

6. **言出法随达成率：覆盖薄弱**
   - 需新增：ISC规则创建→全链路6层即时生效的端到端case（建议≥15条）

7. **验真层指标：无专项case**
   - 效果验真覆盖率、伪通过检出率等9项指标均无测试
   - 需新增验真层专项case（建议≥30条）

8. **工具可信层指标：完全无覆盖**
   - 审计批次回收率、口径一致率等4项指标无case
   - 需新增工具可信层case（建议≥15条）

### P2 — 改进项

9. **北极星指标缺乏结构化标注**
   - 建议为所有case添加`north_star_indicators: []`字段，显式映射到5个北极星指标

10. **字段结构不统一**
    - 各数据集字段命名和结构差异大（如difficulty用easy/medium/hard vs C1/C2）
    - 建议统一为V4标准字段集

11. **自主闭环正向case不足**
    - 现有73条"自主性缺失类"为负面case，缺少正向验证case

12. **多轮对话占比需精确统计**
    - 需遍历所有case的multi_turn字段做精确计算

---

## 九、质量问题

1. **goodcases-from-badcases（426条）质量最高** — 有scoring_rubric、negative_example、root_cause_to_avoid，最接近V4标准
2. **mined-r* 系列（~426条）质量中等** — 有expected_output和execution_chain_steps，但缺显式评分
3. **intent-benchmark（80条）结构偏旧** — 仅有IC分类和difficulty，无V4要求的评分体系
4. **pipeline（38条）为纯技术断言** — 测试规则匹配数量，非V4评分体系
5. **auto-generated（49条）来源可追溯但缺评分** — 有content_hash和source，但无scoring_rubric

---

## 十、建议行动项

| 序号 | 行动 | 预计新增case数 | 优先级 |
|------|------|---------------|--------|
| 1 | 为现有case统一补充scoring_rubric（Pass/Partial/Badcase） | 0（改造现有） | P0 |
| 2 | 新增认知层真实代码覆盖率专项case | 20+ | P0 |
| 3 | 新增Gate门禁（Pre-Gate/A/B）专项case | 40+ | P0 |
| 4 | 新增言出法随全链路验证case | 15+ | P1 |
| 5 | 新增验真层专项case | 30+ | P1 |
| 6 | 新增工具可信层专项case | 15+ | P1 |
| 7 | 从真实会话挖掘C2 case提升C2占比至80% | 180+ | P1 |
| 8 | 为所有case添加north_star_indicators字段 | 0（改造现有） | P2 |
| 9 | 统一字段结构和难度标注体系 | 0（改造现有） | P2 |
| 10 | 新增自主闭环正向验证case | 15+ | P2 |

完成以上行动后，预计评测集将达到 ~1,600+ 条，C2占比≥80%，北极星指标全覆盖。

---

*报告生成时间：2026-03-10T16:20+08:00*
