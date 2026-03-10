# 三问报告：评测计划 + Agent治理 + 质量分析师优化

> 日期：2026-03-10 | 作者：researcher subagent

---

## 问题一：评测的事接下来的计划

### 结论

评测集数量达标（1,304条 vs V4要求≥500），但结构性对齐差距显著：C2占比69%（差11%）、真实对话占比73%（差7%）、北极星指标5项中2项严重缺失、Gate门禁零覆盖、67%的case缺Pass/Partial/Badcase评分标准。评测Runner（run-llm-eval-unified.cjs）已支持5条Track但尚未适配V4北极星指标和Gate门禁维度。需分三阶段补齐。

### 现状数据

| 维度 | V4要求 | 当前值 | 差距 |
|------|--------|--------|------|
| 总case数 | ≥500 | 1,304 | ✅ 达标 |
| C2占比 | ≥80% | 69%（901/1304） | ❌ 差~145条C2 |
| 真实对话占比 | ≥80% | 73%（~955/1304） | ❌ 差~90条 |
| 多轮对话占比 | ≥80% | ~65%（估算） | ⚠️ 需精确统计 |
| 北极星5项全覆盖 | 全覆盖 | 3强2弱（认知层/言出法随严重缺失） | ❌ |
| Gate门禁case | Pre-Gate/A/B | 0条 | ❌ |
| 评分标准统一 | 全部Pass/Partial/Badcase | 仅33%有scoring_rubric | ❌ |

### 正在进行的4批case补充

已启动的第一批`v4-yanchu-fasu-cases-batch1.json`已落地，包含言出法随正向+负向case，字段结构完全对齐V4（含`north_star_indicator`、`scoring_rubric`、`execution_chain_steps`）。这批case是后续补充的模板标杆。

按计划还需补充4批×10条：
1. **Gate门禁批**（10条）：Pre-Gate/Gate-A/Gate-B端到端验证
2. **代码覆盖批**（10条）：验证Agent是否grep/find读真实代码而非文档摘要
3. **自主闭环批**（10条）：正向验证无用户催促下全流程自动完成
4. **言出法随批**（10条）：ISC规则创建→全链路6层即时生效（batch1已部分覆盖）

### 后续计划：还需补多少？

| 行动项 | 新增/改造 | 数量 | 优先级 |
|--------|----------|------|--------|
| 为现有case统一补scoring_rubric | 改造 | ~878条 | P0 |
| 认知层真实代码覆盖率专项case | 新增 | 20+ | P0 |
| Gate门禁专项case | 新增 | 40+（每Gate≥10） | P0 |
| 言出法随全链路case | 新增 | 15+（含batch1） | P1 |
| 验真层专项case | 新增 | 30+ | P1 |
| 工具可信层case | 新增 | 15+ | P1 |
| C2 case补充至80% | 新增/升级 | ~145条 | P1 |
| north_star_indicators字段标注 | 改造 | 全量 | P2 |
| 字段结构统一（difficulty→C1/C2） | 改造 | 全量 | P2 |
| 自主闭环正向case | 新增 | 15+ | P2 |

**总计**：新增~300条case + 全量字段改造。完成后评测集达~1,600条，C2≥80%，北极星全覆盖。

### 评测Runner适配V4情况

当前`run-llm-eval-unified.cjs`支持5条Track（意图识别/多轮/事件规则/执行链/端到端），但：
- ❌ 无北极星指标维度的聚合评分
- ❌ 无Gate门禁Track
- ❌ 无scoring_rubric的Pass/Partial/Badcase三级判定逻辑
- ✅ 有沙盒门禁、报告输出、Track选择等基础能力

需新增：Track F（北极星指标）、Track G（Gate门禁）、scoring_rubric解析器。

### 分阶段里程碑建议

| 阶段 | 内容 | 建议时间 |
|------|------|----------|
| **Phase 1（本周）** | 4批×10条case落地 + batch1已有的言出法随case review | 3/10-3/14 |
| **Phase 2（下周）** | P0改造：全量补scoring_rubric + 认知层/Gate专项case | 3/15-3/21 |
| **Phase 3（第三周）** | Runner适配V4：新增Track F/G + scoring_rubric解析 | 3/22-3/28 |
| **Phase 4（第四周）** | 端到端pipeline首跑 + C2占比补齐 + 字段统一 | 3/29-4/4 |
| **Phase 5（验收）** | 全量V4对齐核查 + 基线校准 | 4/5-4/11 |

