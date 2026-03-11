# Anthropic官方 skill-creator 对比分析报告

> 生成时间：2026-03-11 13:48 GMT+8
> 分析人：analyst子Agent

---

## 1. 官方新版概述

Anthropic官方 `skill-creator`（[GitHub](https://github.com/anthropics/skills/tree/main/skills/skill-creator)）是一个**完整的技能开发生命周期工具**，覆盖从意图捕获到打包发布的全流程。

### 架构组成

| 组件 | 文件 | 功能 |
|------|------|------|
| 核心Prompt | `SKILL.md`（~29KB） | 完整的技能创建流程指导，含意图捕获、访谈、编写、测试、迭代、优化全流程 |
| 评估Agent | `agents/grader.md` | 评估执行结果是否满足预期，含claims提取和eval反馈 |
| 盲比Agent | `agents/comparator.md` | 盲比A/B两个输出，基于rubric评分决定胜者 |
| 分析Agent | `agents/analyzer.md` | 解盲后分析胜者为何胜出，生成改进建议 |
| 触发评估 | `scripts/run_eval.py` | 测试description是否正确触发技能（并行，多轮） |
| 描述优化 | `scripts/improve_description.py` | 基于eval结果迭代优化description文本 |
| 基准聚合 | `scripts/aggregate_benchmark.py` | 聚合多轮benchmark数据，方差分析 |
| 打包工具 | `scripts/package_skill.py` | 将技能打包为`.skill`文件（zip格式） |
| 快速验证 | `scripts/quick_validate.py` | 验证技能目录结构完整性 |
| 评估循环 | `scripts/run_loop.py` | 自动化eval→improve循环 |
| 结果查看 | `eval-viewer/viewer.html` + `generate_review.py` | 浏览器可视化查看评估结果 |
| 参考文档 | `references/` | 技能编写参考资料 |

### 核心流程

```
意图捕获 → 用户访谈 → 编写SKILL.md → 创建测试用例 → 并行执行测试
    → 定量评估(grader) → 用户定性评审 → 迭代改进 → 扩大测试集
    → 盲比(comparator) → 解盲分析(analyzer) → 描述优化(improve_description)
    → 打包发布(package_skill)
```

### 关键特性

- **子Agent并行测试**：通过subagent并行执行多个测试用例
- **盲比机制**：A/B盲比消除偏见，comparator不知道哪个是新版
- **定量+定性双轨评估**：grader做定量打分，用户做定性评审
- **描述优化闭环**：`run_eval.py` + `improve_description.py` 自动迭代优化触发准确率
- **方差分析**：benchmark支持多轮运行，统计方差，识别flaky测试
- **环境自适应**：同时支持Claude Code（有subagent）和Claude.ai（无subagent）
- **依赖**：Python 3, `claude -p` CLI（Claude Code环境）

---

## 2. 我们本地版本概述

本地 `skills/public/skill-creator-addon/` 只有一个文件：

```markdown
# skill-creator-addon — 技能创建后置步骤补丁

## 强制后置步骤（ISC-SKILL-POST-CREATION-GUARD-001）

1. 注册能力锚点：在CAPABILITY-ANCHOR.md中添加技能条目
2. 创建意图路由：在isc-core/rules/中创建intent-route规则
3. 声明触发条件：在SKILL.md头部添加触发场景
4. 验证注册：grep CAPABILITY-ANCHOR.md确认
```

**本质**：这不是一个技能创建器，而是一个**后置治理检查清单**（addon/补丁）。

### 本地ISC生态中的技能创建相关组件

| 组件 | 功能 | 状态 |
|------|------|------|
| `rule.skill-post-creation-guard-001` | 4步后置检查清单 | ✅ 有handler |
| `rule.pipeline-benchmark-skill-created-alignment-001` | 对齐检查（SKILL.md存在、kebab命名、无散落JS、分类标签） | ✅ 有handler |
| `rule.n019-auto-skill-md-generation-019` | SKILL.md缺失/低质量时自动生成 | ✅ 有handler |
| `isc-skill-index-update` handler | 自动更新CAPABILITY-ANCHOR.md索引 | ✅ 有handler |

**总结**：我们有**后置治理**（创建后的检查和自动修复），但**没有前置创建工具**（从0到1的技能开发流程）。

---

## 3. 功能对比表

| 功能维度 | Anthropic官方 | 我们本地 | 差距 |
|----------|:------------:|:-------:|:----:|
| **意图捕获与用户访谈** | ✅ 结构化4步访谈 | ❌ 无 | 🔴 缺失 |
| **SKILL.md编写指导** | ✅ 详细模板+格式规范 | ❌ 无（n019规则可自动生成但质量有限） | 🔴 缺失 |
| **测试用例创建** | ✅ 自动生成+用户确认 | ❌ 无 | 🔴 缺失 |
| **并行测试执行** | ✅ subagent并行 | ❌ 无 | 🔴 缺失 |
| **定量评估(grader)** | ✅ 专用Agent，含claims验证 | ❌ 无 | 🔴 缺失 |
| **盲比A/B测试** | ✅ comparator+analyzer | ❌ 无 | 🟡 高级功能 |
| **描述优化闭环** | ✅ eval→improve自动迭代 | ❌ 无 | 🔴 缺失 |
| **方差分析/benchmark** | ✅ 多轮统计 | ❌ 无 | 🟡 高级功能 |
| **打包发布** | ✅ .skill文件 | ❌ 无（我们用git管理） | 🟡 不同范式 |
| **可视化评审** | ✅ 浏览器viewer | ❌ 无 | 🟡 nice-to-have |
| **后置治理检查** | ❌ 无 | ✅ 4步检查+自动修复 | 🟢 我们领先 |
| **能力锚点注册** | ❌ 无 | ✅ 自动索引更新 | 🟢 我们领先 |
| **意图路由集成** | ❌ 无（Claude Code原生路由） | ✅ ISC规则路由 | 🟢 我们领先 |
| **SKILL.md自动生成** | ❌ 无 | ✅ n019规则 | 🟢 我们领先 |
| **命名/结构规范检查** | ❌ 无 | ✅ alignment规则 | 🟢 我们领先 |

---

## 4. 引入好处

### 4.1 填补核心空白：技能开发前置流程

我们目前的技能创建完全依赖开发者手动编写SKILL.md，没有结构化的开发流程。官方版本提供了：
- **意图捕获**：从模糊需求到明确规格的结构化访谈
- **迭代改进**：测试→评估→改进的闭环，而非一次性编写
- **质量保证**：grader定量评估确保技能真正有效

### 4.2 描述优化能力

`improve_description.py` + `run_eval.py` 的组合可以自动优化技能的触发描述，提高意图路由准确率。这直接关联我们的北极星指标"言出法随达成率"。

### 4.3 盲比消除偏见

comparator的盲比机制可以客观评估技能改进是否真的更好，避免"改了就是好了"的认知偏差。

### 4.4 与上游保持同步

Anthropic会持续迭代这个工具。现在引入可以享受后续更新，避免自研成本。

### 4.5 标准化

采用社区标准的技能格式（YAML frontmatter、evals目录结构、.skill打包格式），有利于未来与社区技能生态互通。

---

## 5. 引入风险

### 5.1 🔴 高风险：依赖 `claude -p` CLI

官方版本的核心脚本（`run_eval.py`, `improve_description.py`, `run_loop.py`）全部依赖 `claude -p` 命令行工具。我们的环境是OpenClaw，不是Claude Code，**没有 `claude` CLI**。

**影响**：所有Python脚本无法直接运行。需要重写为调用OpenClaw的subagent API或其他LLM API。

### 5.2 🔴 高风险：架构范式不同

| 维度 | Anthropic官方 | 我们的环境 |
|------|:------------:|:--------:|
| 运行时 | Claude Code | OpenClaw |
| 子Agent | Claude Code subagent | OpenClaw sessions_spawn |
| 技能路由 | Claude Code原生available_skills | ISC规则路由 |
| 技能注册 | .claude/commands/ 目录 | CAPABILITY-ANCHOR.md + ISC rules |
| 配置格式 | YAML frontmatter | 我们也用YAML frontmatter（兼容） |
| 脚本语言 | Python | 我们主要用Node.js/Shell |

### 5.3 🟡 中风险：后置治理丢失

官方版本没有我们的后置治理机制（能力锚点注册、意图路由创建、结构检查）。如果全量替换，这些治理能力会丢失。

### 5.4 🟡 中风险：SKILL.md格式差异

官方SKILL.md使用标准YAML frontmatter：
```yaml
---
name: skill-creator
description: Create new skills...
---
```

我们的SKILL.md格式不统一，有些用markdown标题，有些用自定义格式。引入后需要统一格式。

### 5.5 🟢 低风险：Python依赖

官方脚本需要Python 3环境。我们的sandbox有Python，但主要生态是Node.js。维护两套语言栈增加复杂度。

### 5.6 🟢 低风险：eval-viewer需要浏览器

`eval-viewer/viewer.html` 需要浏览器环境查看。我们可以用飞书文档替代，或直接跳过。

---

## 6. 建议方案

### ❌ 不建议：全量替换

理由：
- `claude -p` 依赖无法满足，核心脚本全部失效
- 会丢失我们的后置治理机制
- 架构范式差异太大，强行移植成本高于收益

### ❌ 不建议：不引入

理由：
- 我们确实缺少技能开发前置流程
- 官方的eval/improve闭环理念非常有价值
- 盲比和grader机制值得借鉴

### ✅ 建议：部分合并（选择性移植 + 本地适配）

#### 第一优先级：移植核心理念到SKILL.md

将官方SKILL.md中的**流程框架**提取为我们的技能创建指导文档，适配OpenClaw环境：
- 意图捕获4步访谈 → 直接可用
- SKILL.md编写规范（YAML frontmatter格式） → 统一我们的格式
- 测试用例设计方法论 → 直接可用
- 迭代改进流程 → 适配为OpenClaw subagent调用

#### 第二优先级：移植grader Agent

`agents/grader.md` 的评估框架（expectations检查 + claims提取 + eval反馈）可以直接作为我们quality-audit技能的参考模板。输出格式（grading.json）可以对接我们的ISC事件总线。

#### 第三优先级：适配描述优化脚本

将 `improve_description.py` 的逻辑从 `claude -p` 改为调用OpenClaw的 `sessions_spawn` API或智谱GLM API，实现描述优化闭环。

#### 暂不移植

- `comparator.md` / `analyzer.md`：盲比机制有价值但优先级低，等核心流程跑通后再考虑
- `package_skill.py`：我们用git管理技能，不需要.skill打包
- `eval-viewer`：可用飞书文档替代
- `run_eval.py` / `run_loop.py`：强依赖 `claude -p`，需要完全重写

#### 保留我们的优势

合并时必须保留：
- ✅ `skill-post-creation-guard-001`：4步后置检查
- ✅ `pipeline-benchmark-skill-created-alignment-001`：对齐检查
- ✅ `n019-auto-skill-md-generation-019`：SKILL.md自动生成
- ✅ `isc-skill-index-update`：能力锚点自动更新
- ✅ ISC规则路由机制

#### 实施路径

```
Phase 1（1-2天）：提取官方流程框架，重写skill-creator-addon的SKILL.md为完整技能创建指导
Phase 2（2-3天）：基于grader.md完善quality-audit技能的评估逻辑
Phase 3（3-5天）：适配描述优化脚本为OpenClaw原生版本
Phase 4（可选）：移植盲比机制
```

---

## 附录：关键发现

1. **我们的skill-creator-addon不是skill-creator**——它只是一个后置检查清单，与官方版本完全不是同一个东西
2. **官方版本不是我们的上游**——我们的本地版本不是基于官方版本演进的，两者独立发展，解决不同问题
3. **最大价值在理念而非代码**——官方的eval→improve闭环理念、grader评估框架、盲比机制的设计思想比具体代码更有价值
4. **最大障碍是 `claude -p`**——官方所有自动化脚本都依赖Claude Code CLI，这是我们环境中不存在的
