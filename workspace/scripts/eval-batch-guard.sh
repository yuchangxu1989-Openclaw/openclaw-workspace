#!/usr/bin/env bash
# eval-batch-guard.sh — 批次硬限制守卫
# 用法: eval-batch-guard.sh <总条数> [--batch-size N] [--prefix PREFIX]
# 输出: 拆分后的批次清单JSON到stdout
#
# 示例:
#   eval-batch-guard.sh 120
#   eval-batch-guard.sh 120 --batch-size 30
#   eval-batch-guard.sh 200 --prefix "eval-fix"
#
# 功能:
#   - 接收待处理条数，超过50条自动拆分为50条一批
#   - 输出拆分后的批次清单JSON
#
# P0修复 — 对应RCA根因1：超时（批次粒度过大）

set -euo pipefail

# ========== 默认值 ==========
MAX_BATCH_SIZE=50
PREFIX="batch"

# ========== 参数解析 ==========
usage() {
    echo "用法: $0 <总条数> [--batch-size N] [--prefix PREFIX]" >&2
    echo "" >&2
    echo "参数:" >&2
    echo "  <总条数>         待处理的总条数（必填，正整数）" >&2
    echo "  --batch-size N   每批最大条数（默认50，硬上限50）" >&2
    echo "  --prefix PREFIX  批次名称前缀（默认'batch'）" >&2
    echo "" >&2
    echo "输出: JSON格式的批次清单" >&2
    exit 1
}

if [[ $# -lt 1 ]]; then
    usage
fi

TOTAL="$1"
shift

# 校验总条数是正整数
if ! [[ "$TOTAL" =~ ^[0-9]+$ ]] || [[ "$TOTAL" -eq 0 ]]; then
    echo "❌ 总条数必须是正整数，收到: '$TOTAL'" >&2
    exit 1
fi

# 解析可选参数
while [[ $# -gt 0 ]]; do
    case "$1" in
        --batch-size)
            if [[ -z "${2:-}" ]]; then
                echo "❌ --batch-size 需要一个数值参数" >&2
                exit 1
            fi
            REQUESTED_SIZE="$2"
            # 硬上限：不允许超过50
            if [[ "$REQUESTED_SIZE" -gt "$MAX_BATCH_SIZE" ]]; then
                echo "[eval-batch-guard] ⚠️  请求的batch-size($REQUESTED_SIZE)超过硬上限($MAX_BATCH_SIZE)，已强制设为$MAX_BATCH_SIZE" >&2
                REQUESTED_SIZE="$MAX_BATCH_SIZE"
            fi
            MAX_BATCH_SIZE="$REQUESTED_SIZE"
            shift 2
            ;;
        --prefix)
            if [[ -z "${2:-}" ]]; then
                echo "❌ --prefix 需要一个字符串参数" >&2
                exit 1
            fi
            PREFIX="$2"
            shift 2
            ;;
        *)
            echo "❌ 未知参数: $1" >&2
            usage
            ;;
    esac
done

# ========== 计算批次 ==========
if [[ "$TOTAL" -le "$MAX_BATCH_SIZE" ]]; then
    NUM_BATCHES=1
else
    NUM_BATCHES=$(( (TOTAL + MAX_BATCH_SIZE - 1) / MAX_BATCH_SIZE ))
fi

# ========== 输出JSON ==========
# 构建JSON（纯bash，不依赖jq）
echo "{"
echo "  \"total\": ${TOTAL},"
echo "  \"batch_size\": ${MAX_BATCH_SIZE},"
echo "  \"num_batches\": ${NUM_BATCHES},"
echo "  \"batches\": ["

REMAINING=$TOTAL
for ((i = 1; i <= NUM_BATCHES; i++)); do
    if [[ "$REMAINING" -ge "$MAX_BATCH_SIZE" ]]; then
        BATCH_COUNT=$MAX_BATCH_SIZE
    else
        BATCH_COUNT=$REMAINING
    fi

    START=$(( (i - 1) * MAX_BATCH_SIZE + 1 ))
    END=$(( START + BATCH_COUNT - 1 ))

    COMMA=","
    if [[ "$i" -eq "$NUM_BATCHES" ]]; then
        COMMA=""
    fi

    echo "    {"
    echo "      \"batch_id\": \"${PREFIX}-$(printf '%03d' $i)\","
    echo "      \"batch_index\": ${i},"
    echo "      \"start\": ${START},"
    echo "      \"end\": ${END},"
    echo "      \"count\": ${BATCH_COUNT}"
    echo "    }${COMMA}"

    REMAINING=$((REMAINING - BATCH_COUNT))
done

echo "  ]"
echo "}"

# 输出摘要到stderr
echo "[eval-batch-guard] ✅ ${TOTAL}条 → ${NUM_BATCHES}批 (每批≤${MAX_BATCH_SIZE}条)" >&2
