# Agent 角色体系审计报告

> **审计日期**：2026-03-10  
> **审计人**：系统架构师（analyst-02）  
> **审计范围**：openclaw.json 注册的 19 个 Agent + agents/ 目录下的 29 个 Agent 实体  
> **核心结论**：当前角色体系存在 **命名混乱、职责重叠、prompt 同质化、僵尸角色堆积** 四大结构性问题，需要从"角色即标签"回归"角色即能力契约"。

---

## 一、执行摘要

### 一句话结论

当前 8 类逻辑角色扩展为 19 个注册实例 + 10 个僵尸目录，看似兵强马壮，实则 **角色定义全部共用同一段泛化 prompt，无任何角色专属行为约束**，导致 analyst 和 researcher 干着同样的事、reviewer 和 scout 边界模糊、worker-03~06 完全没有身份。这不是"编组灵活"，是"角色虚无"。

### 关键发现（按严重度排序）

| 序号 | 发现 | 严重度 | 影响 |
|------|------|--------|------|
| 1 | 所有子Agent的 AGENTS.md 完全相同（6行通用模板），无角色专属行为定义 | **P0** | 角色分工形同虚设，全靠 spawn task 描述临时定义 |
| 2 | researcher 命名为"系统架构师"、analyst 命名为"洞察分析师"，与 SOUL.md 角色模型定义完全反转 | **P0** | 认知混乱，调度时容易派错角色 |
| 3 | 10 个 agent 目录（auditor/engineer/strategist/codex/coder-03~06/scout-03/worker-02）存在但未注册 | **P1** | 配置漂移，僵尸资源 |
| 4 | worker-03~06 无角色定义，无专属 prompt，是纯粹的"算力槽位" | **P1** | 浪费了角色分化的机会 |
| 5 | reviewer 和 analyst 的边界在实际使用中高度模糊 | **P2** | 任务分配依赖主 Agent 的临时判断，无一致性保证 |
| 6 | scout 的 fallback 模型用了 claude-opus-4-6（非 thinking 版），与其他角色不一致 | **P2** | 侦察任务需要推理能力，fallback 降级过大 |
| 7 | cron-worker 主模型用 zhipu/glm-5，其他角色主模型用 Claude/GPT，缺少统一策略说明 | **P3** | 可理解为成本优化，但缺少决策文档 |

---

## 二、逐角色评估

### 2.1 main（战略家 🎖️）

**职责定义**：战略决策 + 任务编排 + 通信中枢  
**主模型**：Claude Opus 4-6 Thinking  
**Prompt 质量**：★★★★★（SOUL.md 极其详尽，12000+ 字，包含铁律、自检、委派规则）

**评估**：
- ✅ **职责边界最清晰**：有明确的白名单/黑名单、量化自检规则、程序化守卫
- ✅ **模型匹配**：高推理任务配 Claude Opus Thinking，合理
- ✅ **工具限制**：禁用 write/edit/apply_patch，强制委派，设计正确
- ⚠️ **过度规则化风险**：SOUL.md 已膨胀到包含大量铁律/根因记录/ISC 规则引用，信噪比在下降。有些规则（如 completion-handler.sh 的调用）重复出现在 SOUL.md 和 AGENTS.md 中
- ⚠️ **subagents.allowAgents = ["*"]**：主 Agent 可以派任意角色，灵活但也意味着没有编组约束

**建议**：SOUL.md 需要分层——核心身份定义和操作手册分开。当前把"你是谁"和"你怎么调 completion-handler.sh"混在一起，不利于维护。

### 2.2 researcher（"系统架构师" 🔍）

**职责定义**：SOUL.md 定义为"洞察分析师：技术调研、竞品分析、方案比选"  
**openclaw.json Identity**：系统架构师  
**主模型**：Claude Opus 4-6 Thinking  
**Prompt**：通用 6 行模板，无角色专属指令