端到端评测pipeline预计Phase 4（3月底）可首跑，Phase 5完成基线校准后正式可用。

---

## 问题二：Agents配置质量治理到什么程度了，还有尾巴么？

### 结论

P0/P1/P2核心项全部完成，治理成果扎实。遗留3条尾巴，均为P2级别的规范性问题，不影响功能。

### 完成状态总览

| 问题编号 | 描述 | 状态 |
|----------|------|------|
| **P0-1** | 命名修正（researcher/analyst命名匹配角色） | ✅ 已解决 |
| **P0-2** | 子Agent的AGENTS.md个性化 | ⚠️ 主力11个完成，-02系列7个缺失 |
| **P0-3** | 模型配置切换Claude primary | ✅ 已解决（reviewer/writer/analyst/scout均Claude） |
| **P1-1** | 僵尸agent目录清理 | ✅ 已解决（19目录=19注册，零差集） |
| **P1-2** | worker-03~06角色定义 | ✅ 已解决（均有AGENTS.md） |
| **P2** | reviewer/analyst边界清晰度 | ✅ 已解决（双向对照表+易混淆场景判定） |

### 数据快照

- 总agent目录：19个
- 有AGENTS.md的：11个（覆盖率58%）
- 无AGENTS.md的：8个（7个-02系列 + main）
- 模型配置：主力agent用Claude opus-4-6-thinking，-02系列用boom（GPT-5.3-codex），worker用boom

### 遗留尾巴清单

| # | 尾巴 | 影响 | 修复建议 | 优先级 |
|---|------|------|----------|--------|
| 1 | **-02系列7个agent缺AGENTS.md** | 无显式角色定义，依赖隐式继承 | 为每个-02 agent创建AGENTS.md，内容可简化为"XX主力agent的备份槽，继承其角色定义"一句话+指向主力agent的引用 | P2 |
| 2 | **analyst emoji不一致** | openclaw.json用📊，AGENTS.md用📐 | 统一为📐（与"架构师"语义更匹配）或📊（与"分析"语义匹配），二选一改一处 | P3 |
| 3 | **main agent无AGENTS.md** | main作为调度中枢可能依赖全局配置 | 确认main是否需要独立AGENTS.md，如需要则补充调度中枢角色定义 | P3 |

这三条尾巴都是规范性问题，不阻塞任何功能。建议在下次常规维护时顺手修复。

---

## 问题三：质量分析师Agent应该做哪些优化才能自主介入每个开发任务全自动做审计？

### 结论

当前reviewer（质量仲裁官）的角色定义和审计方法论已经很成熟（三层递进审查+P0-P3分级+标准报告格式），但介入方式是纯手动的。completion-handler.sh只输出"🔍 需要质量核查"提示文本，不自动触发reviewer。ISC-AUTO-QA-001.sh只做日志计数校验，不执行实际审计。要实现全自动审计，需要5项优化。

### 当前状态

| 组件 | 现状 | 问题 |
|------|------|------|
| **completion-handler.sh** | 检测到coder/writer/researcher完成任务时输出"🔍 需要质量核查"提示 | 只提示不执行，依赖人工看到提示后手动派reviewer |
| **ISC-AUTO-QA-001.sh** | 对比completions目录和qa-reviews目录的文件数 | 只做事后统计，不触发审计动作 |
| **SOUL.md规则** | 写明"看到提示必须立即派reviewer/analyst执行核查" | 依赖Agent自觉遵守，无强制机制 |
| **reviewer AGENTS.md** | 完整的审查方法论、P0-P3分级、标准报告格式 | 方法论成熟但无自动触发入口 |

### 需要的5项优化

#### 优化1：completion-handler自动触发reviewer（核心）

当前`completion-handler.sh`在`NEED_QA="true"`分支只echo提示。需要改为：

