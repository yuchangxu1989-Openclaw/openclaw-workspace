#!/bin/bash
# 薄封装 — 实际逻辑在技能目录 + 僵尸任务兜底扫描
SCRIPT_DIR="$(dirname "$0")"

# 执行原始completion handler
bash "$SCRIPT_DIR/../skills/public/multi-agent-reporting/completion-handler.sh" "$@"
HANDLER_EXIT=$?

# 每次completion时顺便扫描僵尸任务（后台静默修复，不阻塞主流程）
node "$SCRIPT_DIR/check-stale-tasks.js" --fix --quiet >> /root/.openclaw/workspace/logs/check-stale-tasks.log 2>&1 &

exit $HANDLER_EXIT
