#!/usr/bin/env bash
# MemOS记忆备份到Git — 每天2次自动执行
# 用途：容器重启/快照回滚后可从git恢复全部记忆
set -euo pipefail

WORKSPACE="/root/.openclaw/workspace"
DB="/root/.openclaw/memos-local/memos.db"
DUMP="$WORKSPACE/backups/memos-dump.sql"
STATS="$WORKSPACE/backups/memos-stats.txt"
RECOVERY="$WORKSPACE/backups/README-RECOVERY.md"

cd "$WORKSPACE"

# 0. 检查数据库存在
if [ ! -f "$DB" ]; then
  echo "[ERROR] memos.db not found at $DB"
  exit 1
fi

# 1. WAL checkpoint — 确保所有写入落盘
sqlite3 "$DB" "PRAGMA wal_checkpoint(TRUNCATE);" 2>/dev/null || true

# 2. 完整SQL转储
sqlite3 "$DB" .dump > "$DUMP"
echo "[OK] dump: $(wc -c < "$DUMP") bytes"

# 3. 导出统计
sqlite3 "$DB" "SELECT count(*) as chunks, coalesce(sum(length(content)),0) as total_chars FROM chunks WHERE dedup_status IS NULL OR dedup_status != 'deprecated'" > "$STATS"
CHUNK_COUNT=$(sqlite3 "$DB" "SELECT count(*) FROM chunks WHERE dedup_status IS NULL OR dedup_status != 'deprecated'")
echo "dump_time: $(date '+%Y-%m-%d %H:%M:%S')" >> "$STATS"
echo "chunk_count: $CHUNK_COUNT" >> "$STATS"
echo "[OK] stats: $CHUNK_COUNT chunks"

# 4. 更新恢复文档中的时间戳
if [ -f "$RECOVERY" ]; then
  sed -i "s/^最后备份时间：.*/最后备份时间：$(date '+%Y-%m-%d %H:%M:%S')/" "$RECOVERY"
  sed -i "s/^记忆chunks数量：.*/记忆chunks数量：$CHUNK_COUNT/" "$RECOVERY"
fi

# 5. Git commit + push
git add backups/memos-dump.sql backups/memos-stats.txt backups/README-RECOVERY.md 2>/dev/null || true
if git diff --cached --quiet; then
  echo "[SKIP] no changes to commit"
  exit 0
fi
git commit -m "backup: MemOS memory dump ($CHUNK_COUNT chunks, $(date +%Y-%m-%d))"
git push origin main 2>/dev/null || git push 2>/dev/null || echo "[WARN] push failed, will retry next run"

echo "[DONE] MemOS backup committed and pushed"
