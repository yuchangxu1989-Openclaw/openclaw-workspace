#!/bin/bash
# critical-files-check.sh - 关键系统文件存在性检查
# 此脚本在OpenClaw启动时运行，确保关键文件不被遗忘

EVOMAP_MANIFEST="/root/.openclaw/workspace/skills/isc-core/config/evomap-upload-manifest.json"
MEMORY_FILE="/root/.openclaw/workspace/MEMORY.md"
SOUL_FILE="/root/.openclaw/workspace/SOUL.md"

ERRORS=0

echo "[Critical Files Check] $(date)"

# 检查EvoMap清单
if [ ! -f "$EVOMAP_MANIFEST" ]; then
    echo "❌ CRITICAL: EvoMap manifest missing!"
    echo "   Path: $EVOMAP_MANIFEST"
    echo "   Action: Restore from git or recreate"
    ERRORS=$((ERRORS + 1))
else
    echo "✅ EvoMap manifest exists"
    echo "   Allowed skills: $(grep -o '"allowed_skills"' "$EVOMAP_MANIFEST" | wc -l) entry"
fi

# 检查MEMORY.md
if [ ! -f "$MEMORY_FILE" ]; then
    echo "⚠️  WARNING: MEMORY.md missing"
    ERRORS=$((ERRORS + 1))
else
    echo "✅ MEMORY.md exists"
fi

# 检查SOUL.md
if [ ! -f "$SOUL_FILE" ]; then
    echo "⚠️  WARNING: SOUL.md missing"
    ERRORS=$((ERRORS + 1))
else
    echo "✅ SOUL.md exists"
fi

if [ $ERRORS -gt 0 ]; then
    echo ""
    echo "🚨 $ERRORS critical file(s) missing!"
    exit 1
fi

echo ""
echo "✅ All critical files present"
exit 0
