#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# ISC Handler: skill-distribution-separation
# Rule:        isc-skill-distribution-separation-001  (P0)
# Events:      skill.general.publish_requested
#              skill.evomap.requested
#              skill.evomap.sync
# Purpose:     发布到EvoMap前强制检查distribution标记、权限声明、
#              密钥泄露和沙箱兼容性，阻断不合规发布
# ──────────────────────────────────────────────────────────────────
set -euo pipefail

RULE_ID="isc-skill-distribution-separation-001"
HANDLER_NAME="skill-distribution-separation"

# ── Input ────────────────────────────────────────────────────────
# Expects env vars or JSON on stdin:
#   SKILL_DIR   – path to the skill being published
#   SKILL_META  – path to skill.json / manifest
# If EVENT_PAYLOAD is set, parse from JSON.
SKILL_DIR="${SKILL_DIR:-}"
SKILL_META="${SKILL_META:-}"

if [[ -z "$SKILL_DIR" && -n "${EVENT_PAYLOAD:-}" ]]; then
  SKILL_DIR=$(echo "$EVENT_PAYLOAD" | jq -r '.skill_dir // empty' 2>/dev/null || true)
  SKILL_META=$(echo "$EVENT_PAYLOAD" | jq -r '.skill_meta // empty' 2>/dev/null || true)
fi

if [[ -z "$SKILL_DIR" ]]; then
  echo "[${RULE_ID}] ERROR: SKILL_DIR not set" >&2
  exit 1
fi

# Auto-detect manifest
if [[ -z "$SKILL_META" ]]; then
  for candidate in "$SKILL_DIR/skill.json" "$SKILL_DIR/manifest.json" "$SKILL_DIR/package.json"; do
    if [[ -f "$candidate" ]]; then
      SKILL_META="$candidate"
      break
    fi
  done
fi

if [[ -z "$SKILL_META" || ! -f "$SKILL_META" ]]; then
  echo "[${RULE_ID}] ERROR: No skill manifest found in $SKILL_DIR" >&2
  exit 1
fi

# ── Helpers ──────────────────────────────────────────────────────
FAILED=0
RESULTS=()

fail() {
  local chk="$1" msg="$2"
  FAILED=$((FAILED + 1))
  RESULTS+=("{\"check\":\"${chk}\",\"pass\":false,\"message\":\"${msg}\"}")
  echo "[${RULE_ID}] FAIL ${chk}: ${msg}" >&2
}

pass() {
  local chk="$1" msg="$2"
  RESULTS+=("{\"check\":\"${chk}\",\"pass\":true,\"message\":\"${msg}\"}")
}

# ── CHK-001: distribution字段存在且合法 ─────────────────────────
DISTRIBUTION=$(jq -r '.distribution // .general.distribution // empty' "$SKILL_META" 2>/dev/null || true)

if [[ -z "$DISTRIBUTION" ]]; then
  fail "CHK-001" "技能缺少distribution字段声明，必须为internal/external/both之一"
elif [[ "$DISTRIBUTION" != "internal" && "$DISTRIBUTION" != "external" && "$DISTRIBUTION" != "both" ]]; then
  fail "CHK-001" "distribution值无效: ${DISTRIBUTION}，必须为internal/external/both之一"
else
  pass "CHK-001" "distribution=${DISTRIBUTION}"
fi

# ── 豁免: internal技能不触发后续检查 ─────────────────────────────
if [[ "$DISTRIBUTION" == "internal" ]]; then
  pass "EXEMPT" "distribution=internal，跳过外销检查"
  # Output report
  echo "{\"rule\":\"${RULE_ID}\",\"handler\":\"${HANDLER_NAME}\",\"pass\":true,\"exempt\":true,\"distribution\":\"internal\",\"results\":[$(IFS=,; echo "${RESULTS[*]}")]}"
  exit 0
fi

# ── CHK-002: 权限声明检查 (external / both) ──────────────────────
for perm in filesystem network shell; do
  VAL=$(jq -r ".permissions.${perm} // empty" "$SKILL_META" 2>/dev/null || true)
  if [[ -z "$VAL" ]]; then
    fail "CHK-002" "外销技能必须声明permissions.${perm}权限等级"
  else
    pass "CHK-002" "permissions.${perm}=${VAL}"
  fi
done

