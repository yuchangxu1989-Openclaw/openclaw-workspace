#!/bin/bash
# 一键回滚openclaw.json到最近备份 + restart gateway
# 用法: bash emergency-rollback.sh [指定备份文件路径]
set -euo pipefail

CONF="/root/.openclaw/openclaw.json"
BACKUP_DIR="/root/.openclaw/backups"

if [ -n "${1:-}" ]; then
  # 指定了备份文件
  BACKUP="$1"
else
  # 自动找最近的备份
  BACKUP=$(ls -t "$BACKUP_DIR"/openclaw.json.backup-* 2>/dev/null | head -1)
fi

if [ -z "$BACKUP" ] || [ ! -f "$BACKUP" ]; then
  echo "❌ 找不到可用备份"
  echo "备份目录: $BACKUP_DIR"
  ls -la "$BACKUP_DIR"/ 2>/dev/null || echo "(目录为空)"
  exit 1
fi

echo "📦 使用备份: $BACKUP"
echo "📏 备份大小: $(wc -c < "$BACKUP") bytes"

# 先备份当前的（万一回滚错了还能恢复）
cp "$CONF" "$CONF.pre-rollback-$(date +%Y%m%d%H%M%S)"
echo "💾 当前配置已保存为 pre-rollback 备份"

# 回滚
cp "$BACKUP" "$CONF"
echo "✅ openclaw.json 已回滚"

# restart gateway
echo "🔄 正在重启 gateway..."
openclaw gateway restart 2>&1 || {
  echo "⚠️ gateway restart 可能需要几秒，请稍等后检查 openclaw status"
}

echo "🎉 回滚完成！"
