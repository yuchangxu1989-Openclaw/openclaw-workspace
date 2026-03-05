#!/usr/bin/env bash
# =============================================================================
# check-rule-similarity.sh — ISC规则去重检查器
# =============================================================================
# 用途: 在新ISC规则写入rules/目录前，检测其与现有规则的语义相似度
# 方法: Jaccard similarity — 基于description + trigger.events + action.type的关键词集合重叠度
#
# 用法:
#   ./check-rule-similarity.sh <new_rule_file.json>
#
# 退出码:
#   0 = 无重复 (所有现有规则相似度 < 70%)
#   1 = 发现重复 (≥1条现有规则相似度 ≥ 70%)
#   2 = 参数错误或文件不存在
# =============================================================================

set -euo pipefail

THRESHOLD=70   # 百分比，整数
RULES_DIR="$(cd "$(dirname "$0")/../rules" && pwd)"
SCRIPT_NAME="$(basename "$0")"

# ---------- 颜色 ----------
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

usage() {
  echo "用法: $SCRIPT_NAME <new_rule_file.json>"
  echo ""
  echo "示例:"
  echo "  $SCRIPT_NAME rules/rule.my-new-rule-001.json"
  echo "  $SCRIPT_NAME /path/to/candidate.json"
  exit 2
}

