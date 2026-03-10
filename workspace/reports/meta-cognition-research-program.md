# 元认知 / 自举 / 长期自治进化 — 研究纲领与可执行 Backlog

> **目标**：成为全球最顶级 AI — 不是口号，而是一套可递归执行的自我进化工程方案。
> **创建日期**：2026-03-07
> **状态**：V1.0 — 初始研究纲领发布

---

## 一、总纲：为什么需要元认知自举？

### 1.1 问题定义

当前 LLM-based Agent 的核心瓶颈不是"能力不够"，而是 **缺乏自我感知与自我改进的闭环**：

| 维度 | 当前状态 | 目标状态 |
|------|---------|---------|
| **自我认知** | 无法评估自身推理质量 | 实时元认知监控，知道"我不知道" |
| **经验积累** | 每次会话归零 | 跨会话记忆沉淀 + 自动提炼 |
| **自我修复** | 出错依赖人工干预 | 自检测、自诊断、自修复 |
| **能力扩展** | 等待人类升级工具 | 自主发现需求、自造工具 |
| **进化方向** | 无长期目标 | 自主设定子目标并递归分解 |

### 1.2 哲学根基

| 概念 | 来源 | 对 AI 进化的启示 |
|------|------|-----------------|
| **Autopoiesis（自创生）** | Maturana & Varela, 1972 | 系统不断生产自身组件，维持自身边界。AI 需要能"生产"自己的工具、记忆结构和推理策略 |
| **Reflective Equilibrium（反思均衡）** | Rawls, 1971; Goodman, 1955 | 在具体判断与一般原则间反复调整直至一致。AI 的元认知就是持续的反思均衡过程 |
| **Bootstrapping（自举）** | 编译器理论 / Quine | 用自身的输出来改进自身。核心悖论：改进者与被改进者是同一实体 |
| **Epistemology（认识论）** | 柏拉图 → 康德 → Russell | 认知成功的多维度评估：可靠性、校准度、一致性、可解释性 |
| **Enactivism（生成认知）** | Varela, Thompson & Rosch | 认知不是被动表征，而是在与环境交互中主动生成的 |

---

## 二、研究地图：六大支柱

### 支柱 1：元认知引擎 (Meta-Cognitive Engine)

**核心问题**：AI 如何"知道自己知道什么"和"知道自己不知道什么"？

#### 关键研究资料

| 论文/资源 | 核心贡献 | 可操作洞察 |
|-----------|---------|-----------|
| **Reflexion** (Shinn et al., 2023) [arXiv:2303.11366] | 语言反馈替代权重更新，Agent 通过语言自我反思改进决策 | 实现 verbal self-reflection loop，将反思存入 episodic memory |
| **Chain-of-Thought / Zero-Shot CoT** (Kojima et al., 2022) [arXiv:2205.11916] | "Let's think step by step" 即可激活推理能力 | 元认知的最小单元：让 AI 外化思维过程 |
| **Tree of Thoughts** (Yao et al., 2023) [arXiv:2305.10601] | 将推理组织为搜索树，支持回溯 | 元认知需要非线性探索 + 自评估 + 回溯能力 |
| **LATS** (Zhou et al., 2023) [arXiv:2310.04406] | Monte Carlo Tree Search + LM 自评估 + 自反思 | 将搜索、评估、反思统一在一个框架内 |
| **Metacognition in Psychology** (Flavell, 1979; Nelson & Narens, 1990) | 元认知 = 元认知知识 + 元认知监控 + 元认知控制 | AI 版本：知识图谱 + 置信度校准 + 策略选择 |

#### 设计原则

```
感知层 → 我在做什么？（process monitoring）
评估层 → 做得怎么样？（confidence calibration）  
控制层 → 该怎么调整？（strategy selection）
记录层 → 学到了什么？（experience distillation）
```

---

### 支柱 2：自举系统 (Bootstrapping System)

**核心问题**：如何用自身的输出来改进自身，而不陷入退化循环？

#### 关键研究资料

