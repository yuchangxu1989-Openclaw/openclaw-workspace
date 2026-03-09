#!/usr/bin/env bash
# Handler: knowledge-executable
# Rule:    rule.knowledge-must-be-executable-001
# Events:  knowledge.general.created, user.teaching.received, system.error, system.error.lesson_extracted
#
# 全链路：感知→认知→执行→验证
# 确保任何新知识不仅写入MEMORY，还产出可执行产物（规则/技能/代码/hook）。

set -euo pipefail

RULE_ID="rule.knowledge-must-be-executable-001"
EVENT_TYPE="${ISC_EVENT_TYPE:-unknown}"
EVENT_PAYLOAD="${ISC_EVENT_PAYLOAD:-}"
WORKSPACE="${ISC_WORKSPACE:-/root/.openclaw/workspace}"
SKILLS_DIR="$WORKSPACE/skills/isc-core"
LOG_DIR="$SKILLS_DIR/infrastructure/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/knowledge-executable.log"

log() { echo "[$(date -Iseconds)] [$RULE_ID] $*" >> "$LOG_FILE"; }

log "EVENT=$EVENT_TYPE triggered"

# ── Phase 1: 感知 (Perceive) ──
# Scan for knowledge entries that lack executable artifacts
scan_memory_for_unexecuted() {
  local memory_dir="$WORKSPACE/memory"
  local today; today=$(date +%Y-%m-%d)
  local target="$memory_dir/$today.md"

  if [[ ! -f "$target" ]]; then
    log "No memory file for today ($today), skipping scan"
    return 0
  fi

  # Look for lines that mention lessons/rules/patterns but lack executable refs
  local candidates
  candidates=$(grep -inE '(教训|规则|pattern|lesson|should always|must|不应该|以后要)' "$target" 2>/dev/null || true)

  if [[ -z "$candidates" ]]; then
    log "No actionable knowledge candidates found in $today.md"
    return 0
  fi

  echo "$candidates"
}

# ── Phase 2: 认知 (Classify) ──
# Determine what type of executable artifact the knowledge should become
classify_knowledge() {
  local text="$1"
  # Heuristic classification
  if echo "$text" | grep -qiE '(hook|pre-commit|lint|check)'; then
    echo "hook"
  elif echo "$text" | grep -qiE '(规则|rule|policy|must|禁止|不允许)'; then
    echo "rule"
  elif echo "$text" | grep -qiE '(技能|skill|workflow|流程)'; then
    echo "skill"
  else
    echo "code"
  fi
}

# ── Phase 3: 执行 (Execute) ──
# Flag unexecuted knowledge for the agent to act on
flag_for_execution() {
  local artifact_type="$1"
  local knowledge_text="$2"
  local flag_file="$SKILLS_DIR/infrastructure/flags/pending-knowledge.jsonl"
  mkdir -p "$(dirname "$flag_file")"

  local entry
  entry=$(printf '{"ts":"%s","rule":"%s","type":"%s","text":"%s","status":"pending"}' \
    "$(date -Iseconds)" "$RULE_ID" "$artifact_type" \
    "$(echo "$knowledge_text" | head -1 | sed 's/"/\\"/g')")

  echo "$entry" >> "$flag_file"
  log "Flagged pending knowledge: type=$artifact_type"
}

# ── Phase 4: 验证 (Verify) ──
# Check that recent knowledge entries have corresponding executables
verify_executability() {
  local flag_file="$SKILLS_DIR/infrastructure/flags/pending-knowledge.jsonl"
  if [[ ! -f "$flag_file" ]]; then
    log "No pending knowledge flags, verification passed"
    return 0
  fi

  local pending_count
  pending_count=$(grep -c '"status":"pending"' "$flag_file" 2>/dev/null || echo 0)

  if [[ "$pending_count" -gt 0 ]]; then
    log "WARNING: $pending_count knowledge items still pending executable conversion"
    echo "WARN:$pending_count items pending" 
    return 1
  fi

  log "All knowledge items have been converted to executables"
  return 0
}

# ── Main ──
case "$EVENT_TYPE" in
  knowledge.general.created|user.teaching.received)
    log "Processing new knowledge event"
    candidates=$(scan_memory_for_unexecuted)
    if [[ -n "$candidates" ]]; then
      while IFS= read -r line; do
        artifact_type=$(classify_knowledge "$line")
        flag_for_execution "$artifact_type" "$line"
      done <<< "$candidates"
    fi
    ;;
  system.error|system.error.lesson_extracted)
    log "Processing error/lesson event"
    if [[ -n "$EVENT_PAYLOAD" ]]; then
      artifact_type=$(classify_knowledge "$EVENT_PAYLOAD")
      flag_for_execution "$artifact_type" "$EVENT_PAYLOAD"
    fi
    ;;
  verify|cron)
    verify_executability
    ;;
  *)
    log "Unknown event type: $EVENT_TYPE, running verification"
    verify_executability
    ;;
esac

log "Handler complete for event=$EVENT_TYPE"
