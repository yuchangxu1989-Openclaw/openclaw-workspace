#!/bin/bash
# 薄封装
exec bash "$(dirname "$0")/../skills/public/multi-agent-reporting/sync-live-sessions.sh" "$@"
