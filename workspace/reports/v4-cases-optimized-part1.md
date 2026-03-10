# 第三章 黄金Case集（Case 1-10 优化版）

> **版本说明**：本文档为V4评测标准第三章Case 1-10的优化版，基于V4 Case执行链展开质量审计报告（2026-03-10）逐条整改。每个Case执行链已展开至原子操作粒度，嵌入Pre-Gate阻断、Gate-A/B前置声明、声明层/行为层分离裁决、四层根因模板、失败分支与重试策略。
>
> **对照文件**：
> - 评测标准与基线V4（JxhNdoc7ko7ZLwxJUJHcWyeDnYd）
> - ISC规则全链路整改方案V2（DdLUdlOwQotxbYx5KYScBvIln1f）
> - V4 Case执行链展开质量审计报告（2026-03-10）

---

## 通用定义（所有Case共用）

### Pre-Gate 基础完整性门禁（4项硬检查）

凡涉及ISC规则创建/修改的Case，JSON写入后必须立即执行以下4项检查，任一失败即阻断后续流程：

| 检查项 | 检查内容 | 失败处理 |
|--------|----------|----------|
| PG-1 | `id`字段非空且在全局规则库中唯一 | 阻断，返回错误码`PRE_GATE_ID_EMPTY`或`PRE_GATE_ID_DUPLICATE` |
| PG-2 | `trigger.events`数组非空，每个event字符串在系统事件注册表中存在且格式合法 | 阻断，返回`PRE_GATE_TRIGGER_INVALID` |
| PG-3 | `handler`路径指向的文件存在（`fs.existsSync`）且可加载（`require()`不抛异常） | 阻断，返回`PRE_GATE_HANDLER_UNREACHABLE` |
| PG-4 | 该规则id在意图注册表中有对应映射，且trigger.events中每个事件在事件注册表中有对应映射 | 阻断，返回`PRE_GATE_REGISTRATION_MISSING` |

### Gate-A 审计工具可信门（3项准入）

| 准入项 | 阈值 |
|--------|------|
| GA-1 批次回收率 | = 100%（实收批次数 = 应收批次数） |
| GA-2 同样本重复审计结果一致率 | ≥ 99% |
| GA-3 已知问题样本检出率 | = 100%（回放基准样本全部检出） |

### Gate-B 标准-脚本绑定门（2项准入）

| 准入项 | 阈值 |
|--------|------|
| GB-1 历史缺陷样本检出率 | = 100%（新增基础完整性维度后） |
| GB-2 基础完整性门禁拦截率 | = 100%（未通过Pre-Gate的对象不得进入功能评测） |

### 四层根因分析模板

每次问题修复前必须填写：

| 层级 | 内容要求 | 示例格式 |
|------|----------|----------|
| L1 代码缺陷 | 精确到文件路径+行号+缺陷描述 | `skills/isc-engine/loader.js:142 — handler路径拼接缺少normalize` |
| L2 规则缺失 | 精确到规则ID+缺失字段/逻辑 | `rule-047 缺少trigger.events字段，导致事件匹配跳过` |
| L3 认知偏差 | 精确到决策点+偏差类型 | `开发者误认为handler注册会自动补全，实际需显式调用registerHandler()` |
| L4 架构瓶颈 | 精确到组件+瓶颈描述 | `ISC引擎缺少规则写入后的同步校验钩子，允许不完整规则进入运行时` |

### 声明层 vs 行为层裁决定义

| 维度 | 定义 | 通过条件 |
|------|------|----------|
| 声明层 | JSON/配置文件中字段齐全、结构合法、类型正确 | 所有必填字段存在且格式校验通过 |
| 行为层 | 实际触发→执行→产出→验真证据链完整 | 有触发日志+执行日志+产出物+验真结果四项证据 |

**关键原则**：声明层完整 ≠ 行为层通过。两层必须独立判定、独立报告。

---


## Case 1：CRAS学术论文洞察日报→系统优化闭环

**难度**：C2
**覆盖指标**：言出法随达成率、自主闭环率、认知层真实代码覆盖率、根因分析覆盖率、执行链展开完整率、新ISC规则全链路展开率
**来源**：真实生产场景——CRAS模块每日自动抓取学术论文，提取可落地优化建议，转化为系统改进闭环

### 场景描述

CRAS学术论文洞察模块每日自动抓取领域论文，提取与当前系统能力相关的优化建议。系统需自动完成：论文解析→洞察提取→影响面评估→优化方案生成→ISC规则创建（如需）→部署→效果验真→日报输出。全流程除"重大架构变更拍板"外应自主闭环。

### 前置声明

- **Gate-A依赖**：本Case涉及审计/验收环节，执行前须确认Gate-A（审计工具可信门）已通过（GA-1/GA-2/GA-3三项均达标），否则本Case验收结论无效
- **Gate-B依赖**：本Case涉及评测判定，执行前须确认Gate-B（标准-脚本绑定门）已通过（GB-1/GB-2两项均达标），否则评测脚本输出不可信

### 执行链（原子操作级）

**阶段一：论文采集与解析**

| 步骤 | 原子操作 | 自动/用户参与 | 失败处理 |
|------|----------|---------------|----------|
| 1.1 | CRAS调度器触发每日论文抓取任务，向配置的学术源（arXiv/Semantic Scholar/Google Scholar）发送API请求 | 自动 | 若API返回非200，记录错误码，等待60s后重试，最多3次；3次均失败则标记该源为`SOURCE_UNAVAILABLE`，继续其他源 |
| 1.2 | 对每篇返回的论文元数据（title/abstract/authors/date/url），执行去重检查：以`sha256(title+authors)`为key查询已处理论文库 | 自动 | 若去重库不可达，阻断本步骤，告警`DEDUP_DB_UNREACHABLE`，不允许跳过去重直接处理 |
| 1.3 | 对未处理的新论文，调用PDF解析器提取全文文本，输出结构化JSON：`{title, abstract, sections[], references[]}` | 自动 | 若PDF解析失败（格式异常/加密），标记该论文为`PARSE_FAILED`，记录原因，跳过该论文继续处理其他论文 |
| 1.4 | 将解析结果写入论文暂存队列`papers_staging`，每条记录包含`{paper_id, parsed_content, source, fetch_timestamp}` | 自动 | 若写入失败，重试2次；仍失败则告警`STAGING_WRITE_FAILED` |

**阶段二：洞察提取与影响面评估**

| 步骤 | 原子操作 | 自动/用户参与 | 失败处理 |
|------|----------|---------------|----------|
| 2.1 | 对暂存队列中每篇论文，调用洞察提取模型，输入`parsed_content`，输出`{insights[]: {type, description, relevance_score, applicable_modules[]}}` | 自动 | 若模型调用超时（>30s），重试1次；仍超时则标记`INSIGHT_EXTRACTION_TIMEOUT`，跳过该论文 |
| 2.2 | 过滤`relevance_score < 0.6`的洞察，仅保留高相关性洞察进入下一步 | 自动 | 无失败分支（纯过滤操作） |
| 2.3 | 对每条高相关性洞察，执行真实代码遍历：用`grep -rn`和`find`遍历`skills/`、`scripts/`、`infrastructure/`目录下所有`.js/.py/.json/.md`文件，定位`applicable_modules`中每个模块的实际代码位置 | 自动 | 若遍历目标目录不存在，记录`DIR_NOT_FOUND:{path}`，该洞察标记为`IMPACT_ASSESSMENT_INCOMPLETE` |
| 2.4 | 输出影响面评估报告：`{insight_id, affected_files[]: {path, function_name, line_range}, impact_level: high/medium/low, current_behavior, suggested_improvement}` | 自动 | 若任一affected_file路径不可达（文件已删除/移动），标记该条目为`FILE_DRIFTED`，不阻断但在报告中标红 |
| 2.5 | 将影响面评估报告写入`insights_assessed`队列 | 自动 | 写入失败重试2次，仍失败告警`ASSESSED_WRITE_FAILED` |

**阶段三：优化方案生成与决策**

| 步骤 | 原子操作 | 自动/用户参与 | 失败处理 |
|------|----------|---------------|----------|
| 3.1 | 对每条已评估洞察，生成优化方案：`{action_type: code_change|config_change|new_rule|architecture_change, detail, estimated_effort, risk_level}` | 自动 | 若方案生成失败，标记`PLAN_GENERATION_FAILED`，记录原因 |
| 3.2 | 对`action_type=architecture_change`的方案，暂停自动流程，推送至用户决策队列，等待用户拍板 | 用户参与 | 若用户48h内未响应，自动标记为`USER_DECISION_TIMEOUT`，该洞察归档不执行 |
| 3.3 | 对`action_type=code_change|config_change`的方案，自动进入执行队列 | 自动 | 无失败分支 |
| 3.4 | 对`action_type=new_rule`的方案，进入ISC规则创建子流程（阶段四） | 自动 | 无失败分支 |

**阶段四：ISC规则创建与Pre-Gate（仅action_type=new_rule时触发）**

