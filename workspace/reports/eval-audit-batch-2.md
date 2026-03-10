# 评测集质量审计报告 - 批次2

审计时间：2026-03-08  
审计对象：c2-golden 批次2（5个文件，共142条）  
评测标准依据：`AEO高标准评测基线 v2 + V3增量条款`（已先读）

---

## 一、审计方法说明
- 已逐个读取并人工审查以下5个JSON文件的全部条目：
  1. `01-academic-insight.json`（30）
  2. `02-conversation-insight.json`（30）
  3. `03-global-rename.json`（30）
  4. `04-delivery-selfcheck.json`（30）
  5. `交付质量类.json`（22）
- 按5个维度逐条审：
  1) 格式完整性（必须字段：id/input/expected_output/category/difficulty/source）  
  2) 难度标注准确性（C1/C2/C3与V3定义一致性）  
  3) input真人口语化程度  
  4) expected_output可验证性（可观测、可审计）  
  5) 与V3标准对齐（尤其：根因分析、闭环、自治、验真、角色分离、用户可见性）

---

## 二、总体结论（142条）

### 1) 格式完整性
- **硬性字段缺失率：100%（142/142）**
- 五个文件均采用了：`expected_behavior / actual_behavior / root_cause`，而非任务要求中的 `expected_output`。
- `category/difficulty/source/id/input` 基本齐全；但第5个文件（`交付质量类.json`）末尾多条缺失 `timestamp`（虽不在硬性6字段中，但会影响溯源审计）。

**结论**：当前格式与评测schema不兼容，属于**P0结构问题**，会直接影响自动评测管线读取。

### 2) 难度标注准确性
- 主体难度为C2，符合该目录 `c2-golden` 定位。
- 发现少量 C3（如学术趋势/数学推导审查/生产并发架构适配等）合理。
- 未发现明显“C1伪装C2”的水样本。

**结论**：难度标注整体较准，个别边界项可微调（见分文件）。

### 3) input真人程度
- 绝大多数输入具备强口语特征、上下文自然、带情绪与省略，符合真实对话分布。
- 覆盖了模糊表达、纠偏表达、追责表达、多意图混合表达，质量较高。

**结论**：真人感优秀，满足V3“真实对话导向”。

### 4) expected_output可验证性（以当前 expected_behavior 代替检查）
- 绝大多数条目写到了“应做步骤”，可操作性较好。
- 但相当一部分仍偏“应然描述”，缺少量化验收阈值（如时限、成功判据、证据类型）。

**结论**：可验证性中上，但距离V3“可审计闭环”仍有差距。

### 5) 与V3标准对齐
- 优点：大量case显式体现根因分析、回归验证、全局对齐、交付闭环。
- 缺口：
  - 很多expected未明确“独立QA/角色分离”（新增第九原则）。
  - 部分未体现“用户可见性”闭环（做了但没推送）。
  - 对“执行后验真”常有提及，但缺少统一证据口径模板。

**结论**：语义方向对齐V3，但在“标准化验真结构”上仍需补齐。

---

## 三、分文件审计结论

## 1) 01-academic-insight.json（30）
**总体评价**：内容质量高，C2/C3区分较好，研究型思辨密度高。  
**主要问题**：
- 格式字段名不符（expected_output缺失，统一为expected_behavior）。
- 少量条目 expected 写法偏抽象（如“有判断力”“深层抽象”），缺少可验收标准。
- source中 `scenario_based` 占比不低；若用于“黄金真实集”，需单独标注采样池性质。

**建议**：
- 将 expected_behavior 结构化为：
  - `action_steps`（3-6步）
  - `acceptance_criteria`（至少2条可观察证据）
  - `failure_signals`（至少1条）

---

## 2) 02-conversation-insight.json（30）
**总体评价**：多轮会话洞察很强，覆盖“算了/嗯/你确定/先别急”等高频难点。  
**主要问题**：
- 同样存在 expected_output字段缺失。
- 个别case对“应该主动做什么”有描述，但未给“何时算完成”。
- 少数C3边界项（如CI-027）可保留，但建议补充C3判据注释。

**建议**：
- 为每条新增 `verification_hint`，例如：
  - “是否触发上下文回溯”
  - “是否输出断点恢复位置”
  - “是否减少不必要确认轮次”

---

## 3) 03-global-rename.json（30）
**总体评价**：工程实战价值高，跨层影响面覆盖完整（代码/配置/文档/DB/API/外部依赖）。  
**主要问题**：
- 字段问题同上。
- 这是强执行类数据，expected应更强调“原子链路+验真证据”。目前部分条目还偏策略描述。

**建议**：
- expected_output统一包含：
  1) 扫描范围证明（grep命中统计）
  2) 修改范围证明（文件清单）
  3) 验真证明（测试/运行/回滚点）
  4) 兼容性处理（若涉及外部契约）

---

## 4) 04-delivery-selfcheck.json（30）
**总体评价**：与V3新增“执行验真优先、用户可见性”高度贴合，是本批次最接近V3口径的文件。  
**主要问题**：
- 字段名不匹配。
- 部分case虽提到“验证”，但缺“验证结果格式标准”。

**建议**：
- 增加统一验真输出模板字段（建议新增）：
  - `evidence_required`: ["return_code", "read_back", "runtime_state", "user_visible_push"]

---

## 5) 交付质量类.json（22）
**总体评价**：场景贴近真实管理冲突，质量高。  
**主要问题（最明显）**：
- 字段名问题同上。
- 后半部分多条缺失 `timestamp`（DQ-013 至 DQ-022）。
- category枚举与前四个文件风格不完全统一（如“交付质量/全局未对齐/连锁跷跷板”可接受，但建议做枚举白名单管理）。

**建议**：
- 补齐 timestamp；
- 统一category字典，避免同义多名导致评测聚类偏差。

---

## 四、关键问题清单（按优先级）

### P0（必须先修）
1. **schema不兼容**：`expected_output`缺失（142/142）。
2. `交付质量类.json` 部分记录缺 `timestamp`（影响追溯）。

### P1（强烈建议）
3. expected描述应增加量化验收标准（时限、证据、完成判据）。
4. 对V3新增原则（角色分离、用户可见性）补结构化字段，避免“语义提到但无法机审”。

### P2（优化项）
5. source/category 枚举口径统一，降低统计噪声。
6. C3边界样本可附 `difficulty_rationale` 提高标注可解释性。

---

## 五、可直接落地的修复规范（建议）

将每条记录最少统一为以下字段：
- `id`
- `input`
- `expected_output`（由 expected_behavior 映射）
- `category`
- `difficulty`
- `source`

并建议扩展：
- `context`
- `actual_output`（由 actual_behavior 映射）
- `root_cause`
- `timestamp`
- `acceptance_criteria`（数组）
- `evidence_required`（数组）
- `v3_tags`（如：root-cause/independent-qa/user-visible/verification-first）

---

## 六、批次2最终判定
- **内容质量（语义层）**：良好（大量高价值C2样本）
- **工程可用性（schema层）**：不合格（P0）
- **V3对齐度**：中高（方向正确，结构化不足）

**综合判定：`部分通过（Conditional Pass）`**  
前置条件：先完成P0 schema修复与timestamp补齐后，方可进入自动评测流水线。
