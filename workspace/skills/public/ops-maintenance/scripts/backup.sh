#!/bin/bash
# OpenClaw Workspace Backup Script
# 持久化路径，不再放 /tmp

set -euo pipefail

BACKUP_DIR="/root/.openclaw/backups"
WORKSPACE="/root/.openclaw/workspace"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/workspace-${TIMESTAMP}.tar.gz"

MEMOS_DB="/root/.openclaw/memos-local/memos.db"

mkdir -p "${BACKUP_DIR}"

# MemOS数据库WAL checkpoint（确保数据写入主文件再备份）
if [ -f "${MEMOS_DB}" ]; then
  sqlite3 "${MEMOS_DB}" "PRAGMA wal_checkpoint(TRUNCATE);" 2>/dev/null || true
  echo "🧠 MemOS WAL checkpoint 完成"
fi

# Git bundle (包含完整历史)
cd "${WORKSPACE}"
git bundle create "${BACKUP_DIR}/workspace-${TIMESTAMP}.bundle" --all 2>/dev/null || true

# 关键文件打包 (排除 node_modules/.git 等)
tar czf "${BACKUP_FILE}" \
  -C /root/.openclaw \
  --exclude='workspace/.git' \
  --exclude='workspace/node_modules' \
  --exclude='workspace/skills/*/node_modules' \
  workspace/SOUL.md \
  workspace/USER.md \
  workspace/AGENTS.md \
  workspace/TOOLS.md \
  workspace/HEARTBEAT.md \
  workspace/memory/ \
  workspace/skills/isc-core/rules/ \
  workspace/skills/isc-core/config/ \
  workspace/skills/lto-core/ \
  workspace/scripts/ \
  memos-local/memos.db \
  memos-local/memos.db-wal \
  memos-local/memos.db-shm \
  2>/dev/null || true

# 清理7天前的旧备份
find "${BACKUP_DIR}" -name "workspace-*.tar.gz" -mtime +7 -delete 2>/dev/null || true
find "${BACKUP_DIR}" -name "workspace-*.bundle" -mtime +7 -delete 2>/dev/null || true

# 统计
BACKUP_SIZE=$(du -sh "${BACKUP_FILE}" 2>/dev/null | cut -f1)
BACKUP_COUNT=$(ls -1 "${BACKUP_DIR}"/workspace-*.tar.gz 2>/dev/null | wc -l)

echo "✅ 备份完成: ${BACKUP_FILE} (${BACKUP_SIZE})"
echo "📦 当前备份数: ${BACKUP_COUNT}"
echo "🕐 时间: $(date '+%Y-%m-%d %H:%M:%S')"
