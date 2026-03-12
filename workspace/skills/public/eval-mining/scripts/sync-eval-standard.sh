#!/usr/bin/env bash
# sync-eval-standard.sh - 检测评测标准是否变更（版本从isc-core/config动态读取）
# 用法: bash scripts/sync-eval-standard.sh
# 
# 工作原理:
#   1. 从 eval-standard-version.json 读取当前版本和doc_token
#   2. 假设调用方Agent已通过feishu_doc read拉取最新内容写入缓存文件
#   3. 计算内容 sha256 hash
#   4. 与旧hash对比
#   5. 变更则更新缓存 + 写信号文件

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"

# 动态读取评测标准版本配置
source "$REPO_ROOT/skills/isc-core/config/read-eval-version.sh"

HASH_FILE="$SKILL_DIR/.eval-standard-version-hash"
SIGNAL_DIR="$REPO_ROOT/.eval-mining-signals"
SIGNAL_FILE="$SIGNAL_DIR/standard-updated"
STANDARD_CACHE_FILE="$SKILL_DIR/.eval-standard-cache.md"
# 兼容旧路径
V4_CACHE_FILE="$SKILL_DIR/.v4-standard-cache.md"
if [ ! -f "$STANDARD_CACHE_FILE" ] && [ -f "$V4_CACHE_FILE" ]; then
  STANDARD_CACHE_FILE="$V4_CACHE_FILE"
fi

echo "=== ${EVAL_VERSION} 评测标准同步检测 ==="
echo "文档 Token: $EVAL_DOC_TOKEN"

# 此脚本假设调用方已将最新内容写入缓存文件
if [ ! -f "$STANDARD_CACHE_FILE" ]; then
  echo "ERROR: 未找到标准缓存文件 $STANDARD_CACHE_FILE"
  echo "请先通过 feishu_doc read (token=$EVAL_DOC_TOKEN) 获取内容并写入该文件"
  exit 1
fi

# 计算新hash
NEW_HASH=$(sha256sum "$STANDARD_CACHE_FILE" | awk '{print $1}')
echo "当前内容 hash: $NEW_HASH"

# 读取旧hash（兼容旧hash文件）
OLD_HASH=""
OLD_HASH_FILE="$SKILL_DIR/.v4-version-hash"
if [ -f "$HASH_FILE" ]; then
  OLD_HASH=$(cat "$HASH_FILE" 2>/dev/null || echo "")
elif [ -f "$OLD_HASH_FILE" ]; then
  OLD_HASH=$(cat "$OLD_HASH_FILE" 2>/dev/null || echo "")
fi
echo "缓存 hash: ${OLD_HASH:-<无缓存>}"

# 对比
if [ "$NEW_HASH" = "$OLD_HASH" ]; then
  echo ""
  echo "✅ 标准未变化，无需刷新评测集"
  exit 0
fi

# 标准已变更
echo ""
echo "⚠️  标准已变更！"
echo "  旧 hash: ${OLD_HASH:-<首次同步>}"
echo "  新 hash: $NEW_HASH"

# 更新hash缓存
echo "$NEW_HASH" > "$HASH_FILE"
echo "✅ hash 缓存已更新: $HASH_FILE"

# 写信号文件
mkdir -p "$SIGNAL_DIR"
cat > "$SIGNAL_FILE" <<EOF
{
  "event": "eval.standard.version.changed",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "old_hash": "${OLD_HASH:-null}",
  "new_hash": "$NEW_HASH",
  "version": "$EVAL_VERSION",
  "doc_token": "$EVAL_DOC_TOKEN"
}
EOF
echo "✅ 变更信号已写入: $SIGNAL_FILE"

# 输出变更摘要
echo ""
echo "=== 变更摘要 ==="
echo "${EVAL_VERSION}评测标准文档已更新，需要刷新评测集以对齐最新口径。"
echo "请运行: bash scripts/refresh-evalset.sh"