# ---------- 参数检查 ----------
if [[ $# -lt 1 ]]; then
  echo -e "${RED}错误: 缺少参数${RESET}" >&2
  usage
fi

NEW_RULE_FILE="$1"

if [[ ! -f "$NEW_RULE_FILE" ]]; then
  echo -e "${RED}错误: 文件不存在: $NEW_RULE_FILE${RESET}" >&2
  exit 2
fi

# ---------- 工具检查 ----------
if ! command -v jq &>/dev/null; then
  echo -e "${RED}错误: 需要 jq，请先安装 (apt install jq / brew install jq)${RESET}" >&2
  exit 2
fi

# =============================================================================
# 文本提取函数
# 从规则JSON中提取用于相似度比较的文本字段，拼接为单一字符串
# =============================================================================
extract_text() {
  local file="$1"
  # 提取: description + rule_name + trigger.events数组 + action.type
  # 对missing字段容错，返回空字符串
  jq -r '
    [
      (.description // ""),
      (.rule_name // ""),
      ((.trigger.events // []) | join(" ")),
      ((.trigger.description // "")),
      (.action.type // ""),
      ((.metadata.tags // []) | join(" "))
    ] | join(" ")
  ' "$file" 2>/dev/null || echo ""
}

# =============================================================================
# 关键词集合构建
# 小写化 + 分词（按非字母数字分割）+ 去空词 + 去除停用词
# =============================================================================
STOPWORDS="the a an and or in on at to of for with is are was were be been"

build_word_set() {
  local text="$1"
  # 转小写，非字母数字替换为空格，split，去重，过滤停用词和短词
  local stopword_pattern
  stopword_pattern=$(echo "$STOPWORDS" | tr ' ' '\n' | sed 's/.*/^&$/' | tr '\n' '|' | sed 's/|$//')
  echo "$text" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '\n' | \
    awk 'length($0) > 2' | \
    { grep -vE "$stopword_pattern" 2>/dev/null || true; } | \
    sort -u
}

# =============================================================================
# Jaccard相似度计算
# jaccard(A, B) = |A ∩ B| / |A ∪ B|  (返回0-100整数百分比)
# =============================================================================
jaccard_similarity() {
  local set_a="$1"   # 换行分隔的词集合
  local set_b="$2"

  if [[ -z "$set_a" && -z "$set_b" ]]; then
    echo 0
    return
  fi

  local intersection union

  # 交集大小
  intersection=$(comm -12 \
    <(echo "$set_a" | sort -u) \
    <(echo "$set_b" | sort -u) | awk 'END{print NR}')

  # 并集大小
  union=$(printf '%s\n%s\n' "$set_a" "$set_b" | sort -u | awk 'NF>0 && length($0)>0 {c++} END{print c+0}')

  if [[ -z "$intersection" ]]; then intersection=0; fi
  if [[ -z "$union" ]]; then union=0; fi

  if [[ "$union" -eq 0 ]]; then
    echo 0
    return
  fi

  # 整数百分比（awk做浮点）
  echo "$intersection $union" | awk '{if($2==0) print 0; else printf "%d", ($1/$2)*100}'
}

# =============================================================================
# 主逻辑
# =============================================================================
echo -e "${BOLD}${CYAN}ISC规则去重检查器${RESET}"
echo -e "待检规则: ${BOLD}$NEW_RULE_FILE${RESET}"
echo -e "规则目录: $RULES_DIR"
echo -e "相似度阈值: ${BOLD}${THRESHOLD}%${RESET}"
echo "─────────────────────────────────────────────────────"

# 提取新规则文本
NEW_TEXT=$(extract_text "$NEW_RULE_FILE")
NEW_ID=$(jq -r '.id // "unknown"' "$NEW_RULE_FILE" 2>/dev/null || echo "unknown")
NEW_WORDS=$(build_word_set "$NEW_TEXT")

if [[ -z "$NEW_WORDS" ]]; then
  echo -e "${YELLOW}⚠️  警告: 新规则文本提取为空，无法比较（请检查JSON格式）${RESET}"
  exit 0
fi

# 收集结果
declare -a DUPLICATES=()
declare -a SCORES=()
SCANNED=0
HIGHEST_SCORE=0

# 遍历rules/目录（排除_deprecated子目录和自身）
while IFS= read -r -d '' existing_file; do
  # 跳过自身
  existing_abs="$(realpath "$existing_file")"
  new_abs="$(realpath "$NEW_RULE_FILE")"
  if [[ "$existing_abs" == "$new_abs" ]]; then
    continue
  fi

  SCANNED=$((SCANNED + 1))

  EXISTING_TEXT=$(extract_text "$existing_file")
  EXISTING_WORDS=$(build_word_set "$EXISTING_TEXT")
  EXISTING_ID=$(jq -r '.id // "unknown"' "$existing_file" 2>/dev/null || echo "unknown")

  SCORE=$(jaccard_similarity "$NEW_WORDS" "$EXISTING_WORDS")

  if [[ "$SCORE" -gt "$HIGHEST_SCORE" ]]; then
    HIGHEST_SCORE=$SCORE
  fi

  if [[ "$SCORE" -ge "$THRESHOLD" ]]; then
    DUPLICATES+=("$existing_file")
    SCORES+=("$SCORE")
    echo -e "  ${RED}⚠  相似度 ${SCORE}%${RESET} — $(basename "$existing_file")"
    echo -e "     ID: $EXISTING_ID"
  else
    # 显示接近阈值的（60-69%）作为参考
    if [[ "$SCORE" -ge 60 ]]; then
      echo -e "  ${YELLOW}~  相似度 ${SCORE}%${RESET} — $(basename "$existing_file") [接近阈值，仅供参考]"
    fi
  fi
done < <(find "$RULES_DIR" -maxdepth 1 -name "*.json" -print0 | sort -z)

echo "─────────────────────────────────────────────────────"
echo -e "扫描规则数: ${BOLD}$SCANNED${RESET} | 最高相似度: ${BOLD}${HIGHEST_SCORE}%${RESET}"

# ---------- 结果输出 ----------
if [[ "${#DUPLICATES[@]}" -gt 0 ]]; then
  echo ""
  echo -e "${RED}${BOLD}❌ 发现重复规则 (${#DUPLICATES[@]}条相似度≥${THRESHOLD}%)${RESET}"
  echo ""
  echo -e "${BOLD}相似规则列表（供人工决策）:${RESET}"
  for i in "${!DUPLICATES[@]}"; do
    echo -e "  $((i+1)). ${YELLOW}${DUPLICATES[$i]}${RESET}  [相似度: ${SCORES[$i]}%]"
  done
  echo ""
  echo -e "${BOLD}建议操作:${RESET}"
  echo "  (A) 复用现有规则，不创建新规则"
  echo "  (B) 修改现有规则以覆盖新需求"
  echo "  (C) 确认差异后强制创建（需在规则JSON中添加 \"justification\" 字段说明差异）"
  echo ""
  echo -e "${YELLOW}强制创建命令（需补充justification后执行）:${RESET}"
  echo "  cp $NEW_RULE_FILE $RULES_DIR/  # 添加justification字段后执行"
  echo ""
  # 输出JSON格式便于程序化处理
  echo "DEDUP_RESULT_JSON:"
  echo "{"
  echo "  \"status\": \"BLOCKED\","
  echo "  \"threshold\": $THRESHOLD,"
  echo "  \"highest_score\": $HIGHEST_SCORE,"
  echo "  \"duplicate_count\": ${#DUPLICATES[@]},"
  echo "  \"similar_rules\": ["
  for i in "${!DUPLICATES[@]}"; do
    COMMA=","
    if [[ $i -eq $((${#DUPLICATES[@]}-1)) ]]; then COMMA=""; fi
    echo "    {\"file\": \"${DUPLICATES[$i]}\", \"score\": ${SCORES[$i]}}${COMMA}"
  done
  echo "  ]"
  echo "}"
  exit 1
else
  echo ""
  echo -e "${GREEN}${BOLD}✅ 去重检查通过${RESET} — 无相似度≥${THRESHOLD}%的重复规则，允许创建"
  echo ""
  echo "DEDUP_RESULT_JSON:"
  echo "{"
  echo "  \"status\": \"APPROVED\","
  echo "  \"threshold\": $THRESHOLD,"
  echo "  \"highest_score\": $HIGHEST_SCORE,"
  echo "  \"duplicate_count\": 0,"
  echo "  \"similar_rules\": []"
  echo "}"
  exit 0
fi
