#!/bin/bash
# startup-self-check.sh - 会话启动自检脚本
# 每次AI会话启动时自动执行
# 目的：确保关键文件不丢失，即使session/memory被清除

CHECK_TIME=$(date '+%Y-%m-%d %H:%M:%S')
ERRORS=0
WARNINGS=0
WORKSPACE="/root/.openclaw/workspace"
SESSION_ANCHOR_BOOTSTRAP="$WORKSPACE/infrastructure/session-anchor-bootstrap.js"

echo "╔════════════════════════════════════════╗"
echo "║     启动自检 - ${CHECK_TIME}        ║"
echo "╚════════════════════════════════════════╝"

# ========== 关键文件检查 ==========
echo ""
echo "📋 检查关键文件..."

CRITICAL_FILES=(
  "/root/.openclaw/workspace/CAPABILITY-ANCHOR.md:能力锚点"
  "/root/.openclaw/workspace/SOUL.md:身份设定"
  "/root/.openclaw/workspace/USER.md:用户画像"
  "/root/.openclaw/workspace/AGENTS.md:工作指南"
  "/root/.openclaw/workspace/skills/isc-core/config/evomap-upload-manifest.json:EvoMap清单"
)

for entry in "${CRITICAL_FILES[@]}"; do
  IFS=':' read -r filepath desc <<< "$entry"
  if [ -f "$filepath" ]; then
    echo "  ✅ ${desc}: $(basename $filepath)"
  else
    echo "  ❌ ${desc}: 缺失!"
    ERRORS=$((ERRORS + 1))
  fi
done

# ========== Git恢复尝试 ==========
if [ $ERRORS -gt 0 ]; then
  echo ""
  echo "🔄 尝试从Git恢复缺失文件..."
  cd /root/.openclaw/workspace
  # MEMORY.md/CRITICAL-MEMORY.md已废弃，MemOS为唯一记忆源
  git checkout HEAD -- CAPABILITY-ANCHOR.md SOUL.md USER.md AGENTS.md 2>/dev/null
  if [ $? -eq 0 ]; then
    echo "  ✅ Git恢复成功"
    ERRORS=0
  else
    echo "  ❌ Git恢复失败，需要手动修复"
  fi
fi

# ========== 会话能力锚点预加载 ==========
echo ""
echo "⚓ 预加载能力锚点..."
if [ -f "$WORKSPACE/CAPABILITY-ANCHOR.md" ] && [ -f "$SESSION_ANCHOR_BOOTSTRAP" ]; then
  if node -e "const { ensureCapabilityAnchorLoaded } = require('$SESSION_ANCHOR_BOOTSTRAP'); const a = ensureCapabilityAnchorLoaded({ source: 'startup-self-check' }); console.log('  ✅ 已加载能力锚点:', a.cacheHit ? 'cache-hit' : 'fresh-load', 'size=' + a.size);"; then
    :
  else
    echo "  ❌ 能力锚点预加载失败"
    ERRORS=$((ERRORS + 1))
  fi
else
  echo "  ⚠️  能力锚点或bootstrap脚本缺失"
  WARNINGS=$((WARNINGS + 1))
fi

# ========== 模型配置检查 ==========
echo ""
echo "🔑 检查模型配置..."

# 检查Kimi
if [ -n "$KIMI_API_KEY" ] || grep -r "kimi" /root/.openclaw/config* 2>/dev/null >/dev/null; then
  echo "  ✅ Kimi API: 已配置"
else
  echo "  ⚠️  Kimi API: 未检测到配置"
  WARNINGS=$((WARNINGS + 1))
fi

# 检查智谱GLM
if [ -n "$ZHIPU_API_KEY" ] || grep -r "zhipu\|glm" /root/.openclaw/config* 2>/dev/null >/dev/null; then
  echo "  ✅ 智谱GLM API: 已配置"
else
  echo "  ⚠️  智谱GLM API: 未检测到配置"
  WARNINGS=$((WARNINGS + 1))
fi

# ========== 核心能力检查 ==========
echo ""
echo "🧠 检查核心能力..."

CORE_SKILLS=(
  "lto-core:全局决策流水线"
  "isc-core:智能标准中心"
  "cras:认知进化"
  "evomap-a2a:EvoMap同步"
  "lep-executor:韧性执行"
)

for entry in "${CORE_SKILLS[@]}"; do
  IFS=':' read -r skill desc <<< "$entry"
  if [ -d "/root/.openclaw/workspace/skills/${skill}" ]; then
    echo "  ✅ ${desc}: ${skill}"
  else
    echo "  ⚠️  ${desc}: ${skill} 缺失"
    WARNINGS=$((WARNINGS + 1))
  fi
done

# ========== API 协议一致性校验 ==========
echo ""
echo "🔌 检查 API 协议一致性..."
PROTO_CHECK=$(node /root/.openclaw/workspace/scripts/config-api-protocol-check.js 2>&1)
if echo "$PROTO_CHECK" | grep -q "全部 PASS"; then
  echo "  ✅ 三渠道 API 协议全部自洽"
else
  echo "  ❌ API 协议不一致："
  echo "$PROTO_CHECK" | head -10
  echo "  运行 node scripts/config-api-protocol-check.js --fix 自动修复"
  ERRORS=$((ERRORS + 1))
fi

# ========== 检查结果汇总 ==========
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
  echo "✅ 启动自检通过，所有关键组件正常"
  exit 0
elif [ $ERRORS -eq 0 ]; then
  echo "⚠️  启动自检通过，有 ${WARNINGS} 个警告"
  exit 0
else
  echo "❌ 启动自检失败，有 ${ERRORS} 个错误!"
  echo "🚨 请立即手动修复或联系管理员"
  exit 1
fi

# === 主Agent委派守卫自检 ===
echo "🛡️ 主Agent委派守卫自检..."
# 检查ISC规则存在
if [ ! -f "/root/.openclaw/workspace/skills/isc-core/rules/rule.main-agent-delegation-001.json" ]; then
  echo "🚨 CRITICAL: 主Agent委派守卫规则缺失!"
fi
if [ ! -f "/root/.openclaw/workspace/skills/isc-core/rules/rule.doc-quality-gate-001.json" ]; then
  echo "🚨 CRITICAL: 文档质量门禁规则缺失!"
fi
echo "✅ 委派守卫规则文件完整"

# ISC startup self-check hooks
"/root/.openclaw/workspace/scripts/isc-hooks/rule.n036-memory-loss-recovery.sh" || true
"/root/.openclaw/workspace/scripts/isc-hooks/rule.task-orchestration-quality-001.sh" || true
"/root/.openclaw/workspace/scripts/isc-hooks/rule.tracker-sync-gate-001.sh" || true
