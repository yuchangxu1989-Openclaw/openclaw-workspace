#!/usr/bin/env bash
# eval-mining/index.sh — 一键评测用例挖掘入口
# 用法: bash index.sh <session日志目录> <目标条数> [并发数]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG="$SCRIPT_DIR/config.json"

SESSION_DIR="${1:?用法: bash index.sh <session日志目录> <目标条数> [并发数]}"
TARGET_COUNT="${2:?请指定目标条数}"
MAX_CONCURRENT="${3:-$(jq -r '.max_concurrent' "$CONFIG")}"

BATCH_SIZE="$(jq -r '.batch_size' "$CONFIG")"
LINES_PER_BATCH="$(jq -r '.lines_per_batch' "$CONFIG")"
OUTPUT_DIR="$(jq -r '.output_dir' "$CONFIG")"
V3_DOC="$(jq -r '.v3_standard_doc' "$CONFIG")"

mkdir -p "$OUTPUT_DIR"

echo "=== 评测用例挖掘 ==="
echo "日志目录: $SESSION_DIR"
echo "目标条数: $TARGET_COUNT"
echo "并发上限: $MAX_CONCURRENT"
echo "每批条数: $BATCH_SIZE"
echo "每批行数: $LINES_PER_BATCH"
echo ""

# 计算分片
batch_id=0
spawn_commands=()

for session_file in "$SESSION_DIR"/*.{log,jsonl,txt,md} 2>/dev/null; do
  [ -f "$session_file" ] || continue
  total_lines=$(wc -l < "$session_file")
  num_batches=$(( (total_lines + LINES_PER_BATCH - 1) / LINES_PER_BATCH ))
  
  echo "文件: $session_file ($total_lines 行 → $num_batches 路)"
  
  for ((i=0; i<num_batches; i++)); do
    start_line=$(( i * LINES_PER_BATCH + 1 ))
    end_line=$(( (i + 1) * LINES_PER_BATCH ))
    [ $end_line -gt $total_lines ] && end_line=$total_lines
    
    output_file="${OUTPUT_DIR}/mined-${batch_id}.json"
    
    # 生成 spawn task prompt
    task="读取文件 ${session_file} 的第 ${start_line} 到 ${end_line} 行。从中挖掘恰好10条C2意图识别评测用例，格式遵循V3标准（参考 feishu_doc token ${V3_DOC}）。用 write 工具将结果写入 ${output_file}，JSON数组格式，每条包含 input/expected_intent/context 字段。一次性完成不要等确认。"
    
    spawn_commands+=("$task|$output_file")
    batch_id=$((batch_id + 1))
  done
done

total_batches=${#spawn_commands[@]}
echo ""
echo "总分片数: $total_batches"
echo "预计产出: $((total_batches * BATCH_SIZE)) 条（去重前）"
echo ""

# 输出 spawn 指令列表
echo "=== Spawn 指令列表 ==="
for ((i=0; i<total_batches; i++)); do
  IFS='|' read -r task output_file <<< "${spawn_commands[$i]}"
  echo "--- 批次 $i ---"
  echo "Task: $task"
  echo "Output: $output_file"
  echo ""
done

echo "=== 指令生成完毕 ==="
echo "请使用 sessions_spawn 逐批调度（并发上限 $MAX_CONCURRENT）"
echo ""
echo "完成后运行验证:"
echo "  bash $SCRIPT_DIR/tests/test-mining.sh $OUTPUT_DIR"
echo ""
echo "去重:"
echo "  bash $SCRIPT_DIR/scripts/dedup-eval-cases.sh $OUTPUT_DIR"