CRED_VAL=$(jq -r '.permissions.credential // "null"' "$SKILL_META" 2>/dev/null || true)
if [[ "$CRED_VAL" != "0" ]]; then
  fail "CHK-002d" "外销技能的credential权限必须为0（禁止使用宿主凭证），当前值: ${CRED_VAL}"
else
  pass "CHK-002d" "permissions.credential=0"
fi

# ── CHK-003: .secrets/ 引用检查 ──────────────────────────────────
SECRETS_COUNT=$(grep -r '\.secrets/' "$SKILL_DIR" --include='*.sh' --include='*.js' --include='*.ts' --include='*.py' --include='*.json' --include='*.yaml' --include='*.yml' --include='*.md' -c 2>/dev/null | awk -F: '{s+=$2}END{print s+0}' || echo 0)
if [[ "$SECRETS_COUNT" -gt 0 ]]; then
  fail "CHK-003" "外销技能代码中检测到${SECRETS_COUNT}处.secrets/引用，必须移除"
else
  pass "CHK-003" "无.secrets/引用"
fi

# ── CHK-004: 内部绝对路径引用检查 ────────────────────────────────
# Check for /root/.openclaw, /home/*/openclaw, or other internal paths
INTERNAL_PATHS_COUNT=$(grep -rE '(/root/\.openclaw|/home/[^/]+/\.openclaw|/opt/openclaw)' "$SKILL_DIR" --include='*.sh' --include='*.js' --include='*.ts' --include='*.py' --include='*.yaml' --include='*.yml' -c 2>/dev/null | awk -F: '{s+=$2}END{print s+0}' || echo 0)
if [[ "$INTERNAL_PATHS_COUNT" -gt 0 ]]; then
  fail "CHK-004" "外销技能代码中检测到${INTERNAL_PATHS_COUNT}处内部绝对路径引用，必须移除或替换为相对路径"
else
  pass "CHK-004" "无内部绝对路径引用"
fi

# ── CHK-005: 敏感环境变量引用检查 ────────────────────────────────
SENSITIVE_ENV_COUNT=$(grep -rE '(OPENAI_API_KEY|ANTHROPIC_API_KEY|AWS_SECRET|FEISHU_APP_SECRET|GITHUB_TOKEN|PRIVATE_KEY|DB_PASSWORD|MASTER_KEY)' "$SKILL_DIR" --include='*.sh' --include='*.js' --include='*.ts' --include='*.py' --include='*.yaml' --include='*.yml' -c 2>/dev/null | awk -F: '{s+=$2}END{print s+0}' || echo 0)
if [[ "$SENSITIVE_ENV_COUNT" -gt 0 ]]; then
  fail "CHK-005" "外销技能代码中检测到${SENSITIVE_ENV_COUNT}处敏感环境变量引用，必须移除"
else
  pass "CHK-005" "无敏感环境变量引用"
fi

# ── CHK-006: 沙箱兼容性检查 ──────────────────────────────────────
SANDBOX_COMPAT=$(jq -r '.sandbox_compatible // .general.sandbox_compatible // "null"' "$SKILL_META" 2>/dev/null || true)
if [[ "$SANDBOX_COMPAT" != "true" ]]; then
  fail "CHK-006" "外销技能必须兼容沙箱运行环境(sandbox_compatible=true)，当前值: ${SANDBOX_COMPAT}"
else
  pass "CHK-006" "sandbox_compatible=true"
fi

# ── Output Report ────────────────────────────────────────────────
PASS_FLAG="true"
if [[ "$FAILED" -gt 0 ]]; then
  PASS_FLAG="false"
fi

REPORT="{\"rule\":\"${RULE_ID}\",\"handler\":\"${HANDLER_NAME}\",\"pass\":${PASS_FLAG},\"failed_count\":${FAILED},\"distribution\":\"${DISTRIBUTION}\",\"results\":[$(IFS=,; echo "${RESULTS[*]}")]}"

echo "$REPORT"

# ── Gate Decision ────────────────────────────────────────────────
if [[ "$FAILED" -gt 0 ]]; then
  echo "[${RULE_ID}] BLOCKED: ${FAILED} check(s) failed — publish to EvoMap denied" >&2
  exit 1
fi

echo "[${RULE_ID}] PASSED: all checks passed — publish allowed" >&2
exit 0
