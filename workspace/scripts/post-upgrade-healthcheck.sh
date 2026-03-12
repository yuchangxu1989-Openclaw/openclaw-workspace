#!/usr/bin/env bash
# post-upgrade-healthcheck.sh — Upgrade migration healthcheck (snapshot & verify)
# Usage:
#   --snapshot   Save pre-upgrade baseline to .upgrade-snapshot/
#   --verify     Compare current state against saved snapshot
set -uo pipefail

WORKSPACE="/root/.openclaw/workspace"
SNAPSHOT_DIR="$WORKSPACE/.upgrade-snapshot"
MEMOS_DB="/root/.openclaw/memos-local/memos.db"
VERSION_FILE="/root/.openclaw/version"
TIMESTAMP_FMT="+%Y-%m-%d %H:%M:%S %Z"

RED='\033[0;31m'; YEL='\033[0;33m'; GRN='\033[0;32m'; BOLD='\033[1m'; RST='\033[0m'

critical() { echo -e "${RED}🔴 CRITICAL${RST}: $1"; }
warning()  { echo -e "${YEL}🟡 WARNING${RST}:  $1"; }
info()     { echo -e "${GRN}🟢 INFO${RST}:     $1"; }
header()   { echo -e "\n${BOLD}═══ $1 ═══${RST}"; }

# ─── SNAPSHOT MODE ───────────────────────────────────────────
do_snapshot() {
  header "Creating pre-upgrade snapshot"
  rm -rf "$SNAPSHOT_DIR"
  mkdir -p "$SNAPSHOT_DIR/config" "$SNAPSHOT_DIR/meta"

  # 1. Core config files
  for f in openclaw.json IRONCLAD.md AGENTS.md package.json; do
    src="$WORKSPACE/$f"
    if [[ -f "$src" ]]; then
      cp "$src" "$SNAPSHOT_DIR/$f"
      echo "  ✓ $f"
    else
      echo "  ⚠ $f not found, skipping"
    fi
  done

  # 2. memos.db md5
  if [[ -f "$MEMOS_DB" ]]; then
    md5sum "$MEMOS_DB" | awk '{print $1}' > "$SNAPSHOT_DIR/meta/memos-db.md5"
    echo "  ✓ memos.db md5: $(cat "$SNAPSHOT_DIR/meta/memos-db.md5")"
  else
    echo "  ⚠ memos.db not found"
  fi

  # 3. skills/ directory listing
  if [[ -d "$WORKSPACE/skills" ]]; then
    ls -laR "$WORKSPACE/skills/" > "$SNAPSHOT_DIR/meta/skills-listing.txt" 2>/dev/null
    ls -1 "$WORKSPACE/skills/" > "$SNAPSHOT_DIR/meta/skills-dirs.txt" 2>/dev/null
    local count=$(wc -l < "$SNAPSHOT_DIR/meta/skills-dirs.txt")
    echo "  ✓ skills/ listing ($count entries)"
  fi

  # 4. config/ json files
  if [[ -d "$WORKSPACE/config" ]]; then
    for cfg in "$WORKSPACE/config/"*.json; do
      [[ -f "$cfg" ]] && cp "$cfg" "$SNAPSHOT_DIR/config/"
    done
    local cfgcount=$(ls "$SNAPSHOT_DIR/config/"*.json 2>/dev/null | wc -l)
    echo "  ✓ config/ jsons ($cfgcount files)"
  fi

  # 5. OpenClaw version
  if [[ -f "$VERSION_FILE" ]]; then
    cp "$VERSION_FILE" "$SNAPSHOT_DIR/meta/version.txt"
  else
    openclaw --version 2>/dev/null > "$SNAPSHOT_DIR/meta/version.txt" || echo "unknown" > "$SNAPSHOT_DIR/meta/version.txt"
  fi
  echo "  ✓ version: $(cat "$SNAPSHOT_DIR/meta/version.txt")"

  # 6. Cron config
  crontab -l 2>/dev/null > "$SNAPSHOT_DIR/meta/crontab.txt" || echo "(no crontab)" > "$SNAPSHOT_DIR/meta/crontab.txt"
  local cronlines=$(grep -c '[^[:space:]]' "$SNAPSHOT_DIR/meta/crontab.txt" 2>/dev/null || echo 0)
  echo "  ✓ crontab ($cronlines lines)"

  # 7. Cron workspace files
  if [[ -d "$WORKSPACE/cron" ]]; then
    ls -la "$WORKSPACE/cron/" > "$SNAPSHOT_DIR/meta/cron-dir-listing.txt" 2>/dev/null
    echo "  ✓ cron/ directory listing"
  fi

  # 8. Agent directories (skills/ subdirs as agent-related)
  ls -1d "$WORKSPACE/skills/"*/ 2>/dev/null | sed "s|$WORKSPACE/||" > "$SNAPSHOT_DIR/meta/agent-dirs.txt"
  # Also capture any agents/ dir if exists
  ls -1d "$WORKSPACE/agents/"*/ 2>/dev/null | sed "s|$WORKSPACE/||" >> "$SNAPSHOT_DIR/meta/agent-dirs.txt" || true
  local agentcount=$(wc -l < "$SNAPSHOT_DIR/meta/agent-dirs.txt")
  echo "  ✓ agent directories ($agentcount entries)"

  # 9. Snapshot timestamp
  date "$TIMESTAMP_FMT" > "$SNAPSHOT_DIR/meta/snapshot-time.txt"

  header "Snapshot complete"
  echo "  📁 Saved to: $SNAPSHOT_DIR"
  echo "  🕐 $(cat "$SNAPSHOT_DIR/meta/snapshot-time.txt")"
}

