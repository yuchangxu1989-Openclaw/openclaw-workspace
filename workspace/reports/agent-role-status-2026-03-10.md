# Agent 角色体系现状报告

> 生成时间：2026-03-10 17:34 CST

---

## 一、总览

| 维度 | 数量 |
|------|------|
| Agent 总数 | 19 |
| 有完整自定义角色定义（SOUL.md） | 1（main / 战略家） |
| 使用默认模板 SOUL.md | 18 |
| API Provider 总数 | 61 |
| Claude API Key | 19 |
| Boom (GPT-5.3) API Key | 19 |
| 智谱 (GLM-5) API Key | 23 |

---

## 二、各 Agent 详情

### 核心角色（一期 7+1）

| Agent ID | 中文名 | Emoji | Primary 模型 | Fallback 1 | Fallback 2 | 角色定义 |
|----------|--------|-------|-------------|-----------|-----------|---------|
| main | 战略家 | 🎖️ | Claude Opus 4-6 Thinking | GPT-5.3 Codex | GLM-5 | ✅ 完整自定义 |
| researcher | 洞察分析师 | 🔍 | Claude Opus 4-6 Thinking | GPT-5.3 Codex | GLM-5 | ❌ 默认模板 |
| coder | 开发工程师 | 💻 | Claude Opus 4-6 Thinking | GPT-5.3 Codex | GLM-5 | ❌ 默认模板 |
| reviewer | 质量仲裁官 | 🔎 | Claude Opus 4-6 Thinking | GPT-5.3 Codex | GLM-5 | ❌ 默认模板 |
| writer | 创作大师 | ✍️ | Claude Opus 4-6 Thinking | GPT-5.3 Codex | GLM-5 | ❌ 默认模板 |
| analyst | 系统架构师 | 📐 | Claude Opus 4-6 Thinking | GPT-5.3 Codex | GLM-5 | ❌ 默认模板 |
| scout | 情报专家 | 🎯 | Claude Opus 4-6 Thinking | GPT-5.3 Codex | GLM-5 | ❌ 默认模板 |
| cron-worker | 定时任务执行者 | ⏰ | **GLM-5**（智谱） | GPT-5.3 Codex | Claude Opus 4-6 Thinking | ❌ 默认模板 |

### 二期扩展角色（-02 系列）

| Agent ID | 中文名 | Emoji | Primary 模型 | Fallback 1 | Fallback 2 | 角色定义 |
|----------|--------|-------|-------------|-----------|-----------|---------|
| researcher-02 | 架构师-02 | 🔍 | Claude Opus 4-6 Thinking | GPT-5.3 Codex | GLM-5 | ❌ 默认模板 |
| coder-02 | 工程师-02 | 💻 | Claude Opus 4-6 Thinking | GPT-5.3 Codex | GLM-5 | ❌ 默认模板 |
| reviewer-02 | 仲裁官-02 | 🔎 | Claude Opus 4-6 Thinking | GPT-5.3 Codex | GLM-5 | ❌ 默认模板 |
| writer-02 | 创作师-02 | ✍️ | Claude Opus 4-6 Thinking | GPT-5.3 Codex | GLM-5 | ❌ 默认模板 |
| analyst-02 | 分析师-02 | 📐 | Claude Opus 4-6 Thinking | GPT-5.3 Codex | GLM-5 | ❌ 默认模板 |
| scout-02 | 侦察兵-02 | 🔭 | Claude Opus 4-6 Thinking | GPT-5.3 Codex | GLM-5 | ❌ 默认模板 |
| cron-worker-02 | 定时器-02 | ⏰ | Claude Opus 4-6 Thinking | GPT-5.3 Codex | GLM-5 | ❌ 默认模板 |

### Worker 池（通用执行者）

| Agent ID | 中文名 | Emoji | Primary 模型 | Fallback 1 | Fallback 2 | 角色定义 |
|----------|--------|-------|-------------|-----------|-----------|---------|
| worker-03 | 执行者-02 | ⚡ | Claude Opus 4-6 Thinking | GPT-5.3 Codex | GLM-5 | ❌ 默认模板 |
| worker-04 | 执行者-03 | ⚡ | Claude Opus 4-6 Thinking | GPT-5.3 Codex | GLM-5 | ❌ 默认模板 |
| worker-05 | 执行者-04 | ⚡ | Claude Opus 4-6 Thinking | GPT-5.3 Codex | GLM-5 | ❌ 默认模板 |
| worker-06 | 执行者-05 | ⚡ | Claude Opus 4-6 Thinking | GPT-5.3 Codex | GLM-5 | ❌ 默认模板 |

---

## 三、GLM-5 Key 使用情况

共配置 23 个智谱 API Key，分布如下：

| 用途 | Provider 名称 | 被 Agent 引用 | 备注 |
|------|--------------|--------------|------|
| Agent fallback | zhipu-main, zhipu-researcher, zhipu-coder, zhipu-reviewer, zhipu-writer, zhipu-analyst, zhipu-scout, zhipu-cron-worker | ✅ 被引用 | 一期 agent fallback |
| Agent fallback | zhipu-researcher-02, zhipu-coder-02, zhipu-reviewer-02, zhipu-writer-02, zhipu-analyst-02, zhipu-scout-02, zhipu-cron-worker-02 | ✅ 被引用 | 二期 agent fallback |
| Agent fallback | zhipu-worker-03 ~ zhipu-worker-06 | ✅ 被引用 | worker 池 fallback |
| **未被引用** | **zhipu-embedding** | ❌ | 含 embedding-3 + glm-5，无 agent 使用 |
| **未被引用** | **zhipu-multimodal** | ❌ | 含 glm-4v-plus + glm-5，无 agent 使用 |
| **未被引用** | **zhipu-cron** | ❌ | 独立 glm-5 key，无 agent 使用 |
| **未被引用** | **zhipu-core** | ❌ | 独立 glm-5 key，无 agent 使用 |

**实际使用情况**：GLM-5 作为 fallback 链末端，仅在 Claude 和 GPT-5.3 均不可用时才会触发。唯一例外是 `cron-worker`，其 primary 模型即为 GLM-5。实际生产中 GLM-5 几乎从未被调用过（Claude 可用率极高）。

---

## 四、关键发现

1. **角色定义严重缺失**：19 个 Agent 中仅 `main`（战略家）有完整自定义 SOUL.md，其余 18 个全部使用默认模板，没有针对各自角色的专属行为定义。

2. **命名不一致**：-02 系列的中文名与一期不对应（如 researcher → "洞察分析师" vs researcher-02 → "架构师-02"），存在角色定位模糊。

3. **GLM-5 Key 冗余**：23 个智谱 key 中有 4 个（zhipu-embedding、zhipu-multimodal、zhipu-cron、zhipu-core）未被任何 agent 引用。

4. **GLM-5 实际利用率极低**：除 cron-worker 外，GLM-5 均为第三优先级 fallback，在 Claude 高可用的情况下基本不会被触发。

5. **模型配置高度同质化**：除 cron-worker 外，所有 agent 的模型配置模式完全一致（Claude primary → GPT-5.3 fallback → GLM-5 fallback），没有根据角色特性做差异化配置。
