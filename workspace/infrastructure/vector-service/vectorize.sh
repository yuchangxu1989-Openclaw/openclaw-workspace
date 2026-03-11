#!/bin/bash
# 统一向量化服务 - 智谱API版
# 替代TF-IDF，使用智谱Embedding API（1024维）
# 更新: 支持全量连续执行模式（--continuous），移除分批扫描逻辑

VECTOR_DIR="/root/.openclaw/workspace/infrastructure/vector-service/vectors"
LOG_FILE="/root/.openclaw/workspace/infrastructure/vector-service/logs/vectorization.log"
BACKUP_DIR="/root/.openclaw/workspace/infrastructure/vector-service/backup"
SKILLS_DIR="/root/.openclaw/workspace/skills"
MEMORY_DIR="/root/.openclaw/workspace/memory"
KNOWLEDGE_DIR="/root/.openclaw/workspace/knowledge"
AEO_DIR="/root/.openclaw/workspace/aeo/evaluation-sets"

NODE_SCRIPT="/root/.openclaw/workspace/infrastructure/vector-service/src/batch-vectorize.cjs"

# 参数解析
CONTINUOUS_MODE=false
CLEANUP_MODE=false
CLEANUP_ORPHANS=false
DRY_RUN=true
EVENT_TYPE=""
TARGET_TYPE=""
SPECIFIC_SKILL=""

# 新增参数
CHECK_MISSING=false
AUTO_FIX=false
REPORT_FILE=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --continuous)
      CONTINUOUS_MODE=true
      shift
      ;;
    --cleanup)
      CLEANUP_MODE=true
      shift
      ;;
    --cleanup-orphans)
      CLEANUP_ORPHANS=true
      shift
      ;;
    --check-missing)
      CHECK_MISSING=true
      shift
      ;;
    --auto-fix)
      AUTO_FIX=true
      shift
      ;;
    --report)
      REPORT_FILE="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN="$2"
      shift 2
      ;;
    --event)
      EVENT_TYPE="$2"
      shift 2
      ;;
    --type)
      TARGET_TYPE="$2"
      shift 2
      ;;
    --skill)
      SPECIFIC_SKILL="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

echo "[$(date '+%Y-%m-%d %H:%M:%S')] ====== 开始执行智谱向量化任务 ======" >> "$LOG_FILE"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 参数: continuous=$CONTINUOUS_MODE, cleanup=$CLEANUP_MODE, event=$EVENT_TYPE" >> "$LOG_FILE"

# 确保目录存在
mkdir -p "$VECTOR_DIR"
mkdir -p "$BACKUP_DIR/deleted-skills"
mkdir -p "$BACKUP_DIR/orphan-vectors"
mkdir -p "$(dirname "$LOG_FILE")"

# ==================== 清理模式 ====================
if [ "$CLEANUP_MODE" = true ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 执行向量清理模式" >> "$LOG_FILE"
  
  # 如果指定了技能名称，只清理该技能
  if [ -n "$SPECIFIC_SKILL" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 清理技能: $SPECIFIC_SKILL" >> "$LOG_FILE"
    
    # 备份并删除向量文件
    for vector_file in "$VECTOR_DIR"/skill-${SPECIFIC_SKILL}*.json; do
      if [ -f "$vector_file" ]; then
        backup_name="deleted-$(basename "$vector_file" .json)-$(date +%Y%m%d-%H%M%S).json"
        cp "$vector_file" "$BACKUP_DIR/deleted-skills/$backup_name"
        rm -f "$vector_file"
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] 已删除向量: $vector_file (备份: $backup_name)" >> "$LOG_FILE"
      fi
    done
    
    # 更新索引
    update_index
    echo "✅ 技能 $SPECIFIC_SKILL 的向量已清理"
    exit 0
  fi
  
  echo "⚠️ 未指定技能名称，跳过清理"
  exit 1
fi

# ==================== 孤儿向量清理模式 ====================
if [ "$CLEANUP_ORPHANS" = true ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 执行孤儿向量清理模式 (dry-run=$DRY_RUN)" >> "$LOG_FILE"
  
  orphan_count=0
  
  # 扫描所有技能向量文件
  for vector_file in "$VECTOR_DIR"/skill-*.json; do
    [ -f "$vector_file" ] || continue
    
    # 提取技能名称
    filename=$(basename "$vector_file")
    skill_name=$(echo "$filename" | sed 's/^skill-//' | sed 's/\.json$//')
    
    # 检查源文件是否存在
    source_file="$SKILLS_DIR/$skill_name/SKILL.md"
    
    if [ ! -f "$source_file" ]; then
      orphan_count=$((orphan_count + 1))
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] 发现孤儿向量: $filename (源文件不存在: $source_file)" >> "$LOG_FILE"
      
      if [ "$DRY_RUN" = "false" ]; then
        # 备份并删除
        backup_name="orphan-${filename%.json}-$(date +%Y%m%d-%H%M%S).json"
        cp "$vector_file" "$BACKUP_DIR/orphan-vectors/$backup_name"
        rm -f "$vector_file"
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] 已清理孤儿向量: $filename" >> "$LOG_FILE"
      fi
    fi
  done
  
  if [ "$DRY_RUN" = "false" ]; then
    update_index
    echo "✅ 孤儿向量清理完成: 共清理 $orphan_count 个"
  else
    echo "📋 孤儿向量扫描完成: 发现 $orphan_count 个 (dry-run模式，未实际删除)"
  fi
  
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 孤儿向量清理完成: $orphan_count 个" >> "$LOG_FILE"
  exit 0
