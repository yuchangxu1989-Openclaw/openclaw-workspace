#!/bin/bash
set -euo pipefail

SOURCE="/root/.openclaw/workspace"
LOG_FILE="/root/.openclaw/workspace/infrastructure/logs/sync-shared-rules.log"
FILES_TO_SYNC=(
  "IRONCLAD.md"
  "CAPABILITY-ANCHOR.md"
  "AGENTS.md"
  "config/mcp-registry.json"
)

mkdir -p "$(dirname \"$LOG_FILE\")"

echo "[$(TZ='Asia/Shanghai' date '+%Y-%m-%d %H:%M:%S %Z')] sync start" >> "$LOG_FILE"

for ws in /root/.openclaw/workspace-*/; do
  [ -d "$ws" ] || continue
  for f in "${FILES_TO_SYNC[@]}"; do
    if [ -f "$SOURCE/$f" ]; then
      mkdir -p "$ws/$(dirname "$f")"
      cp "$SOURCE/$f" "$ws/$f"
      echo "[$(TZ='Asia/Shanghai' date '+%Y-%m-%d %H:%M:%S %Z')] synced $f -> $ws$f" >> "$LOG_FILE"
    else
      echo "[$(TZ='Asia/Shanghai' date '+%Y-%m-%d %H:%M:%S %Z')] missing source file: $SOURCE/$f" >> "$LOG_FILE"
    fi
  done
done

echo "[$(TZ='Asia/Shanghai' date '+%Y-%m-%d %H:%M:%S %Z')] sync done" >> "$LOG_FILE"


# --- 注入工作规范到SOUL.md（放最前面） ---
RULES_MARKER="跨Agent共享工作规范"
RULES_BLOCK='## 🔒 跨Agent共享工作规范（铁令）

### 工作目录
主项目根目录：`/root/.openclaw/workspace`
你的默认cwd可能不是这个目录，**执行任何命令前必须先**：
```bash
cd /root/.openclaw/workspace
```

### 时区
所有日期/时间使用 Asia/Shanghai (GMT+8)。

### 禁止事项
1. 禁止执行 `openclaw doctor --fix`
2. 禁止修改 openclaw.json
3. 禁止删除 shared/paths.js、evomap数据文件、public/子目录
4. 找不到文件先 `ls` 确认路径，不要猜

### 提交规范
改完代码必须：
```bash
cd /root/.openclaw/workspace
git add <具体文件>
git commit -m "<type>(<scope>): <description>"
git push
```

---

'

for ws in /root/.openclaw/workspace-*/; do
  [ -d "$ws" ] || continue
  SOUL="$ws/SOUL.md"
  [ -f "$SOUL" ] || continue
  if ! head -1 "$SOUL" | grep -q "$RULES_MARKER" 2>/dev/null; then
    TEMP=$(mktemp)
    echo "$RULES_BLOCK" > "$TEMP"
    cat "$SOUL" >> "$TEMP"
    mv "$TEMP" "$SOUL"
    echo "$(TZ=Asia/Shanghai date '+%Y-%m-%d %H:%M:%S') SOUL_PREPEND $ws" >> infrastructure/logs/sync-shared-rules.log
  fi
done