# ─── VERIFY MODE ─────────────────────────────────────────────
do_verify() {
  if [[ ! -d "$SNAPSHOT_DIR" ]]; then
    echo "❌ No snapshot found at $SNAPSHOT_DIR"
    echo "   Run with --snapshot first before upgrading."
    exit 1
  fi

  header "Post-Upgrade Healthcheck"
  echo "  Snapshot taken: $(cat "$SNAPSHOT_DIR/meta/snapshot-time.txt" 2>/dev/null || echo 'unknown')"
  echo "  Verifying at:   $(date "$TIMESTAMP_FMT")"

  local crit=0 warn=0 inf=0

  # ── 1. openclaw.json ──
  header "openclaw.json"
  if [[ ! -f "$WORKSPACE/openclaw.json" ]]; then
    if [[ -f "$SNAPSHOT_DIR/openclaw.json" ]]; then
      critical "openclaw.json is MISSING (was present in snapshot)"
      ((crit++))
    else
      info "openclaw.json absent in both snapshot and current (OK)"
      ((inf++))
    fi
  elif [[ -f "$SNAPSHOT_DIR/openclaw.json" ]]; then
    if diff -q "$SNAPSHOT_DIR/openclaw.json" "$WORKSPACE/openclaw.json" >/dev/null 2>&1; then
      info "openclaw.json unchanged ✓"
      ((inf++))
    else
      critical "openclaw.json has been MODIFIED"
      diff --unified=3 "$SNAPSHOT_DIR/openclaw.json" "$WORKSPACE/openclaw.json" 2>/dev/null | head -40 || true
      ((crit++))
    fi
  else
    warning "openclaw.json now exists but wasn't in snapshot (new file)"
    ((warn++))
  fi

  # ── 2. IRONCLAD.md ──
  header "IRONCLAD.md"
  _diff_file "IRONCLAD.md" "critical" "IRONCLAD.md" crit warn inf

  # ── 3. AGENTS.md ──
  header "AGENTS.md"
  _diff_file "AGENTS.md" "warning" "AGENTS.md" crit warn inf

  # ── 4. memos.db integrity ──
  header "memos.db"
  if [[ -f "$MEMOS_DB" ]]; then
    local cur_md5=$(md5sum "$MEMOS_DB" | awk '{print $1}')
    local snap_md5=$(cat "$SNAPSHOT_DIR/meta/memos-db.md5" 2>/dev/null || echo "none")
    if [[ "$cur_md5" == "$snap_md5" ]]; then
      info "memos.db md5 unchanged ($cur_md5)"
      ((inf++))
    else
      warning "memos.db md5 changed: $snap_md5 → $cur_md5 (expected if DB was active)"
      ((warn++))
    fi
    # Integrity check
    if sqlite3 "$MEMOS_DB" "PRAGMA integrity_check;" 2>/dev/null | grep -q "^ok$"; then
      info "memos.db integrity check: OK"
      ((inf++))
    else
      critical "memos.db INTEGRITY CHECK FAILED"
      ((crit++))
    fi
  else
    if [[ -f "$SNAPSHOT_DIR/meta/memos-db.md5" ]]; then
      critical "memos.db is MISSING (was present in snapshot)"
      ((crit++))
    else
      info "memos.db absent in both (OK)"
      ((inf++))
    fi
  fi

  # ── 5. Skills directory ──
  header "Skills"
  if [[ -f "$SNAPSHOT_DIR/meta/skills-dirs.txt" ]]; then
    local snap_skills=$(wc -l < "$SNAPSHOT_DIR/meta/skills-dirs.txt")
    local cur_skills=$(ls -1 "$WORKSPACE/skills/" 2>/dev/null | wc -l)
    if (( cur_skills < snap_skills )); then
      local missing=$((snap_skills - cur_skills))
      critical "$missing skill(s) LOST ($snap_skills → $cur_skills)"
      # Show which ones are missing
      comm -23 <(sort "$SNAPSHOT_DIR/meta/skills-dirs.txt") <(ls -1 "$WORKSPACE/skills/" 2>/dev/null | sort) | while read -r s; do
        echo "    ❌ missing: $s"
      done
      ((crit++))
    elif (( cur_skills > snap_skills )); then
      local added=$((cur_skills - snap_skills))
      info "$added new skill(s) added ($snap_skills → $cur_skills)"
      comm -13 <(sort "$SNAPSHOT_DIR/meta/skills-dirs.txt") <(ls -1 "$WORKSPACE/skills/" 2>/dev/null | sort) | while read -r s; do
        echo "    ➕ new: $s"
      done
      ((inf++))
    else
      info "skills/ count unchanged ($cur_skills)"
      ((inf++))
    fi
  fi

  # ── 6. Config JSONs ──
  header "Config JSONs"
  local cfg_changes=0
  for snap_cfg in "$SNAPSHOT_DIR/config/"*.json; do
    [[ -f "$snap_cfg" ]] || continue
    local fname=$(basename "$snap_cfg")
    local cur_cfg="$WORKSPACE/config/$fname"
    if [[ ! -f "$cur_cfg" ]]; then
      warning "config/$fname REMOVED"
      ((warn++)); ((cfg_changes++))
    elif ! diff -q "$snap_cfg" "$cur_cfg" >/dev/null 2>&1; then
      warning "config/$fname changed"
      ((warn++)); ((cfg_changes++))
    fi
  done
  # Check for new configs
  for cur_cfg in "$WORKSPACE/config/"*.json; do
    [[ -f "$cur_cfg" ]] || continue
    local fname=$(basename "$cur_cfg")
    if [[ ! -f "$SNAPSHOT_DIR/config/$fname" ]]; then
      info "config/$fname is NEW"
      ((inf++)); ((cfg_changes++))
    fi
  done
  if (( cfg_changes == 0 )); then
    info "all config JSONs unchanged"
    ((inf++))
  fi

  # ── 7. Version ──
  header "Version"
  local snap_ver=$(cat "$SNAPSHOT_DIR/meta/version.txt" 2>/dev/null || echo "unknown")
  local cur_ver
  if [[ -f "$VERSION_FILE" ]]; then
    cur_ver=$(cat "$VERSION_FILE")
  else
    cur_ver=$(openclaw --version 2>/dev/null || echo "unknown")
  fi
  if [[ "$snap_ver" == "$cur_ver" ]]; then
    info "version unchanged: $cur_ver"
  else
    info "version changed: $snap_ver → $cur_ver"
  fi
  ((inf++))

  # ── 8. Cron ──
  header "Cron"
  local snap_cron_lines=$(grep -c '[^[:space:]]' "$SNAPSHOT_DIR/meta/crontab.txt" 2>/dev/null || echo 0)
  local cur_cron_lines=$(crontab -l 2>/dev/null | grep -c '[^[:space:]]' || echo 0)
  if (( cur_cron_lines == 0 && snap_cron_lines > 0 )); then
    critical "Crontab is EMPTY (had $snap_cron_lines lines before)"
    ((crit++))
  elif (( cur_cron_lines < snap_cron_lines )); then
    local lost=$((snap_cron_lines - cur_cron_lines))
    warning "Crontab shrank: $snap_cron_lines → $cur_cron_lines lines ($lost removed)"
    ((warn++))
  elif (( cur_cron_lines > snap_cron_lines )); then
    local added=$((cur_cron_lines - snap_cron_lines))
    info "Crontab grew: $snap_cron_lines → $cur_cron_lines lines ($added added)"
    ((inf++))
  else
    info "Crontab unchanged ($cur_cron_lines lines)"
    ((inf++))
  fi

  # ── 9. package.json ──
  header "package.json"
  _diff_file "package.json" "warning" "package.json" crit warn inf

  # ── 10. Agent directories ──
  header "Agent Directories"
  if [[ -f "$SNAPSHOT_DIR/meta/agent-dirs.txt" ]]; then
    local snap_agents=$(wc -l < "$SNAPSHOT_DIR/meta/agent-dirs.txt")
    local cur_agents=0
    local cur_agent_file=$(mktemp)
    ls -1d "$WORKSPACE/skills/"*/ 2>/dev/null | sed "s|$WORKSPACE/||" > "$cur_agent_file"
    ls -1d "$WORKSPACE/agents/"*/ 2>/dev/null | sed "s|$WORKSPACE/||" >> "$cur_agent_file" || true
    cur_agents=$(wc -l < "$cur_agent_file")
    if (( cur_agents < snap_agents )); then
      local lost=$((snap_agents - cur_agents))
      critical "$lost agent dir(s) MISSING ($snap_agents → $cur_agents)"
      comm -23 <(sort "$SNAPSHOT_DIR/meta/agent-dirs.txt") <(sort "$cur_agent_file") | while read -r d; do
        echo "    ❌ missing: $d"
      done
      ((crit++))
    elif (( cur_agents > snap_agents )); then
      info "$(( cur_agents - snap_agents )) new agent dir(s) ($snap_agents → $cur_agents)"
      ((inf++))
    else
      info "agent directories unchanged ($cur_agents)"
      ((inf++))
    fi
    rm -f "$cur_agent_file"
  fi

  # ── SUMMARY ──
  header "SUMMARY"
  echo ""
  echo -e "  ${RED}🔴 Critical: $crit${RST}"
  echo -e "  ${YEL}🟡 Warning:  $warn${RST}"
  echo -e "  ${GRN}🟢 Info:     $inf${RST}"
  echo ""
  if (( crit > 0 )); then
    echo -e "  ${RED}${BOLD}⚠️  UPGRADE HAS BREAKING CHANGES — REVIEW CRITICAL ITEMS${RST}"
    exit 2
  elif (( warn > 0 )); then
    echo -e "  ${YEL}${BOLD}⚡ Upgrade OK with warnings — review yellow items${RST}"
    exit 0
  else
    echo -e "  ${GRN}${BOLD}✅ Clean upgrade — no issues detected${RST}"
    exit 0
  fi
}

