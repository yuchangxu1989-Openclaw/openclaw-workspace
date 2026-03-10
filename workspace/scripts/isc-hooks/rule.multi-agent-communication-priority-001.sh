#!/usr/bin/env bash
# ISC Handler: rule.multi-agent-communication-priority-001
# 检查主Agent通信通道是否畅通，是否有重型操作阻塞通信。
set -euo pipefail

# ── 输入解析 ──────────────────────────────────────────────
INPUT="${1:-}"
if [ -z "$INPUT" ]; then
  # 也尝试从 stdin 读取
  if ! read -t 2 INPUT; then
    INPUT="{}"
  fi
fi

# 用 jq 解析，容错
parse() { echo "$INPUT" | jq -r "$1 // empty" 2>/dev/null || true; }

EVENT=$(parse '.event')
RULE_ID=$(parse '.rule_id')
SESSION_ID=$(parse '.session_id // .sessionId')

# ── 状态采集 ──────────────────────────────────────────────
# 1. 检查 openclaw gateway 进程是否存活（主通信通道）
GATEWAY_UP=false
if pgrep -f "openclaw" >/dev/null 2>&1; then
  GATEWAY_UP=true
fi

# 2. 检查是否有重型操作占用大量 CPU（>80% 单进程）阻塞通信
HEAVY_PROCS=0
HEAVY_DETAILS=""
while IFS= read -r line; do
  cpu=$(echo "$line" | awk '{print $1}' | cut -d. -f1)
  if [ "${cpu:-0}" -ge 80 ]; then
    HEAVY_PROCS=$((HEAVY_PROCS + 1))
    cmd=$(echo "$line" | awk '{for(i=2;i<=NF;i++) printf "%s ", $i; print ""}')
    HEAVY_DETAILS="${HEAVY_DETAILS}${cmd}(${cpu}%), "
  fi
done < <(ps -eo pcpu,comm --no-headers --sort=-pcpu 2>/dev/null | head -10)
HEAVY_DETAILS="${HEAVY_DETAILS%, }"

# 3. 检查系统负载（1min avg vs CPU数）
LOAD_1M=$(awk '{print $1}' /proc/loadavg 2>/dev/null || echo "0")
NUM_CPUS=$(nproc 2>/dev/null || echo "1")
LOAD_RATIO=$(awk "BEGIN {printf \"%.2f\", ${LOAD_1M}/${NUM_CPUS}}")
LOAD_HIGH=false
if awk "BEGIN {exit !(${LOAD_RATIO} >= 2.0)}"; then
  LOAD_HIGH=true
fi

# 4. 检查子agent数量（近似：subagent 进程/会话）
SUBAGENT_COUNT=$(pgrep -fc "subagent" 2>/dev/null || echo "0")

# ── 条件判断 ──────────────────────────────────────────────
PASSED=true
SEVERITY="info"
VIOLATIONS=""

if [ "$GATEWAY_UP" = "false" ]; then
  PASSED=false
  SEVERITY="critical"
  VIOLATIONS="gateway_down"
fi

if [ "$HEAVY_PROCS" -gt 0 ]; then
  if [ "$PASSED" = "true" ]; then
    PASSED=false
    SEVERITY="warning"
  fi
  VIOLATIONS="${VIOLATIONS:+${VIOLATIONS}, }heavy_processes_blocking(${HEAVY_PROCS})"
fi

if [ "$LOAD_HIGH" = "true" ]; then
  if [ "$SEVERITY" != "critical" ]; then
    SEVERITY="warning"
  fi
  if [ "$PASSED" = "true" ]; then
    PASSED=false
  fi
  VIOLATIONS="${VIOLATIONS:+${VIOLATIONS}, }system_overloaded(load_ratio=${LOAD_RATIO})"
fi

# ── JSON 输出 ──────────────────────────────────────────────
if [ "$PASSED" = "true" ]; then
  STATUS="pass"
  MESSAGE="主Agent通信通道畅通，无重型操作阻塞"
  EXIT_CODE=0
else
  STATUS="fail"
  MESSAGE="通信通道风险: ${VIOLATIONS}"
  EXIT_CODE=1
fi

cat <<EOF
{
  "rule_id": "rule.multi-agent-communication-priority-001",
  "status": "${STATUS}",
  "severity": "${SEVERITY}",
  "message": "${MESSAGE}",
  "details": {
    "gateway_up": ${GATEWAY_UP},
    "heavy_processes": ${HEAVY_PROCS},
    "heavy_details": "${HEAVY_DETAILS}",
    "load_1m": ${LOAD_1M},
    "load_ratio": ${LOAD_RATIO},
    "load_high": ${LOAD_HIGH},
    "subagent_count": ${SUBAGENT_COUNT}
  },
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

exit $EXIT_CODE
