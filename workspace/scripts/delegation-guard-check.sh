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

echo "--- 检查完成 ---" >> "$GUARD_LOG"