**评估**：
- 🔴 **命名与定义严重冲突**：SOUL.md 说 researcher 是"洞察分析师"，但 openclaw.json 的 identity.name 叫"系统架构师"。而 SOUL.md 的"系统架构师"角色描述（方案设计、边界定义、技术风险收敛）实际上更像 analyst 该做的事
- 🔴 **无专属 prompt**：和 coder、writer 等共用完全相同的 AGENTS.md，没有任何关于"如何做调研"、"调研报告格式"、"信息源优先级"的指导
- ⚠️ **与 scout 高度重叠**：scout 是"技术侦察、可行性验证、情报收集"，researcher 是"技术调研、竞品分析"——侦察 vs 调研的边界不清

**建议**：
1. 修正 identity.name 为"洞察分析师"以匹配 SOUL.md
2. 编写角色专属 prompt：明确调研方法论、信息源优先级、报告格式、与 scout 的分工协议
3. 或者直接与 scout 合并（见总体建议）

### 2.3 coder（开发工程师 💻）

**职责定义**：功能实现、缺陷修复、性能优化  
**主模型**：Claude Opus 4-6 Thinking  
**Prompt**：通用 6 行模板

**评估**：
- ✅ **角色定位清晰**：写代码就是写代码，不太会和其他角色混淆
- ✅ **模型匹配**：代码任务需要强推理，Claude Opus Thinking 合理
- 🔴 **无专属 prompt**：没有代码规范、技术栈偏好、测试要求、commit 规范等指导
- ⚠️ **实例数量最多但无差异化**：coder + coder-02 注册在案，coder-03~06 在目录但未注册。6 个 coder 实例全部相同配置，纯粹是算力扩展

**建议**：
1. 编写 coder 专属 prompt：代码风格、语言偏好、测试覆盖要求、Git 规范
2. 对 coder-03~06 做正式注册或清理（不应有僵尸目录）
3. 考虑是否需要区分前端/后端/基础设施等子专业方向

### 2.4 reviewer（质量仲裁官 🔎）

**职责定义**：用例设计、回归验证、质量门禁  
**主模型**：GPT-5.3 Codex（boom）  
**Prompt**：通用 6 行模板

**评估**：
- ✅ **角色必要性高**：ISC 体系中有明确的质量门禁需求（ISC-DOC-QUALITY-GATE-001、ISC-AUTO-QA-001、ISC-EVAL-ROLE-SEPARATION-001）
- ⚠️ **模型选择有争议**：reviewer 需要深度推理能力来发现代码缺陷和逻辑漏洞，但主模型配的是 GPT-5.3 Codex 而非 Claude Opus Thinking。虽然 GPT-5.3 Codex 也很强，但"质量仲裁"应该是高推理任务
- 🔴 **无专属 prompt**：没有 review checklist、严重度分级标准、review 报告格式、通过/不通过判定规则
- ⚠️ **与 analyst 的边界模糊**：analyst 是"方案设计、边界定义"，reviewer 是"质量门禁"——但在实际操作中，"架构评审"到底谁做？SOUL.md 的 architecture-review-pipeline 技能涉及两者

**建议**：
1. 将主模型改为 Claude Opus Thinking（reviewer 需要最强推理能力）
2. 编写专属 prompt：review 标准、checklist、报告格式、判定规则
3. 明确与 analyst 的分工：analyst 做方案设计和架构评审的"提出方"，reviewer 做质量审查的"审核方"

### 2.5 analyst（洞察分析师 📊）

**职责定义**：SOUL.md 定义为"系统架构师：方案设计、边界定义、技术风险收敛"  
**openclaw.json Identity**：洞察分析师  
**主模型**：GPT-5.3 Codex（boom）  
**Prompt**：通用 6 行模板

**评估**：
- 🔴 **命名与定义严重冲突**（与 researcher 对称）：SOUL.md 说 analyst 是"系统架构师"，但 identity.name 叫"洞察分析师"。而 researcher 的 identity.name 反而叫"系统架构师"。两者名字完全交叉错位
- ⚠️ **模型可能不够**：如果 analyst 承担架构设计和风险收敛，这是高推理任务，GPT-5.3 Codex 作为主模型可能不如 Claude Opus Thinking
- 🔴 **无专属 prompt**