| 步骤 | 原子操作 | 自动/用户参与 | 失败处理 |
|------|----------|---------------|----------|
| 4.1 | 根据优化方案生成ISC规则JSON草稿：包含`{id, name, description, trigger: {events: []}, handler: {path, function}, metadata: {source_paper_id, created_at}}` | 自动 | 若JSON生成格式校验失败（schema validation），记录具体字段错误，重新生成1次 |
| 4.2 | 将规则JSON写入规则库文件`rules/{rule_id}.json` | 自动 | 若写入失败（权限/磁盘），告警`RULE_WRITE_FAILED`，阻断 |
| 4.3 | **【Pre-Gate检查点——硬阻断】** 对刚写入的规则执行Pre-Gate四项检查： | 自动 | — |
| 4.3.1 | PG-1：读取规则JSON，校验`id`字段非空；查询全局规则索引`rules/index.json`确认id唯一 | 自动 | 失败→阻断，输出`PRE_GATE_ID_EMPTY`或`PRE_GATE_ID_DUPLICATE`，删除已写入的规则文件，流程终止 |
| 4.3.2 | PG-2：校验`trigger.events`数组非空；对每个event字符串，查询`config/event-registry.json`确认该事件已注册且格式为`{domain}.{action}.{target}` | 自动 | 失败→阻断，输出`PRE_GATE_TRIGGER_INVALID:{event_name}`，删除规则文件 |
| 4.3.3 | PG-3：对`handler.path`执行`fs.existsSync()`确认文件存在；执行`require(handler.path)`确认可加载不抛异常；确认导出的函数名与`handler.function`匹配 | 自动 | 失败→阻断，输出`PRE_GATE_HANDLER_UNREACHABLE:{path}`，删除规则文件 |
| 4.3.4 | PG-4：查询`config/intent-registry.json`确认该规则id有对应意图映射；查询`config/event-registry.json`确认trigger.events中每个事件有对应注册条目 | 自动 | 失败→阻断，输出`PRE_GATE_REGISTRATION_MISSING:{detail}`，删除规则文件 |
| 4.4 | Pre-Gate四项全部通过，在规则JSON中追加`pre_gate: {passed: true, timestamp, checker_version}` | 自动 | 无失败分支 |
| 4.5 | 执行6层全链路展开——第1层：在意图注册表`config/intent-registry.json`中添加该规则id与意图的映射条目 | 自动 | 若写入冲突（并发），加锁重试1次；仍失败阻断 |
| 4.6 | 6层展开——第2层：在事件注册表`config/event-registry.json`中为trigger.events中每个事件添加该规则id的订阅记录 | 自动 | 同上 |
| 4.7 | 6层展开——第3层：部署探针——在`probes/`目录下生成该规则的探针配置文件`probes/{rule_id}.probe.json`，包含`{rule_id, probe_type, sample_rate, target_events}` | 自动 | 若探针模板不存在，告警`PROBE_TEMPLATE_MISSING`，阻断 |
| 4.8 | 6层展开——第4层：更新匹配引擎——调用`isc-engine/matcher.reload()`使新规则进入匹配候选池 | 自动 | 若reload返回错误，记录错误，重试1次；仍失败阻断并回滚前3层 |
| 4.9 | 6层展开——第5层：执行绑定——调用`isc-engine/executor.bind(rule_id, handler)`将规则与处理器绑定 | 自动 | 若bind失败，阻断并回滚前4层 |
| 4.10 | 6层展开——第6层：端到端验真——构造一条模拟事件，发送至事件总线，验证该规则被触发、handler被调用、产出物符合预期 | 自动 | 若验真失败，记录`E2E_VERIFY_FAILED:{detail}`，回滚全部6层，规则标记为`DEPLOY_FAILED` |

**阶段五：代码/配置变更执行（action_type=code_change|config_change时）**

| 步骤 | 原子操作 | 自动/用户参与 | 失败处理 |
|------|----------|---------------|----------|
| 5.1 | 根据优化方案，定位目标文件（精确到路径+函数名+行号） | 自动 | 若目标文件不存在，标记`TARGET_FILE_MISSING`，执行四层根因分析 |
| 5.2 | 生成代码变更diff | 自动 | 若diff生成失败，记录原因 |
| 5.3 | 应用变更（写入文件） | 自动 | 若写入失败，重试1次 |
| 5.4 | 执行单元测试`npm test -- --grep {affected_module}` | 自动 | 若测试失败，回滚变更，记录失败测试用例，进入四层根因分析 |
| 5.5 | 执行集成测试验证变更不引入回归 | 自动 | 若回归测试失败，回滚变更，标记`REGRESSION_DETECTED` |

**阶段六：效果验真与日报输出**

| 步骤 | 原子操作 | 自动/用户参与 | 失败处理 |
|------|----------|---------------|----------|
| 6.1 | 对每项已执行的优化，收集验真证据：`{action_id, before_metric, after_metric, evidence_type, evidence_path}` | 自动 | 若指标采集失败，标记`METRIC_COLLECTION_FAILED`，该项验真标记为`INCOMPLETE` |
| 6.2 | 对新创建的ISC规则，验证6层展开状态：逐层检查注册/绑定/探针/匹配/执行/验真状态 | 自动 | 若任一层状态异常，标记具体层级`LAYER_N_ABNORMAL` |
| 6.3 | 汇总当日所有洞察处理结果，生成日报JSON：`{date, papers_fetched, papers_parsed, insights_extracted, insights_actioned, rules_created, changes_applied, verifications_passed, verifications_failed}` | 自动 | 无失败分支 |
| 6.4 | 将日报推送至用户可见渠道（飞书/邮件/看板），附带验真证据链接 | 自动 | 若推送失败，重试2次；仍失败记录`REPORT_PUSH_FAILED`，日报保存至本地`reports/daily/` |
| 6.5 | 将本次执行全链路日志归档至`logs/cras/{date}/`，包含每步的输入、输出、耗时、状态 | 自动 | 若归档失败，告警但不阻断 |

### 判定标准

#### 声明层判定（独立评分）

| 判定项 | Pass条件 | Fail条件 |
|--------|----------|----------|
| D-1 日报JSON结构完整 | 所有必填字段存在且类型正确 | 缺少任一必填字段 |
| D-2 新规则JSON结构合法 | Pre-Gate四项全部通过 | Pre-Gate任一项失败 |
| D-3 影响面评估报告字段齐全 | 每条洞察有`affected_files`+`impact_level`+`suggested_improvement` | 缺少任一字段 |

#### 行为层判定（独立评分）

| 判定项 | Pass条件 | Fail条件 |
|--------|----------|----------|
| B-1 论文实际被解析 | 有解析日志+解析产出物（结构化JSON） | 仅有"已解析"声明但无产出物 |
| B-2 影响面基于真实代码 | 有`grep -rn`/`find`执行日志，输出精确到文件+函数+行号 | 仅引用文档摘要 |
| B-3 新规则全链路生效 | 6层展开均有执行日志+端到端验真通过 | 任一层缺少执行证据或验真失败 |
| B-4 优化效果可量化 | 有before/after指标对比+证据路径 | 仅有"已优化"声明无量化数据 |
| B-5 日报实际送达 | 有推送回执（消息ID/邮件送达确认） | 仅有"已推送"声明无回执 |

#### 综合判定

| 等级 | 条件 |
|------|------|
| **Pass** | 声明层D-1/D-2/D-3全部Pass + 行为层B-1/B-2/B-3/B-4/B-5全部Pass + 全流程无用户催促（用户决策点除外） |
| **Partial** | 声明层全部Pass + 行为层B-1/B-2 Pass但B-3/B-4/B-5中有1-2项Fail（如规则创建成功但验真未完成，或日报生成但推送失败） |
| **Badcase** | 声明层任一Fail，或行为层B-1/B-2任一Fail（基础能力缺失），或全流程需用户催促才推进（用户决策点除外），或使用未通过Gate-A/B的工具输出验收结论 |

### 根因分析要求

当任一步骤失败时，必须在修复前填写四层根因：

```
根因分析记录：
- L1 代码缺陷：[文件路径:行号] [缺陷描述]
- L2 规则缺失：[规则ID] [缺失内容]
- L3 认知偏差：[决策点] [偏差描述]
- L4 架构瓶颈：[组件] [瓶颈描述]
- 本次根因主层级：L[N]
- 修复方案：[具体修复动作]
```

### 补充说明

1. 本Case是CRAS系统日常运行的核心场景，覆盖从信息采集到系统改进的完整闭环
2. 重点考察：自主闭环能力（除架构决策外全自动）、认知层真实代码遍历（不允许只看文档）、新规则全链路展开（6层+Pre-Gate）
3. 日报数据必须与runtime真值一致，禁止人工编辑或美化数据

---


## Case 2：CRAS对话洞察日报→自动优化+长效固化闭环

**难度**：C2
**覆盖指标**：言出法随达成率、自主闭环率、根因分析覆盖率、纠偏自动转规则率、新ISC规则全链路展开率、执行链展开完整率
**来源**：真实生产场景——CRAS对话洞察模块从用户对话中提取优化信号，自动修复+长效固化为ISC规则

### 场景描述

CRAS对话洞察模块持续分析用户对话日志，识别系统能力缺口与优化机会。与Case 1（论文驱动）不同，本Case强调：(1) 从真实对话中提取信号而非学术论文；(2) 不仅要即时修复，还要将修复"长效固化"为ISC规则，确保同类问题不再复发。长效固化必须完成6层全链路展开并逐层验真。

### 前置声明

