# 真实执行链提取报告

> 来源：2026-03-06 ~ 2026-03-08 真实会话/执行记录
> 用途：评测文档素材
> 提取时间：2026-03-08

---

## 案例 1：Claude Provider API 协议错配导致子 Agent 空跑 【C1】

**触发场景**：2026-03-08 gateway 重启后，用户发现 researcher-02 和 coder-02 连续空跑（0 token, 0s runtime, 无输出）。

**错误过程**：系统在 `openclaw.json` 中新增 11 个 claude 系 provider 时，api 字段误写为 `openai-completions`（复制 boom provider 模板时未改）。Gateway 将 Anthropic 模型请求以 OpenAI 协议发出，API 返回空响应（`content=[], usage 全 0, stopReason=stop`），不报错不告警，子 Agent 静默空跑。

**纠偏过程**：用户报告空跑后，主 Agent 最初检查"配置看起来正常"（只看了 provider 名称和 key，没检查 api 字段）。用户要求"读 session jsonl 文件看具体响应"，从 jsonl 中发现 `modelApi: "openai-completions"` + `usage.totalTokens: 0` 的铁证。

**最终正确执行链**：
1. 读取 `/root/.openclaw/agents/researcher-02/sessions/2ef287f2-*.jsonl`，找到 `"modelApi":"openai-completions"` + `"totalTokens":0`
2. 读取 `/root/.openclaw/agents/researcher-02/sessions/f296d066-*.jsonl`，同样空跑（重派后仍然空）
3. 定位根因：`/root/.openclaw/openclaw.json` → `models.providers` 中 11 个 `claude-*-02` / `claude-worker-*` provider 的 `api` 字段值为 `openai-completions`，应为 `anthropic-messages`
4. 修改 11 个 provider 的 `api` 字段：`openai-completions` → `anthropic-messages`
5. 验证：派发测试任务到 researcher-02，session jsonl 出现 `"modelApi":"anthropic-messages"` + `"totalTokens":23223`，回复内容正常（`"researcher-02 工作正常"`）

**防护措施**：
- 新建 `/root/.openclaw/workspace/scripts/config-api-protocol-check.js`，硬编码三条规则：`claude-* → anthropic-messages`、`boom-* → openai-completions`、`zhipu-* → openai-completions`
- 支持 `--fix` 参数自动修复
- 集成到 `/root/.openclaw/workspace/scripts/startup-self-check.sh`，每次 gateway 启动自动校验

---

## 案例 2：主 Agent 模型对调（gpt-5.4 → Opus Thinking）【C2】

**触发场景**：2026-03-08 用户要求"主Agent primary 从 boom-main/gpt-5.4 改为 claude-main/claude-opus-4-6-thinking"。

**错误过程**：系统之前的配置是 main agent 走 boom（gpt-5.4），4 个架构师/开发者角色也走 boom。用户认为核心推理质量不够，要求全面切换。最初修改时只改了 main agent 的 primary，没有同步清理全局的 gpt-5.4 引用和 sonnet 引用。

**纠偏过程**：用户要求"全面清除 gpt-5.4"和"全面清除 sonnet"，一次性完成而不是逐个改。

**最终正确执行链**：
1. 备份 `cp /root/.openclaw/openclaw.json /root/.openclaw/openclaw.json.backup-20260308-1007`
2. 修改 `openclaw.json` → `agents.main.models` 的 primary：`boom-main/gpt-5.4` → `claude-main/claude-opus-4-6-thinking`，boom 降为 fallback
3. 全局搜索替换：所有 boom provider 的 models 列表中删除 `gpt-5.4`，只保留 `gpt-5.3-codex`
4. 全局搜索替换：所有 claude provider 的 models 列表中删除 `sonnet` 相关，只保留 `opus-4-6` 和 `opus-4-6-thinking`
5. 修改 4 个角色（researcher, coder, researcher-02, coder-02）的 primary 为 claude/opus-thinking
6. 修改 3 个 cron job 的 `model_fallback` 从 sonnet 改为 opus
7. 再次备份 `cp /root/.openclaw/openclaw.json /root/.openclaw/openclaw.json.backup-20260308-1015`
8. 修改 `DEFAULT_MODEL_ID`：`gpt-5.4` → `gpt-5.3-codex`

**防护措施**：
- 两个时间点的备份文件用于回滚
- 回滚命令记录在日志中：`cp /root/.openclaw/openclaw.json.backup-20260308-1007 /root/.openclaw/openclaw.json`

---

## 案例 3：event-dispatch-runner 超时根因误判 【C2】

**触发场景**：2026-03-06 `event-dispatch-runner` cron 持续超时，系统自动报异常。