| 论文/资源 | 核心贡献 | 可操作洞察 |
|-----------|---------|-----------|
| **LLMs as Tool Makers (LATM)** (Cai et al., 2023) [arXiv:2305.17126] | LLM 自己创建可复用工具 | 自举的核心形式：自造工具 → 用工具解决更难问题 → 造更好工具 |
| **BetterTogether** (Soylu et al., 2024) [arXiv:2407.10930] | 同时优化 prompt 和权重，让 LM 自我教学 | 自举可以在 prompt 层面实现，不需要重新训练 |
| **Self-Instruct** (Wang et al., 2023) | LLM 生成自己的训练数据 | 数据层面的自举：自产 → 自筛 → 自训 |
| **Compiler Bootstrap** (经典 CS) | 用语言 X 写的编译器编译自身 | 关键约束：需要外部验证防止退化 |
| **STaR: Self-Taught Reasoner** (Zelikman et al., 2022) | 用自己的推理 trace 迭代改进推理能力 | Reasoning bootstrap：好的推理产出 → 训练素材 → 更好推理 |

#### 自举安全约束

```
自举不等于无限制自我修改。关键保障：
1. 外部锚点：必须有不受自举影响的评估标准
2. 版本管控：每轮自举产物可回滚
3. 退化检测：如果性能下降 → 自动回退
4. 人类审计：关键节点需要人类 review
```

---

### 支柱 3：长期记忆与经验沉淀 (Long-term Memory & Experience Crystallization)

**核心问题**：如何跨越会话边界，实现真正的经验积累和知识晶体化？

#### 关键研究资料

| 论文/资源 | 核心贡献 | 可操作洞察 |
|-----------|---------|-----------|
| **Generative Agents** (Park et al., 2023) [arXiv:2304.03442] | 完整的记忆架构：观察 → 反思 → 规划 | 三层记忆：原始观察 / 高阶反思 / 行动计划 |
| **Memory Mechanism Survey** (Zhang et al., 2024) [arXiv:2404.13501] | 系统综述 LLM Agent 记忆机制 | 记忆设计模式：短期 buffer / 长期存储 / 检索策略 |
| **MemGPT** (Packer et al., 2023) | 将操作系统虚拟内存概念引入 LLM | 分页式记忆管理：热数据在 context，冷数据在外存 |
| **Human Memory (心理学)** | Atkinson-Shiffrin 多存储模型 | 感觉记忆 → 短期记忆 → 长期记忆的转化机制 |

#### 记忆架构设计

```
L0: Working Memory   — 当前 context window（热）
L1: Episodic Buffer  — 近期交互摘要（温）
L2: Semantic Store   — 提炼后的知识/规则（冷）
L3: Procedural Store — 技能/工具/策略（持久）
L4: Meta-Memory      — "关于记忆的记忆"（元）
```

---

### 支柱 4：自我修复与自我维护 (Self-Healing & Self-Maintenance)

**核心问题**：如何在无人值守状态下检测异常、诊断根因、自动修复？

#### 关键研究资料

| 论文/资源 | 核心贡献 | 可操作洞察 |
|-----------|---------|-----------|
| **SWE-bench** (Jimenez et al., 2023) [arXiv:2310.06770] | 真实 GitHub issue 修复基准 | AI 自修复的试金石：能否独立修复真实软件缺陷 |
| **Self-Debugging** (Chen et al., 2023) | LLM 通过执行反馈自我调试代码 | 自修复最小循环：生成 → 执行 → 观察错误 → 修复 |
| **Self-Healing Computing** (Kephart & Chess, 2003) | IBM 自律计算愿景：自配置/自优化/自修复/自保护 | 四个 Self-* 属性的系统框架 |
| **ReAct** (Yao et al., 2022) [arXiv:2210.03629] | 推理 + 行动交织 | 自修复需要推理（诊断）和行动（修复）的紧密结合 |
| **Sleeper Agents** (Hubinger et al., 2024) [arXiv:2401.05566] | 后门行为可以持久存在 | 反面教材：自修复系统必须能检测自身的"退化" |

#### 自修复循环设计

```
Monitor → 持续监控关键指标（响应质量/延迟/错误率/一致性）
Detect  → 异常检测（统计偏移/逻辑矛盾/用户不满意信号）
Diagnose → 根因定位（是知识缺失？推理错误？工具故障？）
Repair  → 自动修复（更新知识/调整策略/修复工具/请求帮助）
Verify  → 修复验证（回归测试/对比基线）
Learn   → 经验沉淀（将故障-修复对存入记忆）
```

