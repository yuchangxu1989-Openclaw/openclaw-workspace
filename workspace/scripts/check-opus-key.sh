#!/bin/bash
# 薄封装 — 实际逻辑在技能目录
exec bash "$(dirname "$0")/../skills/public/system-monitor/archive/check-opus-key.sh" "$@"