# ── Helper: diff a file ──
_diff_file() {
  local fname="$1" severity="$2" label="$3"
  local -n _crit=$4 _warn=$5 _inf=$6

  if [[ ! -f "$WORKSPACE/$fname" ]]; then
    if [[ -f "$SNAPSHOT_DIR/$fname" ]]; then
      if [[ "$severity" == "critical" ]]; then
        critical "$label is MISSING"
        ((_crit++))
      else
        warning "$label is MISSING"
        ((_warn++))
      fi
    else
      info "$label absent in both (OK)"
      ((_inf++))
    fi
  elif [[ -f "$SNAPSHOT_DIR/$fname" ]]; then
    if diff -q "$SNAPSHOT_DIR/$fname" "$WORKSPACE/$fname" >/dev/null 2>&1; then
      info "$label unchanged ✓"
      ((_inf++))
    else
      if [[ "$severity" == "critical" ]]; then
        critical "$label has been MODIFIED"
        ((_crit++))
      else
        warning "$label has been modified"
        ((_warn++))
      fi
      diff --unified=3 "$SNAPSHOT_DIR/$fname" "$WORKSPACE/$fname" 2>/dev/null | head -30 || true
    fi
  else
    info "$label is new (not in snapshot)"
    ((_inf++))
  fi
}

# ── MAIN ──
case "${1:-}" in
  --snapshot) do_snapshot ;;
  --verify)   do_verify ;;
  *)
    echo "Usage: $0 [--snapshot | --verify]"
    echo "  --snapshot  Save current state before upgrade"
    echo "  --verify    Compare current state against snapshot"
    exit 1
    ;;
esac