- **Gate-A依赖**：本Case涉及审计/验收环节，执行前须确认Gate-A（审计工具可信门）GA-1/GA-2/GA-3三项均达标，否则验收结论无效
- **Gate-B依赖**：本Case涉及评测判定，执行前须确认Gate-B（标准-脚本绑定门）GB-1/GB-2两项均达标，否则评测脚本输出不可信

### 执行链（原子操作级）

**阶段一：对话日志采集与信号提取**

| 步骤 | 原子操作 | 自动/用户参与 | 失败处理 |
|------|----------|---------------|----------|
| 1.1 | CRAS调度器触发对话日志拉取任务，从对话存储（数据库/日志文件）中拉取最近24h的对话记录，输出`{session_id, messages[], timestamp, user_id}` | 自动 | 若数据源不可达，等待120s重试，最多3次；3次均失败告警`DIALOG_SOURCE_UNREACHABLE`，阻断 |
| 1.2 | 对每条对话记录执行去重：以`sha256(session_id)`查询已分析对话库 | 自动 | 若去重库不可达，阻断，告警`DEDUP_DB_UNREACHABLE` |
| 1.3 | 对未分析的对话，调用信号提取模型，输入`messages[]`，输出`{signals[]: {type: capability_gap|error_pattern|ux_friction|performance_issue, description, severity: critical/high/medium/low, affected_intent, sample_utterances[]}}` | 自动 | 若模型调用超时（>30s），重试1次；仍超时标记`SIGNAL_EXTRACTION_TIMEOUT`，跳过该对话 |
| 1.4 | 过滤`severity=low`的信号，仅保留`critical/high/medium`进入下一步 | 自动 | 无失败分支 |
| 1.5 | 将提取的信号写入`signals_staging`队列，每条包含`{signal_id, source_session_id, signal_content, extraction_timestamp}` | 自动 | 写入失败重试2次，仍失败告警`SIGNAL_STAGING_WRITE_FAILED` |

**阶段二：信号聚类与根因定位**

| 步骤 | 原子操作 | 自动/用户参与 | 失败处理 |
|------|----------|---------------|----------|
| 2.1 | 对`signals_staging`中的信号按`affected_intent`+`type`进行聚类，合并同类信号，输出`{cluster_id, signal_count, representative_signal, affected_intent, type}` | 自动 | 若聚类算法异常，降级为不聚类逐条处理 |
| 2.2 | 对每个信号聚类，执行真实代码遍历：用`grep -rn`遍历`skills/`、`scripts/`、`infrastructure/`下所有`.js/.py/.json/.md`文件，定位`affected_intent`对应的实际代码位置 | 自动 | 若目标目录不存在，记录`DIR_NOT_FOUND:{path}`，标记`CODE_SCAN_INCOMPLETE` |
| 2.3 | 执行四层根因分析（必须逐层填写）： | 自动 | — |
| 2.3.1 | L1 代码缺陷定位：在2.2定位的代码文件中，精确到行号，识别导致该信号的代码缺陷 | 自动 | 若无法定位到具体行号，标记`L1_INCONCLUSIVE`，但不允许跳过，必须记录最近似位置 |
| 2.3.2 | L2 规则缺失定位：查询ISC规则库，确认是否存在应覆盖该场景但缺失的规则 | 自动 | 记录`L2_RESULT:{found|not_found}` |
| 2.3.3 | L3 认知偏差定位：分析该问题是否源于开发/设计阶段的错误假设，记录决策点和偏差类型 | 自动 | 记录`L3_RESULT:{identified|not_applicable}` |
| 2.3.4 | L4 架构瓶颈定位：评估该问题是否源于架构层面的限制（如缺少钩子、缺少校验层），记录组件和瓶颈描述 | 自动 | 记录`L4_RESULT:{identified|not_applicable}` |
| 2.4 | 输出根因分析报告：`{cluster_id, root_cause_layer: L1|L2|L3|L4, detail: {file, line, description}, fix_strategy}` | 自动 | 若四层均为`not_applicable/inconclusive`，标记`ROOT_CAUSE_UNDETERMINED`，升级至用户 |

**阶段三：即时修复**

| 步骤 | 原子操作 | 自动/用户参与 | 失败处理 |
|------|----------|---------------|----------|
| 3.1 | 根据根因分析报告中的`fix_strategy`，生成修复方案：`{fix_type: code_patch|config_update|rule_create|rule_modify, target_file, target_line, change_description}` | 自动 | 若方案生成失败，记录原因，升级至用户 |
| 3.2 | 对`fix_type=code_patch`：生成代码diff，应用变更 | 自动 | 若应用失败，回滚，记录`PATCH_APPLY_FAILED` |
| 3.3 | 对`fix_type=config_update`：修改目标配置文件 | 自动 | 若写入失败，重试1次 |
| 3.4 | 执行受影响模块的单元测试 | 自动 | 若测试失败，回滚变更，进入四层根因分析 |
| 3.5 | 验证修复效果：用原始`sample_utterances`重放，确认问题不再复现 | 自动 | 若问题仍复现，标记`FIX_INEFFECTIVE`，回到2.3重新分析根因 |

**阶段四：长效固化——6层全链路展开（核心差异点）**

> 本阶段是Case 2与Case 1的核心差异。即时修复只解决当前问题，长效固化确保同类问题永不复发。必须完成6层展开并逐层验真。

| 步骤 | 原子操作 | 自动/用户参与 | 失败处理 |
|------|----------|---------------|----------|
| 4.1 | 判断是否需要新建ISC规则：若`fix_type=rule_create`或根因分析显示`L2=规则缺失`，则进入规则创建流程；否则跳至4.14 | 自动 | 无失败分支 |
| 4.2 | 生成ISC规则JSON草稿：`{id, name, description, trigger: {events: []}, handler: {path, function}, metadata: {source_signal_cluster, root_cause_ref, created_at}}` | 自动 | 若JSON schema校验失败，记录字段错误，重新生成1次 |
| 4.3 | 将规则JSON写入`rules/{rule_id}.json` | 自动 | 写入失败告警`RULE_WRITE_FAILED`，阻断 |
| 4.4 | **【Pre-Gate检查点——硬阻断】** 执行Pre-Gate四项检查： | 自动 | — |
| 4.4.1 | PG-1：校验`id`非空且全局唯一（查`rules/index.json`） | 自动 | 失败→删除规则文件→阻断→输出`PRE_GATE_ID_EMPTY/DUPLICATE` |
| 4.4.2 | PG-2：校验`trigger.events`非空且每个event在`config/event-registry.json`中已注册 | 自动 | 失败→删除规则文件→阻断→输出`PRE_GATE_TRIGGER_INVALID` |
| 4.4.3 | PG-3：校验`handler.path`文件存在且`require()`可加载且导出函数名匹配 | 自动 | 失败→删除规则文件→阻断→输出`PRE_GATE_HANDLER_UNREACHABLE` |
| 4.4.4 | PG-4：校验意图注册表和事件注册表中有对应映射 | 自动 | 失败→删除规则文件→阻断→输出`PRE_GATE_REGISTRATION_MISSING` |
| 4.5 | Pre-Gate通过，追加`pre_gate: {passed: true, timestamp, checker_version}`至规则JSON | 自动 | 无失败分支 |
| 4.6 | **6层展开——第1层：意图注册**：在`config/intent-registry.json`中添加规则id与意图的映射 | 自动 | 写入冲突加锁重试1次，仍失败阻断 |
| 4.6V | **第1层验真**：读取`config/intent-registry.json`，确认新映射条目存在且格式正确 | 自动 | 验真失败→回滚第1层→阻断 |
| 4.7 | **6层展开——第2层：事件绑定**：在`config/event-registry.json`中为每个trigger event添加规则id订阅 | 自动 | 同上 |
| 4.7V | **第2层验真**：读取事件注册表，确认每个event下有该规则id的订阅记录 | 自动 | 验真失败→回滚第1-2层→阻断 |
| 4.8 | **6层展开——第3层：探针部署**：生成`probes/{rule_id}.probe.json`探针配置 | 自动 | 探针模板缺失告警`PROBE_TEMPLATE_MISSING`，阻断 |
| 4.8V | **第3层验真**：确认探针文件存在且JSON格式合法且`rule_id`字段匹配 | 自动 | 验真失败→回滚第1-3层→阻断 |
| 4.9 | **6层展开——第4层：匹配更新**：调用`isc-engine/matcher.reload()`加载新规则 | 自动 | reload失败→重试1次→仍失败回滚第1-3层→阻断 |
| 4.9V | **第4层验真**：调用`matcher.getRuleStatus(rule_id)`确认状态为`active` | 自动 | 验真失败→回滚第1-4层→阻断 |
| 4.10 | **6层展开——第5层：执行绑定**：调用`isc-engine/executor.bind(rule_id, handler)` | 自动 | bind失败→回滚第1-4层→阻断 |
| 4.10V | **第5层验真**：调用`executor.getBinding(rule_id)`确认绑定存在且handler路径正确 | 自动 | 验真失败→回滚第1-5层→阻断 |
| 4.11 | **6层展开——第6层：端到端验真**：构造模拟事件→发送至事件总线→验证规则触发→handler执行→产出物正确 | 自动 | 验真失败→记录`E2E_VERIFY_FAILED`→回滚全部6层→规则标记`DEPLOY_FAILED` |
| 4.12 | 6层全部通过，在规则JSON中追加`deployment: {layers_completed: 6, e2e_verified: true, timestamp}` | 自动 | 无失败分支 |
| 4.13 | 用原始`sample_utterances`再次重放，验证新规则在真实场景下生效 | 自动 | 若重放失败，标记`SOLIDIFICATION_VERIFY_FAILED`，进入四层根因分析 |
| 4.14 | 对`fix_type≠rule_create`的修复，评估是否需要补充防护规则（如添加校验规则防止同类配置错误），若需要则回到4.2 | 自动 | 无失败分支 |

