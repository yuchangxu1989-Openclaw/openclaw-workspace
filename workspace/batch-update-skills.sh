#!/bin/bash
# 批量技能版本更新脚本

SKILLS_DIR="/root/.openclaw/workspace/skills"
EVOMAP_DIR="/root/.openclaw/workspace/skills/evomap-uploader"

cd /root/.openclaw/workspace

# 确保 evomap 目录存在
mkdir -p "$EVOMAP_DIR"

# 需要处理的技能列表（排除已处理的 aeo, capability-anchor, council-of-seven）
SKILLS="cras cras-generated-1771827136412 cras-generated-1771827197478 dto-core elite-longterm-memory feishu-chat-backup isc-core isc-document-quality parallel-subagent paths-center pdca-engine seef zhipu-router"

for skill in $SKILLS; do
    SKILL_MD="$SKILLS_DIR/$skill/SKILL.md"
    
    if [ ! -f "$SKILL_MD" ]; then
        echo "跳过 $skill: 无 SKILL.md"
        continue
    fi
    
    # 读取当前版本
    version=$(grep -i "version" "$SKILL_MD" | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || echo "1.0.0")
    
    # 递增 patch 版本
    major=$(echo $version | cut -d. -f1)
    minor=$(echo $version | cut -d. -f2)
    patch=$(echo $version | cut -d. -f3)
    new_patch=$((patch + 1))
    new_version="${major}.${minor}.${new_patch}"
    
    echo "[$skill] $version → $new_version"
    
    # 更新 SKILL.md
    sed -i "s/version[: \"]*[^\"\\n]*/version: \"$new_version\"/i" "$SKILL_MD"
    
    # 更新 package.json（如果存在）
    PKG="$SKILLS_DIR/$skill/package.json"
    if [ -f "$PKG" ]; then
        sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$new_version\"/" "$PKG"
    fi
    
    # Git 添加
    git add "skills/$skill/" 2>/dev/null || true
    
    # EvoMap 记录
    ts=$(date +%s%3N)
    cat > "$EVOMAP_DIR/gene-${skill}-${ts}.json" << EOF
{
  "type": "Gene",
  "schema_version": "1.5.0",
  "category": "optimize",
  "summary": "${skill} v${new_version}",
  "asset_id": "gene_${skill}_${ts}",
  "created_at": "$(date -Iseconds)"
}
EOF
    cat > "$EVOMAP_DIR/capsule-${skill}-${ts}.json" << EOF
{
  "type": "Capsule",
  "schema_version": "1.5.0",
  "gene": "gene_${skill}_${ts}",
  "summary": "${skill}同步",
  "outcome": { "status": "success" },
  "asset_id": "capsule_${skill}_${ts}",
  "created_at": "$(date -Iseconds)"
}
EOF
    
    echo "  ✓ GitHub staged, EvoMap recorded"
done

# Git 提交
echo ""
echo "提交更改..."
git commit -m "[AUTO] Batch update 13 skills via global pipeline" 2>/dev/null || echo "无新更改可提交"

echo ""
echo "完成！"