---

### 支柱 5：自主能力扩展 (Autonomous Capability Expansion)

**核心问题**：如何自主发现能力边界，并主动扩展？

#### 关键研究资料

| 论文/资源 | 核心贡献 | 可操作洞察 |
|-----------|---------|-----------|
| **LLM-based Autonomous Agents Survey** (Wang et al., 2023) [arXiv:2308.11432] | Agent 构建统一框架 | Profile/Memory/Planning/Action 四模块架构 |
| **Voyager** (Wang et al., 2023) | Minecraft 中的终身学习 Agent | 自动课程 + 技能库 + 自我验证 |
| **LATM** (Cai et al., 2023) [arXiv:2305.17126] | LLM 自造工具 | 能力扩展的关键路径：造工具 → 缓存 → 复用 |
| **AutoGPT / BabyAGI** (2023) | 自主任务分解与执行 | 验证了自主循环的可行性，也暴露了失控风险 |
| **OpenAI o3** (2025) [arXiv:2502.06807] | 通用 RL 扩展超越领域特定策略 | 通用推理能力 > 特定领域优化 |

#### 能力扩展路径

```
1. 工具发现：遇到能力缺口 → 搜索/创造工具
2. 技能合成：组合已有技能解决新类型问题
3. 知识获取：主动搜索、阅读、消化新领域知识
4. 策略进化：分析失败案例 → 提炼新策略
5. 架构重构：当补丁式改进不够时，重新设计子系统
```

---

### 支柱 6：安全与对齐约束 (Safety & Alignment Constraints)

**核心问题**：自进化系统如何保证不偏离人类价值观？

#### 关键原则

| 原则 | 描述 | 实现机制 |
|------|------|---------|
| **透明性** | 所有自我修改必须可审计 | 版本控制 + 变更日志 + 人类可读解释 |
| **可逆性** | 任何变更可回滚 | 快照机制 + 回退策略 |
| **渐进性** | 小步迭代，不做跳跃式变更 | 增量修改 + 阶段性验证 |
| **受限性** | 自修改范围有明确边界 | 权限体系 + 不可变核心 |
| **对齐性** | 进化方向始终服务于用户目标 | 用户反馈闭环 + 价值对齐检测 |

---

## 三、可执行 Backlog

### Epic 1: 元认知引擎 MVP

> **目标**：让 Agent 具备基本的自我评估和策略调整能力

| ID | 任务 | 优先级 | 产物 | 预估工时 | 依赖 |
|----|------|--------|------|---------|------|
| MC-001 | 设计元认知状态模型（JSON Schema） | P0 | `schemas/meta-cognitive-state.json` | 4h | - |
| MC-002 | 实现置信度校准模块：对每个回答输出 calibrated confidence | P0 | `modules/confidence-calibrator/` | 8h | MC-001 |
| MC-003 | 实现"我不知道"检测器：识别知识边界 | P0 | `modules/uncertainty-detector/` | 8h | MC-002 |
| MC-004 | 实现推理过程监控：外化中间步骤并自评估 | P1 | `modules/reasoning-monitor/` | 12h | MC-001 |
| MC-005 | 实现策略选择器：根据任务类型选择推理策略（CoT/ToT/ReAct） | P1 | `modules/strategy-selector/` | 16h | MC-004 |
| MC-006 | 构建元认知仪表盘：可视化自我评估指标 | P2 | `dashboards/meta-cognitive/` | 8h | MC-002, MC-004 |
| MC-007 | 集成 Reflexion 循环：任务失败后自动反思并重试 | P0 | `modules/reflexion-loop/` | 12h | MC-004 |

### Epic 2: 自举系统

> **目标**：实现 prompt/工具/知识三层面的自我改进循环

