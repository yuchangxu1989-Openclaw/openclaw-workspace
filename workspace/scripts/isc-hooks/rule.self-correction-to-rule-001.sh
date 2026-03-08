#!/usr/bin/env bash
# ISC Hook: rule.self-correction-to-rule-001 — 缺陷根因分析与修复
# 检测自我纠偏是否已固化为规则（非仅memory记录）
set -euo pipefail
RULE_ID="rule.self-correction-to-rule-001"
WORKSPACE="${WORKSPACE:-/root/.openclaw/workspace}"
RULES_DIR="$WORKSPACE/skills/isc-core/rules"

# 检查最近24小时内是否有新规则创建（表明纠偏已固化）
# TODO: 接入实际的缺陷检测事件流，检查每个defect_acknowledged是否有对应规则
RECENT_RULES=$(find "$RULES_DIR" -name "*.json" -mmin -1440 2>/dev/null | wc -l || echo 0)

# 检查最近的git log中是否有纠偏相关的commit
CORRECTION_COMMITS=$(git -C "$WORKSPACE" log --since="24 hours ago" --oneline --grep="correction\|fix\|纠偏\|修复\|defect" 2>/dev/null | wc -l || echo 0)

# 骨架逻辑：如果有纠偏commit但没有新规则，说明纠偏未固化
if [ "$CORRECTION_COMMITS" -gt 0 ] && [ "$RECENT_RULES" -eq 0 ]; then
  echo "{\"rule_id\":\"$RULE_ID\", \"status\":\"fail\", \"detail\":\"$CORRECTION_COMMITS correction commits found but no new rules created in 24h\"}"
  exit 1
fi

echo "{\"rule_id\":\"$RULE_ID\", \"status\":\"pass\", \"detail\":\"Corrections properly codified ($RECENT_RULES recent rules, $CORRECTION_COMMITS correction commits)\"}"
exit 0