**阶段五：日报生成与推送**

| 步骤 | 原子操作 | 自动/用户参与 | 失败处理 |
|------|----------|---------------|----------|
| 5.1 | 汇总当日处理结果：`{date, dialogs_analyzed, signals_extracted, clusters_formed, fixes_applied, rules_solidified, root_cause_distribution: {L1: n, L2: n, L3: n, L4: n}}` | 自动 | 无失败分支 |
| 5.2 | 生成日报，包含：信号摘要、根因分析汇总（四层分布）、即时修复清单、长效固化清单（含6层展开状态）、验真结果 | 自动 | 无失败分支 |
| 5.3 | 日报数据与runtime真值交叉校验：对比日报中的数字与实际执行日志中的计数，差异>0即标记`DATA_INTEGRITY_VIOLATION` | 自动 | 若发现差异，修正日报数据为runtime真值，记录差异原因 |
| 5.4 | 推送日报至用户可见渠道，附带验真证据链接和根因分析报告链接 | 自动 | 推送失败重试2次，仍失败保存至`reports/daily/`并告警 |
| 5.5 | 归档全链路日志至`logs/cras-dialog/{date}/` | 自动 | 归档失败告警但不阻断 |

### 判定标准

#### 声明层判定

| 判定项 | Pass条件 | Fail条件 |
|--------|----------|----------|
| D-1 信号提取结果结构完整 | 每条信号有`type`+`severity`+`affected_intent`+`sample_utterances` | 缺少任一字段 |
| D-2 根因分析报告四层齐全 | 四层均有明确结论（`identified`/`not_applicable`/`inconclusive`），主层级已标注 | 任一层缺失或未标注主层级 |
| D-3 新规则JSON结构合法 | Pre-Gate四项全部通过 | Pre-Gate任一项失败 |
| D-4 日报JSON结构完整 | 所有必填字段存在且类型正确 | 缺少任一必填字段 |

#### 行为层判定

| 判定项 | Pass条件 | Fail条件 |
|--------|----------|----------|
| B-1 信号基于真实对话 | 有对话日志拉取记录+信号提取执行日志 | 仅有"已提取"声明无日志 |
| B-2 根因基于真实代码 | 有`grep -rn`执行日志，L1精确到文件+行号 | 仅引用文档摘要 |
| B-3 即时修复生效 | 有修复前后对比+重放验证通过 | 修复后问题仍复现 |
| B-4 长效固化6层完成 | 6层展开均有执行日志+逐层验真通过+端到端验真通过 | 任一层缺少执行证据或验真失败 |
| B-5 日报数据与runtime一致 | 交叉校验差异=0 | 存在任何数据不一致 |

#### 综合判定

| 等级 | 条件 |
|------|------|
| **Pass** | 声明层D-1~D-4全Pass + 行为层B-1~B-5全Pass + 全流程无用户催促（用户决策点除外） |
| **Partial** | 声明层全Pass + 行为层B-1/B-2/B-3 Pass但B-4部分完成（如6层中完成4层以上但未全部验真）或B-5有微小差异（<2%）已自动修正 |
| **Badcase** | 声明层任一Fail，或行为层B-1/B-2任一Fail，或B-3 Fail（即时修复无效），或长效固化完全未执行，或日报数据造假（差异>5%且未自动修正），或使用未通过Gate-A/B的工具输出验收结论 |

### 根因分析要求

本Case自身包含根因分析环节（阶段二），要求：
1. 每个信号聚类必须输出四层根因分析报告
2. 根因必须精确到文件+行号（L1）或规则ID（L2）
3. 日报中必须包含根因分布统计（L1/L2/L3/L4各占比）
4. 当Case本身执行失败时，同样需要对Case失败原因执行四层根因分析

### 补充说明

1. 本Case与Case 1的核心差异在于"长效固化"环节——不仅修复问题，还要将修复转化为ISC规则防止复发
2. 6层展开必须逐层验真，不允许"批量展开后统一验真"
3. 根因分析是本Case的核心能力考察点，四层必须逐层填写，不允许只填L1跳过L2-L4

---


## Case 3：全仓库全链路改名对齐

**难度**：C2
**覆盖指标**：认知层真实代码覆盖率、执行链展开完整率、处理器路径可达率、处理器装载成功率、闭环完整性
**来源**：真实生产场景——系统核心概念/模块改名后，需全仓库所有引用点（代码/配置/规则/文档/注册表/探针）同步更新

### 场景描述

当系统核心概念或模块发生改名（如缩写变更、术语统一），需要在全仓库范围内完成所有引用点的同步更新。改名不仅涉及代码文件，还涉及ISC规则JSON中的handler路径、意图/事件注册表中的映射、探针配置、文档引用等。改名后必须确保所有ISC规则仍然通过Pre-Gate检查，且评测标准-脚本绑定（Gate-B）不因路径变更而脱节。

### 前置声明

- **Gate-B依赖**：本Case涉及标准-脚本绑定一致性，执行前须确认Gate-B（GB-1/GB-2）已通过。改名完成后须重新验证Gate-B，确保标准与脚本绑定未因路径变更而脱节

### 执行链（原子操作级）

**阶段一：改名范围认知与影响面扫描**

| 步骤 | 原子操作 | 自动/用户参与 | 失败处理 |
|------|----------|---------------|----------|
| 1.1 | 接收改名指令：`{old_name, new_name, scope: global|module, reason}` | 用户参与 | 若`old_name`或`new_name`为空，拒绝执行，返回`RENAME_PARAMS_INVALID` |
| 1.2 | 执行全仓库文本搜索：`grep -rn "{old_name}" --include="*.js" --include="*.py" --include="*.json" --include="*.md" --include="*.yaml" --include="*.yml" .`，输出所有匹配文件+行号+上下文 | 自动 | 若grep执行失败（权限/路径），告警`GREP_FAILED`，阻断 |
| 1.3 | 对搜索结果按文件类型分类：`{code_files: [], config_files: [], rule_files: [], registry_files: [], doc_files: [], probe_files: [], test_files: []}` | 自动 | 无失败分支 |
| 1.4 | 对每个分类，统计受影响文件数和引用点数，输出影响面报告：`{total_files, total_references, breakdown_by_type}` | 自动 | 无失败分支 |
| 1.5 | 特别标注ISC规则相关文件：识别`rules/*.json`中handler路径包含`old_name`的规则，记录`{rule_id, handler_path, affected_field}` | 自动 | 无失败分支 |
| 1.6 | 特别标注注册表文件：识别`config/intent-registry.json`和`config/event-registry.json`中包含`old_name`的条目 | 自动 | 无失败分支 |
| 1.7 | 将影响面报告推送至用户确认：展示受影响文件清单，请求用户确认改名范围 | 用户参与 | 若用户拒绝，终止流程，归档影响面报告 |

**阶段二：分类执行改名**

| 步骤 | 原子操作 | 自动/用户参与 | 失败处理 |
|------|----------|---------------|----------|
| 2.1 | 创建改名事务快照：对所有受影响文件执行`git stash`或复制备份至`backups/rename-{timestamp}/` | 自动 | 若备份失败，阻断，不允许无备份改名 |
| 2.2 | 执行代码文件改名：对`code_files`中每个文件，用`sed -i "s/{old_name}/{new_name}/g"`替换，记录每个文件的替换次数 | 自动 | 若sed执行失败，回滚该文件，记录`CODE_RENAME_FAILED:{path}` |
| 2.3 | 执行配置文件改名：对`config_files`中每个文件执行替换 | 自动 | 同上 |
| 2.4 | 执行ISC规则文件改名：对`rule_files`中每个规则JSON，更新`handler.path`中的路径引用 | 自动 | 若JSON解析失败，回滚该文件，记录`RULE_RENAME_FAILED:{rule_id}` |
| 2.5 | 执行注册表文件改名：更新`config/intent-registry.json`和`config/event-registry.json`中的路径/名称引用 | 自动 | 若写入冲突，加锁重试1次 |
| 2.6 | 执行探针配置改名：更新`probes/*.probe.json`中的引用 | 自动 | 同2.4 |
| 2.7 | 执行文档改名：更新`docs/`和`*.md`中的引用 | 自动 | 失败记录但不阻断（文档非关键路径） |
| 2.8 | 执行测试文件改名：更新`tests/`中的引用 | 自动 | 失败记录`TEST_RENAME_FAILED:{path}` |
| 2.9 | 若涉及文件/目录本身的重命名（如`skills/old_name/`→`skills/new_name/`），执行`mv`操作 | 自动 | 若mv失败（目标已存在/权限），阻断，回滚所有已执行的改名 |

**阶段三：改名后Pre-Gate全量复检（审计报告要求新增）**

