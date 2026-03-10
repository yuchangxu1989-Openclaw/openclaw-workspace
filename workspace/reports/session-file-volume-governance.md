# session-file-volume-governance

## 结论
- 已执行治理，重点处理 heartbeat 暴露的会话文件过多问题。
- 安全策略：保留活跃会话、lock 文件、sessions.json；归档高频批处理 agent 的旧活跃会话；删除超过 6 小时的 `.jsonl.deleted.*` 墓碑文件。

## 判定规则
- 保留：`sessions.json`、`.lock`、非高频 agent 的活跃 `.jsonl`、高频 agent 最近窗口内活跃 `.jsonl`。
- 可归档：`cron-worker` 超出保留窗口的旧活跃 `.jsonl`。
- 可清理：所有 agent 超过 6 小时的 `.jsonl.deleted.*`。

- analyst: active=1, deleted=10, lock=1, sessions.json=1
- auditor: active=0, deleted=2, lock=0, sessions.json=1
- coder: active=0, deleted=9, lock=0, sessions.json=1
- codex: active=0, deleted=0, lock=0, sessions.json=1
- cron-worker: active=120, deleted=1, lock=0, sessions.json=1
- engineer: active=2, deleted=14, lock=1, sessions.json=1
- main: active=3, deleted=0, lock=1, sessions.json=1
- researcher: active=0, deleted=9, lock=0, sessions.json=1
- reviewer: active=1, deleted=6, lock=1, sessions.json=1
- scout: active=1, deleted=4, lock=0, sessions.json=1
- strategist: active=0, deleted=3, lock=0, sessions.json=1
- writer: active=0, deleted=13, lock=0, sessions.json=1

## 已执行动作
- 将 `cron-worker` 旧活跃会话归档压缩，仅保留最近 120 个活跃 `.jsonl`。
- 清理所有 agent 中超过 6 小时的 `.jsonl.deleted.*`。
- 归档目录：`/root/.openclaw/archives/session-governance/20260307-002847`
- 重写治理脚本：`/root/.openclaw/workspace/scripts/session-cleanup-governor.sh`
- 更新 cron：`/root/.openclaw/workspace/cron/session-governance.cron`

## 治理后状态
- 当前活跃 `.jsonl` 总数：128
- 当前 `.jsonl.deleted.*` 总数：71
- 当前 `.lock` 总数：4
- 当前 `sessions.json` 总数：12
- sessions 目录文件总数：215

## 风险控制
- 未删除任何 `.lock` 与 `sessions.json`。
- 未触碰除 `cron-worker` 外的活跃会话文件。
- 活跃会话先 gzip 归档后删除源文件，可回溯。
- 清理对象限定为已标记删除且超过 6 小时的墓碑文件。

## 后续建议
- 若 heartbeat 仍按“活跃 `.jsonl`”计数，120 可能仍偏高，可继续下调 `CRON_KEEP_COUNT`。
- 如需更强治理，可按天分层归档 `cron-worker` 并增加归档保留期清理。
