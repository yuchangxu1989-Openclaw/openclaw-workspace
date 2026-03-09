#!/usr/bin/env bash
# Handler: rule.pipeline-benchmark-skill-publish-security-gate-001
# Event:   skill.publish
# Priority: P0 (gate — blocks pipeline on failure)
# Description: 技能发布安全门禁 — 确保每次 skill.publish 都通过安全检查
#
# 检查项:
#   1. SKILL.md 存在且非空
#   2. 无硬编码密钥/token（基础 secret scan）
#   3. 脚本文件有合理权限（不可 world-writable）
#
# Exit 0 = pass gate, non-zero = block publish

set -euo pipefail

RULE_ID="rule.pipeline-benchmark-skill-publish-security-gate-001"
EVENT="${ISC_EVENT:-skill.publish}"
SKILL_DIR="${ISC_SKILL_DIR:-${1:-}}"

log() { echo "[${RULE_ID}] $*"; }

# --- Validate input ---
if [[ -z "${SKILL_DIR}" ]]; then
  log "ERROR: SKILL_DIR not provided. Set ISC_SKILL_DIR or pass as \$1."
  exit 1
fi

if [[ ! -d "${SKILL_DIR}" ]]; then
  log "ERROR: SKILL_DIR does not exist: ${SKILL_DIR}"
  exit 1
fi

FAILED=0

# --- Check 1: SKILL.md exists and is non-empty ---
if [[ ! -s "${SKILL_DIR}/SKILL.md" ]]; then
  log "FAIL: SKILL.md missing or empty in ${SKILL_DIR}"
  FAILED=1
else
  log "PASS: SKILL.md present"
fi

# --- Check 2: Basic secret scan (API keys, tokens, passwords) ---
SECRET_PATTERN='(AKIA[0-9A-Z]{16}|sk-[a-zA-Z0-9]{20,}|password\s*[:=]\s*["\x27][^"\x27]{4,}|token\s*[:=]\s*["\x27][^"\x27]{8,})'
HITS=$(grep -rIEn "${SECRET_PATTERN}" "${SKILL_DIR}" --include='*.sh' --include='*.js' --include='*.ts' --include='*.py' --include='*.json' --include='*.yaml' --include='*.yml' --include='*.md' 2>/dev/null || true)

if [[ -n "${HITS}" ]]; then
  log "FAIL: Potential hardcoded secrets detected:"
  echo "${HITS}" | head -10
  FAILED=1
else
  log "PASS: No obvious hardcoded secrets"
fi

# --- Check 3: File permissions — no world-writable scripts ---
BAD_PERMS=$(find "${SKILL_DIR}" -type f \( -name '*.sh' -o -name '*.py' -o -name '*.js' \) -perm -o=w 2>/dev/null || true)

if [[ -n "${BAD_PERMS}" ]]; then
  log "FAIL: World-writable scripts found:"
  echo "${BAD_PERMS}" | head -10
  FAILED=1
else
  log "PASS: Script permissions OK"
fi

# --- Result ---
if [[ "${FAILED}" -ne 0 ]]; then
  log "BLOCKED: Security gate failed. Publish denied."
  exit 1
fi

log "PASSED: All security checks passed. Publish allowed."
exit 0