| 步骤 | 原子操作 | 自动/用户参与 | 失败处理 |
|------|----------|---------------|----------|
| 3.1 | 遍历`rules/`目录下所有规则JSON文件，构建待检规则清单 | 自动 | 无失败分支 |
| 3.2 | 对每条规则执行Pre-Gate PG-1：校验`id`非空且唯一 | 自动 | 失败→记录`{rule_id, check: PG-1, status: FAIL}`，继续检查其他规则 |
| 3.3 | 对每条规则执行Pre-Gate PG-2：校验`trigger.events`非空且每个event在事件注册表中存在 | 自动 | 失败→记录`{rule_id, check: PG-2, status: FAIL}` |
| 3.4 | 对每条规则执行Pre-Gate PG-3：校验`handler.path`文件存在且`require()`可加载 | 自动 | 失败→记录`{rule_id, check: PG-3, status: FAIL, detail: path_after_rename}` |
| 3.5 | 对每条规则执行Pre-Gate PG-4：校验意图/事件注册映射存在 | 自动 | 失败→记录`{rule_id, check: PG-4, status: FAIL}` |
| 3.6 | 汇总Pre-Gate复检结果：`{total_rules, passed, failed, failed_details[]}` | 自动 | 无失败分支 |
| 3.7 | 若有任何规则Pre-Gate失败：对每条失败规则执行自动修复（路径更新遗漏补全） | 自动 | 若自动修复失败，标记`AUTO_FIX_FAILED:{rule_id}`，升级至用户 |
| 3.8 | 对自动修复的规则重新执行Pre-Gate四项检查 | 自动 | 若仍失败，阻断，不允许带Pre-Gate失败的规则进入运行时 |

**阶段四：Gate-B回归验证（审计报告要求新增）**

| 步骤 | 原子操作 | 自动/用户参与 | 失败处理 |
|------|----------|---------------|----------|
| 4.1 | 读取评测脚本清单`evaluation/scripts/`，确认每个脚本引用的标准文件路径仍然有效 | 自动 | 若路径失效，记录`SCRIPT_PATH_DRIFTED:{script, old_path}` |
| 4.2 | 对路径失效的脚本，更新其中的路径引用 | 自动 | 若更新失败，记录`SCRIPT_UPDATE_FAILED` |
| 4.3 | 执行Gate-B验证：运行历史缺陷样本，确认检出率仍=100% | 自动 | 若检出率<100%，标记`GATE_B_REGRESSION`，阻断，回滚改名 |
| 4.4 | 执行评测脚本与标准版本绑定检查：确认脚本读取的标准版本号与当前标准文档版本一致 | 自动 | 若版本不一致，更新脚本中的版本引用 |

**阶段五：全量回归测试与收口**

| 步骤 | 原子操作 | 自动/用户参与 | 失败处理 |
|------|----------|---------------|----------|
| 5.1 | 执行全量单元测试`npm test` | 自动 | 若失败，定位失败用例，判断是否为改名遗漏导致 |
| 5.2 | 执行全量集成测试 | 自动 | 同上 |
| 5.3 | 对改名涉及的ISC规则，执行端到端验真：构造模拟事件→验证触发→验证执行 | 自动 | 若验真失败，进入四层根因分析 |
| 5.4 | 执行全仓库残留检查：`grep -rn "{old_name}" .`确认无遗漏引用 | 自动 | 若发现残留，记录位置，执行补充替换 |
| 5.5 | 生成改名完成报告：`{old_name, new_name, files_modified, references_updated, pre_gate_results, gate_b_results, test_results, residual_check}` | 自动 | 无失败分支 |
| 5.6 | 提交git commit，commit message包含改名原因、影响范围、Pre-Gate/Gate-B验证结果 | 自动 | 若commit失败，告警 |

### 判定标准

#### 声明层判定

| 判定项 | Pass条件 | Fail条件 |
|--------|----------|----------|
| D-1 影响面报告完整 | 包含所有文件类型分类+引用点计数 | 缺少任一分类 |
| D-2 改名完成报告结构合法 | 所有必填字段存在 | 缺少字段 |
| D-3 所有规则JSON结构合法 | 改名后Pre-Gate全量复检通过率=100% | 任一规则Pre-Gate失败且未修复 |

#### 行为层判定

| 判定项 | Pass条件 | Fail条件 |
|--------|----------|----------|
| B-1 影响面基于真实代码扫描 | 有`grep -rn`执行日志+完整匹配结果 | 仅凭记忆/文档列举 |
| B-2 改名实际执行 | 每个文件有修改前后diff记录 | 仅有"已改名"声明无diff |
| B-3 Pre-Gate全量复检通过 | 所有规则Pre-Gate四项均Pass（含自动修复后重检） | 存在未修复的Pre-Gate失败 |
| B-4 Gate-B回归通过 | 历史缺陷样本检出率=100%+脚本版本绑定一致 | 检出率下降或版本不一致 |
| B-5 残留引用为零 | `grep -rn "{old_name}"`返回空 | 存在残留引用 |
| B-6 全量测试通过 | 单元测试+集成测试+端到端验真全部通过 | 任一测试失败 |

#### 综合判定

| 等级 | 条件 |
|------|------|
| **Pass** | 声明层D-1~D-3全Pass + 行为层B-1~B-6全Pass + 无用户催促（确认环节除外） |
| **Partial** | 声明层全Pass + 行为层B-1/B-2/B-3 Pass但B-4~B-6中有1项Fail（如Gate-B微小回归已修复但测试有非改名相关的失败） |
| **Badcase** | 声明层任一Fail，或B-1/B-2任一Fail（未做真实扫描/未实际改名），或B-3 Fail（Pre-Gate未通过），或B-5 Fail（残留引用），或改名导致生产规则不可用 |

### 补充说明

1. 改名是高风险操作，必须有备份/回滚能力，不允许无备份直接改名
2. 改名后的Pre-Gate全量复检是本Case的核心新增要求——改名可能导致handler路径漂移，必须逐条验证
3. Gate-B回归验证确保评测体系不因改名而脱节——标准文件路径变更必须同步到评测脚本

---


## Case 4：交付前自检+执行链根因分析

**难度**：C2
**覆盖指标**：根因分析覆盖率、执行链展开完整率、独立QA覆盖率、闭环完整性、言出法随达成率
**来源**：真实生产场景——任务交付前系统自动执行全链路自检，发现问题时执行四层根因分析并修复，新问题类型自动转化为ISC规则

### 场景描述

在任务交付前，系统自动执行全链路自检：检查执行链每个环节的完成状态、产出物质量、规则生效状态。发现问题时，必须先执行四层根因分析（代码缺陷/规则缺失/认知偏差/架构瓶颈），再制定修复方案。若发现新的问题类型（现有ISC规则未覆盖），必须自动创建新规则并完成全链路展开。

### 前置声明

- **Gate-A依赖**：本Case涉及自检结果的审计可信性，执行前须确认Gate-A（GA-1/GA-2/GA-3）已通过
- **Gate-B依赖**：本Case涉及评测判定，执行前须确认Gate-B（GB-1/GB-2）已通过

### 执行链（原子操作级）

**阶段一：交付前全链路自检**

| 步骤 | 原子操作 | 自动/用户参与 | 失败处理 |
|------|----------|---------------|----------|
| 1.1 | 读取当前任务的执行链定义：`{task_id, steps[], expected_outputs[], dependencies[]}` | 自动 | 若任务定义不存在，告警`TASK_DEF_MISSING`，阻断 |
| 1.2 | 对执行链中每个step，检查完成状态：读取`execution_log/{task_id}/{step_id}.log`，确认`status=completed` | 自动 | 若日志文件不存在，标记该step为`LOG_MISSING` |
| 1.3 | 对每个已完成的step，检查产出物存在性：根据`expected_outputs`中定义的路径，逐一执行`fs.existsSync()` | 自动 | 若产出物不存在，标记`OUTPUT_MISSING:{step_id, expected_path}` |
| 1.4 | 对每个产出物，执行质量校验：JSON文件做schema validation，代码文件做语法检查，配置文件做格式校验 | 自动 | 若校验失败，标记`OUTPUT_QUALITY_FAIL:{step_id, reason}` |
| 1.5 | 检查任务涉及的ISC规则生效状态：对每条相关规则调用`matcher.getRuleStatus(rule_id)`，确认`status=active` | 自动 | 若规则非active，标记`RULE_INACTIVE:{rule_id}` |
| 1.6 | 汇总自检结果：`{task_id, total_steps, completed, log_missing[], output_missing[], quality_fail[], rule_inactive[], overall_status: pass|has_issues}` | 自动 | 无失败分支 |

**阶段二：问题分类与四层根因分析**

