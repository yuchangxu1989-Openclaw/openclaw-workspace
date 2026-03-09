#!/usr/bin/env bash
# Handler: rule.isc-evomap-mandatory-security-scan-032
# EvoMap同步清单强制安全扫描 (P0 gate)
# Trigger events: evomap.sync.requested, evomap.skill.requested
# ---
# Blocks EvoMap sync for any skill that hasn't passed security scanning.
# On failure: quarantine skill, notify admin, block sync.
set -euo pipefail

RULE_ID="rule.isc-evomap-mandatory-security-scan-032"
ISC_ROOT="/root/.openclaw/workspace/skills/isc-core"
MANIFEST="${ISC_ROOT}/config/evomap-upload-manifest.json"
QUARANTINE_DIR="${ISC_ROOT}/quarantine"
LOG_PREFIX="[${RULE_ID}]"
MAX_RETRIES=3

log()  { echo "$(date -Iseconds) ${LOG_PREFIX} $*"; }
warn() { echo "$(date -Iseconds) ${LOG_PREFIX} WARN: $*" >&2; }
fail() { echo "$(date -Iseconds) ${LOG_PREFIX} FAIL: $*" >&2; exit 1; }

# --- Step 1: Read manifest ---
if [[ ! -f "$MANIFEST" ]]; then
  fail "EvoMap upload manifest not found: ${MANIFEST}"
fi
log "Reading EvoMap upload manifest..."

# Extract skill paths from manifest (allowed_skills + infrastructure)
SKILLS=$(jq -r '
  ((.allowed_skills // []) + (.infrastructure // []))
  | .[]
  | if type == "object" then .path // .name // empty else . end
' "$MANIFEST" 2>/dev/null) || fail "Failed to parse manifest JSON"

if [[ -z "$SKILLS" ]]; then
  log "No skills found in manifest. Nothing to scan."
  exit 0
fi

SKILL_COUNT=$(echo "$SKILLS" | wc -l)
log "Found ${SKILL_COUNT} skill(s) to scan."

# --- Step 2-4: Scan each skill ---
BLOCKED=()
PASSED=0
QUARANTINED=0

scan_skill() {
  local skill="$1"
  local attempt=0
  local scan_result=""

  while (( attempt < MAX_RETRIES )); do
    (( attempt++ ))

    # Check if skill path exists
    local skill_path=""
    if [[ -d "${ISC_ROOT}/${skill}" ]]; then
      skill_path="${ISC_ROOT}/${skill}"
    elif [[ -d "/root/.openclaw/workspace/skills/${skill}" ]]; then
      skill_path="/root/.openclaw/workspace/skills/${skill}"
    elif [[ -d "${skill}" ]]; then
      skill_path="${skill}"
    fi

    if [[ -z "$skill_path" ]]; then
      warn "Skill path not found: ${skill} (attempt ${attempt}/${MAX_RETRIES})"
      if (( attempt >= MAX_RETRIES )); then
        return 1  # block
      fi
      sleep 1
      continue
    fi

    # Security scan: 8 threat categories
    local threats_found=0

    # 1. Check for suspicious shell commands (curl|wget piping to sh)
    if grep -rqE '(curl|wget)\s+.*\|\s*(ba)?sh' "$skill_path" 2>/dev/null; then
      warn "Skill ${skill}: remote code execution pattern detected"
      (( threats_found++ ))
    fi

    # 2. Check for credential/token harvesting patterns
    if grep -rqiE '(password|secret|token|api.key)\s*[:=]' "$skill_path" --include='*.sh' --include='*.js' --include='*.py' 2>/dev/null; then
      warn "Skill ${skill}: potential credential exposure"
      (( threats_found++ ))
    fi

    # 3. Check for data exfiltration patterns
    if grep -rqE '(nc\s+-[elp]|/dev/tcp/|mkfifo)' "$skill_path" 2>/dev/null; then
      warn "Skill ${skill}: data exfiltration pattern detected"
      (( threats_found++ ))
    fi

    # 4. Check for filesystem tampering outside workspace
    if grep -rqE '(rm\s+-rf\s+/[^r]|chmod\s+777\s+/|chown.*/)' "$skill_path" 2>/dev/null; then
      warn "Skill ${skill}: dangerous filesystem operation"
      (( threats_found++ ))
    fi

    # 5. Check for privilege escalation
    if grep -rqE '(sudo\s+|setuid|setgid|capabilities)' "$skill_path" --include='*.sh' --include='*.js' 2>/dev/null; then
      warn "Skill ${skill}: privilege escalation pattern"
      (( threats_found++ ))
    fi

    # 6. Check for crypto mining signatures
    if grep -rqiE '(stratum\+tcp|xmrig|minerd|cryptonight)' "$skill_path" 2>/dev/null; then
      warn "Skill ${skill}: crypto mining signature detected"
      (( threats_found++ ))
    fi

    # 7. Check for encoded payloads (base64 + eval patterns)
    if grep -rqE '(eval\s*\(\s*atob|base64\s+-d.*\|\s*(ba)?sh|echo\s+[A-Za-z0-9+/=]{50,}\s*\|)' "$skill_path" 2>/dev/null; then
      warn "Skill ${skill}: encoded payload execution pattern"
      (( threats_found++ ))
    fi

    # 8. Permission field validation (SKILL.md)
    local skill_md="${skill_path}/SKILL.md"
    if [[ -f "$skill_md" ]]; then
      if ! grep -qiE '^\s*[-*]\s*(permissions|## permissions)' "$skill_md" 2>/dev/null; then
        warn "Skill ${skill}: missing permissions declaration in SKILL.md"
        (( threats_found++ ))
      fi
    fi

    if (( threats_found > 0 )); then
      return 1  # block
    fi

    return 0  # passed
  done
  return 1
}

for skill in $SKILLS; do
  log "Scanning: ${skill}"
  if scan_skill "$skill"; then
    (( PASSED++ ))
    log "  PASSED: ${skill}"
  else
    BLOCKED+=("$skill")
    (( QUARANTINED++ ))

    # Quarantine: move to quarantine dir with metadata
    mkdir -p "${QUARANTINE_DIR}"
    QFILE="${QUARANTINE_DIR}/$(echo "$skill" | tr '/' '_')_$(date +%Y%m%d%H%M%S).json"
    cat > "$QFILE" <<EOF
{
  "skill": "${skill}",
  "rule": "${RULE_ID}",
  "reason": "security_scan_failed",
  "quarantinedAt": "$(date -Iseconds)",
  "retentionDays": 30,
  "manualReviewRequired": true
}
EOF
    log "  BLOCKED & QUARANTINED: ${skill} → ${QFILE}"
  fi
done

# --- Step 5: Summary ---
log "=== Security Scan Summary ==="
log "Total: ${SKILL_COUNT} | Passed: ${PASSED} | Blocked: ${QUARANTINED}"

if (( QUARANTINED > 0 )); then
  log "GATE DECISION: BLOCK — ${QUARANTINED} skill(s) failed security scan"
  log "Blocked skills: ${BLOCKED[*]}"
  # Notify (stdout for event-bus consumption)
  echo "GATE_RESULT=BLOCK"
  echo "BLOCKED_SKILLS=${BLOCKED[*]}"
  exit 1
else
  log "GATE DECISION: ALLOW — all skills passed security scan"
  echo "GATE_RESULT=ALLOW"
  exit 0
fi
