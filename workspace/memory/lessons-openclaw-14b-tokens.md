# OpenClaw 实战经验吸收与应用
## 来源：一周烧掉14亿Token后的10条血泪教训
## 吸收时间：2026-02-23

---

## 核心洞察
停止把 AI 当聊天机器人，开始把它当基础设施来看待。

---

## 10条教训吸收与应用

### 1. 模型路由决定一切 ✅ 已应用
**原文要点**：
- Sonnet 4.6 是日常最佳，Opus 级别智商但只需 1/5 成本
- Kimi K2.5 是预算之选，工具调用稳定
- 分层配置：好模型日常任务，强力模型后备复杂工作

**我的应用**：
- 当前配置：Kimi K2.5 作为主模型（已通过 OpenClaw 配置）
- 已启用 fallback 机制
- 需要添加：/model 切换命令支持

### 2. Skill 文件是护栏 ✅ 已应用
**原文要点**：
- Skill 文件防止 agent 越野脱缰
- DocClaw Skill：强制"先读再做"工作流

**我的应用**：
- 已构建 ISC 智能标准中心
- 已构建 isc-document-quality 技能
- 已构建 isc-core 核心系统
- 待安装：DocClaw（已在 ClawHub 安装列表）

### 3. Soul.md 是大脑 ✅ 已应用
**原文要点**：
- 构建 → 测试 → 记录 → 决策 → 循环
- 把每个有意义的任务当作执行循环

**我的应用**：
- SOUL.md 已定义三段式输出规范
- 需要强化：progress-log.md 记录机制

### 4. Todo.md = 自动扩展任务清单 ⚠️ 待完善
**原文要点**：
- 大任务分解成子任务
- 工作时更新状态
- 发现后续工作时生成新任务

**我的应用**：
- 需要创建：todo.md 自动管理机制
- 集成到 ISC 反思改进层

### 5. ProgressLog.md = 晨间简报 ⚠️ 待完善
**原文要点**：
- 每轮构建-测试循环都要记录
- 不用看会话记录就知道昨晚发生了什么

**我的应用**：
- 需要创建：progress-log.md 机制
- 集成到 CARS 仪表盘

### 6. Cron job > 长会话 ✅ 已应用
**原文要点**：
- 会话只有开着的时候才有状态
- 定时任务按计划唤醒 agent

**我的应用**：
- CARS 意图洞察仪表盘：每日 07:00
- EvoMap Evolver 自动进化：每 4 小时
- ClawHub Skills 批量安装：13:00

### 7. 文件就是记忆 ✅ 已应用
**原文要点**：
- 长会话会被压缩，丢失上下文
- 重要东西都写到 markdown 文件

**我的应用**：
- MEMORY.md - 长期记忆
- SOUL.md - 决策循环
- USER.md - 用户画像
- AGENTS.md - Agent 身份
- 需要补充：progress-log.md, todo.md

### 8. 模型质量 ≠ Agent 质量 ✅ 已应用
**原文要点**：
- 聊天质量和 agent 质量是完全不同的两件事
- 工具调用可靠性最重要

**我的应用**：
- 当前使用 Kimi K2.5，工具调用稳定
- 已配置 fallback 到更强模型

### 9. 一次只加一个新集成 ✅ 已应用
**原文要点**：
- 每个集成都是独立故障点
- 稳定后再加下一个

**我的应用**：
- 飞书集成已稳定
- EvoMap 集成已完成
- ISC 核心已构建
- 待添加：DocClaw 等技能（按顺序）

### 10. 分开 Dev 和 Ops Agent ⚠️ 待规划
**原文要点**：
- Codex/Claude Code 做开发
- OpenClaw 做运维

**我的应用**：
- 当前我是主 Agent，兼顾开发和运维
- 需要规划：子 Agent 分工机制
- subagent-driven-development 技能可解决

---

## 记忆系统补充

### 当前状态
- OpenClaw 内置向量记忆：memory_search, memory_get
- 已索引：MEMORY.md + memory/*.md
- 需要强化：向量记忆与文件记忆的协同

### 安全补充 ⚠️ 待执行
**原文要点**：
- OpenClaw 出过真实安全事故
- 定期运行安全审计

**我的应用**：
```bash
# 需要执行：
openclaw doctor --deep --fix --yes
openclaw security audit
openclaw security audit --fix
```

---

## 立即执行项

1. [ ] 创建 todo.md 自动管理机制
2. [ ] 创建 progress-log.md 记录机制
3. [ ] 执行安全审计
4. [ ] 安装 DocClaw 技能（先读再做工作流）
5. [ ] 安装 subagent-driven-development（子 Agent 分工）
6. [ ] 强化 progress-log 到 CARS 仪表盘

---

## 长期优化项

1. 构建 Gigabrain 级记忆系统（911+ 条记忆索引）
2. 实现 Dev/Ops Agent 分离
3. 完善透明度和可审计性机制

---

ISC 智能标准中心已记录此学习成果。
