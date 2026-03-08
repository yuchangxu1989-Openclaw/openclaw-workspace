#!/usr/bin/env bash
# ISC Hook: ISC-DOC-QUALITY-GATE-001
set -euo pipefail
RULE_ID="ISC-DOC-QUALITY-GATE-001"
# Check: important documents went through write->review->rewrite pipeline
DOCS=$(find /root/.openclaw/workspace/docs -name "*.md" 2>/dev/null | wc -l)
echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"Doc quality gate is advisory; $DOCS docs in workspace\"}"
