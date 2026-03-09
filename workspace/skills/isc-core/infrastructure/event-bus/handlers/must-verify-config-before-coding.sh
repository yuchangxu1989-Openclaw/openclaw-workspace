#!/usr/bin/env bash
# Handler: rule.must-verify-config-before-coding-001
# Priority: P0 | Category: engineering
# Trigger events: code.module.created, code.module.modified
#
# 编码前必须查配置 — 检测代码中的硬编码配置引用
# 当代码引用API URL、模型名、API Key时，必须有对应的配置文件读取逻辑，
# 不允许凭记忆hardcode。
#
# 输入 (env):
#   ISC_EVENT       — 触发事件名
#   ISC_FILE_PATH   — 被创建/修改的文件路径
#   ISC_DIFF        — (可选) git diff 内容
#   ISC_PROJECT_ROOT — 项目根目录

set -euo pipefail

RULE_ID="rule.must-verify-config-before-coding-001"
FILE="${ISC_FILE_PATH:-}"
DIFF="${ISC_DIFF:-}"
PROJECT_ROOT="${ISC_PROJECT_ROOT:-.}"

if [[ -z "$FILE" ]]; then
  echo "[ISC:${RULE_ID}] SKIP — no file path provided"
  exit 0
fi

# Only check code files
case "$FILE" in
  *.py|*.js|*.ts|*.sh|*.go|*.rs|*.java|*.rb|*.yaml|*.yml|*.json|*.toml) ;;
  *)
    echo "[ISC:${RULE_ID}] SKIP — non-code file: $FILE"
    exit 0
    ;;
esac

# Source to scan: prefer diff, fall back to full file
if [[ -n "$DIFF" ]]; then
  CONTENT="$DIFF"
else
  CONTENT="$(cat "$FILE" 2>/dev/null || true)"
fi

if [[ -z "$CONTENT" ]]; then
  echo "[ISC:${RULE_ID}] SKIP — empty content"
  exit 0
fi

VIOLATIONS=()

# Pattern 1: Hardcoded API URLs (http(s) with host, not localhost/example)
if echo "$CONTENT" | grep -Pn 'https?://(?!localhost|127\.0\.0\.1|example\.com|0\.0\.0\.0)[a-zA-Z0-9][-a-zA-Z0-9.]*\.[a-z]{2,}' | grep -vP '(#.*https?://|//\s*https?://|^\s*\*|^\s*"""|\bcomment\b)' > /tmp/isc_url_hits 2>/dev/null; then
  while IFS= read -r line; do
    VIOLATIONS+=("hardcoded-url: $line")
  done < /tmp/isc_url_hits
fi

# Pattern 2: Hardcoded model names (common LLM model identifiers)
if echo "$CONTENT" | grep -Pn '["'"'"'](gpt-[34][^\s"'"'"']*|claude-[^\s"'"'"']*|gemini-[^\s"'"'"']*|o[1-9]-[^\s"'"'"']*|deepseek-[^\s"'"'"']*)['"'"'"]' | grep -vP '(#|//|^\s*\*|comment|config.*read|\.get\(|environ|getenv|load|parse)' > /tmp/isc_model_hits 2>/dev/null; then
  while IFS= read -r line; do
    VIOLATIONS+=("hardcoded-model: $line")
  done < /tmp/isc_model_hits
fi

# Pattern 3: Hardcoded API keys (string literals that look like keys)
if echo "$CONTENT" | grep -Pn '["'"'"'](sk-[a-zA-Z0-9]{20,}|key-[a-zA-Z0-9]{20,}|AIza[a-zA-Z0-9_-]{30,})['"'"'"]' > /tmp/isc_key_hits 2>/dev/null; then
  while IFS= read -r line; do
    VIOLATIONS+=("hardcoded-key: $line")
  done < /tmp/isc_key_hits
fi

# Report
if [[ ${#VIOLATIONS[@]} -eq 0 ]]; then
  echo "[ISC:${RULE_ID}] PASS — no hardcoded config references detected in $FILE"
  exit 0
fi

echo "============================================"
echo "[ISC:${RULE_ID}] ❌ VIOLATION DETECTED"
echo "File: $FILE"
echo "Rule: 编码前必须查配置 (P0)"
echo "--------------------------------------------"
for v in "${VIOLATIONS[@]}"; do
  echo "  ⚠ $v"
done
echo "--------------------------------------------"
echo "Fix: Read from config file / env var / settings instead of hardcoding."
echo "Rationale: 不查配置就凭记忆写代码=数据不诚实"
echo "============================================"
exit 1