**建议**：
1. 首先统一命名：要么 analyst=系统架构师 + researcher=洞察分析师，要么重新定义
2. 如果 analyst 定位为架构设计，主模型应升级为 Claude Opus Thinking
3. 编写专属 prompt：架构决策模板、权衡分析框架、风险评估方法

### 2.6 scout（情报专家 🎯）

**职责定义**：技术侦察、可行性验证、情报收集  
**主模型**：GPT-5.3 Codex（boom）  
**Fallback**：claude-scout/claude-opus-4-6（注意：非 thinking 版）  
**Prompt**：通用 6 行模板

**评估**：
- ⚠️ **与 researcher 高度重叠**：侦察 vs 调研的区别是什么？在实际任务中，"验证技术可行性"和"调研竞品实现路径"经常交叉
- ⚠️ **fallback 模型降级过大**：其他角色的 Claude fallback 都是 thinking 版，scout 却是非 thinking 版（claude-opus-4-6），侦察验证恰恰需要推理能力
- 🔴 **无专属 prompt**：没有侦察方法论、信息验证标准、情报分级规则

**建议**：
1. 认真考虑与 researcher 合并：合并后叫"情报分析师"或"调研专家"，同时覆盖"信息收集"和"可行性验证"两个能力
2. 如果保留独立，必须明确分工：researcher 做"广度搜索+比较分析"，scout 做"定点深入+POC 验证"
3. 修复 fallback 模型为 thinking 版

### 2.7 writer（创作大师 ✍️）

**职责定义**：方案沉淀、操作手册、交接资料  
**主模型**：GPT-5.3 Codex（boom）  
**Prompt**：通用 6 行模板

**评估**：
- ✅ **角色定位清晰**：写文档就是写文档，不太会混淆
- ✅ **模型选择合理**：文档撰写是高吞吐任务，不需要最强推理，GPT-5.3 Codex 合适
- 🔴 **无专属 prompt**：没有写作风格指南、文档模板、格式规范。虽然 AGENTS.md 里有 ISC-REPORT-READABILITY-001 写作钢印，但那是主 Agent 的规则，writer 子 Agent 的 AGENTS.md 里没有
- ⚠️ **ISC-DOC-QUALITY-GATE-001 的执行依赖**：writer 写完需要 reviewer 审，但 writer 自己不知道这个流程，完全靠主 Agent 编排

**建议**：
1. 将 ISC-REPORT-READABILITY-001 的写作钢印直接写入 writer 的专属 prompt
2. 增加文档模板库引用（报告骨架、操作手册骨架等）
3. 考虑增加"技术文档"和"用户文档"的子方向指导

### 2.8 cron-worker（定时任务执行者 ⏰）

**职责定义**：定时任务执行  
**主模型**：zhipu-cron-worker/glm-5  
**Prompt**：通用 6 行模板

**评估**：
- ✅ **角色定位清晰**：定时任务是明确的独立职责
- ✅ **模型选择合理**：定时任务通常是轻量级、重复性工作，GLM-5 成本低、够用
- ⚠️ **可能过度简化**：定时任务可能涉及复杂逻辑（日报生成、评测触发、数据聚合），GLM-5 可能不足
- ⚠️ **无专属 prompt**：没有定时任务的错误处理、重试策略、日志规范

**建议**：
1. 增加专属 prompt：任务幂等性要求、错误处理规范、执行日志标准
2. 保留 GLM-5 作为主模型（成本合理），但确保 fallback 链路通畅

### 2.9 worker-03~06（执行者-02~05 ⚡）

**评估**：
- 🔴 **无角色定义**：identity 分别叫执行者-02~05，但没有任何职责说明
- 🔴 **无专属 prompt**：AGENTS.md 目录不存在或为空
- 🔴 **本质是"裸算力"**：只是用来并行执行任务的空壳，完全依赖 spawn task 描述来定义行为
- ⚠️ **provider 命名混乱**：worker-03 的主模型是 boom-main-02，worker-04 是 boom-main-03……命名完全无规律