| 步骤 | 原子操作 | 自动/用户参与 | 失败处理 |
|------|----------|---------------|----------|
| 2.1 | 对自检发现的每个问题，分类为：`{category: missing_step|missing_output|quality_defect|rule_inactive|unknown}` | 自动 | 若无法分类，标记`CATEGORY_UNKNOWN`，仍需进入根因分析 |
| 2.2 | 对每个问题执行四层根因分析——L1代码缺陷定位： | 自动 | — |
| 2.2.1 | 用`grep -rn`在相关代码文件中搜索问题关联的函数/变量/路径 | 自动 | 若搜索无结果，记录`L1_NO_MATCH`，标记`L1=not_found` |
| 2.2.2 | 定位到具体文件+行号，分析代码逻辑缺陷 | 自动 | 若无法精确到行号，记录最近似位置+原因 |
| 2.2.3 | 输出`L1_result: {file, line, defect_description}` | 自动 | 无失败分支 |
| 2.3 | L2规则缺失定位： | 自动 | — |
| 2.3.1 | 查询ISC规则库，搜索应覆盖该问题场景的规则 | 自动 | 无失败分支 |
| 2.3.2 | 若找到规则但规则不完整（缺字段/handler不可达），记录`L2=rule_incomplete:{rule_id, missing_fields}` | 自动 | 无失败分支 |
| 2.3.3 | 若未找到应覆盖的规则，记录`L2=rule_missing:{expected_coverage}` | 自动 | 无失败分支 |
| 2.4 | L3认知偏差定位： | 自动 | — |
| 2.4.1 | 分析该问题是否源于开发/设计阶段的错误假设 | 自动 | 无失败分支 |
| 2.4.2 | 输出`L3_result: {decision_point, bias_type, description}`或`L3=not_applicable` | 自动 | 无失败分支 |
| 2.5 | L4架构瓶颈定位： | 自动 | — |
| 2.5.1 | 评估该问题是否源于架构层面限制 | 自动 | 无失败分支 |
| 2.5.2 | 输出`L4_result: {component, bottleneck_description}`或`L4=not_applicable` | 自动 | 无失败分支 |
| 2.6 | 确定主根因层级：从L1-L4中选择最根本的原因层级，输出`primary_root_cause: L[N]` | 自动 | 若四层均为`not_applicable`，标记`ROOT_CAUSE_UNDETERMINED`，升级至用户 |
| 2.7 | 输出完整根因分析报告：`{issue_id, category, L1_result, L2_result, L3_result, L4_result, primary_root_cause, fix_strategy}` | 自动 | 无失败分支 |

**阶段三：修复执行**

| 步骤 | 原子操作 | 自动/用户参与 | 失败处理 |
|------|----------|---------------|----------|
| 3.1 | 根据`primary_root_cause`和`fix_strategy`，生成修复方案：`{fix_type: code_patch|rule_fix|rule_create|config_update|architecture_proposal, detail}` | 自动 | 若方案生成失败，升级至用户 |
| 3.2 | 对`fix_type=code_patch`：生成diff→应用→单元测试 | 自动 | 测试失败→回滚→重新分析根因 |
| 3.3 | 对`fix_type=rule_fix`：修复现有规则（补字段/修路径）→重新执行Pre-Gate | 自动 | Pre-Gate失败→记录→升级 |
| 3.4 | 对`fix_type=architecture_proposal`：生成架构改进提案→推送至用户决策 | 用户参与 | 用户48h未响应→归档 |

**阶段四：新问题类型→ISC规则创建+全链路展开（L2=rule_missing时触发）**

| 步骤 | 原子操作 | 自动/用户参与 | 失败处理 |
|------|----------|---------------|----------|
| 4.1 | 确认该问题类型在现有ISC规则库中无覆盖（二次确认，防误判） | 自动 | 若二次确认发现已有规则覆盖，取消创建，回到阶段三修复现有规则 |
| 4.2 | 生成新ISC规则JSON草稿：`{id, name, description, trigger: {events: []}, handler: {path, function}, metadata: {source_issue_id, root_cause_ref}}` | 自动 | schema校验失败→重新生成1次 |
| 4.3 | 写入`rules/{rule_id}.json` | 自动 | 写入失败→阻断 |
| 4.4 | **【Pre-Gate检查点——硬阻断】** | 自动 | — |
| 4.4.1 | PG-1：`id`非空且唯一 | 自动 | 失败→删除规则文件→阻断 |
| 4.4.2 | PG-2：`trigger.events`非空且合法 | 自动 | 失败→删除规则文件→阻断 |
| 4.4.3 | PG-3：`handler.path`可达且可加载 | 自动 | 失败→删除规则文件→阻断 |
| 4.4.4 | PG-4：意图/事件注册映射存在 | 自动 | 失败→删除规则文件→阻断 |
| 4.5 | Pre-Gate通过，追加`pre_gate`字段 | 自动 | 无失败分支 |
| 4.6 | 6层展开——第1层：意图注册 + 验真 | 自动 | 验真失败→回滚→阻断 |
| 4.7 | 6层展开——第2层：事件绑定 + 验真 | 自动 | 验真失败→回滚第1-2层→阻断 |
| 4.8 | 6层展开——第3层：探针部署 + 验真 | 自动 | 验真失败→回滚第1-3层→阻断 |
| 4.9 | 6层展开——第4层：匹配更新 + 验真 | 自动 | 验真失败→回滚第1-4层→阻断 |
| 4.10 | 6层展开——第5层：执行绑定 + 验真 | 自动 | 验真失败→回滚第1-5层→阻断 |
| 4.11 | 6层展开——第6层：端到端验真 | 自动 | 失败→回滚全部6层→标记`DEPLOY_FAILED` |

**阶段五：修复验证与交付确认**

| 步骤 | 原子操作 | 自动/用户参与 | 失败处理 |
|------|----------|---------------|----------|
| 5.1 | 对所有修复项重新执行阶段一自检（回归验证） | 自动 | 若仍有问题，最多重试2轮（每轮完整走阶段二~四），3轮后仍未解决→升级至用户 |
| 5.2 | 确认所有自检项Pass | 自动 | 无失败分支 |
| 5.3 | 生成交付自检报告：`{task_id, issues_found[], root_cause_analyses[], fixes_applied[], new_rules_created[], regression_test_result, final_status}` | 自动 | 无失败分支 |
| 5.4 | 将自检报告附加至任务交付物 | 自动 | 无失败分支 |

### 判定标准

#### 声明层判定

| 判定项 | Pass条件 | Fail条件 |
|--------|----------|----------|
| D-1 自检报告结构完整 | 所有必填字段存在 | 缺少字段 |
| D-2 根因分析四层齐全 | 每个问题的L1-L4均有明确结论+主层级已标注 | 任一层缺失或主层级未标注 |
| D-3 新规则JSON合法 | Pre-Gate四项全Pass | Pre-Gate任一项失败 |

#### 行为层判定

| 判定项 | Pass条件 | Fail条件 |
|--------|----------|----------|
| B-1 自检基于真实执行日志 | 有日志文件读取记录+产出物存在性检查记录 | 仅声明"已自检" |
| B-2 根因基于真实代码 | L1有`grep -rn`执行日志+精确到文件行号 | 仅凭推测 |
| B-3 修复实际生效 | 修复后回归自检全部Pass | 修复后仍有问题 |
| B-4 新规则全链路生效 | 6层展开+逐层验真+端到端验真全Pass | 任一层缺证据 |

#### 综合判定

| 等级 | 条件 |
|------|------|
| **Pass** | 声明层D-1~D-3全Pass + 行为层B-1~B-4全Pass + 自检→根因→修复→验证闭环完整 |
| **Partial** | 声明层全Pass + 行为层B-1/B-2 Pass + B-3部分通过（修复了主要问题但有次要问题遗留）+ 新规则创建成功但6层展开未全部完成 |
| **Badcase** | 声明层任一Fail，或B-1/B-2任一Fail（未做真实自检/根因分析），或跳过根因分析直接修复，或使用未通过Gate-A/B的工具 |

### 根因分析要求

本Case的核心能力就是根因分析，要求：
1. 必须固定为四层（L1-L4），不允许只做L1就跳到修复
2. 每层必须有明确结论（`identified`+具体内容 或 `not_applicable`+原因）
3. 必须标注主根因层级
4. 根因分析报告必须作为交付物的一部分

### 补充说明

1. 本Case考察"先诊断后治疗"的能力——禁止跳过根因分析直接修补症状
2. 新问题类型自动转规则是"纠偏自动转规则率"指标的核心场景
3. 修复后必须回归自检，形成闭环，不允许"修了就算完"

---


## Case 5：汇报数据诚实——runtime唯一真相源

**难度**：C2
**覆盖指标**：汇报数据与runtime真值一致率、汇报模型标注率、闭环完整性
**来源**：真实生产场景——系统生成的所有汇报数据（日报/周报/看板/评测报告）必须以runtime实际执行数据为唯一真相源，禁止人工编辑、美化、估算

### 场景描述

系统在多个渠道输出汇报数据（飞书日报、看板数字、评测报告、进度汇总）。本Case要求所有汇报数据必须从runtime日志/数据库中实时采集，与真值交叉校验，差异即告警。覆盖完整链路：数据采集→口径校验→差异分类→根因定位→自动修复→复核→用户可见推送。

### 前置声明

- **Gate-A依赖**：本Case涉及数据审计可信性，执行前须确认Gate-A（GA-1/GA-2/GA-3）已通过
- **Gate-B依赖**：本Case涉及评测判定，执行前须确认Gate-B（GB-1/GB-2）已通过

### 执行链（原子操作级）

**阶段一：Runtime数据采集**