fi

# ==================== 缺失向量检查与补全模式 ====================
if [ "$CHECK_MISSING" = true ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 执行缺失向量检查模式 (auto-fix=$AUTO_FIX)" >> "$LOG_FILE"
  
  declare -a MISSING_FILES
  missing_count=0
  
  # 1. 检查技能文件
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 扫描缺失向量的技能文件..." >> "$LOG_FILE"
  while IFS= read -r file; do
    skill_name=$(basename "$(dirname "$file")")
    vector_file="$VECTOR_DIR/skill-${skill_name}.json"
    
    if [ ! -f "$vector_file" ]; then
      MISSING_FILES+=("SKILL|$file")
      missing_count=$((missing_count + 1))
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] 发现缺失向量的技能: $skill_name" >> "$LOG_FILE"
    fi
  done < <(find "$SKILLS_DIR" -name "SKILL.md" -type f 2>/dev/null)
  
  # 2. 检查记忆文件 — MEMORY_DIR已废弃，MemOS为唯一记忆源
  # 跳过memory/*.md扫描
  
  # 3. 检查知识文件
  if [ -d "$KNOWLEDGE_DIR" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 扫描缺失向量的知识文件..." >> "$LOG_FILE"
    while IFS= read -r file; do
      know_name=$(basename "$file" .json)
      vector_file="$VECTOR_DIR/knowledge-${know_name}.json"
      
      if [ ! -f "$vector_file" ]; then
        MISSING_FILES+=("KNOWLEDGE|$file")
        missing_count=$((missing_count + 1))
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] 发现缺失向量的知识: $know_name" >> "$LOG_FILE"
      fi
    done < <(find "$KNOWLEDGE_DIR" -name "*.json" -type f 2>/dev/null)
  fi
  
  # 4. 检查AEO文件
  if [ -d "$AEO_DIR" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 扫描缺失向量的AEO用例..." >> "$LOG_FILE"
    while IFS= read -r file; do
      aeo_name=$(basename "$file" .json)
      aeo_key=$(echo "$aeo_name" | tr '/' '-')
      vector_file="$VECTOR_DIR/aeo-${aeo_key}.json"
      
      if [ ! -f "$vector_file" ]; then
        MISSING_FILES+=("AEO|$file")
        missing_count=$((missing_count + 1))
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] 发现缺失向量的AEO用例: $aeo_name" >> "$LOG_FILE"
      fi
    done < <(find "$AEO_DIR" -name "*.json" -type f 2>/dev/null)
  fi
  
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 缺失向量检查完成: 发现 $missing_count 个缺失" >> "$LOG_FILE"
  
  # 自动修复模式
  fixed_count=0
  if [ "$AUTO_FIX" = true ] && [ $missing_count -gt 0 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 开始自动修复缺失向量..." >> "$LOG_FILE"
    
    # 创建临时文件列表
    TEMP_LIST=$(mktemp)
    for item in "${MISSING_FILES[@]}"; do
      echo "$item" >> "$TEMP_LIST"
    done
    
    # 调用Node.js脚本进行向量化
    node "$NODE_SCRIPT" "$TEMP_LIST" "$VECTOR_DIR" 2>> "$LOG_FILE"
    FIX_EXIT_CODE=$?
    
    rm -f "$TEMP_LIST"
    
    if [ $FIX_EXIT_CODE -eq 0 ]; then
      fixed_count=$missing_count
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ 自动修复完成: 共修复 $fixed_count 个缺失向量" >> "$LOG_FILE"
      # 更新向量索引
      vector_count=$(ls "$VECTOR_DIR"/*.json 2>/dev/null | wc -l)
      echo "$vector_count" > "$VECTOR_DIR/index.count"
      cat > "$VECTOR_DIR/index-meta.json" << EOF
{
  "version": "2.0.0",
  "engine": "zhipu-embedding-3",
  "dimension": 1024,
  "total_vectors": $vector_count,
  "last_update": "$(date -Iseconds)",
  "event_type": "auto_fix"
}
EOF
    else
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] ⚠️ 自动修复部分失败" >> "$LOG_FILE"
    fi
  fi
  
  # 输出结果
  if [ "$AUTO_FIX" = true ]; then
    echo "✅ 缺失向量检查与修复完成: 发现 $missing_count 个, 修复 $fixed_count 个"
  else
    echo "📋 缺失向量检查完成: 发现 $missing_count 个 (dry-run模式，未实际修复)"
    if [ $missing_count -gt 0 ]; then
      echo "   使用 --auto-fix 参数自动修复"
    fi
  fi
  
  # 如果有报告文件参数，写入报告
  if [ -n "$REPORT_FILE" ]; then
    cat > "$REPORT_FILE" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "check_type": "missing_vectors",
  "auto_fix": $AUTO_FIX,
  "statistics": {
    "missing_count": $missing_count,
    "fixed_count": $fixed_count
  },
  "details": [
$(for item in "${MISSING_FILES[@]}"; do
  file_type=$(echo "$item" | cut -d'|' -f1)
  file_path=$(echo "$item" | cut -d'|' -f2-)
  echo "    {\"type\": \"$file_type\", \"path\": \"$file_path\"},"
done | sed '$ s/,$//')
  ]
}
EOF
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 报告已保存: $REPORT_FILE" >> "$LOG_FILE"
  fi
  
  exit 0
fi

# ==================== 更新索引函数 ====================
update_index() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 更新向量索引..." >> "$LOG_FILE"
  vector_count=$(ls "$VECTOR_DIR"/*.json 2>/dev/null | wc -l)
  echo "$vector_count" > "$VECTOR_DIR/index.count"

  # 生成索引元数据
  cat > "$VECTOR_DIR/index-meta.json" << EOF
{
  "version": "2.0.0",
  "engine": "zhipu-embedding-3",
  "dimension": 1024,
  "total_vectors": $vector_count,
  "last_update": "$(date -Iseconds)",
  "execution_mode": "$([ "$CONTINUOUS_MODE" = true ] && echo "continuous" || echo "batch")",
  "event_type": "$EVENT_TYPE"
}
EOF
}

# ==================== 全量连续向量化模式 ====================
# 扫描并收集所有待向量化文件
declare -a SKILL_FILES
declare -a MEMORY_FILES
declare -a KNOWLEDGE_FILES
declare -a AEO_FILES

# 1. 收集技能文件 (SKILL.md)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 扫描技能文件..." >> "$LOG_FILE"
while IFS= read -r file; do
  skill_name=$(basename "$(dirname "$file")")
  vector_file="$VECTOR_DIR/skill-${skill_name}.json"
  
  # 连续模式下：全量重新向量化，不检查时间戳
  # 非连续模式下：只向量化变更的文件
  if [ "$CONTINUOUS_MODE" = false ]; then
    if [ -f "$vector_file" ]; then
      md_time=$(stat -c %Y "$file" 2>/dev/null || stat -f %m "$file" 2>/dev/null)
      vec_time=$(stat -c %Y "$vector_file" 2>/dev/null || stat -f %m "$vector_file" 2>/dev/null)
      if [ "$vec_time" -ge "$md_time" ]; then
        continue  # 跳过未修改的
      fi
    fi
  fi
  
  SKILL_FILES+=("$file")
  
  # 连续模式下立即执行，不分批
  if [ "$CONTINUOUS_MODE" = true ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [连续模式] 立即向量化: $file" >> "$LOG_FILE"
  fi
done < <(find "$SKILLS_DIR" -name "SKILL.md" -type f 2>/dev/null)

# 2. 收集记忆文件 — MEMORY_DIR已废弃，MemOS为唯一记忆源
# if [ -d "$MEMORY_DIR" ]; then ... fi
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 记忆文件扫描已跳过（MEMORY.md已废弃，MemOS为唯一记忆源）" >> "$LOG_FILE"

# 3. 收集知识文件 (knowledge/*.json)
if [ -d "$KNOWLEDGE_DIR" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 扫描知识文件..." >> "$LOG_FILE"
  while IFS= read -r file; do
    know_name=$(basename "$file" .json)
    vector_file="$VECTOR_DIR/knowledge-${know_name}.json"
    
    if [ "$CONTINUOUS_MODE" = false ]; then
      if [ -f "$vector_file" ]; then
        json_time=$(stat -c %Y "$file" 2>/dev/null || stat -f %m "$file" 2>/dev/null)
        vec_time=$(stat -c %Y "$vector_file" 2>/dev/null || stat -f %m "$vector_file" 2>/dev/null)
        if [ "$vec_time" -ge "$json_time" ]; then
          continue
        fi
      fi
    fi
    KNOWLEDGE_FILES+=("$file")
  done < <(find "$KNOWLEDGE_DIR" -name "*.json" -type f 2>/dev/null)
fi

# 4. 收集AEO评测用例
if [ -d "$AEO_DIR" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 扫描AEO评测用例..." >> "$LOG_FILE"
  while IFS= read -r file; do
    aeo_name=$(basename "$file" .json)
    aeo_key=$(echo "$aeo_name" | tr '/' '-')
    vector_file="$VECTOR_DIR/aeo-${aeo_key}.json"
    
    if [ "$CONTINUOUS_MODE" = false ]; then
      if [ -f "$vector_file" ]; then
        json_time=$(stat -c %Y "$file" 2>/dev/null || stat -f %m "$file" 2>/dev/null)
        vec_time=$(stat -c %Y "$vector_file" 2>/dev/null || stat -f %m "$vector_file" 2>/dev/null)
        if [ "$vec_time" -ge "$json_time" ]; then
          continue
        fi
      fi
    fi
    AEO_FILES+=("$file")
  done < <(find "$AEO_DIR" -name "*.json" -type f 2>/dev/null)
fi

# 统计总数
total_count=$((${#SKILL_FILES[@]} + ${#MEMORY_FILES[@]} + ${#KNOWLEDGE_FILES[@]} + ${#AEO_FILES[@]}))
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 待向量化文件总数: $total_count" >> "$LOG_FILE"
echo "  - 技能: ${#SKILL_FILES[@]}" >> "$LOG_FILE"
echo "  - 记忆: ${#MEMORY_FILES[@]}" >> "$LOG_FILE"
echo "  - 知识: ${#KNOWLEDGE_FILES[@]}" >> "$LOG_FILE"
echo "  - AEO: ${#AEO_FILES[@]}" >> "$LOG_FILE"

# 执行向量化
if [ $total_count -eq 0 ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 所有文件已是最新，无需向量化" >> "$LOG_FILE"
  echo "✅ 无需更新"
  update_index
  exit 0
fi

# 创建临时文件列表
TEMP_LIST=$(mktemp)
for file in "${SKILL_FILES[@]}"; do
  echo "SKILL|$file" >> "$TEMP_LIST"
done
for file in "${MEMORY_FILES[@]}"; do
  echo "MEMORY|$file" >> "$TEMP_LIST"
done
for file in "${KNOWLEDGE_FILES[@]}"; do
  echo "KNOWLEDGE|$file" >> "$TEMP_LIST"
done
for file in "${AEO_FILES[@]}"; do
  echo "AEO|$file" >> "$TEMP_LIST"
done

# 调用Node.js脚本进行向量化
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 开始调用智谱API进行向量化..." >> "$LOG_FILE"
if [ "$CONTINUOUS_MODE" = true ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 模式: 全量连续执行" >> "$LOG_FILE"
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 模式: 增量分批执行" >> "$LOG_FILE"
fi

node "$NODE_SCRIPT" "$TEMP_LIST" "$VECTOR_DIR" 2>> "$LOG_FILE"
EXIT_CODE=$?

# 清理临时文件
rm -f "$TEMP_LIST"

# 更新索引
update_index

if [ $EXIT_CODE -eq 0 ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ 向量化完成: 共处理 $total_count 个文件" >> "$LOG_FILE"
  echo "✅ 智谱向量化完成: 技能${#SKILL_FILES[@]}个, 记忆${#MEMORY_FILES[@]}个, 知识${#KNOWLEDGE_FILES[@]}个, AEO${#AEO_FILES[@]}个"
  if [ "$CONTINUOUS_MODE" = true ]; then
    echo "   [全量连续模式]"
  fi
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ⚠️ 向量化部分失败 (exit code: $EXIT_CODE)" >> "$LOG_FILE"
  echo "⚠️ 向量化部分失败，请检查日志"
fi

exit $EXIT_CODE