**建议**：
1. 如果是纯算力扩展，重命名为 worker-pool-N 并统一配置
2. 如果要做角色分化，需要定义具体职责
3. 清理 provider 命名，建立统一的命名规范

### 2.10 僵尸角色（目录存在但未注册）

| 目录名 | 创建时间 | 评估 |
|--------|----------|------|
| auditor | 03-06 | 曾经定义的审计角色，后来被 reviewer 替代？需确认 |
| engineer | 03-06 | 与 coder 高度重叠的命名，疑似早期遗留 |
| strategist | 03-06 | 与 main 的"战略家"定位重叠，疑似早期遗留 |
| codex | 03-08 | ACP harness 相关？需确认用途 |
| coder-03~06 | 03-10 | 最近创建，应注册为正式 agent 或清理 |
| scout-03 | 03-10 | 最近创建，应注册或清理 |
| worker-02 | 03-10 | 最近创建，应注册或清理 |

**建议**：统一清理或注册，不允许"有目录无注册"的中间态存在。

---

## 三、角色边界分析

### 3.1 重叠矩阵

```
           researcher  analyst  reviewer  scout
researcher    ─        高重叠    低重叠    高重叠
analyst       高重叠     ─       中重叠    低重叠
reviewer      低重叠    中重叠     ─       低重叠
scout         高重叠    低重叠    低重叠     ─
```

**核心冲突**：
1. **researcher vs scout**：两者都做"信息收集+分析"，区别仅在深度 vs 广度，但 prompt 完全相同，实际执行无法区分
2. **researcher vs analyst**：identity 命名完全交叉错位，使问题更严重
3. **analyst vs reviewer**：架构评审应该谁做？方案质量谁判？边界不清

### 3.2 能力空白

基于 ISC 规则体系和实际需求，以下场景缺少对应角色：

| 场景 | 当前做法 | 问题 |
|------|---------|------|
| 评测执行 | 无专门角色，临时指派 | ISC-EVAL-ROLE-SEPARATION-001 要求执行者≠评测者，但没有专职评测角色 |
| ISC 规则治理 | 主 Agent 或临时指派 | 规则数量已达 142+，需要专职角色维护规则体系健康度 |
| 运维监控 | cron-worker 兼做 | 系统监控、日志分析、故障响应混在定时任务里 |
| 飞书/外部平台操作 | 任意子 Agent | 飞书文档操作有特殊权限和格式要求，缺少专门指导 |

---

## 四、模型路由分析

### 4.1 当前路由策略

| 角色类型 | 主模型 | 路由逻辑 |
|----------|--------|----------|
| 决策层（main） | Claude Opus Thinking | 高推理，最强模型 |
| 核心执行（researcher, coder） | Claude Opus Thinking | 高推理任务 |
| 标准执行（reviewer, writer, analyst, scout） | GPT-5.3 Codex | 高吞吐，成本较低 |
| 算力池（worker-03~06） | GPT-5.3 Codex | 纯吞吐 |
| 轻量任务（cron-worker） | GLM-5 | 最低成本 |

### 4.2 问题

1. **reviewer 应该用高推理模型**：质量审查需要发现隐藏缺陷，是推理密集型任务。当前用 GPT-5.3 Codex 可能导致审查深度不够
2. **analyst 如果定位为架构师，也应该用高推理模型**：架构决策是系统中推理要求最高的任务之一
3. **scout 的 fallback 用了非 thinking 版 Claude**：唯一一个 fallback 降级到非 thinking 的角色，不合理
4. **三层模型冗余**：每个角色配了 Claude + GPT + GLM 三套 provider，总共 60+ 个 API key。维护成本高，且大部分 fallback 可能从未被触发

### 4.3 推荐路由方案

