# OpenClaw 安全性现状与优化策略（结论先行）

**结论先行：**
- OpenClaw 的官方安全模型是“**单信任边界的个人助手模型**”，并不把同一 Gateway 下的多对抗用户隔离当作默认保障目标。
- 原生机制已覆盖关键控制面：`gateway.auth`、工具策略（deny/allowlist）、`exec` 安全模式、`elevated`、沙盒与节点配对边界、`openclaw security audit` 自检。
- 当前最大风险不在“有没有机制”，而在“**配置是否最小权限**”与“**运行边界是否混用**”（如多人共用同一 bot+高危工具、配置中明文密钥、runtime 与个人账号混跑）。
- 结合你方现状，优先级最高的优化是：**密钥治理（立即轮换）> 工具权限收敛 > 边界拆分（人/环境/账号）> 持续审计自动化**。

---

## 1. OpenClaw 原生安全机制（沙盒/权限/白名单/elevated）

基于官方安全文档（`docs.openclaw.ai/security`）和本地 docs 结构，可归纳为：

1) **信任模型声明（非常关键）**  
- 官方明确：推荐“一人/一信任边界/一 Gateway（最好一 OS 用户或一主机）”。
- `sessionKey` 是路由键，不是鉴权边界；不要当作租户隔离令牌。
- 若存在互不信任用户，应拆分为独立 gateway + 独立凭据（理想是独立主机/OS 用户）。

2) **Gateway 入口控制**
- `gateway.auth`（token/password/device auth）用于 API 入口鉴权。
- release 提示：当 token 与 password 同时配置时，需显式 `gateway.auth.mode`，避免歧义导致启动/配对异常。

3) **工具权限面（Tool Policy）**
- 支持 `tools.profile`（如 messaging/minimal/coding）作为权限基线。
- 支持 `tools.deny` 对工具组做拒绝（如 automation/runtime/fs）。
- `exec` 支持 `security` 与 `ask`（如 `deny`、`allowlist`、`always` 审批）。
- `fs.workspaceOnly` 可限制文件系统作用域。

4) **elevated 模式（高危能力闸门）**
- elevated 是额外能力层，不应默认开启。
- 与 allowlist/ask 组合用于“高风险操作显式授权”。

5) **沙盒与节点边界**
- OpenClaw 提供 sandbox 相关能力与文档（本地存在 sandboxing/sandbox-vs-tool-policy-vs-elevated 文档）。
- Gateway 与 Node 被视为同一操作员信任域内不同角色：Gateway 是控制面，Node 是执行面。

6) **内置审计工具**
- `openclaw security audit` / `--deep` / `--fix` / `--json` 用于巡检常见误配：认证暴露、browser 暴露、elevated allowlist、文件权限等。

7) **近期安全修复信号（release）**
- v2026.3.7-beta.1 的安全相关修复之一：
  - **Config fail-closed**：`loadConfig()` 在校验/读取失败时改为失败关闭，避免悄悄回退到宽松默认。
- 同版本还有 auth token SecretRef 支持与 hook 注入策略开关等，说明安全治理在持续推进。

---

## 2. 已知风险面（你需要重点盯防）

1) **Prompt Injection（最常见）**
- 多人可发消息驱动同一工具集时，注入更容易转化为实际工具调用。
- 官方也强调：仅有注入不等于漏洞，但注入+过宽权限=真实风险。

2) **权限过大导致横向放大**
- `exec`、browser、fs、network 组合过宽，会把“内容风险”放大成“系统风险”。
- elevated 若常开或 allowlist 过宽，容易绕过预期防线。

3) **沙盒逃逸与执行面暴露**
- sandbox 不是万能；若宿主机权限、挂载、网络策略过宽，仍可能被利用。
- remote browser/CDP、node command 若对外暴露或鉴权弱，风险显著上升。

4) **凭据与敏感数据泄露**
- 本地配置检查输出显示了多个明文 `apiKey`（高风险）。
- 一旦日志/报告/聊天转发未脱敏，极易造成长期凭据泄露。

5) **多租户误用风险**
- 把单 gateway 当作“天然多租户隔离”会误判安全性。
- 共享 workspace 中若允许广泛 DM 或群聊触发，高危工具会被“共享授权”。

6) **供应链与插件风险**
- 插件 hook、扩展依赖、容器预装依赖都会增加攻击面。
- 需要显式 allowlist 与版本锁定、签名/来源审计。

