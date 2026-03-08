#!/bin/bash
# ============================================================
# 用户消息意图探针 v2 (LLM分类器版)
# ============================================================
# 用法: echo "用户消息" | bash intent-probe.sh
# 输出: JSON { intent_type, confidence, should_harvest, harvest_category }
#
# V2 架构:
#   用户消息 → 本地快速预过滤 → LLM意图分类(主) → 结构化结果
#
# Fallback: 若LLM不可用(无API Key / 网络超时)，降级到v1关键词版
# ============================================================

set -euo pipefail

MSG=$(cat)

# 空消息直接返回
if [ -z "$MSG" ]; then
    echo '{"intent_type":"empty","confidence":"high","should_harvest":false,"harvest_category":""}'
    exit 0
fi

# === V1 Fallback: 关键词匹配 (LLM不可用时降级) ===
v1_keyword_fallback() {
    local msg="$1"

    # 纠偏类
    CORRECTION_SIGNALS="有误|不对|错了|又犯|为什么不|不应该|badcase|Badcase|你又|没有做|漏了|重复了|不止是|致命|警醒|根因"
    # 否定类
    NEGATION_SIGNALS="不是|不要|别|停|取消|不行|拒绝"
    # 教学类
    TEACHING_SIGNALS="应该是|本质上|你要明白|记住|铁律|规则是"
    # 追问类
    QUESTION_SIGNALS="为什么|怎么回事|什么情况|怎么又"

    if echo "$msg" | grep -qE "$CORRECTION_SIGNALS"; then
        echo '{"intent_type":"correction","confidence":"medium","should_harvest":true,"harvest_category":"纠偏类","engine":"v1-keyword-fallback"}'
    elif echo "$msg" | grep -qE "$NEGATION_SIGNALS"; then
        echo '{"intent_type":"negation","confidence":"medium","should_harvest":true,"harvest_category":"否定类","engine":"v1-keyword-fallback"}'
    elif echo "$msg" | grep -qE "$TEACHING_SIGNALS"; then
        echo '{"intent_type":"teaching","confidence":"medium","should_harvest":true,"harvest_category":"教学类","engine":"v1-keyword-fallback"}'
    elif echo "$msg" | grep -qE "$QUESTION_SIGNALS"; then
        echo '{"intent_type":"root_cause_request","confidence":"medium","should_harvest":false,"harvest_category":"","engine":"v1-keyword-fallback"}'
    else
        echo '{"intent_type":"normal","confidence":"medium","should_harvest":false,"harvest_category":"","engine":"v1-keyword-fallback"}'
    fi
}

# === V2: LLM意图分类 (主路径) ===

# 读取API Key
source /root/.openclaw/.secrets/zhipu-keys.env 2>/dev/null || true
API_KEY="${ZHIPU_API_KEY_1:-}"

# 无Key则fallback到v1
if [ -z "$API_KEY" ]; then
    v1_keyword_fallback "$MSG"
    exit 0
fi

# JSON转义: 对消息中的特殊字符进行转义
escape_json() {
    local s="$1"
    s="${s//\\/\\\\}"      # 反斜杠
    s="${s//\"/\\\"}"      # 双引号
    s="${s//$'\n'/\\n}"    # 换行
    s="${s//$'\r'/\\r}"    # 回车
    s="${s//$'\t'/\\t}"    # Tab
    echo "$s"
}

ESCAPED_MSG=$(escape_json "$MSG")

# 构造系统prompt (覆盖ISC-EVAL-C2-AUTO-HARVEST-001定义的全部8种场景)
SYSTEM_PROMPT='你是意图分类器。对用户消息分类为以下类型之一：
1. correction - 纠偏/指出错误（如：有误、不对、错了、又犯了、搞反了、这里写错了）
2. negation - 否定/拒绝（如：不要、别、不是这样、取消、停）
3. repeated_failure - 反复未果/同一问题多次未解决（如：又出问题了、第N次了、怎么还是、又来了）
4. autonomy_lack - 自主性缺失指出/该自己发现却没发现（如：不应该我来提醒、为什么要我说、你自己应该注意到）
5. teaching - 教学/传授/传达规则（如：本质上是、你要明白、规则是、记住、铁律）
6. root_cause_request - 要求根因分析（如：为什么、根因是什么、根本原因）
7. quality_issue - 交付质量问题/半成品/格式错误（如：格式有误、不完整、残留、半成品、模板没填）
8. normal - 正常指令/问题/闲聊

分类原则：
- 若消息含纠偏、否定、反复未果、自主性缺失、教学、质量问题等信号，should_harvest=true
- root_cause_request 仅在纯粹追问根因时使用，should_harvest=false
- normal 为无特殊信号的普通消息，should_harvest=false
- confidence: high(明确信号)/medium(隐含信号)/low(不确定)

harvest_category映射：
- correction/negation/repeated_failure → 纠偏类
- autonomy_lack → 自主性缺失类
- teaching → 教学类
- quality_issue → 交付质量类
- root_cause_request/normal → 空

只输出纯JSON，不要markdown格式：{"intent_type":"xxx","confidence":"high/medium/low","should_harvest":true/false,"harvest_category":"纠偏类/否定类/自主性缺失类/教学类/交付质量类/空"}'

# 转义system prompt中的换行符用于JSON
SYSTEM_PROMPT_ESCAPED=$(echo "$SYSTEM_PROMPT" | jq -Rs '.')

# 调用智谱GLM-4-Flash
LLM_RESPONSE=$(curl -s --max-time 10 https://open.bigmodel.cn/api/paas/v4/chat/completions \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"model\": \"${INTENT_PROBE_MODEL:-glm-4-plus}\",
    \"messages\": [
      {\"role\": \"system\", \"content\": $SYSTEM_PROMPT_ESCAPED},
      {\"role\": \"user\", \"content\": \"$ESCAPED_MSG\"}
    ],
    \"temperature\": 0.1,
    \"max_tokens\": 150
  }" 2>/dev/null) || true

# 检查LLM响应是否有效
if [ -z "$LLM_RESPONSE" ]; then
    v1_keyword_fallback "$MSG"
    exit 0
fi

# 提取content字段
CONTENT=$(echo "$LLM_RESPONSE" | jq -r '.choices[0].message.content // empty' 2>/dev/null) || true

if [ -z "$CONTENT" ]; then
    # LLM返回异常，fallback
    v1_keyword_fallback "$MSG"
    exit 0
fi

# 清理可能的markdown代码块包裹
CONTENT=$(echo "$CONTENT" | sed 's/^```json//;s/^```//;s/```$//;' | tr -d '\n' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

# 验证是否为合法JSON并包含必要字段
if echo "$CONTENT" | jq -e '.intent_type and .confidence and (.should_harvest != null)' >/dev/null 2>&1; then
    # 合法JSON，添加engine标记后输出
    echo "$CONTENT" | jq -c '. + {"engine":"v2-llm"}'
else
    # JSON解析失败，fallback
    v1_keyword_fallback "$MSG"
    exit 0
fi
