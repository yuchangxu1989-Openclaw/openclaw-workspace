#!/bin/bash
# 主Agent委派守卫 - 可被pre-commit或定期检查调用
# 检查最近的git diff中是否有主Agent直接写大文件的痕迹

GUARD_LOG="/root/.openclaw/workspace/logs/delegation-guard.log"
mkdir -p /root/.openclaw/workspace/logs

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 委派守卫检查执行" >> "$GUARD_LOG"

# 检查规则文件完整性
RULES_OK=true
for rule in rule.main-agent-delegation-001.json rule.doc-quality-gate-001.json; do
  if [ ! -f "/root/.openclaw/workspace/skills/isc-core/rules/$rule" ]; then
    echo "🚨 缺失规则: $rule" >> "$GUARD_LOG"
    RULES_OK=false
  fi
done

if $RULES_OK; then
  echo "✅ 所有委派守卫规则完整" >> "$GUARD_LOG"
fi

# 检查CAPABILITY-ANCHOR.md是否包含委派边界
if ! grep -q "主Agent行为边界" /root/.openclaw/workspace/CAPABILITY-ANCHOR.md 2>/dev/null; then
  echo "⚠️ CAPABILITY-ANCHOR.md缺少主Agent行为边界段落" >> "$GUARD_LOG"
fi

# 检查CAPABILITY-ANCHOR.md是否包含逃逸路径封堵
if ! grep -q "主Agent禁止操作清单" /root/.openclaw/workspace/CAPABILITY-ANCHOR.md 2>/dev/null; then
  echo "🚨 CAPABILITY-ANCHOR.md缺少主Agent禁止操作清单（7种逃逸路径未封堵）" >> "$GUARD_LOG"
fi

# === 新增：扫描最近session历史，统计exec调用次数 ===
SESSION_LOG_DIR="/root/.openclaw/logs"
RECENT_LOGS=$(find "$SESSION_LOG_DIR" -name "*.log" -mmin -60 2>/dev/null | head -5)

EXEC_WARN=false
for logfile in $RECENT_LOGS; do
  # 统计单个日志文件中的exec调用次数
  EXEC_COUNT=$(grep -c '"tool":"exec"\|"name":"exec"\|tool.*exec\|"action":"exec"' "$logfile" 2>/dev/null || echo 0)
  if [ "$EXEC_COUNT" -ge 5 ]; then
    echo "🚨 exec过多警告: $logfile 中发现 $EXEC_COUNT 次exec调用（阈值5）" >> "$GUARD_LOG"
    EXEC_WARN=true
  fi
done

# 扫描openclaw session历史目录
HISTORY_DIR="/root/.openclaw/sessions"
if [ -d "$HISTORY_DIR" ]; then
  RECENT_SESSIONS=$(find "$HISTORY_DIR" -name "*.json" -mmin -30 2>/dev/null | head -5)
  for sess in $RECENT_SESSIONS; do
    EXEC_COUNT=$(grep -c '"exec"' "$sess" 2>/dev/null || echo 0)
    if [ "$EXEC_COUNT" -ge 5 ]; then
      echo "🚨 exec过多警告: session $sess 中发现 $EXEC_COUNT 次exec调用" >> "$GUARD_LOG"
      EXEC_WARN=true
    fi
  done
fi

# 检查修改型命令使用
for logfile in $RECENT_LOGS; do
  SED_COUNT=$(grep -c 'sed -i\|tee \| > \| >> ' "$logfile" 2>/dev/null || echo 0)
  if [ "$SED_COUNT" -ge 1 ]; then
    echo "🚨 修改型命令警告: $logfile 中发现 $SED_COUNT 次sed/tee/重定向" >> "$GUARD_LOG"
    EXEC_WARN=true
  fi
done

if ! $EXEC_WARN; then
  echo "✅ 未发现主Agent exec过多或修改型命令滥用" >> "$GUARD_LOG"
fi

echo "--- 检查完成 ---" >> "$GUARD_LOG"
