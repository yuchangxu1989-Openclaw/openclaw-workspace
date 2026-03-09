#!/usr/bin/env bash
# Handler: rule.public-skill-quality-gate-001
# 可销售技能质量门禁 — P0_gate
# Events: skill.public.pre_publish, skill.public.modified, git.commit.skills_public
#
# Checks that skills under skills/public/ meet sales-quality standards before publish.
# Exit 0 = pass (publish allowed), Exit 1 = blocked (quality gate failed).

set -euo pipefail

SKILL_DIR="${1:?Usage: $0 <skill-directory>}"
ERRORS=()

# --- helpers ---
fail() { ERRORS+=("$1"); }

# 1. SKILL.md exists and has complete frontmatter (name + description)
SKILL_MD="$SKILL_DIR/SKILL.md"
if [[ ! -f "$SKILL_MD" ]]; then
  fail "SKILL.md not found"
else
  if ! grep -qiP '^\s*name\s*:' "$SKILL_MD"; then
    fail "SKILL.md missing 'name' in frontmatter"
  fi
  if ! grep -qiP '^\s*description\s*:' "$SKILL_MD"; then
    fail "SKILL.md missing 'description' in frontmatter"
  fi

  # 2. description contains trigger words AND "NOT for" exclusions
  DESC_BLOCK=$(sed -n '/^---$/,/^---$/p' "$SKILL_MD" 2>/dev/null || true)
  if [[ -n "$DESC_BLOCK" ]]; then
    if ! echo "$DESC_BLOCK" | grep -qiP '(when|use when|activate when|trigger)'; then
      fail "description missing trigger-word guidance (e.g. 'Use when …')"
    fi
    if ! echo "$DESC_BLOCK" | grep -qiP 'not\s+for'; then
      fail "description missing 'NOT for' exclusion clause"
    fi
  fi

  # 5. Usage example present
  if ! grep -qiP '(example|usage|```|cli)' "$SKILL_MD"; then
    fail "SKILL.md lacks usage examples"
  fi

  # 6. Preconditions / prerequisites
  if ! grep -qiP '(prerequisite|precondition|require|before you|setup)' "$SKILL_MD"; then
    fail "SKILL.md lacks precondition/prerequisite section"
  fi
fi

# 3. No external npm dependencies (or explicitly declared)
if [[ -f "$SKILL_DIR/package.json" ]]; then
  DEP_COUNT=$(jq '(.dependencies // {} | length) + (.devDependencies // {} | length)' "$SKILL_DIR/package.json" 2>/dev/null || echo 0)
  if (( DEP_COUNT > 0 )); then
    # Check if declared in SKILL.md
    if ! grep -qiP '(dependencies|npm|node_modules)' "$SKILL_MD" 2>/dev/null; then
      fail "Has npm dependencies but SKILL.md does not declare them"
    fi
  fi
fi

# 4. No sensitive information (API keys, passwords, internal paths)
SENSITIVE_PATTERN='(api[_-]?key|secret[_-]?key|password|passwd|token\s*[:=]|/root/|/home/[a-z]+/\.)'
if grep -rqiP "$SENSITIVE_PATTERN" "$SKILL_DIR" --include='*.md' --include='*.sh' --include='*.js' --include='*.json' --include='*.yaml' --include='*.yml' 2>/dev/null; then
  fail "Potential sensitive information detected (API key/password/internal path)"
fi

# 7. File structure: at minimum SKILL.md must exist (already checked above)

# --- verdict ---
if (( ${#ERRORS[@]} > 0 )); then
  echo "❌ Quality gate BLOCKED — ${#ERRORS[@]} issue(s):"
  for e in "${ERRORS[@]}"; do
    echo "  • $e"
  done
  exit 1
fi

echo "✅ Quality gate passed for $(basename "$SKILL_DIR")"
exit 0
