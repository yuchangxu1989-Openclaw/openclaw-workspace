#!/usr/bin/env bash
# auto-skill-discovery.sh — 扫描scripts/目录，找出未技能化的"野生脚本"
# 归属技能: SEEF (自我进化引擎)
# 三层闭合: 感知(扫描) + 认知(对比/告警) + 执行(JSON输出+告警)
set -euo pipefail

WORKSPACE="${WORKSPACE:-/root/.openclaw/workspace}"
SCRIPTS_DIR="$WORKSPACE/scripts"
SKILLS_DIR="$WORKSPACE/skills/public"
LOG_DIR="$WORKSPACE/logs"
OUTPUT_FILE="$LOG_DIR/wild-scripts-discovery.json"
PREV_FILE="$LOG_DIR/wild-scripts-discovery.prev.json"

mkdir -p "$LOG_DIR"

# ── 已收编脚本跳过列表 ──
# 薄封装、工具脚本、已明确收编的脚本
SKIP_LIST=(
  install-hooks
  completion-handler
  register-task
  update-task
  show-task-board
  show-task-board-feishu
  push-feishu-board
  auto-skill-discovery
)

is_skipped() {
  local name="$1"
  for skip in "${SKIP_LIST[@]}"; do
    [[ "$name" == "$skip" ]] && return 0
  done
  return 1
}

# ── 薄封装检测：前3行含"薄封装"则跳过 ──
is_thin_wrapper() {
  local file="$1"
  head -3 "$file" 2>/dev/null | grep -qi '薄封装' && return 0
  return 1
}

