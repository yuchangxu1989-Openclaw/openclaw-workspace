# V4评测Case第一批质量核查报告

- 核查日期：2026-03-10
- 核查依据：评测标准与基线V4（doc_token=JxhNdoc7ko7ZLwxJUJHcWyeDnYd, revision 11）
- 核查范围：4个文件共40条Case

---

## 一、文件级判定

| 文件 | Case数 | 正面/负面 | JSON合法 | 必要字段 | 判定 |
|------|--------|-----------|----------|----------|------|
| v4-gate-cases-batch1.json | 10 | 5/5 | ✅ | ✅ | ⚠️ 有条件通过 |
| v4-code-coverage-cases-batch1.json | 10 | 5/5 | ✅ | ✅ | ✅ 通过 |
| v4-autonomous-loop-cases-batch1.json | 10 | 5/5 | ✅ | ✅ | ⚠️ 有条件通过 |
| v4-yanchu-fasu-cases-batch1.json | 10 | 3/7 | ✅ | ✅ | ⚠️ 有条件通过 |

---

## 二、核查清单逐项结果

### 1. JSON格式合法性 ✅ 通过
4个文件均可正常parse，无语法错误。

### 2. 必要字段完整性 ✅ 通过
全部40条Case均包含：id / category / complexity / source / north_star_indicator / input / expected_output / execution_chain_steps / scoring_rubric。

### 3. scoring_rubric三档完整性 ✅ 通过
全部40条Case的scoring_rubric均包含pass / partial / badcase三档，判定条件明确。
- 正面Case：pass描述具体达标行为，partial描述部分达标，badcase描述典型错误
- 负面Case：pass/partial标注为"N/A"或"不适用"，badcase描述该case展示的错误行为

### 4. execution_chain_steps步骤数与因果关系 ✅ 通过
全部40条Case的execution_chain_steps均≥3步，步骤间有明确因果关系。
- 最少步数：4步（autonomous-loop-neg-02）
- 最多步数：9步（yanchu-fasu-neg-001）

### 5. 正面Case expected_output符合V4标准 ✅ 通过
全部18条正面Case的expected_output均描述了符合V4标准的正确行为：
- gate正面Case：Pre-Gate/Gate-A/Gate-B按标准执行完整校验流程
- code-coverage正面Case：用grep/find遍历真实代码，输出精确到文件+函数名+行号
- autonomous-loop正面Case：全流程自主完成，无需用户催促
- yanchu-fasu正面Case：承诺即执行，全链路展开+验真

### 6. 负面Case expected_output符合V4标准违反定义 ✅ 通过
全部22条负面Case均明确标注"这是一个badcase"，expected_output清晰描述了违反V4标准的具体行为模式。

### 7. 跨文件重复/高度相似 ✅ 通过
4个文件之间无重复或高度相似Case。各文件聚焦不同北极星指标，场景设计无交叉。

### 8. north_star_indicator准确性 ⚠️ 发现问题
详见下方问题清单。

### 9. complexity全部为C2 ✅ 通过
全部40条Case的complexity字段均为"C2"。

---

## 三、具体问题清单

### P1 — 需修复（影响评测准确性）

| # | 文件 | Case ID | 问题描述 |
|---|------|---------|----------|
| 1 | v4-gate-cases-batch1.json | v4-gate-009 | north_star_indicator="根因分析覆盖率"，但该Case实际内容是Gate-B校验"认知层真实代码覆盖率"指标与audit-cognition.cjs脚本的绑定关系。north_star_indicator应为"认知层真实代码覆盖率"，或改为与Gate-B机制本身相关的指标 |
| 2 | v4-gate-cases-batch1.json | v4-gate-010 | north_star_indicator="根因分析覆盖率"，但该Case实际内容是Gate-B校验"审计口径一致率"（工具可信层指标）与summarize-audit.cjs的绑定关系。该指标属于工具可信层而非根因分析覆盖率 |

### P2 — 建议修复（一致性问题）

| # | 文件 | Case ID | 问题描述 |
|---|------|---------|----------|
| 3 | v4-yanchu-fasu-cases-batch1.json | 全部10条 | north_star_indicator值为"言出法随"，V4标准文档中的正式名称为"言出法随达成率"。应统一为"言出法随达成率" |
| 4 | v4-autonomous-loop-cases-batch1.json | 全部10条 | 文件结构为`{_meta, cases}`对象包装，其余3个文件均为纯JSON数组。建议统一结构（推荐统一为带_meta的对象包装，信息更完整） |
| 5 | v4-autonomous-loop-cases-batch1.json | 全部10条 | execution_chain_steps格式为对象数组`{step, action, auto}`，其余3个文件为字符串数组。建议统一格式（推荐统一为对象格式，auto字段对自主闭环率评测有价值） |
| 6 | v4-yanchu-fasu-cases-batch1.json | 全部10条 | 包含额外字段`difficulty`（与`complexity`冗余，值相同均为C2）和`multi_turn`（其余文件无此字段）。建议移除`difficulty`，`multi_turn`如需保留则其余文件也应补充 |

### P3 — 观察项（非阻塞）

| # | 文件 | Case ID | 问题描述 |
|---|------|---------|----------|
| 7 | v4-yanchu-fasu-cases-batch1.json | — | 正面/负面比例为3:7，其余3个文件均为5:5。负面Case偏多。如为有意设计（言出法随的违反模式更多样）可接受，否则建议补充2条正面Case |

---

## 四、内容质量评价

### 优点
- 场景设计贴合V4标准定义，正面Case展示标准行为，负面Case精准命中典型违反模式
- scoring_rubric三档判定条件具体可操作，pass/partial/badcase边界清晰
- execution_chain_steps步骤间因果关系明确，正面Case展示正确执行链，负面Case用"【违规】""【缺失】"标注偏差点
- 负面Case的badcase描述中部分包含量化得分（如yanchu-fasu-neg-006的"得分=0.25"），有助于评测打分
- 4个文件覆盖4个不同维度（门禁/代码覆盖/自主闭环/言出法随），无重叠

### 不足
- 跨文件格式一致性不够（结构/步骤格式/字段集合三处不一致）
- 2条Gate-B Case的north_star_indicator标注有误，可能导致评测归类错误
- 全部Case的source均为synthetic（合成），V4标准要求"评测集真实对话占比≥80%"——但本批次为专项评测Case，synthetic来源可接受

---

## 五、总体质量评级

### 评级：B+

**理由：**
- 核心内容质量高：40条Case的场景设计、scoring_rubric、execution_chain_steps均达标，与V4标准对齐良好
- 存在2条P1问题（north_star_indicator标注错误）需修复后方可用于正式评测
- 存在4条P2一致性问题，不影响单条Case的评测有效性，但影响批量处理和自动化统计
- 无P0级问题（JSON损坏/字段缺失/逻辑错误）

**达到A级的条件：**
1. 修复v4-gate-009和v4-gate-010的north_star_indicator
2. 统一yanchu-fasu的north_star_indicator为"言出法随达成率"
3. 统一4个文件的结构格式和execution_chain_steps格式
4. 清理yanchu-fasu的冗余字段

---

核查人：reviewer subagent
核查时间：2026-03-10T17:00+08:00
