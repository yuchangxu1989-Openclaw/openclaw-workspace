# ops-maintenance — 运维维护技能

系统备份、会话清理、启动自检、内存治理、cron持久化、Git管理等运维维护功能集合。

## 包含脚本

### 核心备份
- backup.sh — 工作区备份
- backup-rotate.sh — 多版本轮转备份
- send-config-backup.sh — openclaw.json定时备份发飞书（cron: 每天10:00/22:00）
- memos-dump-to-git.sh — MemOS数据库SQL dump到git（cron: 每天04:00/16:00）
- pre-gateway-restart.sh — gateway重启前自动备份openclaw.json（保留最近10份）

### 灾难恢复
- emergency-rollback.sh — 一键回滚openclaw.json到最近备份 + restart gateway
- restore-cron.sh — 从git备份恢复crontab（容器重启后执行）

### Cron持久化
- save-cron.sh — 导出crontab到git自动备份（cron: 每小时:50）

### Git管理
- git-auto-push.sh — 检测未push的commit自动push（cron: 每5分钟）
- git-guardian.sh — 扫描未跟踪的重要文件(.js/.json/.md/.sh)

### 系统维护
- critical-files-check.sh — 关键文件存在性检查
- session-cleanup.sh — 会话文件清理
- session-cleanup-governor.sh — 会话清理治理
- startup-self-check.sh — 启动自检
- system-maintenance.sh — 系统维护
- thinking-content-cleanup.sh — thinking内容清理

### 工具
- key-management.sh — API Key统一管理
- daily-ops-report.js — 每日运维报告（Node.js）
- openai-with-proxy.sh — OpenAI代理调用
- spawn-glm5.sh — GLM5模型启动

## 脚本位置

所有脚本统一存放在 `skills/public/ops-maintenance/scripts/` 下。
原 `scripts/` 目录中的以下文件已替换为 symlink 指向本技能：
- save-cron.sh, restore-cron.sh, send-config-backup.sh, memos-dump-to-git.sh
- emergency-rollback.sh, pre-gateway-restart.sh, git-auto-push.sh, git-guardian.sh

crontab引用路径不变，通过symlink自动重定向。
