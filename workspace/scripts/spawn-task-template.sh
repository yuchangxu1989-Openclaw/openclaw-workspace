#!/usr/bin/env bash
# spawn-task-template.sh — subagent任务模板：强制绝对路径
# 用法: spawn-task-template.sh <任务描述>
# 输出: 格式化后的task字符串（自动插入cd和绝对路径提醒）
#
# 功能:
#   - 自动在任务描述前插入 "cd /root/.openclaw/workspace" 和绝对路径提醒
#   - 输出格式化的task字符串，可直接用于sessions_spawn的task参数
#
# P0修复 — 对应RCA根因4：环境/路径/工作区隔离

set -euo pipefail

WORKSPACE="/root/.openclaw/workspace"

# ========== 参数校验 ==========
if [[ $# -lt 1 ]]; then
    echo "❌ 用法: $0 <任务描述>" >&2
    echo "   示例: $0 '修复eval数据集中的45条badcase'" >&2
    echo "" >&2
    echo "   也可通过stdin传入:" >&2
    echo "   echo '任务描述' | $0 -" >&2
    exit 1
fi

# 支持从stdin读取（参数为 - 时）
if [[ "$1" == "-" ]]; then
    TASK_DESC=$(cat)
else
    TASK_DESC="$*"
fi

# 校验任务描述非空
if [[ -z "${TASK_DESC// /}" ]]; then
    echo "❌ 任务描述不能为空" >&2
    exit 1
fi

# ========== 检测是否已包含绝对路径前缀 ==========
HAS_ABS_PATH=false
if echo "$TASK_DESC" | grep -q "/root/.openclaw/workspace"; then
    HAS_ABS_PATH=true
fi

# ========== 构建格式化task ==========
HEADER="**所有路径用绝对路径 ${WORKSPACE}/ 开头！**
cd ${WORKSPACE}"

# 如果原始描述中没有绝对路径，追加路径替换提醒
PATH_REMINDER=""
if ! $HAS_ABS_PATH; then
    PATH_REMINDER="
⚠️ 注意：所有文件读写操作必须使用绝对路径（${WORKSPACE}/...），禁止使用相对路径。"
fi

FORMATTED_TASK="${HEADER}
${PATH_REMINDER}
${TASK_DESC}"

# ========== 输出 ==========
echo "$FORMATTED_TASK"

# 摘要到stderr
DESC_PREVIEW="${TASK_DESC:0:60}"
if [[ ${#TASK_DESC} -gt 60 ]]; then
    DESC_PREVIEW="${DESC_PREVIEW}..."
fi
echo "[spawn-task-template] ✅ 已格式化任务: \"${DESC_PREVIEW}\"" >&2
if $HAS_ABS_PATH; then
    echo "[spawn-task-template] ℹ️  原始描述已包含绝对路径" >&2
else
    echo "[spawn-task-template] ℹ️  已自动插入绝对路径提醒" >&2
fi
