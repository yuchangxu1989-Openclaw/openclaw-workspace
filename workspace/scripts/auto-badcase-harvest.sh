#!/bin/bash
# auto-badcase-harvest.sh — 薄封装，实际逻辑已迁移至技能目录
# 用法: auto-badcase-harvest.sh <badcase_id> <category> <description> [wrong_chain] [correct_chain] [root_cause]
set -euo pipefail
SKILL_DIR="/root/.openclaw/workspace/skills/public/auto-badcase-harvest"
exec bash "$SKILL_DIR/harvest.sh" "$@"
