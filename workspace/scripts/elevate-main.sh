#!/bin/bash
# elevate-main.sh — 临时授权主Agent使用所有工具（10分钟）
# 用法: bash elevate-main.sh
# 写入当前时间+10分钟的毫秒时间戳到 /tmp/main-elevated-until.txt

DURATION_MS=$((10 * 60 * 1000))  # 10分钟
NOW_MS=$(date +%s%3N 2>/dev/null || echo $(( $(date +%s) * 1000 )))
UNTIL_MS=$(( NOW_MS + DURATION_MS ))

echo "$UNTIL_MS" > /tmp/main-elevated-until.txt

UNTIL_HUMAN=$(date -d @$(( UNTIL_MS / 1000 )) '+%Y-%m-%d %H:%M:%S' 2>/dev/null || date -r $(( UNTIL_MS / 1000 )) '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo "unknown")

echo "🔓 主Agent临时授权已激活"
echo "   有效期: 10分钟"
echo "   过期时间: $UNTIL_HUMAN"
echo "   文件: /tmp/main-elevated-until.txt"
echo "   值: $UNTIL_MS"
