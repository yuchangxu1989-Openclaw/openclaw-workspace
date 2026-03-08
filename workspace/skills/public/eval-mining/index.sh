#!/usr/bin/env bash
# eval-mining/index.sh — 评测集生成与清洗统一入口
# 用法:
#   bash index.sh mine <session日志目录> <目标条数> [并发数]
#   bash index.sh clean [file_or_dir]
#   bash index.sh refresh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG="$SCRIPT_DIR/config.json"
MODE="${1:-mine}"

case "$MODE" in
  mine)
    shift
    SESSION_DIR="${1:?用法: bash index.sh mine <session日志目录> <目标条数> [并发数]}"
    TARGET_COUNT="${2:?请指定目标条数}"
    MAX_CONCURRENT="${3:-$(jq -r '.max_concurrent' "$CONFIG")}"

    BATCH_SIZE="$(jq -r '.batch_size' "$CONFIG")"
    LINES_PER_BATCH="$(jq -r '.lines_per_batch' "$CONFIG")"
    OUTPUT_DIR="$(jq -r '.output_dir' "$CONFIG")"
    V3_DOC="$(jq -r '.v3_standard_doc' "$CONFIG")"

    mkdir -p "$OUTPUT_DIR"

    echo "=== 评测用例挖掘 (mine) ==="
    echo "日志目录: $SESSION_DIR"
    echo "目标条数: $TARGET_COUNT"
    echo "并发上限: $MAX_CONCURRENT"
    echo "每批条数: $BATCH_SIZE"
    echo "每批行数: $LINES_PER_BATCH"
    echo ""

    batch_id=0
    spawn_commands=()

    shopt -s nullglob
    for session_file in "$SESSION_DIR"/*.log "$SESSION_DIR"/*.jsonl "$SESSION_DIR"/*.txt "$SESSION_DIR"/*.md; do
      total_lines=$(wc -l < "$session_file")
      num_batches=$(( (total_lines + LINES_PER_BATCH - 1) / LINES_PER_BATCH ))

      echo "文件: $session_file ($total_lines 行 → $num_batches 路)"

      for ((i=0; i<num_batches; i++)); do
        start_line=$(( i * LINES_PER_BATCH + 1 ))
        end_line=$(( (i + 1) * LINES_PER_BATCH ))
        [ $end_line -gt $total_lines ] && end_line=$total_lines

        output_file="${OUTPUT_DIR}/mined-${batch_id}.json"

        task="读取文件 ${session_file} 的第 ${start_line} 到 ${end_line} 行。从中挖掘恰好10条C2意图识别评测用例，格式遵循V3标准（参考 feishu_doc token ${V3_DOC}）。用 write 工具将结果写入 ${output_file}，JSON数组格式，每条包含 id/input/expected_output/category/difficulty/source 字段。一次性完成不要等确认。"

        spawn_commands+=("$task|$output_file")
        batch_id=$((batch_id + 1))
      done
    done

    total_batches=${#spawn_commands[@]}
    echo ""
    echo "总分片数: $total_batches"
    echo "预计产出: $((total_batches * BATCH_SIZE)) 条（去重前）"
    echo ""

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
    echo "完成后运行:"
    echo "  bash $SCRIPT_DIR/scripts/dedup-eval-cases.sh $OUTPUT_DIR"
    echo "  bash $SCRIPT_DIR/scripts/clean-eval-cases.sh $OUTPUT_DIR"
    ;;

  clean)
    shift
    # 检查是否有 --apply 标志
    CLEAN_MODE="scan"
    if [ "${1:-}" = "--apply" ]; then
      CLEAN_MODE="apply"
      shift
    fi
    TARGET="${1:-$(jq -r '.output_dir' "$CONFIG")}"

    echo "=== 评测集清洗 (clean, 模式: $CLEAN_MODE) ==="
    bash "$SCRIPT_DIR/scripts/clean-eval-cases.sh" "$CLEAN_MODE" "$TARGET"
    ;;

  refresh)
    OUTPUT_DIR="$(jq -r '.output_dir' "$CONFIG")"

    echo "=== 评测集刷新 (refresh) ==="
    echo ""
    echo "--- 第1步: 清洗全量评测集 ---"
    bash "$SCRIPT_DIR/scripts/clean-eval-cases.sh" "$OUTPUT_DIR"
    echo ""
    echo "--- 第2步: 去重 ---"
    bash "$SCRIPT_DIR/scripts/dedup-eval-cases.sh" "$OUTPUT_DIR"
    echo ""
    echo "--- 刷新完成 ---"
    echo "如需补缺，请运行: bash index.sh mine <session日志目录> <目标条数>"
    ;;

  *)
    echo "用法:"
    echo "  bash index.sh mine <session日志目录> <目标条数> [并发数]"
    echo "  bash index.sh clean [file_or_dir]"
    echo "  bash index.sh refresh"
    exit 1
    ;;
esac
