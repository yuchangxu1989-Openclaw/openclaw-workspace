#!/bin/bash
set -euo pipefail

BASE_DIR="/root/.openclaw/agents"
ARCHIVE_ROOT="/root/.openclaw/archives/session-governance"
LOG_FILE="/root/.openclaw/workspace/logs/session-cleanup.log"
CRON_KEEP_COUNT=120
MAIN_KEEP_COUNT=20
DELETED_RETENTION_HOURS=6

mkdir -p "$ARCHIVE_ROOT" "$(dirname "$LOG_FILE")"
STAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE_DIR="$ARCHIVE_ROOT/$STAMP"
mkdir -p "$ARCHIVE_DIR/cron-worker-active"

echo "[$(date '+%F %T')] session governance start" >> "$LOG_FILE"

python3 - <<'PY' >> "$LOG_FILE"
import os, glob, time, gzip, shutil
BASE_DIR = "/root/.openclaw/agents"
ARCHIVE_DIR = os.environ["ARCHIVE_DIR"]
CRON_KEEP_COUNT = int(os.environ["CRON_KEEP_COUNT"])
MAIN_KEEP_COUNT = int(os.environ["MAIN_KEEP_COUNT"])
DELETED_RETENTION_SECONDS = int(os.environ["DELETED_RETENTION_HOURS"]) * 3600
now = time.time()
archived = 0
purged_deleted = 0
kept = {}

for agent in os.listdir(BASE_DIR):
    sp = os.path.join(BASE_DIR, agent, "sessions")
    if not os.path.isdir(sp):
        continue
    active = []
    for f in glob.glob(os.path.join(sp, "*.jsonl")):
        active.append((os.path.getmtime(f), f))
    active.sort(reverse=True)
    keep = len(active)
    archive_slice = []
    if agent == "cron-worker" and len(active) > CRON_KEEP_COUNT:
        keep = CRON_KEEP_COUNT
        archive_slice = active[CRON_KEEP_COUNT:]
    elif agent == "main" and len(active) > MAIN_KEEP_COUNT:
        keep = MAIN_KEEP_COUNT
        archive_slice = active[MAIN_KEEP_COUNT:]

    kept[agent] = keep
    if archive_slice:
        target_dir = os.path.join(ARCHIVE_DIR, f"{agent}-active")
        os.makedirs(target_dir, exist_ok=True)
        for _, f in archive_slice:
            out = os.path.join(target_dir, os.path.basename(f) + ".gz")
            with open(f, "rb") as src, gzip.open(out, "wb", compresslevel=6) as dst:
                shutil.copyfileobj(src, dst)
            os.remove(f)
            archived += 1

    for f in glob.glob(os.path.join(sp, "*.jsonl.deleted.*")):
        if now - os.path.getmtime(f) > DELETED_RETENTION_SECONDS:
            os.remove(f)
            purged_deleted += 1

print(f"archived_active={archived}")
print(f"purged_deleted={purged_deleted}")
for agent in sorted(kept):
    print(f"keep[{agent}]={kept[agent]}")
PY

echo "[$(date '+%F %T')] session governance done" >> "$LOG_FILE"
