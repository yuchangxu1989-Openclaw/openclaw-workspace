#!/bin/bash
# ISC规则创建钩子
# 任何规则文件创建后自动通知DTO

OPENCLAW_HOME="${OPENCLAW_HOME:-/root/.openclaw}"
WORKSPACE="${OPENCLAW_WORKSPACE:-$OPENCLAW_HOME/workspace}"
SKILLS_DIR="$WORKSPACE/skills"
ISC_CORE_DIR="$SKILLS_DIR/isc-core"

RULES_DIR="$ISC_CORE_DIR/rules"
STANDARDS_DIR="$ISC_CORE_DIR/standards"
DTO_EVENT_PATH="$SKILLS_DIR/dto-core/events/isc-rule-created.jsonl"

# 检查参数
if [ $# -lt 1 ]; then
    echo "用法: $0 <规则文件路径>"
    exit 1
fi

RULE_FILE="$1"

# 验证是ISC规则文件
if [[ ! "$RULE_FILE" =~ ^($RULES_DIR|$STANDARDS_DIR) ]]; then
    echo "不是ISC规则文件，跳过通知"
    exit 0
fi

# 提取规则信息
RULE_ID=$(grep -o '"id": *"[^"]*"' "$RULE_FILE" | head -1 | sed 's/.*"\([^"]*\)".*/\1/')
RULE_NAME=$(grep -o '"name": *"[^"]*"' "$RULE_FILE" | head -1 | sed 's/.*"\([^"]*\)".*/\1/')
RULE_DOMAIN=$(grep -o '"domain": *"[^"]*"' "$RULE_FILE" | head -1 | sed 's/.*"\([^"]*\)".*/\1/')

if [ -z "$RULE_ID" ]; then
    echo "无法提取规则ID，跳过通知"
    exit 0
fi

# 生成通知
RELATIVE_PATH="${RULE_FILE#$ISC_CORE_DIR/}"

NOTIFICATION=$(cat <<EOF
{"source":"isc-core","timestamp":"$(date -Iseconds)","event":"rule_created","data":{"ruleId":"$RULE_ID","ruleName":"$RULE_NAME","filePath":"$RULE_FILE","relativePath":"$RELATIVE_PATH","domain":"$RULE_DOMAIN"}}
EOF
)

# 写入DTO事件队列
echo "$NOTIFICATION" >> "$DTO_EVENT_PATH"

echo "[ISC→DTO] 已通知: $RULE_ID"
echo "  📍 位置: $RELATIVE_PATH"
