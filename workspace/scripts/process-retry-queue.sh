#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="/root/.openclaw/workspace"
ROOT_DIR="/"
exec "/skills/public/multi-agent-dispatch/scripts/process-retry-queue.sh" ""
