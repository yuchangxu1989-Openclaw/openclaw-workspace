# MemOS 调研报告

> 调研日期：2026-03-10 | 调研人：Researcher Agent

---

## 结论先行

**MemOS 已有官方 OpenClaw 插件（Cloud + Local），可直接 `openclaw plugins install` 一键集成，无需自研适配。** 它能显著增强我们现有的 MEMORY.md 记忆管理——从纯文本文件升级为结构化、可检索、可进化的记忆系统。Local 插件尤其适合我们的多 Agent 架构，支持记忆隔离 + 技能共享。

**推荐：先试 Local 插件（零成本、零云依赖），验证效果后再决定是否上 Cloud。**

---

## 1. MemOS 是什么

MemOS（Memory Operating System）是面向 LLM 和 AI Agent 的记忆操作系统，由 MemTensor 团队开发，Apache 2.0 开源。

**核心功能：**
- 统一记忆 API：增删改查一套接口，记忆以图结构存储，可检视可编辑
- 多模态记忆：文本、图片、工具调用轨迹、用户画像
- 知识库管理（MemCube）：多知识库组合，支持隔离与共享
- 异步调度（MemScheduler）：毫秒级延迟，高并发生产可用
- 记忆反馈与修正：自然语言纠正/补充已有记忆
- 任务总结 + 技能进化：碎片对话 → 结构化任务 → 可复用技能，自动升级

**解决的问题：** LLM 没有持久记忆，每次对话从零开始。MemOS 让 Agent "记住"历史交互、用户偏好、学到的技能，实现跨会话的上下文连续性和个性化。

**性能数据（官方）：**
- 比 OpenAI Memory 准确率 +43.70%
- 节省 35.24% memory tokens
- LoCoMo 75.80 / LongMemEval +40.43%

---

## 2. 技术架构

### 核心 SDK（Python）
- PyPI 包名：`MemoryOS`
- Python 3.x，依赖向量数据库（本地或远程）
- 支持 Redis Streams 任务调度、NebulaGraph 图存储
- 部署模式：轻量（quick）和完整（full）

### OpenClaw 插件（Node.js）— 这是我们关心的
- **Cloud 插件**：`@memtensor/memos-cloud-openclaw-plugin`
  - NPM 包，纯 Node.js，通过 REST API 调用 MemOS Cloud
  - 生命周期钩子：`before_agent_start` → 召回记忆，`agent_end` → 存储对话
  - 需要 API Key（免费额度可用）
  
- **Local 插件**：`@memtensor/memos-local-openclaw-plugin`
  - NPM 包，纯 Node.js，本地 SQLite 存储
  - FTS5 全文搜索 + 向量搜索（混合检索）
  - 内置 Web 管理面板（Memory Viewer，7 个管理页面，端口 18799）
  - 任务总结 + 技能自进化
  - 多 Agent 记忆隔离 + 技能共享
  - 一键迁移 OpenClaw 原生记忆（MEMORY.md 等）
  - 零云依赖

### 安装方式
```bash
# Cloud
openclaw plugins install @memtensor/memos-cloud-openclaw-plugin@latest

# Local
openclaw plugins install @memtensor/memos-local-openclaw-plugin
```

---

## 3. 与 OpenClaw 系统兼容性分析

### 我们的系统现状
- OpenClaw Agent 框架，Node.js 生态
- 18 个子 Agent（researcher、coder、ops 等）
- ISC 规则引擎
- 记忆管理：MEMORY.md（长期）+ memory/*.md（每日笔记）+ HEARTBEAT.md

### 兼容性评估

| 维度 | 评估 | 说明 |
|------|------|------|
| **技术栈** | ✅ 完全兼容 | 官方 OpenClaw 插件，Node.js 原生，NPM 安装 |
| **安装集成** | ✅ 一键安装 | `openclaw plugins install` + 重启 gateway |
| **多 Agent** | ✅ 原生支持 | `multiAgentMode=true`，自动按 agentId 隔离记忆 |
| **现有记忆迁移** | ✅ 内置支持 | Local 插件有一键迁移 OpenClaw 原生记忆功能 |
| **侵入性** | ✅ 低 | 生命周期插件，不改现有代码，通过钩子注入 |
| **数据主权** | ✅ Local 可控 | 本地 SQLite，数据不出机器 |

### 能否替代 MEMORY.md？

**不建议完全替代，建议增强。** 理由：

1. MEMORY.md 是人类可读的纯文本，git 可追踪，简单可靠
2. MemOS 提供的是结构化检索能力——Agent 不再需要每次加载整个 MEMORY.md
3. 最佳方案：**两者并存**
   - MEMORY.md 继续作为"人类可读的长期记忆备份"
   - MemOS 作为"Agent 运行时的智能记忆检索层"
   - Local 插件支持从 MEMORY.md 导入，保持同步

### 对 18 个子 Agent 的价值

- **记忆隔离**：每个 Agent 有独立记忆空间，researcher 的调研笔记不会污染 coder 的代码记忆
- **技能共享**：researcher 学会的调研方法论可以发布为公共技能，其他 Agent 可安装复用
- **跨会话连续性**：子 Agent 被 spawn 后能自动获取相关历史上下文，不再每次从零开始

---

## 4. 实际价值评估

### 值得投入的理由

1. **零开发成本**：官方插件，一键安装，不需要写适配代码
2. **解决真实痛点**：当前 MEMORY.md 方案的问题——文件越来越大、检索靠全文加载、多 Agent 记忆混杂
3. **Token 节省**：官方数据 72% lower token usage（智能检索 vs 全量加载）
4. **技能进化**：从"记住"到"学会"，Agent 能积累可复用的操作技能
5. **可视化管理**：Web 面板让记忆透明可控，方便调试

### 风险与顾虑

1. **成熟度**：Local 插件 v1.0.0（2026-03-08 刚发布），可能有 bug
2. **性能开销**：本地向量搜索 + embedding 计算需要额外资源
3. **依赖风险**：引入第三方插件，MemTensor 团队的持续维护能力待观察
4. **复杂度增加**：多了一层记忆系统，调试链路变长

### 投入建议

| 阶段 | 行动 | 预计耗时 |
|------|------|----------|
| **试水** | 在测试环境装 Local 插件，跑几天看效果 | 1-2 小时安装 + 1 周观察 |
| **评估** | 对比有/无 MemOS 时的 Agent 表现（token 用量、上下文准确性） | 1 周 |
| **推广** | 效果好则全量启用，配置多 Agent 模式 | 半天 |

---

## 信息源

| 来源 | URL | 获取时间 |
|------|-----|----------|
| GitHub 主仓库 | https://github.com/MemTensor/MemOS | 2026-03-10 |
| Cloud 插件仓库 | https://github.com/MemTensor/MemOS-Cloud-OpenClaw-Plugin | 2026-03-10 |
| Local 插件官网 | https://memos-claw.openmem.net | 2026-03-10 |
| PyPI (MemoryOS) | https://pypi.org/project/MemoryOS/ | 2026-03-10 |
| 官方文档 | https://memos-docs.openmem.net/ | 2026-03-10 |
| 论文 (长版) | https://arxiv.org/abs/2507.03724 | 2025 |
| 论文 (短版) | https://arxiv.org/abs/2505.22101 | 2025 |

---

*置信度：高。信息来源为官方 GitHub、官方文档、PyPI，交叉验证一致。第三方评测数据未找到（Brave Search API 未配置），性能数据仅来自官方，需独立验证。*
