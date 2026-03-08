#!/bin/bash
# 文档质量门禁 - 感知探针
# 被主Agent在每次派发文档任务前调用，输出应该走的流程

TASK_DESC="$1"
LOG="/root/.openclaw/workspace/logs/doc-quality-gate.log"
mkdir -p /root/.openclaw/workspace/logs

# 检测是否是重大文档任务
is_major_doc() {
  echo "$TASK_DESC" | grep -qiE '飞书文档|feishu_doc.*write|重要报告|架构方案|评测基线|方案设计|决策文档'
}

if is_major_doc; then
  echo "🚨 QUALITY_GATE_REQUIRED"
  echo "此任务触发文档质量门禁，必须走 写→审→改 流水线"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] TRIGGERED: $TASK_DESC" >> "$LOG"
else
  echo "✅ QUALITY_GATE_SKIP"
  echo "此任务无需质量门禁"
fi
