#!/usr/bin/env bash
# skill-creator-addon — 技能创建后置步骤
# ISC-SKILL-POST-CREATION-GUARD-001
#
# 用法:
#   bash index.sh <skill-name> <skill-path> [trigger-keywords]
#
# 执行4个强制后置步骤:
#   1. 注册能力锚点 → CAPABILITY-ANCHOR.md
#   2. 创建ISC意图路由规则 → isc-core/rules/
#   3. 验证SKILL.md有触发条件声明
#   4. grep验证注册成功
set -euo pipefail

SKILL_NAME="${1:?Usage: index.sh <skill-name> <skill-path> [trigger-keywords]}"
SKILL_PATH="${2:?Usage: index.sh <skill-name> <skill-path> [trigger-keywords]}"
TRIGGER_KEYWORDS="${3:-}"

ANCHOR_FILE="/root/.openclaw/workspace/CAPABILITY-ANCHOR.md"
RULES_DIR="/root/.openclaw/workspace/skills/isc-core/rules"
WORKSPACE="/root/.openclaw/workspace"

ERRORS=()
STEPS_OK=0

echo "╔══════════════════════════════════════════════════════╗"
echo "║  skill-creator-addon: 后置步骤检查                    ║"
echo "║  技能: $SKILL_NAME"
echo "╚══════════════════════════════════════════════════════╝"

# ── Step 1: 注册能力锚点 ─────────────────────────────────────────────────────
echo ""
echo "▶ Step 1/4: 注册能力锚点 (CAPABILITY-ANCHOR.md)"

if grep -q "$SKILL_NAME" "$ANCHOR_FILE" 2>/dev/null; then
  echo "  ✅ 已存在于 CAPABILITY-ANCHOR.md"
  STEPS_OK=$((STEPS_OK + 1))
else
  echo "  ⚠️  未找到，正在注册..."
  # 确定技能描述
  local_skill_md="${SKILL_PATH}/SKILL.md"
  DESCRIPTION="$SKILL_NAME skill"
  if [ -f "$local_skill_md" ]; then
    # 从SKILL.md提取description
    DESC_LINE=$(grep -m1 'description:' "$local_skill_md" 2>/dev/null || true)
    if [ -n "$DESC_LINE" ]; then
      DESCRIPTION=$(echo "$DESC_LINE" | sed 's/^.*description:\s*//')
    fi
  fi

  # 追加到CAPABILITY-ANCHOR.md
  cat >> "$ANCHOR_FILE" <<EOF

