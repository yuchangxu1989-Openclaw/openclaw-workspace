#!/usr/bin/env bash
# ISC Handler: rule.skill-mandatory-skill-md-001
# Scans skills/ subdirectories for missing SKILL.md files.
# Input: JSON via $1 (file path) or stdin
# Output: JSON result to stdout
# Exit: 0 = pass, 1 = violations found, 2 = error

set -euo pipefail

WORKSPACE="${ISC_WORKSPACE:-/root/.openclaw/workspace}"
SKILLS_DIR="${WORKSPACE}/skills"

# --- Input parsing ---
if [[ -n "${1:-}" && -f "${1:-}" ]]; then
  INPUT=$(cat "$1")
elif [[ ! -t 0 ]]; then
  INPUT=$(cat)
else
  INPUT='{}'
fi

RULE_ID=$(echo "$INPUT" | jq -r '.rule_id // "rule.skill-mandatory-skill-md-001"')

# --- Condition check ---
if [[ ! -d "$SKILLS_DIR" ]]; then
  jq -n --arg rid "$RULE_ID" '{
    rule_id: $rid,
    status: "error",
    message: "skills/ directory not found",
    violations: [],
    timestamp: (now | todate)
  }'
  exit 2
fi

# --- Scan ---
MISSING=()
SCANNED=0

for dir in "$SKILLS_DIR"/*/; do
  [[ -d "$dir" ]] || continue
  SCANNED=$((SCANNED + 1))
  if [[ ! -f "${dir}SKILL.md" ]]; then
    MISSING+=("$(basename "$dir")")
  fi
done

# --- JSON output ---
if [[ ${#MISSING[@]} -eq 0 ]]; then
  jq -n --arg rid "$RULE_ID" --argjson scanned "$SCANNED" '{
    rule_id: $rid,
    status: "pass",
    message: ("All " + ($scanned|tostring) + " skills have SKILL.md"),
    violations: [],
    scanned: $scanned,
    timestamp: (now | todate)
  }'
  exit 0
else
  MISSING_JSON=$(printf '%s\n' "${MISSING[@]}" | jq -R . | jq -s .)
  jq -n --arg rid "$RULE_ID" \
         --argjson scanned "$SCANNED" \
         --argjson missing "$MISSING_JSON" '{
    rule_id: $rid,
    status: "fail",
    message: (($missing | length | tostring) + " skill(s) missing SKILL.md"),
    violations: [.[] | {skill: ., file: "SKILL.md", severity: "CRITICAL"}] | null // ($missing | map({skill: ., file: "SKILL.md", severity: "CRITICAL"})),
    scanned: $scanned,
    timestamp: (now | todate)
  }' | jq --argjson m "$MISSING_JSON" '.violations = ($m | map({skill: ., file: "SKILL.md", severity: "CRITICAL"}))'
  exit 1
fi
