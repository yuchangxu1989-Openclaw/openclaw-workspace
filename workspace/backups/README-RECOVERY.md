# ⚠️ MemOS记忆恢复指南

> 如果你失忆了（容器重启 / 快照回滚 / 数据丢失），这里是你的记忆备份。
> 这个文件和备份由 `scripts/memos-dump-to-git.sh` 自动维护。

## 📦 备份文件说明

| 文件 | 说明 |
|------|------|
| `memos-dump.sql` | MemOS数据库的完整SQL转储（可直接恢复） |
| `memos-stats.txt` | 备份时的统计信息（chunks数量、总字符数） |

## 🔧 恢复步骤（3步）

### Step 1: 导入SQL转储

```bash
# 如果旧数据库损坏，先删除
rm -f /root/.openclaw/memos-local/memos.db /root/.openclaw/memos-local/memos.db-wal /root/.openclaw/memos-local/memos.db-shm

# 从备份恢复
sqlite3 /root/.openclaw/memos-local/memos.db < /root/.openclaw/workspace/backups/memos-dump.sql
```

### Step 2: 重启服务

```bash
systemctl restart openclaw-gateway
```

### Step 3: 验证恢复

```bash
node -e "const db=require('better-sqlite3')('/root/.openclaw/memos-local/memos.db');console.log('chunks:',db.prepare('SELECT count(*) as c FROM chunks').get().c)"
```

如果chunks数量与下方统计接近，恢复成功。

## 📊 备份统计

最后备份时间：2026-03-13 16:00:02
记忆chunks数量：3005

## ⏰ 自动备份频率

- Cron每天2次：04:00 和 16:00（GMT+8）
- 脚本路径：`scripts/memos-dump-to-git.sh`
- 日志路径：`/tmp/memos-dump.log`

---

## 🕐 Crontab恢复

容器重启后crontab会丢失，需要从git备份恢复：

```bash
bash /root/.openclaw/workspace/scripts/restore-cron.sh
```

备份文件位置：`infrastructure/cron/crontab-backup.txt`
自动备份脚本：`scripts/save-cron.sh`（每天03:00自动执行，变更自动commit+push）
