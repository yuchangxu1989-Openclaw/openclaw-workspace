# 发布静默 Watchdog 实施报告

时间：2026-03-08

## 目标
1. 检测超过阈值未发布的静默窗口
2. 自动告警并自动补发/重试
3. 接入 cron 或事件触发
4. 输出实施报告

## 本次落地

### 1. 检测发布静默窗口
新增文件：`skills/evomap-publisher/publish-silence-watchdog.js`

实现要点：
- 扫描 `infrastructure/event-bus/events.jsonl`
- 聚合发布请求类事件：
  - `evomap.publish.requested`
  - `skill.version.changed`
  - `skill.version.detected`
  - `isc.version.changed`
  - `dto.publish.requested`
- 对比发布成功事件：
  - `evomap.publish.succeeded`
  - `evomap.publish.completed`
- 若某 skill 最近一次请求后，在阈值时间内未出现对应成功发布，则判定为“发布静默窗口”
- 默认阈值：180 分钟，可通过环境变量覆盖：
  - `EP_SILENCE_THRESHOLD_MINUTES`
  - `EP_SILENCE_LOOKBACK_HOURS`

### 2. 自动告警 + 自动补发/重试
Watchdog 在发现超阈值静默后，会：
- 写入 `infrastructure/publish-watchdog/alerts.jsonl`
- 发出事件：`evomap.publish.silence.alert`
- 触发高优先级自动补发：
  - 调用 `node skills/evomap-publisher/index.js publish <skillId> --version <version> --priority high`
- 对补发动作发出事件：`evomap.publish.retry.requested`
- 若补发失败，再次写告警

同时实现了告警冷却，避免刷屏：
- 默认 30 分钟内同一 `skillId@version` 只告警一次
- 状态持久化文件：`infrastructure/publish-watchdog/state.json`

### 3. 事件触发接入
新增 handler：`infrastructure/event-bus/handlers/publish-silence-watchdog.js`

接入事件：
- `evomap.publish.silence.check`
- `evomap.publish.retry.requested`

新增 dispatcher 路由：`infrastructure/dispatcher/routes.json`

作用：
- 支持外部系统、规则引擎、事件总线主动触发巡检
- 支持补发失败后的二次检查/人工触发重试

### 4. cron 接入
新增 cron 配置：`skills/dto-core/config/cron/evomap-publish-silence-watchdog.yaml`

配置说明：
- 每 15 分钟执行一次
- 走 EventBus 主路径
- 触发事件 `evomap.publish.silence.check`
- payload 内可配置阈值、回看窗口、自动补发上限、告警冷却时间

## 关键文件清单
- `skills/evomap-publisher/publish-silence-watchdog.js`
- `infrastructure/event-bus/handlers/publish-silence-watchdog.js`
- `infrastructure/dispatcher/routes.json`
- `skills/dto-core/config/cron/evomap-publish-silence-watchdog.yaml`
- `reports/publish-silence-watchdog-2026-03-08.md`

## 运行方式

### 手动巡检
```bash
node skills/evomap-publisher/publish-silence-watchdog.js run
```

### 仅检查，不自动补发
```bash
node skills/evomap-publisher/publish-silence-watchdog.js check
```

### 事件触发
向 EventBus 发出：
- `evomap.publish.silence.check`
- 或 `evomap.publish.retry.requested`

## 当前设计边界
- 目前依赖 EventBus 历史事件做“请求-成功”配对，适合现有架构、侵入性低
- 成功发布事件是否完整上报，决定静默识别准确率；若部分发布链路尚未 emit `evomap.publish.succeeded/completed`，建议后续统一补齐
- 当前自动补发通过 CLI 调发布器，已满足“补债”要求；如后续需要更强幂等，可追加任务表/去重键

## 建议后续增强
1. 在 `skills/evomap-publisher/index.js` 内原生 emit：
   - `evomap.publish.requested`
   - `evomap.publish.succeeded`
   - `evomap.publish.failed`
   提升可观测性与静默检测准确率
2. 将告警通道从“落盘 + EventBus”扩展到飞书直发
3. 为自动补发增加指数退避与最大日重试次数
4. 增加 dashboard 指标：
   - 静默窗口数
   - 平均补发恢复时长
   - 自动恢复成功率

## 结论
本次已完成“直接扩列补债：治理发布静默”的最小可运行落地：
- 能检测超阈值未发布窗口
- 能自动告警
- 能自动补发/重试
- 同时支持 cron 与事件触发
- 已产出报告并落盘
