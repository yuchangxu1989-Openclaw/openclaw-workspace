#!/usr/bin/env bash
# ISC-SKILL-POST-CREATION-GUARD-001
# 扫描所有技能目录，检查是否完成注册（能力锚点+意图路由规则）
set -euo pipefail

WORKSPACE="/root/.openclaw/workspace"
ANCHOR="$WORKSPACE/CAPABILITY-ANCHOR.md"
RULES_DIR="$WORKSPACE/skills/isc-core/rules"

if [ ! -f "$ANCHOR" ]; then
  echo "✗ CAPABILITY-ANCHOR.md 不存在: $ANCHOR"
  exit 1
fi

UNREGISTERED=()

# 扫描 skills/ 和 skills/public/ 下所有含 SKILL.md 的目录
for skill_md in "$WORKSPACE"/skills/*/SKILL.md "$WORKSPACE"/skills/public/*/SKILL.md; do
  [ -f "$skill_md" ] || continue
  skill_dir=$(dirname "$skill_md")
  skill_name=$(basename "$skill_dir")

  # 跳过 isc-core 自身
  [ "$skill_name" = "isc-core" ] && continue

  missing=()

  # 检查 a: CAPABILITY-ANCHOR.md 中是否有该技能条目
  if ! grep -qi "$skill_name" "$ANCHOR" 2>/dev/null; then
    missing+=("CAPABILITY-ANCHOR.md缺少条目")
  fi

  # 检查 b: isc-core/rules/ 中是否有对应意图路由规则
  if ! ls "$RULES_DIR"/intent-route.*"$skill_name"*.json 2>/dev/null | grep -q . && \
     ! grep -rql "$skill_name" "$RULES_DIR"/intent-route.*.json 2>/dev/null; then
    missing+=("缺少意图路由规则")
  fi

  if [ ${#missing[@]} -gt 0 ]; then
    UNREGISTERED+=("$skill_name: ${missing[*]}")
  fi
done

if [ ${#UNREGISTERED[@]} -gt 0 ]; then
  echo "╔══════════════════════════════════════════════════╗"
  echo "║  ✗ 未注册技能列表 (${#UNREGISTERED[@]}个)                      ║"
  echo "╚══════════════════════════════════════════════════╝"
  for item in "${UNREGISTERED[@]}"; do
    echo "  • $item"
  done
  exit 1
else
  echo "✓ 所有技能已完成注册"
  exit 0
fi
