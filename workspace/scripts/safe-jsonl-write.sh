#!/usr/bin/env bash
# safe-jsonl-write.sh — JSONL写前写后条数校验wrapper
# 用法: safe-jsonl-write.sh <目标JSONL文件> <写入命令...>
# 示例: safe-jsonl-write.sh data/eval.jsonl python3 transform.py --output data/eval.jsonl
#
# 功能:
#   1. 写前记录行数
#   2. 执行写入命令
#   3. 写后校验行数变化是否合理（不减少>10%，不清零）
#   4. 不合理则自动 git checkout 恢复 + 报错退出
#
# P0修复 — 对应RCA根因3：数据破坏/幻写

set -euo pipefail

# ========== 参数校验 ==========
if [[ $# -lt 2 ]]; then
    echo "❌ 用法: $0 <目标JSONL文件> <写入命令...>" >&2
    echo "   示例: $0 data/eval.jsonl python3 transform.py" >&2
    exit 1
fi

TARGET_FILE="$1"
shift
WRITE_CMD=("$@")

# ========== 常量 ==========
MAX_DECREASE_PERCENT=10   # 允许的最大减少百分比
WORKSPACE="/root/.openclaw/workspace"

# ========== 辅助函数 ==========
count_lines() {
    local file="$1"
    if [[ -f "$file" ]]; then
        wc -l < "$file" | tr -d ' '
    else
        echo "0"
    fi
}

log_info() {
    echo "[safe-jsonl-write] ℹ️  $*"
}

log_error() {
    echo "[safe-jsonl-write] ❌ $*" >&2
}

log_ok() {
    echo "[safe-jsonl-write] ✅ $*"
}

# ========== 写前记录 ==========
BEFORE_COUNT=$(count_lines "$TARGET_FILE")
log_info "写前行数: ${BEFORE_COUNT} (${TARGET_FILE})"

# 如果文件在git中，记录当前commit hash用于恢复
IN_GIT=false
if cd "$WORKSPACE" 2>/dev/null && git ls-files --error-unmatch "$TARGET_FILE" &>/dev/null; then
    IN_GIT=true
    GIT_REF=$(git rev-parse HEAD)
    log_info "文件在git管理中，恢复点: ${GIT_REF:0:8}"
fi

# ========== 执行写入命令 ==========
log_info "执行写入命令: ${WRITE_CMD[*]}"
CMD_EXIT=0
"${WRITE_CMD[@]}" || CMD_EXIT=$?

if [[ $CMD_EXIT -ne 0 ]]; then
    log_error "写入命令执行失败 (exit=$CMD_EXIT)"
    # 命令失败时也检查文件是否被破坏
    AFTER_COUNT=$(count_lines "$TARGET_FILE")
    if [[ "$AFTER_COUNT" -ne "$BEFORE_COUNT" ]]; then
        log_error "命令失败且文件已被修改 (${BEFORE_COUNT} → ${AFTER_COUNT})，尝试恢复..."
        if $IN_GIT; then
            cd "$WORKSPACE" && git checkout "$TARGET_FILE" 2>/dev/null && \
                log_info "已通过 git checkout 恢复文件" || \
                log_error "git checkout 恢复失败！请手动检查"
        fi
    fi
    exit $CMD_EXIT
fi

# ========== 写后校验 ==========
AFTER_COUNT=$(count_lines "$TARGET_FILE")
log_info "写后行数: ${AFTER_COUNT} (${TARGET_FILE})"

# 校验1: 清零检测
if [[ "$AFTER_COUNT" -eq 0 && "$BEFORE_COUNT" -gt 0 ]]; then
    log_error "严重：文件被清空！(${BEFORE_COUNT} → 0)"
    if $IN_GIT; then
        cd "$WORKSPACE" && git checkout "$TARGET_FILE"
        log_info "已通过 git checkout 恢复文件 (恢复到 ${BEFORE_COUNT} 行)"
    fi
    exit 1
fi

# 校验2: 减少超过阈值
if [[ "$BEFORE_COUNT" -gt 0 ]]; then
    DECREASE=$((BEFORE_COUNT - AFTER_COUNT))
    if [[ "$DECREASE" -gt 0 ]]; then
        DECREASE_PERCENT=$((DECREASE * 100 / BEFORE_COUNT))
        if [[ "$DECREASE_PERCENT" -gt "$MAX_DECREASE_PERCENT" ]]; then
            log_error "行数减少超过${MAX_DECREASE_PERCENT}%！(${BEFORE_COUNT} → ${AFTER_COUNT}，减少${DECREASE_PERCENT}%)"
            if $IN_GIT; then
                cd "$WORKSPACE" && git checkout "$TARGET_FILE"
                log_info "已通过 git checkout 恢复文件 (恢复到 ${BEFORE_COUNT} 行)"
            fi
            exit 1
        else
            log_info "行数减少 ${DECREASE_PERCENT}%，在允许范围内 (阈值${MAX_DECREASE_PERCENT}%)"
        fi
    fi
fi

# 校验3: 异常膨胀检测（增长超过300%视为可疑，仅警告不阻断）
if [[ "$BEFORE_COUNT" -gt 0 && "$AFTER_COUNT" -gt $((BEFORE_COUNT * 3)) ]]; then
    log_info "⚠️  警告：行数异常膨胀 (${BEFORE_COUNT} → ${AFTER_COUNT}，增长$((AFTER_COUNT * 100 / BEFORE_COUNT))%)，请人工确认"
fi

# ========== 通过 ==========
CHANGE=""
if [[ "$AFTER_COUNT" -gt "$BEFORE_COUNT" ]]; then
    CHANGE="+$((AFTER_COUNT - BEFORE_COUNT))"
elif [[ "$AFTER_COUNT" -lt "$BEFORE_COUNT" ]]; then
    CHANGE="-$((BEFORE_COUNT - AFTER_COUNT))"
else
    CHANGE="±0"
fi

log_ok "校验通过: ${BEFORE_COUNT} → ${AFTER_COUNT} (${CHANGE})"
exit 0
