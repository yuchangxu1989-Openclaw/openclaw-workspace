#!/usr/bin/env bash
# 薄封装 — 实际逻辑在 skills/seef/auto-skill-discovery.sh
exec bash "$(dirname "$0")/../skills/seef/auto-skill-discovery.sh" "$@"
