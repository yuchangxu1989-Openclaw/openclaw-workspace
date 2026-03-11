#!/usr/bin/env bash
# isc-auto-align — ISC规则三层对齐检查器
# 用法:
#   bash index.sh <rule.json>          # 检查单条规则
#   bash index.sh --all                # 检查所有规则
#   bash index.sh --summary            # 输出汇总报告
set -euo pipefail

RULES_DIR="/root/.openclaw/workspace/skills/isc-core/rules"
HANDLERS_DIR="/root/.openclaw/workspace/skills/isc-core/handlers"
EVENT_BUS_DIR="/root/.openclaw/workspace/skills/isc-core/infrastructure/event-bus/handlers"
GEN_DIR="/root/.openclaw/workspace/skills/public/isc-auto-align/generated"
mkdir -p "$GEN_DIR"

# ── 单条规则对齐检查 ──────────────────────────────────────────────────────────
check_rule() {
  local RULE_FILE="$1"
  if [ ! -f "$RULE_FILE" ]; then
    echo "{\"error\":\"rule file not found: $RULE_FILE\"}" >&2
    return 1
  fi

  local RULE_ID RULE_NAME HANDLER TRIGGER_EVENTS SEVERITY
  RULE_ID=$(jq -r '.id // "unknown"' "$RULE_FILE")
  RULE_NAME=$(jq -r '.rule_name // .name // "unknown"' "$RULE_FILE")
  HANDLER=$(jq -r '.action.handler // .action.script // empty' "$RULE_FILE")
  TRIGGER_EVENTS=$(jq -r '(.trigger.events // []) | length' "$RULE_FILE")
  SEVERITY=$(jq -r '.severity // "unknown"' "$RULE_FILE")

  local SENSE_STATUS="ok" EXEC_STATUS="ok" VERIFY_STATUS="ok"
  local GENERATED_FILES=()

  # ── 感知层: trigger.events 是否定义 ──
  if [ "$TRIGGER_EVENTS" -eq 0 ]; then
    SENSE_STATUS="missing"
    local SENSE_GEN="$GEN_DIR/sense-${RULE_ID}.sh"
    cat > "$SENSE_GEN" <<EOF
#!/usr/bin/env bash
# TODO: 感知探针 for rule: $RULE_ID ($RULE_NAME)
# 需要定义 trigger.events 或实现 inotifywait/cron/git-hook 感知机制
echo "SENSE PROBE: $RULE_ID - not yet implemented"
exit 1
EOF
    chmod +x "$SENSE_GEN"
    GENERATED_FILES+=("$SENSE_GEN")
  fi

  # ── 执行层: handler文件是否存在 ──
  if [ -n "$HANDLER" ]; then
    # 尝试多种路径: handlers/{name}.js, handlers/{name}.sh, 直接路径
    local FOUND_HANDLER=false
    for EXT in ".js" ".sh" ""; do
      if [ -f "${HANDLERS_DIR}/${HANDLER}${EXT}" ]; then
        FOUND_HANDLER=true
        break
      fi
      if [ -f "${EVENT_BUS_DIR}/${HANDLER}${EXT}" ]; then
        FOUND_HANDLER=true
        break
      fi
    done
    if [ "$FOUND_HANDLER" = false ]; then
      EXEC_STATUS="missing"
      local EXEC_GEN="$GEN_DIR/handler-${HANDLER}.js"
      cat > "$EXEC_GEN" <<EOF
'use strict';
// TODO: Handler for rule: $RULE_ID ($RULE_NAME)
// Severity: $SEVERITY
module.exports = {
  id: '$HANDLER',
  ruleId: '$RULE_ID',
  async execute(context) {
    // TODO: implement handler logic
    throw new Error('Handler not implemented: $HANDLER');
  }
};
EOF
      GENERATED_FILES+=("$EXEC_GEN")
    fi
  else
    EXEC_STATUS="missing"
    local SAFE_ID
    SAFE_ID=$(echo "$RULE_ID" | sed 's/^rule\.//')
    local EXEC_GEN="$GEN_DIR/handler-${SAFE_ID}.js"
    cat > "$EXEC_GEN" <<EOF
'use strict';
// TODO: Handler for rule: $RULE_ID ($RULE_NAME)
// Severity: $SEVERITY
// Rule has no action.handler defined — needs one
module.exports = {
  id: '${SAFE_ID}',
  ruleId: '$RULE_ID',
  async execute(context) {
    throw new Error('Handler not implemented: ${SAFE_ID}');
  }
};
EOF
    GENERATED_FILES+=("$EXEC_GEN")
  fi

  # ── 验真层: 是否有对应测试/验证脚本 ──
  local SAFE_ID
  SAFE_ID=$(echo "$RULE_ID" | sed 's/^rule\.//')
  local VERIFY_FOUND=false
  # 检查多个可能的测试位置
  for TEST_PATH in \
    "/root/.openclaw/workspace/tests/test-${RULE_ID}.sh" \
    "/root/.openclaw/workspace/tests/test-${SAFE_ID}.sh" \
    "/root/.openclaw/workspace/skills/isc-core/tests/test-${SAFE_ID}.js" \
    "/root/.openclaw/workspace/skills/public/isc-auto-align/tests/test-${SAFE_ID}.sh"; do
    if [ -f "$TEST_PATH" ]; then
      VERIFY_FOUND=true
      break
    fi
  done
  if [ "$VERIFY_FOUND" = false ]; then
    VERIFY_STATUS="missing"
    local VERIFY_GEN="$GEN_DIR/verify-${SAFE_ID}.sh"
    cat > "$VERIFY_GEN" <<EOF
#!/usr/bin/env bash
# TODO: 验真测试 for rule: $RULE_ID ($RULE_NAME)
# 验证: 1) 感知层正确触发 2) 执行层正确执行 3) 结果符合预期
echo "VERIFY: $RULE_ID - not yet implemented"
exit 1
EOF
    chmod +x "$VERIFY_GEN"
    GENERATED_FILES+=("$VERIFY_GEN")
  fi

  # ── 输出JSON报告 ──
  local GEN_JSON="[]"
  if [ ${#GENERATED_FILES[@]} -gt 0 ]; then
    GEN_JSON=$(printf '%s\n' "${GENERATED_FILES[@]}" | jq -R . | jq -s .)
  fi

  local ALIGNED="true"
  if [ "$SENSE_STATUS" != "ok" ] || [ "$EXEC_STATUS" != "ok" ] || [ "$VERIFY_STATUS" != "ok" ]; then
    ALIGNED="false"
  fi

  cat <<EOJSON
{"rule_id":"$RULE_ID","rule_name":"$RULE_NAME","severity":"$SEVERITY","sense":"$SENSE_STATUS","exec":"$EXEC_STATUS","verify":"$VERIFY_STATUS","aligned":$ALIGNED,"generated_files":$GEN_JSON}
EOJSON
}

# ── 批量检查所有规则 ──────────────────────────────────────────────────────────
check_all() {
  local TOTAL=0 ALIGNED=0 MISALIGNED=0
  local RESULTS="["
  local FIRST=true

  for RULE_FILE in "$RULES_DIR"/rule.*.json; do
    [ -f "$RULE_FILE" ] || continue
    # Skip deprecated/draft rules
    [[ "$RULE_FILE" == *"_deprecated"* ]] && continue
    [[ "$RULE_FILE" == *"_drafts"* ]] && continue

    local RESULT
    RESULT=$(check_rule "$RULE_FILE" 2>/dev/null) || continue
    TOTAL=$((TOTAL + 1))

    local IS_ALIGNED
    IS_ALIGNED=$(echo "$RESULT" | jq -r '.aligned')
    if [ "$IS_ALIGNED" = "true" ]; then
      ALIGNED=$((ALIGNED + 1))
    else
      MISALIGNED=$((MISALIGNED + 1))
    fi

    if [ "$FIRST" = true ]; then
      FIRST=false
    else
      RESULTS+=","
    fi
    RESULTS+="$RESULT"
  done
  RESULTS+="]"

  echo "$RESULTS" | jq .
}

# ── 汇总报告 ──────────────────────────────────────────────────────────────────
summary_report() {
  local ALL_RESULTS
  ALL_RESULTS=$(check_all 2>/dev/null)

  local TOTAL ALIGNED SENSE_MISS EXEC_MISS VERIFY_MISS
  TOTAL=$(echo "$ALL_RESULTS" | jq 'length')
  ALIGNED=$(echo "$ALL_RESULTS" | jq '[.[] | select(.aligned == true)] | length')
  SENSE_MISS=$(echo "$ALL_RESULTS" | jq '[.[] | select(.sense == "missing")] | length')
  EXEC_MISS=$(echo "$ALL_RESULTS" | jq '[.[] | select(.exec == "missing")] | length')
  VERIFY_MISS=$(echo "$ALL_RESULTS" | jq '[.[] | select(.verify == "missing")] | length')

  cat <<EOJSON
{
  "total_rules": $TOTAL,
  "fully_aligned": $ALIGNED,
  "misaligned": $((TOTAL - ALIGNED)),
  "alignment_rate": "$(echo "scale=1; $ALIGNED * 100 / $TOTAL" | bc)%",
  "missing_sense": $SENSE_MISS,
  "missing_exec": $EXEC_MISS,
  "missing_verify": $VERIFY_MISS,
  "generated_dir": "$GEN_DIR"
}
EOJSON
}

# ── Main ──────────────────────────────────────────────────────────────────────
case "${1:-}" in
  --all)
    check_all
    ;;
  --summary)
    summary_report
    ;;
  --help|-h)
    echo "Usage: bash index.sh <rule.json> | --all | --summary"
    ;;
  "")
    echo "Error: no argument. Use --all, --summary, or provide a rule.json path" >&2
    exit 1
    ;;
  *)
    check_rule "$1"
    ;;
esac
