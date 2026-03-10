# OpenClaw Gateway `exec` 白名单限制安全评估（2026-03-09）

## 结论摘要（先看）
- **可行且推荐优先**：使用 OpenClaw 原生 `tools.exec.security=allowlist` + `tools.exec.safeBins`/`safeBinProfiles`（而不是自造 hook）。
- **不推荐单独使用**：仅做 shell wrapper（可被绕过、维护成本高、容易误伤）。
- **强推荐作为底座**：Linux 受限用户 + 文件权限隔离（对 gateway 稳定性影响最小，回滚也简单）。
- **对飞书收发/子Agent通信影响**：
  - 只改“工具层 exec 策略”一般不会影响通道心跳和消息收发；
  - 但若把策略设得过严，可能影响需要 exec 的功能（含部分子任务/插件执行）。

---

## 1) 源码路径与执行链路（基于 `/usr/lib/node_modules/openclaw/dist`）

> 由于安装包为打包后 dist 文件，以下为“可追踪到的实际运行代码路径”。

### 1.1 `exec` 配置模型（支持字段）
在 `model-selection-CjMYMtR0.js` 可见 `ToolExecBaseShape`：
- `tools.exec.host: sandbox|gateway|node`
- `tools.exec.security: deny|allowlist|full`
- `tools.exec.ask: off|on-miss|always`
- `tools.exec.safeBins: string[]`
- `tools.exec.safeBinTrustedDirs: string[]`
- `tools.exec.safeBinProfiles: record`
等。

关键证据：
- `ToolExecBaseShape` 定义包含 `security/safeBins/safeBinProfiles`（约 7030~7060 行段）
- `AgentToolExecSchema` / `ToolExecSchema` 均引用该 base shape。

### 1.2 命令解析与 wrapper 处理
在同文件可见：
- `src/infra/exec-wrapper-resolution.ts`
- `src/infra/exec-command-resolution.ts`
- `src/infra/exec-allowlist-pattern.ts`

说明：
- 系统会解析可执行路径、展开 wrapper 链（如 `env/nice/nohup/stdbuf/timeout` 等），并对某些 wrapper 做阻断或展开；
- 允许名单匹配支持 glob/pattern，并对路径做归一化。

这意味着 **OpenClaw 内部已经有“命令级 allowlist + wrapper 识别”机制**，不是简单字符串 contains。

### 1.3 执行与拒绝路径
在 `dist/plugin-sdk/reply-DFFRlayb.js` 可见执行主逻辑：
- `runExecProcess(...)`
- 当策略不满足时抛错：
  - `exec denied: host=<...> security=deny`
  - `exec denied: allowlist execution plan unavailable (...)`
  - `exec denied: allowlist miss`

事件层在 `server-node-events-CjqZYCu8.js` 存在：
- `exec.started`
- `exec.finished`
- `exec.denied`

说明拒绝是“可观测事件”，不是静默失败。

### 1.4 是否有现成 allowlist/denylist/hook
- **allowlist：有（原生）**，通过 `tools.exec.security=allowlist` + allowlist 解析链路实现。 
- **denylist（针对 exec 命令本身）**：未看到 `tools.exec.denyCommands` 这类一等字段；看到的通用 `tools.deny` 是“工具级禁用”，不是 shell 子命令 deny。 
- **hook 机制**：未看到官方“自定义 pre-exec hook 插件点”可直接注入命令审计/重写。

---

## 2) 三种方案评估

## a) `openclaw.json` 配置方案（原生 allowlist）

### 可行性
**高**。源码明确支持：
- `tools.exec.security=allowlist`
- `tools.exec.safeBins`
- `tools.exec.safeBinProfiles`
- `tools.exec.safeBinTrustedDirs`

并且执行链中有强制 deny 分支。

### 对 gateway 进程本身影响
- **低到中**：仅影响“通过 exec 工具发起的命令”。
- 不会直接改变 Node 主进程事件循环/网络 socket。
- 但若误配导致内部某些需要 exec 的能力被拦，会出现功能退化（非进程崩溃）。

### 对飞书消息收发影响
- **低**（通常）。飞书收发主链路不依赖你主Agent每次 exec。
- 风险点：若你的自动化流程依赖 exec 做消息附件处理/脚本转换，可能被拒绝。

### 对子Agent spawn/通信影响
- **中**：若子Agent工作流依赖 exec 执行命令，allowlist 过窄会增加 `exec.denied`。
- 通信链路本身（会话/消息通道）通常不受影响；受影响的是“子Agent能做什么命令”。

### 实施复杂度 / 回滚
- 实施：**中低**（改配置+重载/重启）。
- 回滚：**低**（改回 `security=full` 或放宽 allowlist）。

### 评价
**首选**。因为是官方内建策略，行为可预测，维护成本最低。