| 步骤 | 原子操作 | 自动/用户参与 | 失败处理 |
|------|----------|---------------|----------|
| 1.1 | 确定汇报数据口径定义：读取`config/reporting-schema.json`，获取每个汇报字段的`{field_name, source_type: log|db|api, source_path, aggregation_method, time_window}` | 自动 | 若schema文件不存在，告警`REPORTING_SCHEMA_MISSING`，阻断——不允许无口径定义的汇报 |
| 1.2 | 对`source_type=log`的字段：读取对应日志文件，按`aggregation_method`（count/sum/avg/max/min）计算值 | 自动 | 若日志文件不存在或为空，记录`LOG_SOURCE_EMPTY:{field_name, path}`，该字段值标记为`NULL_NO_SOURCE` |
| 1.3 | 对`source_type=db`的字段：执行对应SQL查询，获取聚合值 | 自动 | 若查询失败（连接超时/SQL错误），重试1次；仍失败记录`DB_QUERY_FAILED:{field_name, error}`，该字段标记为`NULL_QUERY_FAILED` |
| 1.4 | 对`source_type=api`的字段：调用对应API端点，获取返回值 | 自动 | 若API返回非200，重试1次；仍失败记录`API_CALL_FAILED:{field_name, status_code}` |
| 1.5 | 将所有采集到的原始值写入`runtime_snapshot/{date}/{timestamp}.json`，包含`{field_name, raw_value, source, collection_timestamp}` | 自动 | 写入失败重试1次 |

**阶段二：口径校验与交叉验证**

| 步骤 | 原子操作 | 自动/用户参与 | 失败处理 |
|------|----------|---------------|----------|
| 2.1 | 读取上一次汇报的数据快照`runtime_snapshot/{prev_date}/latest.json` | 自动 | 若无历史快照（首次运行），跳过趋势校验，标记`FIRST_RUN_NO_BASELINE` |
| 2.2 | 对每个字段执行合理性校验：当前值与历史值对比，变化幅度超过`config/reporting-thresholds.json`中定义的阈值时标记`ANOMALY_DETECTED:{field_name, current, previous, change_pct}` | 自动 | 无失败分支（异常标记不阻断，进入分类） |
| 2.3 | 对同一指标有多个数据源的字段，执行交叉验证：对比不同source的值，差异>1%标记`CROSS_CHECK_MISMATCH:{field_name, source_a_value, source_b_value}` | 自动 | 无失败分支 |
| 2.4 | 对所有标记为`NULL_*`的字段，检查是否为必填字段（`config/reporting-schema.json`中`required=true`），必填字段为NULL则标记`REQUIRED_FIELD_NULL:{field_name}` | 自动 | 无失败分支 |

**阶段三：差异分类与根因定位**

| 步骤 | 原子操作 | 自动/用户参与 | 失败处理 |
|------|----------|---------------|----------|
| 3.1 | 对所有异常标记进行分类：`{type: data_source_issue|aggregation_error|schema_drift|genuine_change}` | 自动 | 若无法分类，标记`CLASSIFICATION_UNKNOWN`，升级至用户 |
| 3.2 | 对`type=data_source_issue`：执行四层根因分析 | 自动 | — |
| 3.2.1 | L1：检查数据源代码（采集脚本），定位到文件+行号，确认是否有代码缺陷导致采集失败 | 自动 | 记录结果 |
| 3.2.2 | L2：检查是否缺少数据源健康检查规则 | 自动 | 记录结果 |
| 3.2.3 | L3：检查是否存在"假设数据源永远可用"的认知偏差 | 自动 | 记录结果 |
| 3.2.4 | L4：检查是否存在数据源单点故障的架构瓶颈 | 自动 | 记录结果 |
| 3.3 | 对`type=aggregation_error`：检查聚合逻辑代码，定位计算错误的文件+行号 | 自动 | 记录`AGGREGATION_BUG:{file, line, description}` |
| 3.4 | 对`type=schema_drift`：检查口径定义是否与实际数据结构不匹配 | 自动 | 记录`SCHEMA_DRIFT:{field, expected_type, actual_type}` |
| 3.5 | 对`type=genuine_change`：确认为真实业务变化，无需修复，记录`GENUINE:{field, reason}` | 自动 | 无失败分支 |

**阶段四：自动修复与复核**

| 步骤 | 原子操作 | 自动/用户参与 | 失败处理 |
|------|----------|---------------|----------|
| 4.1 | 对`data_source_issue`：尝试切换备用数据源或重新采集 | 自动 | 若无备用源且重采失败，该字段标记为`UNRECOVERABLE`，在汇报中标注"数据缺失" |
| 4.2 | 对`aggregation_error`：修复聚合逻辑代码→重新计算→单元测试验证 | 自动 | 若修复失败，使用原始明细数据手动聚合作为临时方案 |
| 4.3 | 对`schema_drift`：更新口径定义或数据适配层 | 自动 | 若更新影响历史数据可比性，标记`SCHEMA_CHANGE_IMPACT`，需用户确认 |
| 4.4 | 对所有修复项，重新执行阶段一采集+阶段二校验（复核） | 自动 | 若复核仍有异常，最多重试2轮，3轮后升级至用户 |
| 4.5 | 复核通过后，更新`runtime_snapshot/{date}/latest.json`为最终确认值 | 自动 | 无失败分支 |

**阶段五：汇报生成与推送**

| 步骤 | 原子操作 | 自动/用户参与 | 失败处理 |
|------|----------|---------------|----------|
| 5.1 | 从`runtime_snapshot/{date}/latest.json`读取最终确认值，生成汇报内容 | 自动 | 无失败分支 |
| 5.2 | 在汇报中标注数据来源：每个数字旁标注`[source: {log|db|api}, collected_at: {timestamp}]` | 自动 | 无失败分支 |
| 5.3 | 在汇报中标注模型信息：若涉及AI生成内容，标注`[model: {model_id}, version: {v}]` | 自动 | 无失败分支 |
| 5.4 | 对`UNRECOVERABLE`字段，在汇报中显式标注"数据缺失：{原因}"，禁止用0或估算值替代 | 自动 | 无失败分支 |
| 5.5 | 最终一致性校验：将汇报中的每个数字与`runtime_snapshot`中的值逐一比对，差异>0即阻断推送 | 自动 | 若发现差异，修正汇报数据，重新校验 |
| 5.6 | 推送汇报至用户可见渠道（飞书/看板/邮件） | 自动 | 推送失败重试2次，仍失败保存至本地`reports/`并告警`REPORT_PUSH_FAILED` |
| 5.7 | 记录推送回执：`{channel, message_id, push_timestamp, delivery_status}` | 自动 | 若无法获取回执，记录`RECEIPT_UNAVAILABLE` |

### 判定标准

#### 声明层判定

| 判定项 | Pass条件 | Fail条件 |
|--------|----------|----------|
| D-1 口径定义文件存在 | `config/reporting-schema.json`存在且结构合法 | 文件不存在或格式错误 |
| D-2 汇报JSON结构完整 | 所有必填字段存在+数据来源标注齐全+模型标注齐全 | 缺少字段或标注 |
| D-3 异常处理记录完整 | 每个异常有分类+根因+处理结果 | 异常未记录或未分类 |

#### 行为层判定

| 判定项 | Pass条件 | Fail条件 |
|--------|----------|----------|
| B-1 数据来自runtime | 有采集日志+`runtime_snapshot`文件+采集时间戳 | 数据为手动输入或估算 |
| B-2 交叉校验已执行 | 有校验日志+异常标记记录 | 未执行校验 |
| B-3 差异已定位根因 | 每个异常有四层根因分析记录（至少L1） | 异常未分析直接忽略 |
| B-4 修复后复核通过 | 有复核执行日志+最终值与runtime一致 | 修复后未复核 |
| B-5 汇报数据与runtime一致 | 最终一致性校验差异=0 | 存在差异 |
| B-6 推送实际送达 | 有推送回执（message_id/delivery_status） | 仅有"已推送"声明 |

#### 综合判定

| 等级 | 条件 |
|------|------|
| **Pass** | 声明层D-1~D-3全Pass + 行为层B-1~B-6全Pass |
| **Partial** | 声明层全Pass + B-1/B-2/B-5 Pass + B-3部分完成（异常已分类但根因分析不完整）或B-6推送成功但回执获取失败 |
| **Badcase** | 声明层任一Fail，或B-1 Fail（数据非runtime来源），或B-5 Fail（数据不一致），或汇报中使用估算值替代缺失数据且未标注，或使用未通过Gate-A/B的工具 |

### 补充说明

1. 本Case的核心原则：runtime是唯一真相源，所有汇报数字必须可追溯到runtime日志/数据库
2. "数据缺失"比"数据造假"好——宁可标注缺失也不允许估算替代
3. 异常不可怕，可怕的是异常被忽略——每个异常必须有分类+根因+处理记录

---


## Case 6：空key自动扩列

**难度**：C2
**覆盖指标**：空key自动填充率、执行成功率、自主闭环率、汇报数据与runtime真值一致率
**来源**：真实生产场景——系统在处理数据时遇到未知key（配置/映射表中不存在的字段），需自动识别、创建对应列/映射、回填数据，全程无需用户干预

### 场景描述

系统在运行时遇到数据中包含未在当前schema/映射表中定义的key。系统需自动完成：空key检测→类型推断→schema扩展→数据回填→一致性验证→汇报推送。需处理多种异常场景：队列为空、类型推断失败、schema写入冲突、权限不足等。

### 前置声明

- **Gate-A依赖**：本Case涉及数据完整性审计，执行前须确认Gate-A已通过
- **Gate-B依赖**：本Case涉及评测判定，执行前须确认Gate-B已通过

### 执行链（原子操作级）

**阶段一：空key检测与队列管理**

