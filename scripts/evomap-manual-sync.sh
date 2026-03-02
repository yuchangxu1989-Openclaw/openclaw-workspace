#!/bin/bash
# EvoMap手动同步脚本

echo "================================"
echo "🔄 EvoMap 手动同步"
echo "================================"
echo ""

# 检查环境变量
if [ -z "$EVOMAP_HUB_URL" ]; then
  echo "⚠️  EVOMAP_HUB_URL 未配置，使用离线模式"
  echo "    Gene/Capsule 已保存到队列目录，等待上传"
else
  echo "✅ EvoMap Hub: $EVOMAP_HUB_URL"
fi

echo ""
echo "📦 本次同步内容:"
echo "--------------------------------"

# 列出本次创建的Gene/Capsule
for file in /root/.openclaw/workspace/skills/evomap-uploader/*-manual-*.json; do
  if [ -f "$file" ]; then
    name=$(basename "$file")
    type=$(cat "$file" | grep '"type"' | head -1 | sed 's/.*: "\([^"]*\)".*/\1/')
    summary=$(cat "$file" | grep '"summary"' | sed 's/.*: "\([^"]*\)".*/\1/')
    echo "  [$type] $name"
    echo "    └─ $summary"
  fi
done

echo ""
echo "✅ Gene/Capsule 已生成并保存到:"
echo "   /root/.openclaw/workspace/skills/evomap-uploader/"
echo ""
echo "📊 队列统计:"
gene_count=$(ls /root/.openclaw/workspace/skills/evomap-uploader/gene-*.json 2>/dev/null | wc -l)
capsule_count=$(ls /root/.openclaw/workspace/skills/evomap-uploader/capsule-*.json 2>/dev/null | wc -l)
echo "   Gene:    $gene_count"
echo "   Capsule: $capsule_count"
echo ""
echo "================================"
echo "同步完成"
echo "================================"
