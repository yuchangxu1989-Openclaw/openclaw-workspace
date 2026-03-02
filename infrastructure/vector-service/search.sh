#!/bin/bash
# 语义搜索 - 智谱向量版
# 基于1024维智谱Embedding向量的语义相似度搜索

VECTOR_DIR="/root/.openclaw/workspace/infrastructure/vector-service/vectors"
SEARCH_SCRIPT="/root/.openclaw/workspace/infrastructure/vector-service/src/semantic-search.cjs"

QUERY="$1"
TOP_K="${2:-5}"
TYPE_FILTER="${3:-all}"  # all, skill, memory, knowledge, aeo

if [ -z "$QUERY" ]; then
    echo "用法: ./search.sh \"查询文本\" [返回数量] [类型过滤]"
    echo "  类型过滤: all (默认) | skill | memory | knowledge | aeo"
    exit 1
fi

echo "=== 智谱语义搜索 ==="
echo "查询: '$QUERY'"
echo "返回: $TOP_K 个结果"
echo "类型: $TYPE_FILTER"
echo ""

# 检查向量目录
if [ ! -d "$VECTOR_DIR" ]; then
    echo "错误: 向量目录不存在 $VECTOR_DIR"
    exit 1
fi

# 检查是否有向量文件
VECTOR_COUNT=$(ls "$VECTOR_DIR"/*.json 2>/dev/null | wc -l)
if [ "$VECTOR_COUNT" -eq 0 ]; then
    echo "⚠️  没有可用的向量文件"
    echo "请先运行 ./vectorize.sh 生成向量"
    exit 1
fi

# 调用Node.js搜索脚本
node "$SEARCH_SCRIPT" "$QUERY" "$TOP_K" "$TYPE_FILTER"
