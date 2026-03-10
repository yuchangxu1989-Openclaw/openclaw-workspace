# ContextEngine 插件接口深度分析（结论先行）

## 一句话结论
**ContextEngine 是我们当前“上下文膨胀 + 关键规则丢失 + 子Agent传递不稳”问题的核心解法。**

如果只做一件事：
- 用 `bootstrap + assemble` 控制“初始注入与按需组装”；
- 用 `compact + afterTurn` 控制“压缩质量与长期记忆沉淀”；
- 用 `prepareSubagentSpawn + onSubagentEnded` 控制“多Agent上下文闭环”。

---

## 来源与可信度说明
本分析基于：
1. PR #22201（feature/context engine）公开信息：新增 ContextEngine 生命周期与接线点。  
2. 本地文档 `docs/concepts/context.md`（当前上下文组成、注入与压缩机制）。

说明：线上 `docs.openclaw.ai/plugins/context-engine` 当前抓取 404，故 hook 语义以 PR 描述与现有运行机制推断，偏“产品落地视角”，不是逐行源码注释。

---

## 生命周期 Hook 逐项评估（重点：对我们有什么用）

| Hook | 触发时机 | 做什么 | 对我们的价值 |
|------|---------|--------|-------------|
| **bootstrap** | 会话/运行初始化时（首轮或引擎初始化阶段） | 从 session 文件/持久层“水合”出 canonical context store；建立索引、优先级、记忆分层 | **解决启动全量灌入**的第一入口：把 AGENTS/SOUL/MEMORY 拆成“规则层/策略层/事实层”，不再一次性全塞 |
| **ingest** | 单次新增上下文事件（用户消息、assistant结果、工具结果）后 | 增量吸收新信息，打标签（铁律、偏好、任务事实、噪声） | 把“有价值信息”及时结构化，减少后续 compact 时随机丢失 |
| **assemble** | 每次真正发给模型前 | 从 canonical store 里按预算拼装本轮 prompt：必选、候选、按需片段、最近历史 | **控制上下文窗口的关键 hook**：可实现“铁律永驻 + 任务相关召回 + 噪声隔离” |
| **compact** | 触发压缩时（/compact 或溢出压缩） | 用策略压缩历史：保留锚点、生成摘要、写回可追溯结构 | **解决压缩失真/丢铁律**：可做“受保护段不压缩、分层摘要、可回放摘要” |
| **afterTurn** | 每轮完成后 | 后处理：把本轮结果写回、触发后台压缩决策、刷新记忆权重 | **跨会话记忆衰减的主战场**：把短期结论沉淀成长期记忆，不等到爆窗才补救 |
| **prepareSubagentSpawn** | 子Agent创建前 | 选择并裁剪要传给子Agent的上下文包（任务目标+必要规则+最小背景） | **直接解决子Agent传递不完整**：避免“带太多”或“漏关键约束” |
| **onSubagentEnded** | 子Agent结束后 | 合并子Agent产出：提炼结论、写回主会话、更新记忆图谱 | 形成多Agent闭环，防止子Agent成果只停留在一次性日志 |

---

## 针对你们 5 个痛点的“hook 对应关系”

## 1) 启动时全量加载导致溢出 → 哪个 hook 能改？
**首选：`bootstrap` + `assemble`**

- `bootstrap`：把 AGENTS.md / SOUL.md / MEMORY.md / CAPABILITY-ANCHOR.md 拆成结构化条目（如：不可压缩铁律、角色设定、任务偏好、历史事实）。
- `assemble`：每轮只注入“必需 + 相关”，而不是固定全量注入。

> 价值：启动 token 立刻下降，且不牺牲关键约束。

## 2) 压缩时关键信息被随机丢失 → 哪个 hook 能改？
**首选：`compact`，辅助 `ingest`**

- `ingest` 先把关键内容打标（例如 `rule:hard`, `identity:core`, `preference:stable`）。
- `compact` 按标签执行保留策略：硬规则不压缩、软规则摘要保留、噪声优先删除。

> 价值：压缩从“随机摘要”变成“受约束压缩”。

## 3) 子Agent spawn 时上下文传递不完整 → 哪个 hook 能改？
**首选：`prepareSubagentSpawn`，回收靠 `onSubagentEnded`**

- spawn 前做“任务最小闭包”打包：目标、边界条件、必守规则、必要事实。
- 结束后把子Agent关键产出回写主上下文，避免知识断层。

> 价值：子Agent执行更稳，主Agent可持续复用子Agent结果。

## 4) 跨会话记忆衰减 → 哪个 hook 能改？
**首选：`afterTurn` + `bootstrap`**

- `afterTurn` 每轮沉淀“长期记忆候选”（稳定偏好、长期目标、成功策略）。
- `bootstrap` 下次会话启动时优先加载这些高价值记忆，而不是长日志。

> 价值：记忆从“靠运气被带上”变成“有管道、可复用”。

## 5) 规则/铁律被压缩掉 → 哪个 hook 能改？
**首选：`assemble` + `compact`**

- `assemble` 固定注入“铁律区”（small immutable block）。
- `compact` 对铁律区设为 protected，不参与摘要折叠。

> 价值：规则稳定性显著提升，降低行为漂移。

---

## 建议的落地优先级（按 ROI）

### P0（立刻做）
1. **assemble 规则化**：建立三层注入
   - Layer A: 永久铁律（小而硬）
   - Layer B: 当前任务相关记忆
   - Layer C: 最近对话窗口
2. **compact 保护策略**：为铁律/身份/长期偏好加 protected tag。

### P1（随后做）
3. **afterTurn 记忆沉淀**：每轮抽取“可复用结论”写入 MEMORY 分层存储。  
4. **prepareSubagentSpawn 模板化**：定义子Agent上下文打包模板（任务、约束、输入、验收标准）。

### P2（增强）
5. **onSubagentEnded 回写治理**：对子Agent输出做去重、可信度评分、冲突检测后再并入主记忆。

---

## 对你们系统的实际收益（非技术口径）

- **更省窗口**：不再把几份大文档全量塞给模型。  
- **更稳行为**：铁律不再被压缩误伤。  
- **更强协作**：子Agent拿到该拿的信息，结束后成果能回流。  
- **更像“长期助手”**：每轮都在积累可复用经验，而不是每次重来。

---

## 风险与注意事项

1. **过度剪裁风险**：assemble 过激会导致模型“失忆”。需保留最小安全底座。  
2. **标签质量决定上限**：ingest 打标不准，会把噪声当记忆。  
3. **子Agent回写污染**：onSubagentEnded 需有可信度门槛，避免错误知识扩散。

---

## 最终判断
**ContextEngine 不是“可有可无的插件点”，而是你们当前上下文治理问题的主控面。**

从问题匹配度看：
- 溢出问题：`bootstrap/assemble` 命中；
- 压缩失真：`compact` 命中；
- 子Agent断层：`prepareSubagentSpawn/onSubagentEnded` 命中；
- 长期记忆：`afterTurn/bootstrap` 命中。

建议尽快按 P0→P1 推进，先把“全量注入”改成“策略组装”，你们的上下文稳定性会立刻改善。
