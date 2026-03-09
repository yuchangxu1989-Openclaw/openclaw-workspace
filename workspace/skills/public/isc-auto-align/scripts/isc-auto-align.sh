#!/usr/bin/env bash
# ISC Auto-Alignment Script
# 输入: 规则文件路径
# 功能: 检查并补齐 感知层/执行层/验真层，输出对齐报告JSON
set -euo pipefail

RULE_FILE="${1:?Usage: isc-auto-align.sh <rule.json>}"
GEN_DIR="/root/.openclaw/workspace/scripts/isc-generated"
mkdir -p "$GEN_DIR"

if [ ! -f "$RULE_FILE" ]; then
  echo "{\"error\": \"rule file not found: $RULE_FILE\"}" >&2
  exit 1
fi

RULE_ID=$(jq -r '.id // "unknown"' "$RULE_FILE")
RULE_NAME=$(jq -r '.name // "unknown"' "$RULE_FILE")
ACTION_SCRIPT=$(jq -r '.action.script // empty' "$RULE_FILE")
TRIGGER_EVENTS=$(jq -r '.trigger.events // [] | join(",")' "$RULE_FILE")

SENSE_STATUS="ok"
EXEC_STATUS="ok"
VERIFY_STATUS="ok"
GENERATED_FILES=()

# ============ 感知层检查 ============
# 检查是否有对应的探针/hook/cron
SENSE_FILE="$GEN_DIR/sense-${RULE_ID}.sh"
if [ -z "$TRIGGER_EVENTS" ]; then
  SENSE_STATUS="missing"
  cat > "$SENSE_FILE" <<EOSENSE
#!/usr/bin/env bash
# TODO: 感知探针 for rule: $RULE_ID ($RULE_NAME)
# 此脚本应实现对规则触发事件的感知/监听逻辑
# 触发事件: $TRIGGER_EVENTS
# TODO: 实现 inotifywait / cron / git hook 等感知机制
echo "SENSE PROBE: $RULE_ID - not yet implemented"
exit 1
EOSENSE
  chmod +x "$SENSE_FILE"
  GENERATED_FILES+=("$SENSE_FILE")
else
  # 有trigger events定义，检查是否有实际的hook/cron实现
  # 对于meta类规则，pre-commit hook本身就是感知层
  HOOK_FILE="/root/.openclaw/workspace/.git/hooks/pre-commit"
  if [ -f "$HOOK_FILE" ] && grep -q "isc-auto-align" "$HOOK_FILE" 2>/dev/null; then
    SENSE_STATUS="ok"
  else
    SENSE_STATUS="missing"
    cat > "$SENSE_FILE" <<EOSENSE
#!/usr/bin/env bash
# TODO: 感知探针 for rule: $RULE_ID ($RULE_NAME)
# 此脚本应实现对规则触发事件的感知/监听逻辑
# 触发事件: $TRIGGER_EVENTS
# TODO: 实现 inotifywait / cron / git hook 等感知机制
echo "SENSE PROBE: $RULE_ID - not yet implemented"
exit 1
EOSENSE
    chmod +x "$SENSE_FILE"
    GENERATED_FILES+=("$SENSE_FILE")
  fi
fi

# ============ 执行层检查 ============
if [ -n "$ACTION_SCRIPT" ]; then
  SCRIPT_PATH="/root/.openclaw/workspace/$ACTION_SCRIPT"
  if [ -f "$SCRIPT_PATH" ] && [ -x "$SCRIPT_PATH" ]; then
    EXEC_STATUS="ok"
  else
    EXEC_STATUS="missing"
    EXEC_GEN="$GEN_DIR/exec-${RULE_ID}.sh"
    cat > "$EXEC_GEN" <<EOEXEC
#!/usr/bin/env bash
# TODO: 执行动作脚本 for rule: $RULE_ID ($RULE_NAME)
# 原始action.script指向: $ACTION_SCRIPT
# TODO: 实现规则要求的执行逻辑
echo "EXEC ACTION: $RULE_ID - not yet implemented"
exit 1
EOEXEC
    chmod +x "$EXEC_GEN"
    GENERATED_FILES+=("$EXEC_GEN")
  fi
else
  EXEC_STATUS="missing"
  EXEC_GEN="$GEN_DIR/exec-${RULE_ID}.sh"
  cat > "$EXEC_GEN" <<EOEXEC
#!/usr/bin/env bash
# TODO: 执行动作脚本 for rule: $RULE_ID ($RULE_NAME)
# 规则未定义action.script，需要补充
# TODO: 实现规则要求的执行逻辑
echo "EXEC ACTION: $RULE_ID - not yet implemented"
exit 1
EOEXEC
  chmod +x "$EXEC_GEN"
  GENERATED_FILES+=("$EXEC_GEN")
fi

# ============ 验真层检查 ============
TEST_FILE="/root/.openclaw/workspace/tests/test-${RULE_ID}.sh"
TEST_GEN="$GEN_DIR/verify-${RULE_ID}.sh"
if [ -f "$TEST_FILE" ]; then
  VERIFY_STATUS="ok"
else
  VERIFY_STATUS="missing"
  cat > "$TEST_GEN" <<EOVERIFY
#!/usr/bin/env bash
# TODO: 质量验真测试 for rule: $RULE_ID ($RULE_NAME)
# 此脚本应验证规则的执行效果是否符合预期
# TODO: 编写测试用例，验证：
#   1. 感知层是否正确触发
#   2. 执行层是否正确执行
#   3. 结果是否符合规则要求
echo "VERIFY: $RULE_ID - not yet implemented"
exit 1
EOVERIFY
  chmod +x "$TEST_GEN"
  GENERATED_FILES+=("$TEST_GEN")
fi

# ============ 输出对齐报告 ============
GEN_JSON=$(printf '%s\n' "${GENERATED_FILES[@]}" | jq -R . | jq -s .)
cat <<EOREPORT
{
  "rule_id": "$RULE_ID",
  "rule_name": "$RULE_NAME",
  "sense": "$SENSE_STATUS",
  "exec": "$EXEC_STATUS",
  "verify": "$VERIFY_STATUS",
  "generated_files": $GEN_JSON
}
EOREPORT
