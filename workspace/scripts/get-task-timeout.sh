#!/bin/bash
# get-task-timeout.sh — timeout分级配置
# 用法: get-task-timeout.sh <任务类型或label>
# 输出: 对应的timeout秒数
#
# 分级方案:
#   light  (QA/验证/scout/reviewer)     = 300s  (5min)
#   standard (开发/分析/coder/writer)    = 600s  (10min)
#   heavy  (评测/批量/eval/batch/research) = 1200s (20min)
#
# ⚠️ 不修改openclaw.json！timeout通过spawn的runTimeoutSeconds参数传入。

INPUT="${1:-standard}"
INPUT_LOWER=$(echo "$INPUT" | tr '[:upper:]' '[:lower:]')

# 精确匹配类型名
case "$INPUT_LOWER" in
  light|lite|qa|quick)
    echo 300; exit 0 ;;
  heavy|batch|eval|evaluation|long)
    echo 1200; exit 0 ;;
  standard|normal|default)
    echo 600; exit 0 ;;
esac

# 关键词模糊匹配（从label推断）
if echo "$INPUT_LOWER" | grep -qE 'review|verify|check|qa|validate|scout|smoke|probe|health'; then
  echo 300; exit 0
fi

if echo "$INPUT_LOWER" | grep -qE 'eval|bench|batch|regression|research|harvest|evolution|report|survey'; then
  echo 1200; exit 0
fi

# 默认: standard
echo 600
