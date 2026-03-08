#!/usr/bin/env bash
# auto-skill-discovery.sh — 扫描scripts/目录，找出未技能化的脚本候选
# 可被cron定期调用: */30 * * * * /root/.openclaw/workspace/scripts/auto-skill-discovery.sh
set -euo pipefail

WORKSPACE="${WORKSPACE:-/root/.openclaw/workspace}"
SCRIPTS_DIR="$WORKSPACE/scripts"
SKILLS_DIR="$WORKSPACE/skills/public"
SIGNAL_DIR="$WORKSPACE/.skill-discovery-signals"
OUTPUT_FILE="${1:-/dev/stdout}"

mkdir -p "$SIGNAL_DIR"

# 收集已技能化的脚本（通过skills/public/*/index.sh中引用的脚本名）
declare -A SKILLIZED
for skill_dir in "$SKILLS_DIR"/*/; do
  [ -d "$skill_dir" ] || continue
  skill_name=$(basename "$skill_dir")
  # 技能名通常和脚本名一致（去掉.sh）
  SKILLIZED["$skill_name"]=1
  # 也检查index.sh中是否引用了某个scripts/*.sh
  if [ -f "$skill_dir/index.sh" ]; then
    while IFS= read -r ref; do
      ref_base=$(basename "$ref" .sh 2>/dev/null || true)
      [ -n "$ref_base" ] && SKILLIZED["$ref_base"]=1
    done < <(grep -oP 'scripts/\K[^"'\''/ ]+\.sh' "$skill_dir/index.sh" 2>/dev/null || true)
  fi
done

# 扫描scripts/目录
CANDIDATES=()
for script in "$SCRIPTS_DIR"/*.sh; do
  [ -f "$script" ] || continue
  script_name=$(basename "$script" .sh)
  
  # 跳过明显的工具/辅助脚本
  case "$script_name" in
    install-hooks|completion-handler|register-task|update-task) continue ;;
  esac
  
  # 检查是否已技能化
  if [ -z "${SKILLIZED[$script_name]:-}" ]; then
    # 检查脚本大小（>10行的才值得技能化）
    lines=$(wc -l < "$script")
    if [ "$lines" -gt 10 ]; then
      # 提取脚本首行注释作为描述
      desc=$(head -5 "$script" | grep '^#' | grep -v '^#!' | head -1 | sed 's/^# *//' || echo "无描述")
      CANDIDATES+=("$script_name|$script|$lines|$desc")
    fi
  fi
done

# 输出结果
if [ ${#CANDIDATES[@]} -eq 0 ]; then
  echo "✅ 所有脚本均已技能化，无候选。"
  exit 0
fi

{
  echo "# 未技能化脚本候选列表"
  echo ""
  echo "扫描时间: $(date '+%Y-%m-%d %H:%M:%S')"
  echo "脚本目录: $SCRIPTS_DIR"
  echo "已技能化数量: ${#SKILLIZED[@]}"
  echo "候选数量: ${#CANDIDATES[@]}"
  echo ""
  echo "| 脚本名 | 行数 | 描述 | 建议技能名 | 理由 |"
  echo "|--------|------|------|-----------|------|"
  for entry in "${CANDIDATES[@]}"; do
    IFS='|' read -r name path lines desc <<< "$entry"
    echo "| $name | $lines | $desc | $name | 独立可复用脚本，>10行，有明确功能 |"
  done
} > >(if [ "$OUTPUT_FILE" = "/dev/stdout" ]; then cat; else tee "$OUTPUT_FILE"; fi)

# 写入信号文件供后续处理
echo "${#CANDIDATES[@]} candidates found at $(date)" > "$SIGNAL_DIR/last-scan-result.txt"
for entry in "${CANDIDATES[@]}"; do
  IFS='|' read -r name _ _ _ <<< "$entry"
  echo "$name" >> "$SIGNAL_DIR/last-scan-result.txt"
done

echo ""
echo "📌 信号文件已写入: $SIGNAL_DIR/last-scan-result.txt"