| 任务特征 | 推荐模型 | 适用角色 |
|----------|---------|----------|
| 高推理（架构/评审/决策） | Claude Opus Thinking | main, analyst(架构师), reviewer |
| 中推理（调研/代码） | Claude Opus Thinking / GPT-5.3 | researcher, coder, scout |
| 高吞吐（文档/批量） | GPT-5.3 Codex | writer, worker-pool |
| 低成本（定时/轻量） | GLM-5 | cron-worker |

---

## 五、总体架构建议

### 5.1 核心重构方案

#### 方案：角色精简 + Prompt 分化 + 算力池化

**从 8 类 19 实例 → 7 类 + 弹性算力池**

| 角色 | 新命名 | 职责定义 | 主模型 | 变化 |
|------|--------|----------|--------|------|
| main | 战略家 | 不变 | Claude Opus Thinking | 不变 |
| architect | 系统架构师 | 方案设计 + 架构评审提案 + 技术风险 | Claude Opus Thinking | 原 analyst，改名+升级模型 |
| coder | 开发工程师 | 代码实现 + 缺陷修复 + 性能优化 | Claude Opus Thinking | 不变 |
| reviewer | 质量仲裁官 | 代码/文档/方案审查 + 质量门禁 | Claude Opus Thinking | 升级模型 |
| researcher | 情报分析师 | 技术调研 + 竞品分析 + POC验证 + 可行性探索 | GPT-5.3 Codex | **合并原 researcher + scout** |
| writer | 创作大师 | 文档撰写 + 方案沉淀 | GPT-5.3 Codex | 不变 |
| cron-worker | 定时任务执行者 | 定时任务 + 轻量运维 | GLM-5 | 不变 |
| worker-N | 执行者-N | 弹性算力池，按需分配 | GPT-5.3 Codex | 统一为无差别算力 |

**关键变化**：
1. **合并 researcher + scout → 情报分析师**：消除两个信息收集角色的重叠
2. **analyst → architect（系统架构师）**：回归 SOUL.md 的原始定义，升级模型
3. **reviewer 模型升级**：质量审查需要强推理
4. **worker-03~06 统一为算力池**：不伪装成角色，就是并行执行槽位

### 5.2 Prompt 分化方案（P0，最优先）

**当前最大的问题不是角色数量，而是所有子 Agent 共用完全相同的 6 行泛化 prompt。** 这让"角色"只是一个标签，不是一个行为契约。

每个角色的 AGENTS.md 应包含：

```
# 通用部分（所有角色共享）
- 语言要求
- 产出要求（写文件、汇报）
- 工作路径规范

# 角色专属部分（每个角色独有）
- 角色定义（一句话）
- 核心能力要求
- 工作方法论
- 输出格式规范
- 质量标准
- 与其他角色的协作接口
```

**各角色专属 prompt 要点**：

| 角色 | 专属 prompt 核心内容 |
|------|---------------------|
| architect | 架构决策模板（问题→约束→选项→权衡→决策→风险）、ADR 格式、anti-entropy 校验 |
| coder | 代码规范、测试覆盖要求、commit 格式、技术栈偏好、性能约束 |
| reviewer | review checklist、严重度分级（P0-P3）、通过/不通过判定标准、review 报告格式 |
| researcher | 信息源优先级、调研报告格式、对比矩阵模板、可信度分级 |
| writer | ISC-REPORT-READABILITY-001 写作钢印（嵌入prompt）、文档模板库引用、格式规范 |
| cron-worker | 幂等性要求、错误重试策略、执行日志标准、超时处理 |

### 5.3 僵尸清理

立即执行：
- 删除或归档 `auditor/`、`engineer/`、`strategist/` 目录（早期遗留，已被替代）
- `codex/` 确认用途后决定保留或清理
- `coder-03~06`、`scout-03`、`worker-02` 注册到 openclaw.json 或删除，不允许中间态

### 5.4 命名规范

建立统一命名规则：