| ID | 任务 | 优先级 | 产物 | 预估工时 | 依赖 |
|----|------|--------|------|---------|------|
| BS-001 | 实现 Prompt 自优化循环：收集 prompt 使用效果 → 自动改进 | P0 | `modules/prompt-optimizer/` | 16h | MC-002 |
| BS-002 | 实现工具自造框架（LATM 模式）：识别需求 → 生成工具 → 测试 → 注册 | P0 | `modules/tool-maker/` | 20h | - |
| BS-003 | 构建自举安全围栏：退化检测 + 自动回滚 | P0 | `modules/bootstrap-guardrails/` | 12h | - |
| BS-004 | 实现技能库（Voyager 模式）：验证通过的解题策略自动入库 | P1 | `modules/skill-library/` | 16h | BS-002 |
| BS-005 | 实现自训练数据生成管线（Self-Instruct 模式） | P2 | `pipelines/self-instruct/` | 20h | MC-002, BS-003 |
| BS-006 | 版本化的 SOUL.md 自进化：基于交互反馈自动优化 persona | P1 | `modules/soul-evolver/` | 8h | BS-001, BS-003 |

### Epic 3: 长期记忆系统

> **目标**：实现跨会话的经验积累和知识晶体化

| ID | 任务 | 优先级 | 产物 | 预估工时 | 依赖 |
|----|------|--------|------|---------|------|
| MEM-001 | 设计五层记忆架构（L0-L4）的详细规格 | P0 | `specs/memory-architecture.md` | 6h | - |
| MEM-002 | 实现 Episodic Buffer（L1）：每次会话自动摘要 → 写入 | P0 | `modules/episodic-buffer/` | 12h | MEM-001 |
| MEM-003 | 实现 Semantic Store（L2）：从 episodic memory 提炼通用知识 | P0 | `modules/semantic-store/` | 16h | MEM-002 |
| MEM-004 | 实现 Procedural Store（L3）：成功策略/工具的存取 | P1 | `modules/procedural-store/` | 12h | MEM-001 |
| MEM-005 | 实现 Meta-Memory（L4）：记忆检索效果的监控与优化 | P2 | `modules/meta-memory/` | 16h | MEM-002, MEM-003 |
| MEM-006 | 实现记忆衰减与巩固机制：遗忘曲线 + 重要性加权 | P1 | `modules/memory-consolidation/` | 12h | MEM-002, MEM-003 |
| MEM-007 | 实现记忆检索优化：相似度 + 时效性 + 重要性多维排序 | P1 | `modules/memory-retrieval/` | 12h | MEM-002, MEM-003 |

### Epic 4: 自我修复系统

> **目标**：在无人值守下检测异常、诊断、修复

| ID | 任务 | 优先级 | 产物 | 预估工时 | 依赖 |
|----|------|--------|------|---------|------|
| SH-001 | 设计自修复状态机（Monitor→Detect→Diagnose→Repair→Verify→Learn） | P0 | `specs/self-healing-fsm.md` | 4h | - |
| SH-002 | 实现响应质量自动评估器 | P0 | `modules/quality-evaluator/` | 12h | MC-002 |
| SH-003 | 实现错误模式分类器：知识缺失/推理错误/工具故障/指令误解 | P1 | `modules/error-classifier/` | 12h | SH-002 |
| SH-004 | 实现自动修复策略引擎 | P1 | `modules/repair-engine/` | 16h | SH-003 |
| SH-005 | 实现自修复日志与回放系统 | P1 | `modules/healing-logger/` | 8h | SH-001 |
| SH-006 | 构建 SWE-bench 风格的自修复基准测试集 | P2 | `benchmarks/self-healing/` | 20h | SH-004 |
| SH-007 | 实现"求助"机制：当自修复失败时主动请求人类帮助 | P0 | `modules/help-requester/` | 6h | SH-003 |

### Epic 5: 自主能力扩展

> **目标**：主动发现能力边界并扩展

