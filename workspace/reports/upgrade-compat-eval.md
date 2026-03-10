# OpenClaw 2026.3.2 → 2026.3.7/3.8 升级兼容性评估

评估时间：2026-03-09

## 1) Breaking Change 逐条影响评估

### 1. `tools.profile` 默认改为 `messaging`
**结论：不影响（低风险）**

- 现场检查结果：`/root/.openclaw/openclaw.json` 中已显式配置 `"tools": { ... "profile": "full" ... }`，不是依赖默认值。
- 因此即使新版本默认值变为 `messaging`，你们当前实例仍会按显式配置走 `full`。
- 风险点：若某些子Agent/临时环境未加载该配置文件，可能回退到默认 profile。

**建议动作**：
- 升级前确认所有运行入口（主进程、sessions_spawn、cron触发路径）都引用同一份 `openclaw.json`。

---

### 2. ACP dispatch 默认启用
**结论：大概率不影响（低~中风险，建议验证）**

- 现场检查结果：`grep -i "acp"` 在 `openclaw.json` 未检出明显 ACP 配置。
- 这意味着你们目前可能未显式使用 ACP 功能。
- 变更后“默认启用”可能引入两类潜在影响：
  1) 额外路由/调度分支被激活；
  2) 某些工具调用路径从旧分发逻辑切到 ACP 分发逻辑。

**建议动作**：
- 做一次灰度验证（至少覆盖：`sessions_spawn` 并发、exec工具、Feishu消息流）。
- 若版本提供 `acp.dispatch` 开关，建议先显式关闭后升级，再逐步打开验证。

---

### 3. Plugin SDK 移除 `api.registerHttpHandler`
**结论：当前信息下不影响（低风险）**

- 现场检查结果：
  - `openclaw.json` 存在 `"plugins"` 段。
  - `/root/.openclaw/plugins/` 目录当前不可列出（命令退出码2），未确认是否存在本地插件代码。
  - 配置文件中未检出 `registerHttp` 关键字。
- 如果你们没有自定义插件，或插件未调用 `api.registerHttpHandler`，则该 breaking change 不会命中。

**建议动作**：
- 补充一次目录与代码级检查（特别是 workspace 中是否有插件实现）：
  - 全局搜索 `registerHttpHandler` / `registerHttp`。
  - 若有命中，需按新 SDK 改造后再升。

---

### 4. Zalo plugin 变更
**结论：不影响**

- 你们明确“不用 Zalo”。

---

## 2) 非 Breaking 但需注意的变更与本地改造风险

结合你们本地化改造清单，给出升级关注点：

1. **workspace 二次开发（17.8万行，55技能）**
   - 这是最大风险面。即便核心 breaking change 不命中，也可能受行为变更影响（工具默认参数、会话调度细节、错误码/超时）。
   - 建议对高频技能做回归冒烟。

2. **openclaw.json 多 provider/agent 配置复杂**
   - 3个 provider + 8个 agent × 每个5模型，矩阵较大。
   - 升级后需验证 provider 鉴权字段、模型路由优先级是否与旧版一致。

3. **Feishu 渠道 streaming**
   - 检查结果：`feishu.streaming=true` 且 `blockStreaming=true`。
   - 说明你们已启用流式但又有阻断策略，升级后需重点验证消息分片/合并、最终落盘一致性。

4. **pre-commit hooks（ISC 守卫）**
   - 非运行时 breaking，但升级可能改变代码生成/格式输出，导致守卫规则触发率变化。

5. **cron（LTO 编排器）**
   - 升级后建议检查定时任务环境变量是否仍能正确读取新版本配置路径与默认值。

6. **API Key 明文存储**
   - 检查结果：`openclaw.json` 中 `apiKey/api_key/token` 相关字段命中 **63** 次。
   - 这不是本次指定 breaking，但属于高安全风险；升级窗口期建议一并治理为 SecretRef。

7. **tools exec security/elevated**
   - 若新版收紧默认安全策略，可能对你们依赖 `exec` 的自动化链路产生影响。
   - 建议显式声明安全模式，避免吃默认值变化。

8. **sessions_spawn 并发最多16路**
   - 升级后应重点压测子 Agent 并发稳定性（排队、超时、资源回收、日志关联ID）。

---

## 3) 升级建议

**总体建议：先改配置再升（推荐）**

原因：
- 已确认的 breaking change 大多“看起来不命中”，但你们本地改造规模大、并发高、渠道链路复杂。
- ACP 默认启用与工具/会话行为细微变更，在高并发场景最容易放大。

### 建议实施步骤（最小风险路径）
1. **升级前固定显式配置**
   - 保持 `tools.profile=full`（已满足）。
   - 若支持，显式设置 ACP dispatch 为旧行为（或先关闭）。
2. **补齐插件代码扫描**
   - 全仓搜索 `registerHttpHandler`，确认 0 命中再进入升级。
3. **灰度升级（1台/1环境）**
   - 验证 Feishu streaming、sessions_spawn 16并发、关键技能链路。
4. **通过后全量**
   - 发布后观察 24h：失败率、超时率、Feishu消息异常率。
5. **安全债治理（并行）**
   - 将明文 key 逐步迁移到 SecretRef。

---

## 附：本次现场检查命令结果摘要

- `grep -i "profile|tools"`：检出 `"profile": "full"`
- `grep -i "acp"`：无输出
- `grep -i "plugin|registerHttp"`：仅检出 `"plugins": {`
- `ls /root/.openclaw/plugins/`：退出码2（目录不存在或无权限）
- `grep -A5 "feishu"`：`streaming: true`, `blockStreaming: true`
- `grep -c "apiKey|api_key|token"`：`63`