```
角色命名 = {职能}-{序号}
Provider命名 = {提供商}-{角色}
模型路由 = {provider}/{模型id}

示例：
角色: architect, architect-02
Provider: claude-architect, boom-architect
路由: claude-architect/claude-opus-4-6-thinking
```

禁止 worker-03 的 provider 叫 boom-main-02 这种交叉命名。

### 5.5 动态编组支撑

当前固定角色能否支撑"12 开发 + 3 质量 + 1 架构师"的动态编组？

**答案：部分可以，但需要改进。**

当前系统已经有多实例能力（coder + coder-02，reviewer + reviewer-02），理论上可以做到 N 实例并行。但问题是：

1. **实例创建需要预配置**：每个实例都需要在 openclaw.json 中预先注册 + 预先分配 API key，不支持运行时动态创建
2. **没有"角色池"概念**：不能说"从 worker pool 里拿 12 个，给它们 coder 角色"。每个 worker 都是固定配置
3. **API key 是瓶颈**：每个实例需要独立的 API key，动态扩缩受限于预分配的 key 数量

**改进建议**：
- 将 worker-03~06 设计为"通用执行池"，spawn 时通过 task 描述注入角色行为
- 在 spawn 机制中支持传入角色 prompt 片段，让通用 worker 可以临时扮演任何角色
- 这样 12+3+1 编组 = 12 个 worker 注入 coder prompt + 3 个 worker 注入 reviewer prompt + 1 个 architect

### 5.6 新增角色评估

| 候选角色 | 是否需要 | 理由 |
|----------|---------|------|
| 评测专员（evaluator） | **建议新增** | ISC-EVAL-ROLE-SEPARATION-001 明确要求执行者≠评测者，但当前没有专职评测角色。评测是 AEO 体系的核心环节 |
| 治理专员（governor） | 暂不新增 | ISC 规则治理可以由 reviewer 兼做，当前规则量（142+）还不至于需要独立角色 |
| 运维专员（ops） | 暂不新增 | 可由 cron-worker 扩展职责覆盖 |
| 飞书专员 | 不新增 | 飞书操作是工具能力，不是角色能力，应通过技能共享解决 |

如果新增 evaluator：
- **主模型**：Claude Opus Thinking（评测需要深度推理）
- **专属 prompt**：评测标准引用（AEO 评测标准 V3）、评测报告格式、通过/不通过判定
- **核心约束**：不可评测自己执行的任务（程序化保证）

---

## 六、实施优先级

| 阶段 | 内容 | 优先级 | 预期工时 |
|------|------|--------|----------|
| P0-立即 | 修复 researcher/analyst 命名错位 | **最高** | 0.5h |
| P0-立即 | 为每个角色编写专属 prompt（替换通用模板） | **最高** | 4h |
| P1-本周 | 清理僵尸 agent 目录 | 高 | 1h |
| P1-本周 | 合并 researcher + scout → 情报分析师 | 高 | 2h |
| P1-本周 | reviewer 模型升级为 Claude Opus Thinking | 高 | 0.5h |
| P2-下周 | 统一 provider 命名规范 | 中 | 2h |
| P2-下周 | 设计算力池机制（worker-pool） | 中 | 4h |
| P3-规划 | 评估新增 evaluator 角色 | 低 | 2h |
| P3-规划 | SOUL.md 分层重构（身份 vs 操作手册） | 低 | 4h |

---

## 七、风险与待确认

1. **researcher + scout 合并的用户意图确认**：SOUL.md 中并行调度协议明确区分了 scout 先行侦察 + researcher 调研的两阶段模式，合并会改变这个工作流
2. **模型升级的成本影响**：reviewer 从 GPT-5.3 升级到 Claude Opus Thinking 会增加 API 成本
3. **通用 worker 注入 prompt 的可行性**：需要确认 OpenClaw 的 spawn 机制是否支持在 task 描述中注入角色级 prompt
4. **僵尸目录的历史原因**：auditor/engineer/strategist 可能有未记录的用途，清理前需确认

---

*报告完。*
