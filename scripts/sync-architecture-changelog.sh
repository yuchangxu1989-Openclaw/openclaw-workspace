#!/usr/bin/env bash
# Cron backup: Scan recent commits for tagged entries that may have been missed
# by the post-commit hook (e.g., rebases, cherry-picks, manual commits outside hook)
#
# Usage: Run via cron, e.g. daily at 02:00
#   0 2 * * * /root/.openclaw/scripts/sync-architecture-changelog.sh
#
# Can also be run manually: bash /root/.openclaw/scripts/sync-architecture-changelog.sh [days]

set -euo pipefail

REPO_DIR="/root/.openclaw"
MEMORY_DIR="${REPO_DIR}/workspace/memory"
CHANGELOG="${MEMORY_DIR}/architecture-changelog.md"
TAG_PATTERN='\[(ARCH|FIX|CONFIG|BREAKING|SECURITY|REFACTOR)\]'
DAYS_BACK="${1:-7}"  # Default: look back 7 days
LOG_FILE="${MEMORY_DIR}/logs/changelog-sync-$(date +%Y%m%d-%H%M%S).log"

cd "${REPO_DIR}"
mkdir -p "${MEMORY_DIR}/logs"

echo "[$(date)] Starting architecture changelog sync (last ${DAYS_BACK} days)" | tee "${LOG_FILE}"

# Initialize changelog if missing
if [ ! -f "${CHANGELOG}" ]; then
    cat > "${CHANGELOG}" << 'HEADER'
# Architecture Changelog

Auto-generated from git commits tagged with [ARCH] [FIX] [CONFIG] [BREAKING] [SECURITY] [REFACTOR].
This file is maintained by the post-commit hook and sync script.

---

HEADER
    echo "[$(date)] Created new changelog file" | tee -a "${LOG_FILE}"
fi

# Get all tagged commits from the last N days
SINCE_DATE=$(date -d "${DAYS_BACK} days ago" +%Y-%m-%d 2>/dev/null || date -v-${DAYS_BACK}d +%Y-%m-%d)
ADDED=0
SKIPPED=0

while IFS= read -r COMMIT_HASH; do
    [ -z "${COMMIT_HASH}" ] && continue

    COMMIT_SHORT=$(git rev-parse --short "${COMMIT_HASH}")
    COMMIT_MSG=$(git log -1 --format="%s" "${COMMIT_HASH}")

    # Check if this commit is tagged
    if ! echo "${COMMIT_MSG}" | grep -qE "${TAG_PATTERN}"; then
        continue
    fi

    # Check if already recorded (by full hash)
    if grep -qF "${COMMIT_HASH}" "${CHANGELOG}" 2>/dev/null; then
        SKIPPED=$((SKIPPED + 1))
        continue
    fi

    # Extract info and append
    COMMIT_AUTHOR=$(git log -1 --format="%an" "${COMMIT_HASH}")
    COMMIT_DATE=$(git log -1 --format="%ai" "${COMMIT_HASH}")
    COMMIT_BODY=$(git log -1 --format="%b" "${COMMIT_HASH}")
    TAGS=$(echo "${COMMIT_MSG}" | grep -oE "${TAG_PATTERN}" | tr '\n' ' ' | sed 's/ $//')

    # Diff stats (handle first commit gracefully)
    DIFF_STAT=$(git diff --stat "${COMMIT_HASH}~1" "${COMMIT_HASH}" 2>/dev/null || echo "N/A")
    FILE_COUNT=$(echo "${DIFF_STAT}" | tail -1 | grep -oE '[0-9]+ file' | grep -oE '[0-9]+' || echo "?")
    INSERTIONS=$(echo "${DIFF_STAT}" | tail -1 | grep -oE '[0-9]+ insertion' | grep -oE '[0-9]+' || echo "0")
    DELETIONS=$(echo "${DIFF_STAT}" | tail -1 | grep -oE '[0-9]+ deletion' | grep -oE '[0-9]+' || echo "0")

    KEY_FILES=$(git diff --name-only "${COMMIT_HASH}~1" "${COMMIT_HASH}" 2>/dev/null \
        | grep -vE '(\.lock$|node_modules|\.log$|\.tmp$)' \
        | head -5 \
        | sed 's/^/  - /' \
        || echo "  - (unavailable)")

    COMMIT_SUMMARY=$(echo "${COMMIT_MSG}" | sed -E "s/\[(ARCH|FIX|CONFIG|BREAKING|SECURITY|REFACTOR)\]\s*//g")
    [ -z "${COMMIT_SUMMARY}" ] && COMMIT_SUMMARY="${COMMIT_MSG}"

    cat >> "${CHANGELOG}" << EOF

## ${COMMIT_DATE} ${TAGS} ${COMMIT_SUMMARY}
- **Commit:** \`${COMMIT_SHORT}\` (${COMMIT_HASH})
- **Author:** ${COMMIT_AUTHOR}
- **变更统计:** ${FILE_COUNT} files, +${INSERTIONS}, -${DELETIONS}
- **关键文件:**
${KEY_FILES}
EOF

    if [ -n "${COMMIT_BODY}" ]; then
        echo "- **详细说明:**" >> "${CHANGELOG}"
        echo "${COMMIT_BODY}" | sed 's/^/  > /' >> "${CHANGELOG}"
    fi

    echo "" >> "${CHANGELOG}"
    echo "---" >> "${CHANGELOG}"

    ADDED=$((ADDED + 1))
    echo "[$(date)] Added: ${COMMIT_SHORT} ${TAGS} ${COMMIT_SUMMARY}" | tee -a "${LOG_FILE}"

done < <(git log --since="${SINCE_DATE}" --format="%H" --reverse)

echo "[$(date)] Sync complete: ${ADDED} added, ${SKIPPED} already recorded" | tee -a "${LOG_FILE}"

# Clean up old logs (keep last 30)
ls -t "${MEMORY_DIR}/logs/changelog-sync-"*.log 2>/dev/null | tail -n +31 | xargs rm -f 2>/dev/null || true