# ── 收集已技能化的脚本 ──
declare -A SKILLIZED
for skill_dir in "$SKILLS_DIR"/*/; do
  [ -d "$skill_dir" ] || continue
  skill_name=$(basename "$skill_dir")
  SKILLIZED["$skill_name"]=1
  # 检查index.sh/index.js中引用的脚本
  for idx in "$skill_dir"/index.{sh,js}; do
    [ -f "$idx" ] || continue
    while IFS= read -r ref; do
      ref_base=$(basename "$ref" 2>/dev/null)
      ref_base="${ref_base%.sh}"
      ref_base="${ref_base%.js}"
      [ -n "$ref_base" ] && SKILLIZED["$ref_base"]=1
    done < <(grep -oP 'scripts/\K[^"'\''/ ]+\.(sh|js)' "$idx" 2>/dev/null || true)
  done
done

# ── 保存上次结果用于对比 ──
if [ -f "$OUTPUT_FILE" ]; then
  cp "$OUTPUT_FILE" "$PREV_FILE"
fi

# ── 扫描 *.sh 和 *.js ──
CANDIDATES=()
for script in "$SCRIPTS_DIR"/*.sh "$SCRIPTS_DIR"/*.js; do
  [ -f "$script" ] || continue
  
  script_basename=$(basename "$script")
  # 去掉扩展名
  script_name="${script_basename%.sh}"
  script_name="${script_name%.js}"
  ext="${script_basename##*.}"
  
  # 跳过已收编
  is_skipped "$script_name" && continue
  
  # 跳过薄封装
  is_thin_wrapper "$script" && continue
  
  # 检查是否已技能化
  if [ -n "${SKILLIZED[$script_name]:-}" ]; then
    continue
  fi
  
  # >10行才值得技能化
  lines=$(wc -l < "$script")
  if [ "$lines" -le 10 ]; then
    continue
  fi
  
  # 提取描述
  desc=$(head -5 "$script" | grep '^[#/]' | grep -v '^#!' | head -1 | sed 's|^[#/ ]*||' || echo "无描述")
  
  CANDIDATES+=("{\"name\":\"$script_name\",\"file\":\"$script_basename\",\"ext\":\"$ext\",\"lines\":$lines,\"desc\":\"$desc\"}")
done

# ── 生成JSON输出 ──
NOW=$(date '+%Y-%m-%dT%H:%M:%S+08:00')
COUNT=${#CANDIDATES[@]}

{
  echo "{"
  echo "  \"scan_time\": \"$NOW\","
  echo "  \"scripts_dir\": \"$SCRIPTS_DIR\","
  echo "  \"skillized_count\": ${#SKILLIZED[@]},"
  echo "  \"wild_count\": $COUNT,"
  echo "  \"wild_scripts\": ["
  for i in "${!CANDIDATES[@]}"; do
    if [ "$i" -lt $((COUNT - 1)) ]; then
      echo "    ${CANDIDATES[$i]},"
    else
      echo "    ${CANDIDATES[$i]}"
    fi
  done
  echo "  ]"
  echo "}"
} > "$OUTPUT_FILE"

# ── 对比上次扫描，发现新增则告警 ──
if [ -f "$PREV_FILE" ] && [ "$COUNT" -gt 0 ]; then
  # 提取上次的脚本名列表
  prev_names=$(grep -oP '"name"\s*:\s*"\K[^"]+' "$PREV_FILE" 2>/dev/null | sort || true)
  curr_names=$(grep -oP '"name"\s*:\s*"\K[^"]+' "$OUTPUT_FILE" 2>/dev/null | sort || true)
  
  new_scripts=$(comm -13 <(echo "$prev_names") <(echo "$curr_names") 2>/dev/null || true)
  new_count=$(echo "$new_scripts" | grep -c . 2>/dev/null || echo 0)
  
  if [ "$new_count" -gt 0 ]; then
    echo "🚨 发现${new_count}个新野生脚本，需收编进技能："
    echo "$new_scripts" | sed 's/^/  - /'
  fi
elif [ ! -f "$PREV_FILE" ] && [ "$COUNT" -gt 0 ]; then
  echo "🚨 发现${COUNT}个新野生脚本，需收编进技能（首次扫描）"
fi

# ── 事件总线集成（断点①修复）──
EVENT_BUS_FILE="$WORKSPACE/infrastructure/event-bus/events.jsonl"
if [ "$COUNT" -gt 0 ] && [ -d "$(dirname "$EVENT_BUS_FILE")" ]; then
  # 构建脚本名列表用于事件payload
  SCRIPT_NAMES=$(grep -oP '"name"\s*:\s*"\K[^"]+' "$OUTPUT_FILE" 2>/dev/null | paste -sd',' | sed 's/,/","/g')
  EVENT_TS=$(date -Iseconds)

  # 断点① 修复：发现野生脚本时写事件到event-bus
  echo "{\"type\":\"skill.wild_script.discovered\",\"timestamp\":\"$EVENT_TS\",\"source\":\"auto-skill-discovery\",\"data\":{\"scripts\":[\"$SCRIPT_NAMES\"],\"count\":$COUNT,\"output_file\":\"$OUTPUT_FILE\"}}" >> "$EVENT_BUS_FILE"
  echo "📡 已发送 skill.wild_script.discovered 事件到事件总线 (count=$COUNT)"

  # 断点② 修复：触发SEEF discoverer，让两套发现机制衔接
  echo "{\"type\":\"seef.skill.discovered\",\"timestamp\":\"$EVENT_TS\",\"source\":\"auto-skill-discovery\",\"data\":{\"source\":\"auto-discovery\",\"wild_scripts_count\":$COUNT,\"scripts\":[\"$SCRIPT_NAMES\"],\"output_file\":\"$OUTPUT_FILE\"}}" >> "$EVENT_BUS_FILE"
  echo "📡 已发送 seef.skill.discovered 事件到事件总线 → SEEF creator"
fi

# ── 汇总输出 ──
if [ "$COUNT" -eq 0 ]; then
  echo "✅ 所有脚本均已技能化，无野生脚本。"
else
  echo "📋 野生脚本清单已写入: $OUTPUT_FILE (共${COUNT}个)"
fi