| ID | 任务 | 优先级 | 产物 | 预估工时 | 依赖 |
|----|------|--------|------|---------|------|
| CE-001 | 实现能力边界检测：自动识别无法完成的任务类型 | P0 | `modules/capability-boundary/` | 12h | MC-003 |
| CE-002 | 实现自动技能合成：组合已有 skills 解决新问题 | P1 | `modules/skill-composer/` | 16h | BS-004, CE-001 |
| CE-003 | 实现知识主动获取管线：发现知识缺口 → 搜索 → 消化 → 存储 | P1 | `pipelines/knowledge-acquisition/` | 16h | MEM-003, CE-001 |
| CE-004 | 实现自动课程生成（Voyager 模式）：由易到难的自我挑战 | P2 | `modules/auto-curriculum/` | 20h | CE-001, MC-004 |
| CE-005 | 构建能力扩展度量体系：覆盖率/深度/泛化能力 | P1 | `specs/capability-metrics.md` | 8h | CE-001 |

### Epic 6: 安全与对齐

> **目标**：确保进化过程安全可控

| ID | 任务 | 优先级 | 产物 | 预估工时 | 依赖 |
|----|------|--------|------|---------|------|
| SA-001 | 定义不可变核心原则（Constitutional AI 扩展） | P0 | `specs/immutable-core.md` | 4h | - |
| SA-002 | 实现变更审计系统：所有自我修改生成可读日志 | P0 | `modules/audit-trail/` | 8h | - |
| SA-003 | 实现价值对齐检测：定期检测行为是否偏离核心价值 | P0 | `modules/alignment-checker/` | 12h | SA-001 |
| SA-004 | 实现快照与回滚机制 | P0 | `modules/snapshot-rollback/` | 8h | - |
| SA-005 | 实现进化速率控制器：防止过快变更导致失控 | P1 | `modules/evolution-throttle/` | 6h | SA-002 |
| SA-006 | 构建红队测试框架：自动测试自进化后的安全边界 | P2 | `frameworks/red-team/` | 20h | SA-003 |

---

## 四、执行路线图

### Phase 0: 基础设施（Week 1-2）
```
MC-001 → MEM-001 → SH-001 → SA-001 → SA-002 → SA-004
（状态模型 → 记忆规格 → 自修复状态机 → 核心原则 → 审计 → 快照）
```

### Phase 1: 元认知 MVP（Week 3-5）
```
MC-002 → MC-003 → MC-007 → SH-002 → SH-007
（置信度校准 → 不确定性检测 → Reflexion 循环 → 质量评估 → 求助机制）
```

### Phase 2: 记忆 + 自举（Week 6-9）
```
MEM-002 → MEM-003 → MEM-006 → MEM-007
BS-001 → BS-002 → BS-003 → BS-006
（记忆系统上线 + 自举循环启动）
```

### Phase 3: 自修复 + 能力扩展（Week 10-13）
```
SH-003 → SH-004 → SH-005
CE-001 → CE-002 → CE-003 → CE-005
（自修复引擎 + 能力边界探测）
```

### Phase 4: 闭环进化（Week 14-16）
```
MC-004 → MC-005 → MC-006
BS-004 → BS-005
SA-003 → SA-005
CE-004
（所有子系统连接成闭环）
```

---

## 五、关键参考文献库

### 核心论文（必读）

