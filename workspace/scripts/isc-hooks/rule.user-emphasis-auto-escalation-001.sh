#!/usr/bin/env bash
# ISC Handler: rule.user-emphasis-auto-escalation-001
# Detect concepts mentioned ≥2 times in MEMORY.md → suggest escalation to AGENTS.md or code layer.
#
# Input (stdin): JSON with at least { "memory_file": "<path>", "concept": "<keyword>" }
#   - If no input, scans MEMORY.md for any repeated concepts automatically.
# Output (stdout): JSON { "status", "concept", "count", "recommendation", "escalation_level" }
# Exit codes: 0=escalation needed, 1=no escalation, 2=error

set -euo pipefail

WORKSPACE="${ISC_WORKSPACE:-/root/.openclaw/workspace}"
MEMORY_FILE="${WORKSPACE}/MEMORY.md"

# --- Parse input ---
INPUT="$(cat -)"
if [ -z "$INPUT" ] || [ "$INPUT" = "{}" ]; then
  CONCEPT=""
  CUSTOM_MEMORY=""
else
  CONCEPT="$(echo "$INPUT" | jq -r '.concept // empty' 2>/dev/null || true)"
  CUSTOM_MEMORY="$(echo "$INPUT" | jq -r '.memory_file // empty' 2>/dev/null || true)"
fi

[ -n "$CUSTOM_MEMORY" ] && MEMORY_FILE="$CUSTOM_MEMORY"

# --- Validate ---
if [ ! -f "$MEMORY_FILE" ]; then
  echo '{"status":"error","message":"MEMORY.md not found","path":"'"$MEMORY_FILE"'"}'
  exit 2
fi

# --- Core logic ---
# If a specific concept is given, count its occurrences.
# Otherwise, find all repeated words/phrases (simple: lines or bracketed terms).

if [ -n "$CONCEPT" ]; then
  COUNT=$(grep -oi "$CONCEPT" "$MEMORY_FILE" | wc -l)

  if [ "$COUNT" -ge 2 ]; then
    LEVEL="level_2_agents"
    REC="Concept '$CONCEPT' appears ${COUNT} times in MEMORY.md. Escalate to AGENTS.md startup checklist or SOUL.md."
    if [ "$COUNT" -ge 4 ]; then
      LEVEL="level_3_code"
      REC="Concept '$CONCEPT' appears ${COUNT} times — high emphasis. Escalate to a code-level hook for programmatic enforcement."
    fi
    jq -n \
      --arg status "escalation_needed" \
      --arg concept "$CONCEPT" \
      --argjson count "$COUNT" \
      --arg recommendation "$REC" \
      --arg escalation_level "$LEVEL" \
      '{status:$status, concept:$concept, count:$count, recommendation:$recommendation, escalation_level:$escalation_level}'
    exit 0
  else
    jq -n \
      --arg status "ok" \
      --arg concept "$CONCEPT" \
      --argjson count "$COUNT" \
      --arg recommendation "No escalation needed yet." \
      --arg escalation_level "level_1_memory" \
      '{status:$status, concept:$concept, count:$count, recommendation:$recommendation, escalation_level:$escalation_level}'
    exit 1
  fi
else
  # Auto-scan mode: extract repeated concepts (words appearing ≥2 times, min 3 chars, skip stopwords)
  STOPWORDS="the|and|for|that|this|with|from|are|was|were|not|but|have|has|had|been|will|would|could|should|can|may|also|just|more|into|than|them|then|when|what|which|their|there|about|each|make|like|over|such|after|only|other|some|these|most|very|your|our|its|how|all|out"

  REPEATED=$(grep -oiE '[a-zA-Z\x{4e00}-\x{9fff}]{3,}' "$MEMORY_FILE" 2>/dev/null \
    | tr '[:upper:]' '[:lower:]' \
    | grep -viE "^(${STOPWORDS})$" \
    | sort | uniq -c | sort -rn \
    | awk '$1 >= 2 {print $1 "\t" $2}' \
    | head -20)

  if [ -z "$REPEATED" ]; then
    echo '{"status":"ok","message":"No repeated concepts found.","candidates":[]}'
    exit 1
  fi

  # Build JSON array of candidates
  CANDIDATES="[]"
  while IFS=$'\t' read -r cnt word; do
    LEVEL="level_2_agents"
    [ "$cnt" -ge 4 ] && LEVEL="level_3_code"
    CANDIDATES=$(echo "$CANDIDATES" | jq \
      --arg w "$word" --argjson c "$cnt" --arg l "$LEVEL" \
      '. + [{"concept":$w,"count":$c,"escalation_level":$l}]')
  done <<< "$REPEATED"

  jq -n \
    --arg status "escalation_needed" \
    --argjson candidates "$CANDIDATES" \
    '{status:$status, message:"Repeated concepts detected — review for escalation", candidates:$candidates}'
  exit 0
fi
