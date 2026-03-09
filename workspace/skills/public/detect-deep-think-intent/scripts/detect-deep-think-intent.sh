#!/usr/bin/env bash
# detect-deep-think-intent.sh — 深度思考意图探测探针
# 输入: 用户消息文本 (第一个参数或stdin)
# 输出: JSON {"should_delegate": bool, "matched_keywords": [...], "suggested_agent": "..."}
# 关键词从外部配置文件读取，支持扩展

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/../skills/isc-core/config/deep-think-keywords.json"

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo '{"should_delegate":false,"matched_keywords":[],"suggested_agent":"","error":"config not found"}' 
  exit 1
fi

# 获取用户消息：优先参数，其次stdin
if [[ $# -ge 1 ]]; then
  MESSAGE="$1"
else
  MESSAGE="$(cat)"
fi

if [[ -z "$MESSAGE" ]]; then
  echo '{"should_delegate":false,"matched_keywords":[],"suggested_agent":""}'
  exit 0
fi

# 用jq从配置提取关键词和agent映射
KEYWORDS=$(jq -r '.keywords[]' "$CONFIG_FILE")
MATCHED=()

while IFS= read -r kw; do
  if echo "$MESSAGE" | grep -qF "$kw"; then
    MATCHED+=("$kw")
  fi
done <<< "$KEYWORDS"

if [[ ${#MATCHED[@]} -eq 0 ]]; then
  echo '{"should_delegate":false,"matched_keywords":[],"suggested_agent":""}'
  exit 0
fi

# 确定建议的agent：遍历agent_mapping，找第一个命中的分类
SUGGESTED=$(jq -r '.default_agent' "$CONFIG_FILE")
MAPPING_KEYS=$(jq -r '.agent_mapping | keys[]' "$CONFIG_FILE")

best_count=0
while IFS= read -r category; do
  cat_keywords=$(jq -r ".agent_mapping[\"$category\"].keywords[]" "$CONFIG_FILE")
  count=0
  while IFS= read -r ckw; do
    for m in "${MATCHED[@]}"; do
      if [[ "$m" == "$ckw" ]]; then
        ((count++)) || true
      fi
    done
  done <<< "$cat_keywords"
  if [[ $count -gt $best_count ]]; then
    best_count=$count
    SUGGESTED=$(jq -r ".agent_mapping[\"$category\"].agent" "$CONFIG_FILE")
  fi
done <<< "$MAPPING_KEYS"

# 构造JSON输出
MATCHED_JSON=$(printf '%s\n' "${MATCHED[@]}" | jq -R . | jq -s .)
jq -n \
  --argjson should_delegate true \
  --argjson matched_keywords "$MATCHED_JSON" \
  --arg suggested_agent "$SUGGESTED" \
  '{should_delegate: $should_delegate, matched_keywords: $matched_keywords, suggested_agent: $suggested_agent}'