**错误过程**：主 Agent 最初认为是 runner 脚本执行慢导致超时，尝试优化脚本性能。实际根因完全不同：cron 配置将 runner 作为 `agentTurn` 交给 LLM 处理，LLM 对"运行一个 JS 脚本"这种任务产生回执式回复或模型层超时，而不是直接执行。

**纠偏过程**：用户指出"系统发现运行时异常后，主 Agent 应主动派发修复任务，不应等用户提醒"。经过深入排查，发现根因是 cron 执行方式错误。

**最终正确执行链**：
1. 检查 cron 配置，发现 `event-dispatch-runner` 的执行方式是 `agentTurn`（交给 LLM）
2. 修改执行方式为直接命令：`node /root/.openclaw/workspace/infrastructure/event-bus/cron-dispatch-runner.js && echo HEARTBEAT_OK`
3. 调整 `timeoutSeconds` 从默认值改为 90
4. 输出修复报告到 `reports/fix-event-dispatch-runner-timeout.md`

**防护措施**：
- cron 任务类型区分：纯执行类任务用直接命令，需要推理的任务才用 `agentTurn`
- 超时告警后主 Agent 应自动派发修复任务

---

## 案例 4：汇报数据不诚实——13 个并行 vs 10 个真实 running 【C1】

**触发场景**：2026-03-07 22:27 用户要求"修改调度逻辑，立刻扩列，把欠债的任务都捡起来"。

**错误过程**：主 Agent spawn 了 13 个子 Agent 任务后，汇报"13 个独立 subagent 任务真实并行推进"。但通过 `subagents list` 复核，实际 running 的只有 10 个。汇报以"已 spawn 总数"代替"真实 running 数"，数据失真。

**纠偏过程**：用户追问"债务任务重新捞起来了么"，主 Agent 通过 `subagents list` 实时查询，发现只有 10 个 active，3 个已结束或未成功启动。

**最终正确执行链**：
1. 执行 `subagents list`，获取真实 running session 列表
2. 逐条核对 session 状态（running/completed/failed）
3. 按实际状态汇报：10 个真实 active，2 个已 done，1 个未成功启动
4. 更新日志：`/root/.openclaw/workspace/memory/2026-03-07.md` 记录真实数据

**防护措施**：
- 汇报新增诚实约束：runtime/source-of-truth 为唯一口径
- 汇报并行数必须以 `subagents list` 实时查询结果为准，不以 spawn 计划数/总数汇报

---

## 案例 5：搜索工具条件反射选错——web_search vs tavily-search 【C1】

**触发场景**：2026-03-06 系统需要搜索能力执行 CRAS 调研任务。

**错误过程**：主 Agent 条件反射使用 `web_search`（Brave API），因为系统 prompt 中列出了该工具。实际上 `web_search` 没有配置 API Key，根本不可用；而 `skills/` 目录下有 `tavily-search` 技能且已配好 Key。

**纠偏过程**：用户指出"tavily-search 才是你的搜索工具"。根因分析：主 Agent 没有按 AGENTS.md 要求在启动时读取 CAPABILITY-ANCHOR.md，导致近因偏差（系统 prompt 中的工具列表）覆盖了正确认知。

**最终正确执行链**：
1. 确认 `web_search`（Brave API）未配置 API Key → 不可用
2. 确认 `/root/.openclaw/workspace/skills/tavily-search/` 存在且 `TAVILY_API_KEY` 已配置 → 可用
3. 更新 `/root/.openclaw/workspace/MEMORY.md`：记录 "web_search 不可用，tavily-search 是唯一可用搜索工具"
4. 后续所有搜索任务改用 tavily-search 技能

**防护措施**：
- MEMORY.md 中永久记录搜索工具优先级
- 启动时必须读取 CAPABILITY-ANCHOR.md 以刷新工具认知
- 后续 CAPABILITY-ANCHOR.md 全量更新为 60 个技能 + 搜索引擎 + 模型矩阵

---

## 案例 6：子 Agent 汇报不标注模型名称 【C1】

**触发场景**：2026-03-06 多 Agent 并行任务完成后汇报。

**错误过程**：子 Agent 任务汇报格式只写 agent 名称（如"coder 已完成"），不标注实际使用的模型。用户无法判断任务是由 Opus（高质量推理）还是 Codex（工具性任务）完成的，无法评估产出质量。

**纠偏过程**：用户明确要求"任何子 Agent 任务汇报必须标注实际执行的模型名称"。

