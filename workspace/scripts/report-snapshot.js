#!/bin/bash
# 薄封装 — 实际逻辑在技能目录
exec node "$(dirname "$0")/../skills/public/multi-agent-reporting/scripts/report-snapshot.js" "$@"