### $SKILL_NAME
- **描述**: $DESCRIPTION
- **触发词**: ${TRIGGER_KEYWORDS:-"(需手动配置)"}
- **技能路径**: ${SKILL_PATH#$WORKSPACE/}
EOF
  
  if grep -q "$SKILL_NAME" "$ANCHOR_FILE"; then
    echo "  ✅ 注册成功"
    STEPS_OK=$((STEPS_OK + 1))
  else
    echo "  ❌ 注册失败"
    ERRORS+=("Step1: CAPABILITY-ANCHOR.md注册失败")
  fi
fi

# ── Step 2: 创建ISC意图路由规则 ──────────────────────────────────────────────
echo ""
echo "▶ Step 2/4: 创建ISC意图路由规则"

SAFE_NAME=$(echo "$SKILL_NAME" | tr '[:upper:]' '[:lower:]' | tr ' _' '-')
RULE_FILE="$RULES_DIR/intent-route-${SAFE_NAME}.json"

if [ -f "$RULE_FILE" ]; then
  echo "  ✅ 规则已存在: $(basename "$RULE_FILE")"
  STEPS_OK=$((STEPS_OK + 1))
else
  echo "  ⚠️  未找到，正在创建..."
  
  # 构建trigger keywords数组
  KEYWORDS_JSON="[]"
  if [ -n "$TRIGGER_KEYWORDS" ]; then
    KEYWORDS_JSON=$(echo "$TRIGGER_KEYWORDS" | tr ',' '\n' | jq -R . | jq -s .)
  fi

  cat > "$RULE_FILE" <<EOF
{
  "id": "intent-route-${SAFE_NAME}",
  "rule_name": "意图路由: ${SKILL_NAME}",
  "version": "1.0.0",
  "severity": "medium",
  "description": "将匹配意图路由到 ${SKILL_NAME} 技能",
  "trigger": {
    "events": ["intent.matched"],
    "conditions": {
      "keywords": ${KEYWORDS_JSON}
    }
  },
  "action": {
    "type": "route",
    "target_skill": "${SKILL_NAME}",
    "skill_path": "${SKILL_PATH#$WORKSPACE/}"
  }
}
EOF

  if [ -f "$RULE_FILE" ] && jq empty "$RULE_FILE" 2>/dev/null; then
    echo "  ✅ 规则创建成功: $(basename "$RULE_FILE")"
    STEPS_OK=$((STEPS_OK + 1))
  else
    echo "  ❌ 规则创建失败或JSON无效"
    ERRORS+=("Step2: ISC规则创建失败")
  fi
fi

# ── Step 3: 验证SKILL.md有触发条件声明 ───────────────────────────────────────
echo ""
echo "▶ Step 3/4: 验证SKILL.md触发条件"

SKILL_MD="${SKILL_PATH}/SKILL.md"
if [ ! -f "$SKILL_MD" ]; then
  echo "  ❌ SKILL.md不存在: $SKILL_MD"
  ERRORS+=("Step3: SKILL.md不存在")
else
  # 检查是否有触发条件相关内容
  if grep -qiE '触发|trigger|事件|event|条件|condition' "$SKILL_MD"; then
    echo "  ✅ SKILL.md包含触发条件声明"
    STEPS_OK=$((STEPS_OK + 1))
  else
    echo "  ⚠️  SKILL.md缺少触发条件，正在追加..."
    cat >> "$SKILL_MD" <<EOF

## 触发条件

- **关键词**: ${TRIGGER_KEYWORDS:-"(待配置)"}
- **事件**: intent.matched
- **ISC规则**: intent-route-${SAFE_NAME}
EOF
    echo "  ✅ 已追加触发条件声明"
    STEPS_OK=$((STEPS_OK + 1))
  fi
fi

# ── Step 4: 验证注册完整性 ───────────────────────────────────────────────────
echo ""
echo "▶ Step 4/4: 验证注册完整性"

VERIFY_OK=true
# 4a: CAPABILITY-ANCHOR.md
if ! grep -q "$SKILL_NAME" "$ANCHOR_FILE" 2>/dev/null; then
  echo "  ❌ CAPABILITY-ANCHOR.md 中未找到 $SKILL_NAME"
  VERIFY_OK=false
fi
# 4b: ISC规则
if [ ! -f "$RULE_FILE" ]; then
  echo "  ❌ ISC规则文件不存在"
  VERIFY_OK=false
fi
# 4c: SKILL.md触发条件
if [ -f "$SKILL_MD" ] && grep -qiE '触发|trigger' "$SKILL_MD"; then
  : # ok
else
  echo "  ❌ SKILL.md缺少触发条件"
  VERIFY_OK=false
fi

if [ "$VERIFY_OK" = true ]; then
  echo "  ✅ 全部验证通过"
  STEPS_OK=$((STEPS_OK + 1))
else
  ERRORS+=("Step4: 验证未通过")
fi

# ── 最终报告 ──────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════"
echo "  结果: ${STEPS_OK}/4 步骤完成"

if [ ${#ERRORS[@]} -eq 0 ]; then
  echo "  ✅ 技能后置步骤全部完成"
  echo "════════════════════════════════════════════════════════"
  # 输出机器可读JSON
  cat <<EOJSON
{"ok":true,"skill":"$SKILL_NAME","steps_ok":$STEPS_OK,"steps_total":4,"errors":[]}
EOJSON
  exit 0
else
  echo "  ❌ 存在错误:"
  for ERR in "${ERRORS[@]}"; do
    echo "    - $ERR"
  done
  echo "════════════════════════════════════════════════════════"
  ERR_JSON=$(printf '%s\n' "${ERRORS[@]}" | jq -R . | jq -s .)
  cat <<EOJSON
{"ok":false,"skill":"$SKILL_NAME","steps_ok":$STEPS_OK,"steps_total":4,"errors":$ERR_JSON}
EOJSON
  exit 1
fi
