#!/usr/bin/env bash
# Handler: rule.skill-no-direct-llm-call-001
# Event:   skill.lifecycle.created, skill.lifecycle.modified
# Purpose: 检查技能代码中是否直接调用LLM API（禁止）
# Priority: P0 | Category: architecture
#
# 正确方式：(1) 用当前Agent默认模型 (2) sessions_spawn派子Agent
# 唯一例外：用户显式在配置中指定技能-模型绑定关系

set -euo pipefail

RULE_ID="rule.skill-no-direct-llm-call-001"
SKILL_PATH="${1:?Usage: $0 <skill-directory>}"

# Forbidden patterns — direct HTTP calls to LLM providers
PATTERNS=(
  'fetch.*chat/completions'
  'axios.*chat/completions'
  'https\.request.*bigmodel'
  'https\.request.*anthropic'
  'https\.request.*openai'
  'curl.*chat/completions'
  'curl.*anthropic'
  'curl.*openai'
  'curl.*bigmodel'
)

VIOLATIONS=()

for pattern in "${PATTERNS[@]}"; do
  # Search all code files, skip node_modules/vendor
  matches=$(grep -rn --include='*.js' --include='*.ts' --include='*.sh' --include='*.py' \
    -E "$pattern" "$SKILL_PATH" \
    --exclude-dir=node_modules --exclude-dir=vendor 2>/dev/null || true)
  if [[ -n "$matches" ]]; then
    VIOLATIONS+=("$matches")
  fi
done

if [[ ${#VIOLATIONS[@]} -gt 0 ]]; then
  echo "❌ [$RULE_ID] VIOLATION: 技能代码中检测到直接LLM API调用"
  echo ""
  echo "禁止原因: 模型选择是运行时配置层的职责，不是技能的职责。"
  echo "正确做法: (1) 用当前Agent默认模型 (2) sessions_spawn派子Agent"
  echo "例外: 用户显式在配置中指定技能-模型绑定关系"
  echo ""
  echo "违规详情:"
  for v in "${VIOLATIONS[@]}"; do
    echo "$v"
  done
  exit 1
else
  echo "✅ [$RULE_ID] PASS: 未检测到直接LLM API调用"
  exit 0
fi