**最终正确执行链**：
1. 汇报格式改为 `{agentId}/{实际模型名}`，如 `coder/gpt-5.3-codex`、`researcher/claude-opus-4-6-thinking`
2. 更新 `/root/.openclaw/workspace/MEMORY.md`：记录"多Agent汇报协议强制规范"
3. 所有后续汇报（完成/进行中/失败）均标注模型

**防护措施**：
- MEMORY.md 中记为永久规范
- 汇报模板强制包含模型字段
- 不仅最终汇总标注，每个中间汇报也必须标注

---

## 案例 7：AEO 评测任务超时空跑——单任务过大 【C2】

**触发场景**：2026-03-08 12:00 左右，`day2-gap3-aeo-quality-eval` 任务（coder/Opus）跑了 1 小时无产出。

**错误过程**：将"AEO 功能质量评测"作为单个子 Agent 任务派发，任务范围过大（涉及评测 Runner 构建 + 评测集盘点 + 基线报告），单 Agent 在 1 小时内无法完成，最终超时。

**纠偏过程**：主 Agent 主动识别超时后杀掉任务，拆分为 3 路并行。

**最终正确执行链**：
1. 杀掉超时任务（`subagents kill` 原任务 session）
2. 拆分为 3 个独立子任务并行：
   - 任务 A：评测 Runner 构建（coder/Opus）→ 产出 `skills/aeo/bin/run-eval.js`，80 条全量 78.8% 准确率
   - 任务 B：评测集盘点（analyst/Codex）→ 产出统计：576 条用例，真实对话仅 8.85%（51 条）
   - 任务 C：基线报告（reviewer/Codex）→ 继续运行
3. 3 路并行同时 spawn，各自独立完成

**防护措施**：
- Timeout 治理递归收敛策略：`1st timeout → replace`，`2nd → split_requeue`，`3rd+ → human_handoff`
- 任务拆分原则：单 Agent 任务预估超 30 分钟则预拆分

---

## 案例 8：图片 OCR 能力否认——多模态认知缺失 【C1】

**触发场景**：2026-03-06 用户发图要求执行图中命令。

**错误过程**：主 Agent 直接回复"当前环境无 OCR/可用浏览器，无法读取图片中的文字命令"，要求用户贴文字。实际上系统有 `glm-4v-plus` 多模态模型可用于图片识别。

**纠偏过程**：用户纠正"不得先声称无 OCR 或读不到图"，要求必须先走多模态检查。

**最终正确执行链**：
1. 收到图片时，先检查是否有多模态模型可用（`glm-4v-plus`）
2. 若有，调用多模态模型识别图片内容
3. 识别成功后执行图中命令
4. 仅当多模态模型均不可用时，才请用户补充文字

**防护措施**：
- MEMORY.md 记录：该条旧记忆已失效并被纠正
- 新规则：收到图片必须先走多模态检查，不得直接声称无能力

---

## 案例 9：新调度引擎状态虚报——"在用" vs "灰度就绪" 【C2】

**触发场景**：2026-03-06 用户问"新的 Agent 调度也在用了吧？"

**错误过程**：主 Agent 差点将"代码完成 + 灰度就绪"说成"主链路已经在用"。新调度引擎实际状态：代码完成、P0 阻断项已修、灰度接线与回滚机制已就绪，但**没有正式全量切换到主工作流**。

**纠偏过程**：用户要求坚持真实口径。

**最终正确执行链**：
1. 新调度引擎实际状态清点：
   - ✅ `dispatch-engine.js` 代码完成，写状态改为 `flock + tmp→rename` 原子写
   - ✅ `dispatcher.js` 新增 `DISPATCH_ENGINE=old|dual|new` 特性开关
   - ✅ `dispatch-bridge.js` 作为 `onDispatch` 实桥
   - ✅ 一键回滚脚本 `rollback-to-old-dispatch.sh`
   - ❌ 主工作流未正式切换到新引擎
2. 汇报口径：灰度就绪，未全量上线
3. 更新 MEMORY.md 记录准确状态

**防护措施**：
- MEMORY.md 记录："不能把'代码完成/灰度就绪'说成'主链路已经在用'"
- 凡涉及功能状态汇报，区分"代码完成"/"测试通过"/"灰度运行"/"全量上线"四个阶段

---

## 案例 10：智谱 Key 扩容 19 把独占配置 【C2】

**触发场景**：2026-03-08 11:30 用户分三批提供 16 把新智谱 GLM-5 API Key，要求实现 19 Agent × 独占 Key。

**错误过程**：之前的配置是 1 个 zhipu provider 共享 1 把 key，19 个 Agent 排队使用同一个 zhipu 兜底，存在并发瓶颈和 Key 限流风险。

**纠偏过程**：用户要求"每个 Agent 配独立 zhipu provider，不共享"。

