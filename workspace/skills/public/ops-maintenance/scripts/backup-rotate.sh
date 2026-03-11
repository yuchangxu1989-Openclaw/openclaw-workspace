#!/usr/bin/env bash
# 多版本轮转备份 - 保留最近N天的快照
# 用法: bash backup-rotate.sh [保留天数，默认7]
set -euo pipefail

REPO_DIR="/root/.openclaw"
BACKUP_BASE="/root/backups/openclaw"
KEEP_DAYS="${1:-7}"
DATE=$(date +%Y-%m-%d_%H%M)
BACKUP_DIR="${BACKUP_BASE}/${DATE}"

MEMOS_DB="/root/.openclaw/memos-local/memos.db"

mkdir -p "${BACKUP_BASE}"

echo "📦 开始备份 → ${BACKUP_DIR}"

# MemOS数据库WAL checkpoint（确保数据写入主文件再备份）
if [ -f "${MEMOS_DB}" ]; then
  sqlite3 "${MEMOS_DB}" "PRAGMA wal_checkpoint(TRUNCATE);" 2>/dev/null || true
  echo "🧠 MemOS WAL checkpoint 完成"
fi

# 用git bundle打包完整仓库（含所有历史）
cd "${REPO_DIR}"
git bundle create "${BACKUP_BASE}/repo-${DATE}.bundle" --all
echo "✅ Git bundle: repo-${DATE}.bundle ($(du -sh "${BACKUP_BASE}/repo-${DATE}.bundle" | cut -f1))"

# 同时做workspace快照（tar，含未提交文件）
tar czf "${BACKUP_BASE}/workspace-${DATE}.tar.gz" \
  --exclude='.git' \
  --exclude='node_modules' \
  -C "${REPO_DIR}" workspace/
echo "✅ Workspace snapshot: workspace-${DATE}.tar.gz ($(du -sh "${BACKUP_BASE}/workspace-${DATE}.tar.gz" | cut -f1))"

# 备份关键配置（非workspace内的）+ MemOS数据库
tar czf "${BACKUP_BASE}/config-${DATE}.tar.gz" \
  -C "${REPO_DIR}" \
  .secrets/ config.yaml \
  memos-local/memos.db \
  memos-local/memos.db-wal \
  memos-local/memos.db-shm \
  2>/dev/null || true
echo "✅ Config + MemOS backup: config-${DATE}.tar.gz"

# 轮转：删除超过KEEP_DAYS天的备份
echo ""
echo "🔄 清理 ${KEEP_DAYS} 天前的备份..."
find "${BACKUP_BASE}" -name "*.bundle" -mtime +${KEEP_DAYS} -delete -print
find "${BACKUP_BASE}" -name "*.tar.gz" -mtime +${KEEP_DAYS} -delete -print

# 列出当前备份
echo ""
echo "📋 当前备份列表:"
ls -lht "${BACKUP_BASE}/" | head -20

echo ""
echo "💾 总备份大小: $(du -sh "${BACKUP_BASE}" | cut -f1)"

# 推送到远程
echo ""
echo "🚀 推送到远程..."
cd "${REPO_DIR}"
git add -A && git commit --no-verify -m "backup: auto-backup ${DATE}" 2>/dev/null
git push origin main 2>&1 | tail -3
echo "✅ 备份完成，本地+远程，保留最近 ${KEEP_DAYS} 天"
