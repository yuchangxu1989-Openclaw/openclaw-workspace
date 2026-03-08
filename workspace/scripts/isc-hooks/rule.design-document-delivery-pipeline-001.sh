#!/usr/bin/env bash
# rule.design-document-delivery-pipeline-001 — design_document_delivery_pipeline
# 扫描设计文档，检查是否包含9步流水线必需的结构
RULE_ID="rule.design-document-delivery-pipeline-001"
WORKSPACE="/root/.openclaw/workspace"
DOCS_DIR="$WORKSPACE/docs"
FAIL=0
VIOLATIONS=""

# 检查docs目录下的设计文档
if [ -d "$DOCS_DIR" ]; then
  for doc in "$DOCS_DIR"/*设计*.md "$DOCS_DIR"/*design*.md; do
    [ ! -f "$doc" ] && continue
    name=$(basename "$doc")
    # 检查必需章节
    HAS_SUMMARY=$(grep -c '摘要\|执行摘要\|Summary' "$doc" 2>/dev/null || echo 0)
    HAS_BACKGROUND=$(grep -c '背景\|Background' "$doc" 2>/dev/null || echo 0)
    HAS_ARCH=$(grep -c '架构\|Architecture' "$doc" 2>/dev/null || echo 0)
    if [ "$HAS_SUMMARY" -eq 0 ] || [ "$HAS_BACKGROUND" -eq 0 ]; then
      VIOLATIONS="${VIOLATIONS}${name}:missing_sections; "
      FAIL=1
    fi
  done
fi

if [ "$FAIL" -eq 1 ]; then
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"fail\",\"detail\":\"设计文档结构不完整: ${VIOLATIONS}\"}"
  exit 1
else
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"设计文档结构检查通过\"}"
  exit 0
fi
