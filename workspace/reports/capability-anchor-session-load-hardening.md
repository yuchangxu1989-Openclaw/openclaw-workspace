# capability anchor / 会话能力加载链加固报告

## 结论
已排查并直接加固。当前问题不在于 `CAPABILITY-ANCHOR.md` 不存在，而在于它虽然被文档/规则反复要求“会话启动时要读”，但在真实代码链路里，**并没有一个稳定、显式、可复用的会话入口加载器** 去确保它在 bootstrap / LLM context 初始化阶段被真正加载和留痕。

这会导致：
- anchor 主要停留在约定层、文档层、规则层；
- 会话/决策入口未必真的读过它；
- 已知能力更容易在 session 中被遗漏或“遗忘”。

## 排查结果

### 1. capability anchor 已存在，但更多是声明性存在
发现以下相关资产：
- `/root/.openclaw/workspace/CAPABILITY-ANCHOR.md`
- `/root/.openclaw/workspace/skills/capability-anchor/SKILL.md`
- `/root/.openclaw/workspace/skills/isc-core/rules/rule.capability-anchor-auto-register-001.json`
- `/root/.openclaw/workspace/skills/isc-core/rules/rule.capability-anchor-lifecycle-sync-001.json`
- `/root/.openclaw/workspace/infrastructure/event-bus/handlers/capability-anchor-sync.js`

说明：系统已经有“锚点生成/同步”的意识，但偏向**更新链**，不是**会话加载链**。

### 2. 会话/决策入口原本没有稳定显式加载器
发现：
- `infrastructure/system-bootstrap.js` 仅检查关键文件存在、统计规则/handler、必要时 git 恢复；
- `scripts/startup-self-check.sh` 也主要做存在性检查和恢复；
- `infrastructure/llm-context/index.js` 负责模型能力路由，但构造时不会显式触碰 capability anchor；
- event-bus 中虽有与 anchor 相关 handler/rule，但没有形成“session start -> anchor preload -> telemetry”的稳定链。

结论：
**anchor 被要求使用，但未被稳定注入到会话起点。**

## 已实施加固

### A. 新增统一会话能力锚点加载器
新增文件：
- `/root/.openclaw/workspace/infrastructure/session-anchor-bootstrap.js`

职责：
- 校验 `CAPABILITY-ANCHOR.md` 存在；
- 读取并缓存内容；
- 提供 `ensureCapabilityAnchorLoaded()`；
- 通过 event bus 发出 `session.capability-anchor.loaded` 事件，形成可观测性；
- 为 bootstrap / startup self-check / llm-context 提供统一入口。

意义：
- 把“应该读取锚点”从约定变成代码；
- 减少每个入口各自实现、各自遗忘。

### B. 加固 system bootstrap
修改文件：
- `/root/.openclaw/workspace/infrastructure/system-bootstrap.js`

改动：
- 引入 `ensureCapabilityAnchorLoaded`；
- 在 bootstrap 关键组件检查后，**显式预加载能力锚点**；
- 把加载结果写入 `status.components.anchor`，包括 loaded / cacheHit / size / loadedAt；
- 加载失败时把系统状态标记为 unhealthy。

效果：
- `bootstrap()` 不再只是检查 anchor 在不在，而是检查“能不能真正加载”；
- 会话入口对 anchor 的依赖变成执行性约束。

### C. 加固 startup self-check
修改文件：
- `/root/.openclaw/workspace/scripts/startup-self-check.sh`

改动：
- 增加 `SESSION_ANCHOR_BOOTSTRAP` 变量；
- 在关键文件检查 / Git 恢复之后，新增“会话能力锚点预加载”步骤；
- 使用 node 单行脚本调用 `ensureCapabilityAnchorLoaded({ source: 'startup-self-check' })`；
- 失败计入 `ERRORS`，不是静默略过。

效果：
- 启动自检从“看到文件”升级为“验证可加载”；
- 降低 anchor 文件存在但 session 并未真正触达的风险。

### D. 在 LLM context 构造阶段预热 anchor
修改文件：
- `/root/.openclaw/workspace/infrastructure/llm-context/index.js`

改动：
- 引入 `ensureCapabilityAnchorLoaded`；
- 在 `LLMContext` constructor 内尝试预加载 anchor，并把结果存入 `this._capabilityAnchor`；
- 这里保持 non-fatal，避免影响底层 LLM 调用，但让“模型能力路由层”默认触达能力锚点。

效果：
- 决策/模型调用入口至少会在初始化阶段碰一次 anchor；
- 进一步降低“路由层知道 provider，却忘了系统已知能力清单”的概率。

## 这次加固解决了什么

从原来的：
- 文档要求读 anchor
- 规则要求同步 anchor
- 但真实 session 入口不一定读

变成现在：
- bootstrap 会显式 preload anchor
- startup self-check 会显式 preload anchor
- llm-context 构造时会 opportunistic preload anchor
- event bus 有 `session.capability-anchor.loaded` 事件可追踪

即：
**把 capability anchor 从“静态文档资产”加固成“会话入口加载资产”。**

## 仍未完全解决，但建议后续继续做的点

### 1. 把 anchor 片段真正注入 system prompt / decision prompt
当前加固解决的是“加载链”和“会话入口触达”，但还没看到明确的 prompt 组装链把 anchor 摘要稳定拼进每轮决策上下文。

建议后续：
- 在真正的 system prompt builder / agent prompt composer 中，注入 anchor 摘要；
- 不一定全量注入，可按分类摘要注入；
- 结合 intent / routing 只注入相关能力段。

### 2. 补一个 session.started -> capability-anchor.loaded 的强绑定规则
当前 telemetry 已可发事件，但未看到一个完整的强制性 session-start rule。

建议后续新增规则：
- `session.general.started` 必须触发 `session-anchor-bootstrap`
- 若加载失败，直接告警或阻断高阶决策

### 3. 给 anchor 增加摘要缓存 / 分类索引
当前缓存的是全文与 preview。
后续可以：
- 提前生成 tool/model/skill/channel 分类索引；
- 决策时按需取子集，减少上下文体积。

## 本次修改文件
- `/root/.openclaw/workspace/infrastructure/session-anchor-bootstrap.js` （新增）
- `/root/.openclaw/workspace/infrastructure/system-bootstrap.js`
- `/root/.openclaw/workspace/infrastructure/llm-context/index.js`
- `/root/.openclaw/workspace/scripts/startup-self-check.sh`

## 最终判断
本次已完成“直接可加固”的部分，核心收益是：

> capability anchor 不再只靠人记得读，而是被挂进了 bootstrap / startup self-check / llm-context 三个关键入口。

这会实质性降低“已知能力在会话中被遗忘”的概率。