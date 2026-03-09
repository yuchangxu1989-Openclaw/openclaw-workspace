#!/usr/bin/env bash
# cron-feishu-notify.sh — 通用cron报告飞书推送脚本
# 用法:
#   cron-feishu-notify.sh <任务名> <报告内容>
#   cron-feishu-notify.sh <任务名> --file <报告文件路径>
#
# 目标用户: ou_a113e465324cc55f9ab3348c9a1a7b9b (通过OpenClaw send)

set -euo pipefail

TASK_NAME="${1:?用法: $0 <任务名> <内容|--file 文件路径>}"
shift

TARGET_USER="ou_a113e465324cc55f9ab3348c9a1a7b9b"
TIMESTAMP=$(TZ=Asia/Shanghai date '+%Y-%m-%d %H:%M:%S')

# 获取报告内容
if [[ "${1:-}" == "--file" ]]; then
    FILE="${2:?需要指定文件路径}"
    if [[ ! -f "$FILE" ]]; then
        echo "错误: 文件不存在: $FILE" >&2
        exit 1
    fi
    CONTENT=$(cat "$FILE")
else
    CONTENT="$*"
fi

# 截断过长内容 (飞书消息限制)
if [[ ${#CONTENT} -gt 3000 ]]; then
    CONTENT="${CONTENT:0:2900}
...（内容已截断，完整报告见本地日志）"
fi

# 构建消息
MSG="📋 【${TASK_NAME}】
⏰ ${TIMESTAMP}
━━━━━━━━━━━━━━━━
${CONTENT}"

# 通过 openclaw send 推送到飞书
openclaw send --to "user:${TARGET_USER}" --channel feishu -- "${MSG}" 2>&1 || {
    echo "⚠️ 飞书推送失败，报告内容已保存在本地日志" >&2
    exit 1
}

echo "✅ 飞书推送成功: ${TASK_NAME}"
