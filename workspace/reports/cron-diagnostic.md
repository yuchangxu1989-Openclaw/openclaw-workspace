# 定时任务诊断报告

生成时间：2026-03-06 11:02 (GMT+8)
工作目录：`/root/.openclaw/workspace`

---

## 1) 定时任务清单（来源、频率、脚本路径）

| 来源 | 频率 | 命令/脚本 | 注册状态 |
|---|---|---|---|
| 系统 crontab | `*/5 * * * *` | `flock -xn /tmp/stargate.lock -c '/usr/local/qcloud/stargate/admin/start.sh ...'` | ✅（外部系统任务） |
| 系统 crontab | `0 3 * * *` | `/bin/bash /root/.openclaw/workspace/scripts/backup-rotate.sh 7` | ✅ |
| 系统 crontab（OpenClaw） | `0 * * * *` | `node infrastructure/self-check/day-completion-scanner.js --auto` | ✅ |
| 系统 crontab（OpenClaw） | `*/5 * * * *` | `node infrastructure/self-check/rework-analyzer.js --auto` | ✅ |
| 系统 crontab（OpenClaw） | `*/5 * * * *` | `node infrastructure/self-check/correction-harvester.js --auto` | ✅ |
| 系统 crontab（OpenClaw） | `*/10 * * * *` | `scripts/session-cleanup-governor.sh` | ✅ |
| 系统 crontab（OpenClaw） | `*/5 * * * *` | `scripts/gateway-memory-governor.sh` | ✅ |
| 系统 crontab（OpenClaw） | `*/5 * * * *` | `node scripts/api-probe.js >> /tmp/api-probe.log` | ✅ |
| 本地任务编排 cron 配置 | `*/5 * * * *` | `scripts/api-probe.js`（`api-probe-health.json`） | ✅（已在 crontab 注册） |
| 本地任务编排 cron 配置 | `*/15 * * * *` | `auto-response-pipeline` fallback sweep（YAML） | ❌（未在 crontab 发现注册） |
| 本地任务编排 cron 配置 | `*/30 * * * *` | `cras-b-user-insight` fallback sweep（JSON） | ❌（未在 crontab 发现注册） |
| 本地任务编排 cron 配置 | `0 * * * *` | `system-monitor-health-check`（YAML） | ❌（未在 crontab 发现注册） |
| event-bus 脚本 | 设计为每5分钟 | `infrastructure/event-bus/cron-dispatch-runner.js` | ❌（未在 crontab 发现注册） |

---

## 2) 健康状态（✅正常 / ⚠️异常 / ❌失效）

### A. 系统 crontab 已注册任务

1. `backup-rotate.sh`（每日03:00）
- 脚本存在：✅
- 手工运行：⚠️（本次未执行，避免实际备份/清理副作用）
- 日志：`/root/backups/openclaw/backup.log`（本次未检查）
- 结论：⚠️ 待补充“最近24小时执行证据”

2. `day-completion-scanner.js`（每小时）
- 脚本存在：✅
- 手工运行：✅ 输出“无新的Day完成事件，跳过”
- 日志更新时间：✅ `infrastructure/logs/day-scanner.log` 11:00（<24h）
- 状态文件：✅ `.scanner-state.json` 11:01 更新
- 结论：✅ 正常

3. `rework-analyzer.js`（每5分钟）
- 脚本存在：✅
- 手工运行：✅ “检测到0个返工信号，无新事件退出”
- 日志更新时间：✅ `infrastructure/logs/rework-analyzer.log` 11:00（<24h）
- 状态文件：✅ `.rework-state.json` 11:01 更新
- 结论：✅ 正常

4. `correction-harvester.js`（每5分钟）
- 脚本存在：✅
- 手工运行：✅ “总计0个纠偏信号，无新信号退出”
- 日志更新时间：✅ `infrastructure/logs/correction-harvester.log` 11:00（<24h）
- 状态文件：✅ `.harvester-state.json` 11:01 更新
- 结论：✅ 正常

5. `api-probe.js`（每5分钟）
- 脚本存在：✅
- 手工运行：✅ 全部健康（19 healthy）
- 日志更新时间：✅ `/tmp/api-probe.log` 11:00（<24h）
- 结论：✅ 正常

6. `session-cleanup-governor.sh` / `gateway-memory-governor.sh`
- 脚本存在：✅
- 手工运行：⚠️ 本次未执行（潜在治理副作用）
- 日志：未在 crontab 指定，缺少明确观测点
- 结论：⚠️ 可执行性未知，建议补 `--dry-run` 和固定日志

7. `stargate` 外部任务
- 非本仓库脚本，无法在当前范围做代码级诊断
- 结论：⚠️ 范围外

### B. 本地任务编排 cron 配置任务

1. `api-probe-health.json`
- 配置脚本路径存在：✅
- 调度频率：✅ 每5分钟合理
- crontab 注册：✅ 存在对应条目
- 结论：✅ 正常

2. `auto-response-pipeline.yaml`
- 配置为 fallback sweep 每15分钟：频率合理（兜底）✅
- 但未发现实际执行入口/脚本，也未注册到 crontab：❌
- 结论：❌ 失效（配置存在但未落地调度）

3. `cras-b-user-insight.json`
- 配置 fallback sweep 每30分钟：频率合理✅
- 未在 crontab 注册：❌
- 结论：❌ 失效（仅配置，未调度）

4. `system-monitor-health.yaml`
- 配置每小时：频率合理✅
- 未在 crontab 注册：❌
- 结论：❌ 失效（仅配置，未调度）

