#!/usr/bin/env bash
# ISC Handler: rule.wild-script-auto-discovery-001
# 扫描 scripts/ 下未在任何 SKILL.md 中引用的"野生"脚本
set -euo pipefail

WORKSPACE="${ISC_WORKSPACE:-/root/.openclaw/workspace}"
SCRIPTS_DIR="$WORKSPACE/scripts"
SKILLS_DIR="$WORKSPACE/skills"

# --- Input parsing (accept optional JSON on stdin) ---
INPUT="{}"
if [ ! -t 0 ]; then
  INPUT="$(cat)"
fi
# Allow overrides via JSON input
SCRIPTS_DIR_OVR=$(echo "$INPUT" | jq -r '.scripts_dir // empty' 2>/dev/null || true)
[ -n "$SCRIPTS_DIR_OVR" ] && SCRIPTS_DIR="$SCRIPTS_DIR_OVR"

# --- Collect all script files under scripts/ ---
if [ ! -d "$SCRIPTS_DIR" ]; then
  echo '{"status":"skip","wild_scripts":[],"message":"scripts/ directory not found"}' | jq .
  exit 0
fi

mapfile -t ALL_SCRIPTS < <(find "$SCRIPTS_DIR" -type f \( -name '*.sh' -o -name '*.py' -o -name '*.rb' -o -name '*.js' -o -name '*.ts' -o -name '*.pl' \) | sort)

if [ ${#ALL_SCRIPTS[@]} -eq 0 ]; then
  echo '{"status":"pass","wild_scripts":[],"count":0,"message":"No scripts found"}' | jq .
  exit 0
fi

# --- Collect all SKILL.md files ---
mapfile -t SKILL_FILES < <(find "$SKILLS_DIR" -name 'SKILL.md' -type f 2>/dev/null || true)

# Concatenate all SKILL.md content for reference checking
SKILL_CONTENT=""
for sf in "${SKILL_FILES[@]}"; do
  SKILL_CONTENT+="$(cat "$sf")"$'\n'
done

# --- Check each script against SKILL.md references ---
WILD=()
MANAGED=()
for script in "${ALL_SCRIPTS[@]}"; do
  # Get relative path from workspace root
  REL="${script#$WORKSPACE/}"
  # Also check just the basename
  BASE="$(basename "$script")"

  if echo "$SKILL_CONTENT" | grep -qF "$REL" || echo "$SKILL_CONTENT" | grep -qF "$BASE"; then
    MANAGED+=("$REL")
  else
    WILD+=("$REL")
  fi
done

# --- JSON output ---
WILD_JSON=$(printf '%s\n' "${WILD[@]}" | jq -R . | jq -s .)
MANAGED_JSON=$(printf '%s\n' "${MANAGED[@]}" | jq -R . | jq -s .)

if [ ${#WILD[@]} -gt 0 ]; then
  STATUS="fail"
  EXIT_CODE=1
  MSG="${#WILD[@]} wild script(s) found not referenced in any SKILL.md"
else
  STATUS="pass"
  EXIT_CODE=0
  MSG="All ${#ALL_SCRIPTS[@]} scripts are managed by skills"
fi

jq -n \
  --arg status "$STATUS" \
  --arg message "$MSG" \
  --argjson wild "$WILD_JSON" \
  --argjson managed "$MANAGED_JSON" \
  --arg total "${#ALL_SCRIPTS[@]}" \
  --arg wild_count "${#WILD[@]}" \
  '{
    status: $status,
    message: $message,
    total_scripts: ($total | tonumber),
    wild_count: ($wild_count | tonumber),
    wild_scripts: $wild,
    managed_scripts: $managed
  }'

exit $EXIT_CODE
