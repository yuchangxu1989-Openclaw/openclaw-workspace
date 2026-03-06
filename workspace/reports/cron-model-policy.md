# Cron 模型策略

## 规则
- 仅以下 4 个 cron 允许硬编码 `payload.model = boom-cron-worker/gpt-5.3-codex`：
  - `b76c9b20-d206-4d2d-9d26-815804cd22fd` `CRAS-A-主动学习引擎`
  - `d9d8123d-e14e-408d-b72c-04b273530943` `CRAS-E-自主进化`
  - `f6f0ba02-eab9-4ab1-87cb-c1a9e648b5aa` `CRAS-D-战略调研`
  - `merged-capability-pdca-4h` `能力同步与PDCA-每4小时`
- 其他 cron 不得硬编码 `payload.model`。
- 非例外 cron 的运行时默认模型应回落到 `zhipu-cron/glm-5`。

## 并发保护
- `api-probe-health` 的 cron 命令已加 `flock -n /tmp/api-probe-health.lock`。
- 目的：避免 api-probe 并发运行时同时改写 `/root/.openclaw/openclaw.json`。

## 审计
- 审计脚本：`/root/.openclaw/workspace/scripts/audit-cron-model-policy.js`
- 运行方式：
  - `node /root/.openclaw/workspace/scripts/audit-cron-model-policy.js`
  - 或指定文件：`node /root/.openclaw/workspace/scripts/audit-cron-model-policy.js /root/.openclaw/cron/jobs.json`
- 审计失败时返回非 0，并列出违规 cron。