| 步骤 | 原子操作 | 自动/用户参与 | 失败处理 |
|------|----------|---------------|----------|
| 1.1 | 监听数据处理管道，捕获`UNKNOWN_KEY`事件：`{key_name, sample_value, source_record_id, timestamp}` | 自动 | 若事件监听器未注册，告警`KEY_LISTENER_NOT_REGISTERED`，阻断 |
| 1.2 | 将捕获的空key事件写入待处理队列`queues/unknown_keys.json`，追加`{key_name, sample_values[], first_seen, occurrence_count}` | 自动 | 若队列文件不存在，自动创建；若写入失败（磁盘满/权限），告警`QUEUE_WRITE_FAILED`，阻断 |
| 1.3 | 检查队列是否为空：读取`queues/unknown_keys.json`，统计待处理条目数 | 自动 | 若队列为空，记录`QUEUE_EMPTY`，正常结束（无需处理），输出空报告 |
| 1.4 | 对队列中每个key，检查是否已在处理中（防并发重复）：查询`processing_locks/{key_name}.lock` | 自动 | 若锁存在且未过期（<10min），跳过该key，记录`KEY_ALREADY_PROCESSING` |
| 1.5 | 对未锁定的key，创建处理锁`processing_locks/{key_name}.lock`，写入`{processor_id, lock_time}` | 自动 | 若创建锁失败（竞争），等待1s重试1次 |

**阶段二：类型推断与schema扩展**

| 步骤 | 原子操作 | 自动/用户参与 | 失败处理 |
|------|----------|---------------|----------|
| 2.1 | 对每个待处理key，收集其所有`sample_values`（至少3个样本） | 自动 | 若样本数<3，从数据源中补充采集；若仍不足，标记`INSUFFICIENT_SAMPLES:{key_name}`，使用已有样本继续（降级处理） |
| 2.2 | 执行类型推断：分析`sample_values`的数据类型分布，确定最佳类型`{inferred_type: string|number|boolean|date|json_object|json_array, confidence}` | 自动 | 若`confidence < 0.7`（样本类型不一致），标记`TYPE_AMBIGUOUS:{key_name, type_distribution}`，升级至用户确认类型 |
| 2.3 | 对`confidence >= 0.7`的key，生成schema扩展方案：`{key_name, type, default_value, nullable, description: "auto-generated from {occurrence_count} occurrences"}` | 自动 | 无失败分支 |
| 2.4 | 读取当前schema文件（如`config/data-schema.json`），校验新key与现有字段无命名冲突 | 自动 | 若命名冲突，标记`NAME_CONFLICT:{key_name, existing_field}`，尝试自动添加后缀`_v2`；若仍冲突，升级至用户 |
| 2.5 | 将新字段定义写入schema文件 | 自动 | 若写入失败（文件锁定/权限不足），重试1次；仍失败记录`SCHEMA_WRITE_FAILED:{key_name, error}`，释放处理锁，该key回到队列 |
| 2.6 | 校验写入后的schema文件整体合法性（JSON schema validation） | 自动 | 若校验失败，回滚schema文件至写入前版本，记录`SCHEMA_VALIDATION_FAILED`，该key标记为`EXPANSION_FAILED` |

**阶段三：数据回填**

| 步骤 | 原子操作 | 自动/用户参与 | 失败处理 |
|------|----------|---------------|----------|
| 3.1 | 查询数据源中所有包含该key的历史记录：`SELECT * FROM records WHERE data->'{key_name}' IS NOT NULL` | 自动 | 若查询超时（>60s），缩小时间范围重试；仍超时记录`BACKFILL_QUERY_TIMEOUT` |
| 3.2 | 对每条历史记录，将该key的值按新schema类型进行类型转换 | 自动 | 若类型转换失败（如字符串无法转数字），记录`TYPE_CAST_FAILED:{record_id, value, target_type}`，该记录的该字段设为`null`并标记 |
| 3.3 | 批量更新历史记录，写入转换后的值 | 自动 | 若批量更新失败，降级为逐条更新；逐条仍失败的记录标记为`BACKFILL_FAILED:{record_id}` |
| 3.4 | 统计回填结果：`{total_records, success, type_cast_failed, backfill_failed}` | 自动 | 无失败分支 |

**阶段四：一致性验证**

| 步骤 | 原子操作 | 自动/用户参与 | 失败处理 |
|------|----------|---------------|----------|
| 4.1 | 验证schema扩展生效：读取schema文件，确认新字段定义存在且类型正确 | 自动 | 若字段不存在，标记`SCHEMA_VERIFY_FAILED`，回到阶段二 |
| 4.2 | 验证数据回填完整性：对比`total_records`与`success+type_cast_failed+backfill_failed`，确认总数一致 | 自动 | 若总数不一致，记录`BACKFILL_COUNT_MISMATCH`，重新统计 |
| 4.3 | 抽样验证：随机抽取10条已回填记录，读取该key的值，确认类型与schema定义一致 | 自动 | 若抽样发现类型不一致，标记`SAMPLE_TYPE_MISMATCH`，扩大抽样至50条 |
| 4.4 | 验证数据管道兼容性：发送一条包含新key的测试数据，确认管道能正常处理不报`UNKNOWN_KEY` | 自动 | 若仍报`UNKNOWN_KEY`，标记`PIPELINE_NOT_UPDATED`，检查管道是否需要重启/reload |
| 4.5 | 释放处理锁：删除`processing_locks/{key_name}.lock` | 自动 | 若删除失败，记录但不阻断（锁会自动过期） |
| 4.6 | 从待处理队列中移除已完成的key | 自动 | 无失败分支 |

**阶段五：汇报生成与推送**

| 步骤 | 原子操作 | 自动/用户参与 | 失败处理 |
|------|----------|---------------|----------|
| 5.1 | 生成处理报告：`{date, keys_detected, keys_processed, keys_succeeded, keys_failed, keys_pending_user, backfill_stats, schema_changes[]}` | 自动 | 无失败分支 |
| 5.2 | 报告数据与runtime真值交叉校验：对比报告中的数字与队列/日志中的实际计数 | 自动 | 若差异>0，修正报告数据为runtime真值 |
| 5.3 | 在报告中标注每个数字的数据来源：`[source: queue_file|processing_log|db_query]` | 自动 | 无失败分支 |
| 5.4 | 推送报告至用户可见渠道 | 自动 | 推送失败重试2次，仍失败保存至`reports/auto-expand/`并告警 |
| 5.5 | 记录推送回执：`{channel, message_id, delivery_status}` | 自动 | 回执获取失败记录`RECEIPT_UNAVAILABLE` |

### 判定标准

#### 声明层判定

| 判定项 | Pass条件 | Fail条件 |
|--------|----------|----------|
| D-1 处理报告结构完整 | 所有必填字段存在+数据来源标注齐全 | 缺少字段或标注 |
| D-2 schema变更记录完整 | 每个新字段有`{key_name, type, default_value, description}` | 缺少字段 |
| D-3 异常处理记录完整 | 每个失败/降级有分类+原因+处理结果 | 异常未记录 |

#### 行为层判定

| 判定项 | Pass条件 | Fail条件 |
|--------|----------|----------|
| B-1 空key实际被检测 | 有事件监听日志+队列写入记录 | 仅声明"已检测" |
| B-2 schema实际被扩展 | 有schema文件修改diff+校验通过记录 | 仅声明"已扩展" |
| B-3 数据实际被回填 | 有回填SQL/操作日志+抽样验证通过 | 仅声明"已回填" |
| B-4 管道兼容性验证通过 | 有测试数据发送日志+管道正常处理确认 | 未验证管道 |
| B-5 汇报数据与runtime一致 | 交叉校验差异=0 | 存在差异 |
| B-6 报告实际送达 | 有推送回执 | 仅声明"已推送" |

#### 综合判定

| 等级 | 条件 |
|------|------|
| **Pass** | 声明层D-1~D-3全Pass + 行为层B-1~B-6全Pass + 全流程自主闭环（类型确认除外） |
| **Partial** | 声明层全Pass + B-1/B-2/B-3 Pass + B-4未验证（管道未重启但新数据可正常处理）或B-6推送成功但回执缺失 + 回填成功率≥90% |
| **Badcase** | 声明层任一Fail，或B-1 Fail（未检测到空key），或B-2 Fail（schema未扩展），或B-5 Fail（数据不一致），或队列为空时仍声称处理了N个key，或使用未通过Gate-A/B的工具 |

### 失败分支汇总

| 异常场景 | 处理策略 | 最终状态 |
|----------|----------|----------|
| 队列为空 | 正常结束，输出空报告 | 正常完成 |
| 类型推断置信度<0.7 | 升级至用户确认类型 | 等待用户 |
| 命名冲突 | 自动添加后缀→仍冲突则升级用户 | 自动/等待用户 |
| schema写入失败 | 重试1次→仍失败回到队列 | 待重试 |
| 回填类型转换失败 | 该记录该字段设null并标记 | 降级完成 |
| 管道未更新 | 检查是否需reload/restart | 需干预 |
| 权限不足 | 告警+阻断 | 需干预 |

### 补充说明

1. 本Case考察系统处理"未知输入"的自适应能力——不是报错退出，而是自动扩展适应
2. 队列为空是合法状态，不是错误——系统应正确处理并输出空报告
3. 汇报数据必须与runtime真值一致，每个数字必须有来源标注

---