**思路**：在"🔍 需要质量核查"之后，自动调用openclaw CLI或API派发reviewer subagent，传入任务ID、产出物路径、原始任务描述作为审计输入。

关键设计点：
- 触发条件：coder/writer/researcher完成且status=done
- 传入参数：taskId + artifactPath + originalTaskSummary
- 超时保护：reviewer审计设30分钟超时
- 失败兜底：reviewer派发失败时写入retry-queue.json

#### 优化2：reviewer审计checklist标准化

当前reviewer的AGENTS.md有方法论但无结构化checklist。需要为不同类型的产出物定义标准化审计项：

- **代码类产出**：可运行性 → 错误处理 → 安全隐患 → git规范 → 与设计一致性
- **文档类产出**：完整性 → 准确性 → 一致性 → 可执行性
- **评测类产出**：覆盖率 → 用例有效性 → 回归结果 → 与V4对齐度
- **配置类产出**：合法性 → 向后兼容 → 副作用检查

每类checklist以JSON schema定义，reviewer启动时根据产出物类型自动加载对应checklist。

#### 优化3：reviewer产出标准格式（机器可解析）

当前reviewer报告是Markdown格式，人可读但机器难解析。需要双格式输出：

- **Markdown报告**（人读）：保持现有格式
- **JSON结构化结果**（机器读）：
  ```
  {verdict: "pass"|"fail", p0_count, p1_count, p2_count, p3_count, 
   findings: [{severity, file, line, description, fix_suggestion}],
   checklist_results: [{item, passed: bool}]}
  ```

JSON结果写入`/logs/qa-reviews/{taskId}.json`，供后续自动化流程消费。

#### 优化4：不通过时的自动重派机制

当reviewer判定"不通过"（存在P0或多个P1）时：

**思路**：
1. reviewer输出JSON结果中verdict=fail
2. completion-handler（或新的qa-dispatcher脚本）检测到fail
3. 自动将findings列表作为修复指令，重新派发给原执行agent
4. 原agent修复后再次触发completion-handler → 再次自动审计
5. 设置最大重试次数（建议3次），超过后升级为人工介入

关键：重派时必须携带reviewer的findings作为上下文，避免原agent盲目重做。

#### 优化5：审计结果自动写入任务看板

当前task-board只记录任务的done/failed状态。需要扩展：

- 新增字段：`qa_status`（pending/reviewing/passed/failed）、`qa_reviewer`、`qa_report_path`、`qa_retry_count`
- reviewer完成审计后自动调用update-task.sh更新这些字段
- push-feishu-board.sh同步展示QA状态列

### 架构建议：事件驱动的全自动审计pipeline

```
开发Agent完成任务
    ↓
completion-handler.sh 检测到 NEED_QA=true
    ↓
自动派发 reviewer subagent（传入taskId+artifact+context）
    ↓
reviewer 执行标准化checklist审计
    ↓
输出 Markdown报告 + JSON结构化结果
    ↓
┌─ verdict=pass → 更新看板qa_status=passed，流程结束
└─ verdict=fail → 更新看板qa_status=failed
                    ↓
              自动重派原agent（携带findings）
                    ↓
              原agent修复 → 再次触发completion-handler
                    ↓
              循环直到pass或达到重试上限
                    ↓
              超过重试上限 → 升级人工介入（飞书通知）
```

### 实施优先级

| 序号 | 优化项 | 工作量 | 建议顺序 |
|------|--------|--------|----------|
| 1 | completion-handler自动触发reviewer | 中（改1个脚本+新增派发逻辑） | 第一步 |
| 2 | reviewer产出JSON结构化结果 | 小（reviewer AGENTS.md加输出规范） | 第二步 |
| 3 | 审计结果写入看板 | 小（update-task.sh加字段） | 第三步 |
| 4 | 审计checklist标准化 | 中（定义4类checklist schema） | 第四步 |
| 5 | 不通过自动重派 | 大（新增qa-dispatcher+重试逻辑） | 第五步 |

建议先做1+2+3形成最小闭环（自动触发→结构化输出→看板可见），再迭代4+5完善审计深度和自动修复能力。

---

*报告生成时间：2026-03-10T16:51+08:00*
