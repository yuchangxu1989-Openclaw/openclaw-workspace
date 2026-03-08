#!/usr/bin/env bash
# ISC Hook: rule.memory-digest-must-verify-001 — 记忆消化必须核实磁盘文件
# 检测memory文件中引用的路径是否真实存在
set -euo pipefail
RULE_ID="rule.memory-digest-must-verify-001"
WORKSPACE="${WORKSPACE:-/root/.openclaw/workspace}"
MEMORY_DIR="$WORKSPACE/memory"

if [ ! -d "$MEMORY_DIR" ]; then
  echo "{\"rule_id\":\"$RULE_ID\", \"status\":\"pass\", \"detail\":\"No memory directory, nothing to verify\"}"
  exit 0
fi

# 获取最近的memory文件
LATEST=$(ls -t "$MEMORY_DIR"/*.md 2>/dev/null | head -1 || echo "")
if [ -z "$LATEST" ]; then
  echo "{\"rule_id\":\"$RULE_ID\", \"status\":\"pass\", \"detail\":\"No memory files found\"}"
  exit 0
fi

# 从memory文件中提取文件路径引用并验证存在性
MISSING=()
# 匹配反引号或引号中的路径模式
PATHS=$(grep -oE '`[a-zA-Z0-9_./-]+\.(md|json|sh|py|yaml|yml|ts|js)`' "$LATEST" 2>/dev/null | tr -d '`' || echo "")
for p in $PATHS; do
  # 尝试在workspace下查找
  if [ ! -e "$WORKSPACE/$p" ] && [ ! -e "$p" ]; then
    MISSING+=("$p")
  fi
done

if [ ${#MISSING[@]} -gt 0 ]; then
  SHOW="${MISSING[*]:0:5}"
  echo "{\"rule_id\":\"$RULE_ID\", \"status\":\"fail\", \"detail\":\"${#MISSING[@]} referenced files not found on disk: $SHOW\"}"
  exit 1
fi

echo "{\"rule_id\":\"$RULE_ID\", \"status\":\"pass\", \"detail\":\"All referenced files in latest memory verified on disk\"}"
exit 0