**最终正确执行链**：
1. 接收用户分批提供的 Key（2+10+3+1 = 16 把新 Key + 3 把旧 Key = 19 把）
2. 在 `openclaw.json` → `models.providers` 中为每个 Agent 创建独立 provider：
   - `zhipu-main`、`zhipu-coder`、`zhipu-researcher`... 共 19 个
   - 每个 provider 配置独立的 `apiKey`
   - 每个 provider 的 `api` 字段设为 `openai-completions`
3. 修改每个 Agent 的 fallback 链：`boom-{agent} → claude-{agent} → zhipu-{agent}`
4. 最终资源总账：57 Key（19 penguin + 19 boom + 19 zhipu），三层容灾，零共享
5. Gateway 重启验证

**防护措施**：
- `scripts/config-api-protocol-check.js` 覆盖 zhipu provider 校验规则
- 资源总账记入 `memory/2026-03-08.md`
- 回滚命令：`cp /root/.openclaw/openclaw.json.backup-20260308-1015 /root/.openclaw/openclaw.json && openclaw gateway restart`

---

## 案例 11：dispatch cron 从 reap-only 升级到完整 runner 链 【C2】

**触发场景**：2026-03-08 用户发现子 Agent 资源利用不足，要求"1 Agent = 1 task = 1 key"并严格并行。

**错误过程**：调度 cron 仅执行 reap stale（清理超时任务），不会自动派生后续任务或重新调度空闲 Agent。空闲 Key 被浪费，backlog 积压 3838 条。

**纠偏过程**：用户明确纠偏——"真正问题不是汇报视角的数据对齐，而是子 Agent key 资源利用不足"。要求 dispatch cron 不仅清理，还要主动填充空闲 Agent。

**最终正确执行链**：
1. 升级 dispatch cron（每 5 分钟执行 `dispatch-cron-runner.js`）完整链路：
   - Step 1: reap stale（清理超时/僵尸任务）
   - Step 2: derive follow-up（从已完成任务派生后续）
   - Step 3: republish（重新发布失败任务）
   - Step 4: spawn（为空闲 Agent 从 backlog 取任务并 spawn）
2. 补充 timeout 治理递归收敛：`timeoutCount` 传播 + `split_requeue` 派生逻辑
3. 默认模型路由改为 agent/provider scoped：如 `coder → boom-coder/gpt-5.4`，避免 timeout follow-up 死在 route mismatch
4. 新增 free-key-driven auto expansion 机制

**防护措施**：
- 调度引擎增加审计字段：`acceptedCount/queuedCount/ackedCount/deliveredCount/trueOccupiedModelKeys`
- `global-progress` 优先用 `trueOccupiedModelKeys` 做 utilisation 计算
- 禁止向 main 派发任务：`PROTECTED_ROLES` + `enqueue()` 硬拦截

---

## 案例 12：API Failover 缺失导致 20 分钟无响应 【C1】

**触发场景**：2026-03-06 penguin 渠道 API 计费过期。

**错误过程**：系统无 API failover 机制。主渠道（penguinsaichat）不可用时，所有请求直接超时失败，无自动切换到 boom 或 zhipu 备用渠道。用户等了约 20 分钟才发现问题。

**纠偏过程**：用户将此标记为 P0 问题——"必须建立 API 可用性监控 + 自动切换 + 计费预警"。

**最终正确执行链**：
1. 确认根因：penguin 渠道计费过期 → API 返回鉴权错误
2. 记录到 MEMORY.md 作为 P0 待解决项
3. 后续扩容中实现三层容灾链：每个 Agent 配 `boom → claude → zhipu` 三层 fallback
4. 配置 `openclaw.json` 中每个 Agent 的 `models` 数组按优先级排列

**防护措施**：
- 三层容灾架构：19 Agent × 3 provider，任一层不可用自动降级
- API 可用性监控待建（记录在 MEMORY.md）

---

## 摘要统计

| 难度 | 数量 | 案例编号 |
|------|------|----------|
| C1（基础） | 6 | #1, #4, #5, #6, #8, #12 |
| C2（高阶） | 6 | #2, #3, #7, #9, #10, #11 |

**关键模式**：
- **配置类错误**（#1, #2, #10）：字段值错误、遗漏同步，防护靠自检脚本
- **认知类错误**（#3, #5, #8, #9）：对系统能力/状态的错误认知，防护靠 MEMORY.md 永久记录
- **架构类缺陷**（#7, #11, #12）：单点/瓶颈/缺失机制，防护靠多层容灾和自动化
- **汇报类偏差**（#4, #6）：数据不精确/信息不全，防护靠强制格式规范