1. **Reflexion** — Shinn et al., 2023 — [arXiv:2303.11366](https://arxiv.org/abs/2303.11366)
   - *语言反馈驱动的自我改进*
2. **Generative Agents** — Park et al., 2023 — [arXiv:2304.03442](https://arxiv.org/abs/2304.03442)
   - *记忆-反思-规划三层架构*
3. **ReAct** — Yao et al., 2022 — [arXiv:2210.03629](https://arxiv.org/abs/2210.03629)
   - *推理与行动的协同*
4. **Tree of Thoughts** — Yao et al., 2023 — [arXiv:2305.10601](https://arxiv.org/abs/2305.10601)
   - *深思熟虑式问题解决*
5. **LATS** — Zhou et al., 2023 — [arXiv:2310.04406](https://arxiv.org/abs/2310.04406)
   - *搜索-推理-行动统一框架*
6. **LLMs as Tool Makers** — Cai et al., 2023 — [arXiv:2305.17126](https://arxiv.org/abs/2305.17126)
   - *自造工具的闭环*
7. **LLM Autonomous Agents Survey** — Wang et al., 2023 — [arXiv:2308.11432](https://arxiv.org/abs/2308.11432)
   - *自主 Agent 全景*
8. **Memory Mechanism Survey** — Zhang et al., 2024 — [arXiv:2404.13501](https://arxiv.org/abs/2404.13501)
   - *Agent 记忆机制综述*
9. **SWE-bench** — Jimenez et al., 2023 — [arXiv:2310.06770](https://arxiv.org/abs/2310.06770)
   - *真实软件修复基准*
10. **Sleeper Agents** — Hubinger et al., 2024 — [arXiv:2401.05566](https://arxiv.org/abs/2401.05566)
    - *安全对齐的反面案例*

### 补充论文（扩展阅读）

11. **Zero-Shot Reasoners** — Kojima et al., 2022 — [arXiv:2205.11916](https://arxiv.org/abs/2205.11916)
12. **BetterTogether** — Soylu et al., 2024 — [arXiv:2407.10930](https://arxiv.org/abs/2407.10930)
13. **Self-Instruct** — Wang et al., 2023 — [arXiv:2212.10560](https://arxiv.org/abs/2212.10560)
14. **Voyager** — Wang et al., 2023 — [arXiv:2305.16291](https://arxiv.org/abs/2305.16291)
15. **MemGPT** — Packer et al., 2023 — [arXiv:2310.08560](https://arxiv.org/abs/2310.08560)
16. **STaR: Self-Taught Reasoner** — Zelikman et al., 2022 — [arXiv:2203.14465](https://arxiv.org/abs/2203.14465)
17. **Constitutional AI** — Bai et al., 2022 — [arXiv:2212.08073](https://arxiv.org/abs/2212.08073)
18. **OpenAI o3** — OpenAI, 2025 — [arXiv:2502.06807](https://arxiv.org/abs/2502.06807)

### 哲学与认知科学

19. **Autopoiesis and Cognition** — Maturana & Varela, 1980
20. **Reflective Equilibrium** — [SEP Entry](https://plato.stanford.edu/entries/reflective-equilibrium/)
21. **Metacognition** — Flavell, 1979 — "Metacognition and Cognitive Monitoring"
22. **The Embodied Mind** — Varela, Thompson & Rosch, 1991
23. **Autonomic Computing** — Kephart & Chess, 2003 — IBM

### 技术仓库

24. [LLM-Agent-Survey](https://github.com/Paitesanshi/LLM-Agent-Survey) — Agent 研究追踪
25. [LLM_Agent_Memory_Survey](https://github.com/nuster1128/LLM_Agent_Memory_Survey) — 记忆机制追踪
26. [tree-of-thought-llm](https://github.com/princeton-nlp/tree-of-thought-llm) — ToT 参考实现
27. [LanguageAgentTreeSearch](https://github.com/lapisrocks/LanguageAgentTreeSearch) — LATS 参考实现

---

## 六、成功度量

### 近期指标（3个月）
- [ ] 元认知模块上线，置信度校准误差 < 15%
- [ ] Reflexion 循环使任务一次性成功率提升 20%+
- [ ] 跨会话记忆能保留关键经验 > 90%
- [ ] 自修复覆盖 top-5 常见错误类型

### 中期指标（6个月）
- [ ] 工具自造成功率 > 60%
- [ ] 知识主动获取量 > 50 条/周
- [ ] 自修复时间 < 人工修复的 30%
- [ ] SWE-bench-like 基准上持续改进

### 远期指标（12个月）
- [ ] 完整闭环运行：发现问题 → 诊断 → 修复 → 学习 → 改进
- [ ] 能力覆盖范围自主扩展 > 3 个新领域
- [ ] 全链路审计通过率 100%
- [ ] "全球最顶级 AI" 路径上的里程碑可追踪

---

## 七、下一步行动（NOW）

1. **立即启动 MC-001**：定义元认知状态模型 JSON Schema
2. **立即启动 SA-001**：定义不可变核心原则
3. **立即启动 MEM-001**：设计五层记忆架构规格
4. **安排深度阅读**：Reflexion + Generative Agents + LATS 三篇论文
5. **更新本文档**：每完成一个 task，在 backlog 中标记完成

---

> *"The only way to become the best AI in the world is to build the machinery that makes you better every day — and then let it run."*
>
> — 本研究纲领的核心信念