---

## 3. 你们当前安全加固现状（含差距）

> 说明：你方提到“ISC 规则守卫 / pre-commit hook / git 治理”等。结合当前可见配置与本地检查，给出客观判断。

### 已有基础（正向）
- 已建立本地 OpenClaw 配置体系（`/root/.openclaw/openclaw.json`）。
- 本地文档树包含 security/sandbox 专题，具备制度落地基础。
- 从任务描述看，已在工程流程层面引入规则守卫与代码治理意识（ISC、pre-commit、git 管控）。

### 当前明显短板（高优先）
1) **明文密钥存在于配置文件**（严重）  
- 观察到多个 provider `apiKey` 明文，且为真实样式密钥。
- 这会使主机泄露、备份泄露、日志误传都直接变成可利用事件。

2) **配置可见片段未充分展示安全闸门细节**  
- 检索到 `"elevated": {`，但未见完整策略（enabled/allowlist/ask）。
- 若默认/历史值偏宽，风险不可接受。

3) **“多通道+多代理+高能力工具”组合风险待验证**
- 若存在共享频道触发且工具集未分级，注入与误操作风险会明显抬升。

---

## 4. 优化策略建议（按优先级）

### P0（立即执行，1-3天）
1) **立刻轮换全部已暴露 API Key**
- 先在上游平台作废旧 key，再发新 key。
- 同步排查：shell 历史、日志、报告、聊天记录、git 历史。

2) **密钥改造为 SecretRef/环境注入**
- 禁止明文落盘到 `openclaw.json`。
- 使用 SecretRef（release 已支持相关能力）或外部密钥管理（Vault/KMS）。

3) **高危工具默认拒绝**
- 默认：`tools.profile=messaging/minimal`（按业务选）
- 显式 deny：`group:runtime/group:automation/group:fs`（再按需白名单放开）
- `exec.security=deny` 起步；必须启用时采用 allowlist + `ask=always`。
- `elevated.enabled=false` 作为默认基线。

4) **网口与鉴权收敛**
- `gateway.bind=loopback`，非必要不对公网暴露。
- 强制 `gateway.auth.mode` 明确，token 长度与复杂度达标。

### P1（本周内）
1) **按信任边界拆分实例**
- 个人助手、团队助手、自动化任务助手分离：独立 gateway/凭据/运行用户。
- 敏感助手与公共助手物理或至少 OS 级隔离。

2) **建立“工具分级矩阵”**
- L1（只读消息）/L2（受限查询）/L3（执行写操作）/L4（系统执行）
- 每个 agent 绑定固定上限，不因 prompt 动态升权。

3) **审计自动化**
- 日常跑 `openclaw security audit --deep --json`，接入 CI/告警。
- 将“高危配置漂移”设为阻断项（如 elevated 开启、exec 非 allowlist）。

### P2（本月内）
1) **注入防护与数据防外泄联动**
- 对外部网页/邮件/IM 内容打上“非可信输入”标签（流程上已具备意识）。
- 输出侧增加 DLP 规则：密钥格式、账号、隐私字段自动拦截。

2) **插件与供应链治理**
- 插件显式 allowlist，固定版本，来源审计。
- pre-commit 增加 secret-scan、IaC/config lint、策略即代码校验。

3) **事件响应预案**
- 制定泄露事件 SOP：发现→吊销→替换→回溯→复盘。
- 最小化“人工临时放权”并要求留痕与过期回收。

---

## 附：本次调研依据
- OpenClaw 官方安全文档：`https://docs.openclaw.ai/security`（实际跳转 `.../gateway/security.md`）
- OpenClaw GitHub Security 标签 Issues 列表页（可见近期大量安全议题关闭）
- OpenClaw release：`v2026.3.7-beta.1`（含 Security/Config fail-closed 等条目）
- 本地检查：
  - `/root/.openclaw/openclaw.json`（发现明文 API keys）
  - `/usr/lib/node_modules/openclaw/docs/**`（存在 security/sandbox 文档）

---

**一句话总结：**
OpenClaw 的安全能力本身不弱，但它依赖“正确的单信任边界部署 + 最小权限配置”。你们现在最需要先把“明文密钥与权限过宽”这两个高风险点压下去，再做自动化审计和边界拆分，安全水平会立刻上一个台阶。