### C. event-bus cron 调度

`infrastructure/event-bus/cron-dispatch-runner.js`
- 脚本存在：✅
- 手工运行：✅ 正常初始化并处理事件
- cursor 文件：✅ `.cron-dispatch-cursor.json` 11:01 更新
- 但未在 crontab 注册：❌
- 结论：❌ 失效（设计为cron脚本，但未被cron触发）

---

## 3) 失效原因与修复建议

### 失效项1：本地任务编排 fallback 配置未注册
- 影响对象：
  - `skills/lto-core/config/cron/auto-response-pipeline.yaml`
  - `skills/lto-core/config/cron/cras-b-user-insight.json`
  - `skills/lto-core/config/cron/system-monitor-health.yaml`
- 原因：仅有配置文件，没有对应执行器将其“编译/注册”到系统 crontab。
- 修复建议：
  1. 增加统一注册器（例如 `scripts/register-lto-cron.js`），扫描该目录并生成/更新 crontab。
  2. 在 CI 或启动脚本加入“配置-注册一致性检查”，发现未注册立即告警。
  3. 对每个 本地任务编排 cron 配置要求 `runner` 字段（脚本或模块入口）并做存在性校验。

### 失效项2：event-bus cron runner 未注册
- 影响对象：`infrastructure/event-bus/cron-dispatch-runner.js`
- 原因：代码注释声明“每5分钟cron job调用”，但实际 crontab 无条目。
- 修复建议：
  - 增加 crontab：
    - `*/5 * * * * cd /root/.openclaw/workspace && node infrastructure/event-bus/cron-dispatch-runner.js >> infrastructure/logs/cron-dispatch.log 2>&1`
  - 并加入日志轮转。

### 风险项：治理脚本可观测性不足
- 影响对象：`session-cleanup-governor.sh`、`gateway-memory-governor.sh`
- 原因：无统一日志路径、无 dry-run 约定，健康度难判定。
- 建议：
  - 支持 `--dry-run`；
  - 固定输出到 `infrastructure/logs/*.log`；
  - 补充“最后成功时间”状态文件。

---

## 4) 逻辑写死检查（文件:行号）

> 重点标注“可能导致未来失效或不可移植”的硬编码。

### 4.1 路径硬编码

1. `infrastructure/self-check/day-completion-scanner.js:26`
- `const WORKSPACE = process.env.WORKSPACE_ROOT || '/root/.openclaw/workspace';`
- 问题：默认绝对路径写死，迁移目录会失效。
- 建议：优先使用 `process.cwd()` 或仓库根定位逻辑，默认值走相对推导。

2. `infrastructure/self-check/rework-analyzer.js:31`
- 同上路径硬编码。

3. `infrastructure/self-check/correction-harvester.js:33`
- 同上路径硬编码。

4. 本地任务编排 配置 `api-probe-health.json:4`
- `command` 内写死 `/root/.openclaw/workspace`。
- 建议：改模板变量（如 `${WORKSPACE_ROOT}`）并在注册器展开。

### 4.2 时间窗口/阈值硬编码

1. `infrastructure/event-bus/cron-dispatch-runner.js:19`
- `const WINDOW_MS = 5 * 60 * 1000`
- 问题：与调度频率强耦合，改cron频率时容易漏改。
- 建议：从环境变量/配置读取（如 `CRON_DISPATCH_WINDOW_MS`）。

2. `infrastructure/self-check/rework-analyzer.js` 多处
- 默认窗口、信号权重、类别模板均写死在代码常量中（41-117附近）。
- 建议：外置到 `config/self-check/*.json`，支持热更新。

3. `infrastructure/self-check/correction-harvester.js` 多处
- 纠偏正则、优先级映射写死（42-216附近）。
- 建议：外置规则库，支持版本化管理。

### 4.3 业务信息/日期写死

1. `skills/lto-core/config/cron/auto-response-pipeline.yaml` metadata
- `reshaped_at: "2026-03-06"`（说明性字段）
- 风险低，但属于静态历史信息，不应参与运行逻辑。

2. `skills/lto-core/config/cron/cras-b-user-insight.json` metadata
- 同上。

3. `skills/lto-core/config/cron/system-monitor-health.yaml` thresholds
- 各阈值（如丢弃率0.05、积压100、成功率0.90）为写死值。
- 建议：抽到环境分层配置（dev/staging/prod）。

### 4.4 依赖/引用可用性风险

1. `system-monitor-health.yaml` 中 source/module 引用
- 引用 `infrastructure/observability/metrics.js`、`infrastructure/decision-log/decision-logger.js`、`infrastructure/config/feature-flags.js` 等。
- 当前该任务未注册，因此这些引用并未被真实执行验证。
- 建议：注册后加一次“启动自检（module可加载性）”。

---

## 结论摘要

- **正常运行**：`day-completion-scanner`、`rework-analyzer`、`correction-harvester`、`api-probe`。
- **明确失效（未注册）**：
  1) 本地任务编排 fallback 三项（auto-response、cras-b-user-insight、system-monitor-health）
  2) `event-bus/cron-dispatch-runner.js`
- **主要根因**：配置与系统 crontab 缺少自动同步机制。
- **优先修复顺序**：
  1. 先补 `cron-dispatch-runner` 的crontab注册（影响事件分发闭环）。
  2. 建 本地任务编排 cron 注册器 + 一致性检查（防止“配置存在但不执行”再次发生）。
  3. 逐步去除路径/阈值硬编码，改为配置化。
