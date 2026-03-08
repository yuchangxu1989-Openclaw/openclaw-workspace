#!/usr/bin/env bash
# ISC Hook: rule.design-document-narrative-review-001
# Description: 模拟演讲强制门禁——设计文档必须通过模拟演讲审查才能交付
set -euo pipefail
RULE_ID="rule.design-document-narrative-review-001"

# Check: design documents have narrative review records
DOCS_DIR="/root/.openclaw/workspace/docs/design"
REVIEW_DIR="/root/.openclaw/workspace/docs/reviews"
if [ -d "$DOCS_DIR" ]; then
  DOCS=$(find "$DOCS_DIR" -name "*.md" 2>/dev/null | wc -l)
  REVIEWS=$(find "$REVIEW_DIR" -name "*review*" 2>/dev/null | wc -l)
  if [ "$DOCS" -gt 0 ] && [ "$REVIEWS" -lt "$DOCS" ]; then
    echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"fail\",\"detail\":\"$REVIEWS/$DOCS design docs have narrative reviews\"}"
  else
    echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"Design docs reviewed ($REVIEWS/$DOCS)\"}"
  fi
else
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"No design docs directory\"}"
fi