---

## b) wrapper 脚本方案（shell 替换为白名单检查器）

### 可行性
**中**。技术上可做：把 exec 指向 wrapper，再由 wrapper 决定是否放行。

### 主要风险
1. **绕过风险**：
   - 若系统可直接执行绝对路径二进制，wrapper 可能被绕开；
   - wrapper 常见基于命令字符串匹配，面对引号、转义、`env`/`bash -c` 嵌套容易误判。
2. **兼容性风险**：
   - OpenClaw 本身已经有 wrapper 解析策略；你再叠一层 wrapper，诊断复杂度上升；
   - 命令参数边界条件（空格、unicode、here-doc）容易出问题。
3. **运维风险**：
   - 一旦 wrapper 挂掉/超时，所有 exec 功能受影响。

### 对 gateway / 飞书 / 子Agent
- gateway本体：**中风险**（错误 wrapper 可能造成大量失败日志与任务阻塞）
- 飞书收发：**低到中**（主通道不一定断，但自动化动作可能失败）
- 子Agent：**中到高**（执行面全部经过 wrapper，误杀概率高）

### 实施复杂度 / 回滚
- 实施：**中高**（需要健壮参数解析与测试）。
- 回滚：**中**（改回原 shell/path 即可，但需要确认无残留配置）。

### 评价
**不建议作为主方案**，可作为临时补丁或审计层，但不应替代原生策略。

---

## c) Linux 用户权限方案（受限用户 + FS 权限）

### 可行性
**高**，且与应用解耦。

### 思路
- 让主Agent（或整个 gateway 服务）运行在受限用户；
- 工作目录可写，系统目录只读；
- 必要时配合 `no-new-privileges`、systemd `ReadWritePaths`/`ProtectSystem` 等。

### 对 gateway 进程本身影响
- **低到中**：只要目录权限提前配好，稳定性通常最好。
- 风险是“权限缺失导致某些缓存/日志路径写失败”。

### 对飞书消息收发影响
- **低**：网络连接权限通常不受普通用户限制。
- 仅当证书、token、session 文件不可读写时会中断。

### 对子Agent spawn/通信影响
- **中**：spawn 仍可进行，但其文件写入能力受同一用户权限约束（这是预期安全收益）。

### 实施复杂度 / 回滚
- 实施：**中**（需要梳理目录、systemd service、umask/ACL）。
- 回滚：**中低**（切回原用户运行即可）。

### 评价
**强烈建议与方案a组合**。这是“纵深防御”里最稳的一层。

---

## 3) 对你关注点的直接回答

### 3.1 “会不会影响 gateway 稳定性和连接？”
- 用 **原生 `tools.exec.security=allowlist`**：一般不会影响连接稳定性；主要影响的是 exec 命令是否被拒绝。
- 用 **wrapper**：更容易引入不可预期失败，稳定性风险更高。
- 用 **Linux 权限**：对连接影响最小，但要保证运行时目录可写。

### 3.2 “会不会导致飞书消息收发中断？”
- 仅改 exec 白名单：**通常不会中断主收发**。
- 但若你的消息处理链依赖 exec（转码/脚本），会出现功能性失败，不等于通道断线。

### 3.3 “会不会影响子Agent spawn和通信？”
- 通信本身通常不受影响；
- 子Agent执行命令能力会被同样策略限制，allowlist 过严会显著增加任务失败率。

---

## 4) 建议落地顺序（最安全）
1. **先上方案 c（受限用户/权限隔离）**：降低破坏面，不改命令语义。  
2. **再上方案 a（原生 allowlist）**：
   - 初期 `ask=on-miss` 收集命中/拒绝数据；
   - 逐步补齐 allowlist/safeBins；
   - 稳定后再考虑更严格策略。  
3. **避免方案 b 作为主控层**；若必须用，仅做旁路审计，不做硬阻断。

---

## 5) 风险等级对比（简表）
| 方案 | 安全收益 | 稳定性风险 | 飞书中断风险 | 子Agent影响 | 实施复杂度 | 回滚 |
|---|---|---|---|---|---|---|
| a. openclaw原生allowlist | 高 | 低-中 | 低 | 中 | 中低 | 低 |
| b. wrapper | 中 | 中-高 | 低-中 | 中-高 | 中高 | 中 |
| c. Linux受限用户 | 高 | 低-中 | 低 | 中 | 中 | 中低 |

---

## 6) 最终建议
- **推荐组合：c + a**（权限隔离 + 原生allowlist）。
- **不推荐**把 wrapper 作为核心安全边界。
- 若要最小化业务抖动：先把 `security=allowlist` 配成“宽松+可观测”（结合 `ask=on-miss`），观察 `exec.denied` 事件，再逐步收紧。
