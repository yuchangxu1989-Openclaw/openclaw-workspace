#!/bin/bash
# ============================================================
# 意图探针结果 → harvest 分发器
# ============================================================
# 用法: echo "用户消息" | bash intent-harvest-dispatch.sh "上下文摘要"
#
# 流程:
#   1. 调用 intent-probe.sh 获取意图分类
#   2. 记录探针结果到日志
#   3. should_harvest=true → 调用 auto-badcase-harvest.sh 入库
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="/root/.openclaw/workspace/logs"
mkdir -p "$LOG_DIR"

MSG=$(cat)
CONTEXT="${1:-无上下文}"

# 空消息跳过
if [ -z "$MSG" ]; then
    echo "⏭️ 空消息，跳过意图探针"
    exit 0
fi

# 调用探针
PROBE_RESULT=$(echo "$MSG" | bash "$SCRIPT_DIR/intent-probe.sh")
SHOULD_HARVEST=$(echo "$PROBE_RESULT" | jq -r '.should_harvest')
INTENT_TYPE=$(echo "$PROBE_RESULT" | jq -r '.intent_type')
CATEGORY=$(echo "$PROBE_RESULT" | jq -r '.harvest_category')
CONFIDENCE=$(echo "$PROBE_RESULT" | jq -r '.confidence')

# 记录探针结果到日志
echo "[$(date -Iseconds)] intent_probe: type=$INTENT_TYPE confidence=$CONFIDENCE should_harvest=$SHOULD_HARVEST msg=$(echo "$MSG" | head -c 100)" >> "$LOG_DIR/intent-probe.log"

if [ "$SHOULD_HARVEST" = "true" ]; then
    # 生成badcase ID (带时间戳防重复)
    TIMESTAMP=$(date +%s)
    BADCASE_ID="auto-intent-probe-${INTENT_TYPE}-${TIMESTAMP}"

    # 调用harvest入库
    bash "$SCRIPT_DIR/auto-badcase-harvest.sh" \
        "$BADCASE_ID" \
        "$CATEGORY" \
        "意图探针自动捕获: $INTENT_TYPE" \
        "用户消息触发${INTENT_TYPE}信号" \
        "系统应自动识别并处理${INTENT_TYPE}意图" \
        "上下文: $CONTEXT | 原始消息: $(echo "$MSG" | head -c 200)"

    echo "🎯 意图探针触发harvest: $BADCASE_ID ($INTENT_TYPE)"
else
    echo "✅ 意图探针: $INTENT_TYPE (无需harvest)"
fi
