#!/bin/bash
# index.sh — 技能入口，转发到核心采集逻辑
set -euo pipefail
SKILL_DIR="$(cd "$(dirname "$0")" && pwd)"
exec bash "$SKILL_DIR/harvest.sh" "$@"
