#!/usr/bin/env bash
# safe-interrupt.sh — 安全打断主Agent正在执行的exec sessions
# 用法: bash /root/.openclaw/workspace/scripts/safe-interrupt.sh

set -euo pipefail

REPORT_DIR="/root/.openclaw/workspace/reports"
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
REPORT_FILE="${REPORT_DIR}/interrupt-report-${TIMESTAMP}.md"

mkdir -p "$REPORT_DIR"

echo "🔍 正在扫描主Agent活跃的exec sessions..."
echo ""

# 获取活跃的exec sessions (通过openclaw gateway RPC)
SESSIONS_RAW=$(openclaw gateway call sessions.list --params '{"kinds":["agent"],"activeMinutes":60}' 2>/dev/null || echo "")

if [ -z "$SESSIONS_RAW" ]; then
    echo "⚠️  无法连接Gateway或无活跃sessions"
    exit 0
fi

# 尝试通过process工具列出活跃进程
echo "📋 活跃的后台进程:"
echo "---"

# 查找openclaw相关的长时间运行进程
PIDS=""
ps aux --sort=-start_time | grep -E "(node|bash|python)" | grep -v grep | grep -v "safe-interrupt" | head -20 | while read line; do
    PID=$(echo "$line" | awk '{print $2}')
    CMD=$(echo "$line" | awk '{for(i=11;i<=NF;i++) printf "%s ", $i; print ""}')
    TIME=$(echo "$line" | awk '{print $10}')
    echo "  PID: $PID | 运行时间: $TIME | 命令: $CMD"
done

echo ""
echo "---"

# 查找sandbox容器中的进程
CONTAINERS=$(docker ps --filter "label=openclaw" --format "{{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Command}}" 2>/dev/null || echo "")
if [ -n "$CONTAINERS" ]; then
    echo "🐳 OpenClaw Sandbox容器:"
    echo "$CONTAINERS" | while IFS=$'\t' read -r cid cname cstatus ccmd; do
        echo "  容器: $cname ($cid) | 状态: $cstatus | 命令: $ccmd"
    done
    echo ""
fi

# 查找可能的长时间exec (通过/tmp或workspace中的lockfile)
LOCKFILES=$(find /tmp -name "openclaw-exec-*" -newer /tmp -mmin +1 2>/dev/null || echo "")

echo ""
read -p "⚠️  是否终止以上进程? (y/N): " CONFIRM

if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
    echo "❌ 已取消"
    exit 0
fi

# 开始生成中断报告
cat > "$REPORT_FILE" << EOF
# 安全中断报告

- **时间**: $(date '+%Y-%m-%d %H:%M:%S')
- **操作员**: $(whoami)

## 中断的进程

EOF

INTERRUPTED=0
SAVED=0

# 保存workspace中最近修改的文件作为部分产出
echo "💾 保存部分产出..."
RECENT_FILES=$(find /root/.openclaw/workspace -name "*.md" -o -name "*.js" -o -name "*.sh" -o -name "*.json" -o -name "*.py" | xargs ls -t 2>/dev/null | head -10)

if [ -n "$RECENT_FILES" ]; then
    SAVE_DIR="${REPORT_DIR}/partial-output-${TIMESTAMP}"
    mkdir -p "$SAVE_DIR"
    
    echo "$RECENT_FILES" | while read f; do
        if [ -f "$f" ]; then
            # 只保存最近5分钟内修改的文件
            if find "$f" -mmin -5 -print 2>/dev/null | grep -q .; then
                cp "$f" "$SAVE_DIR/" 2>/dev/null && {
                    BASENAME=$(basename "$f")
                    echo "  ✅ 已保存: $BASENAME"
                    echo "- \`$f\` → 已备份" >> "$REPORT_FILE"
                    SAVED=$((SAVED + 1))
                }
            fi
        fi
    done
fi

# 终止sandbox容器
if [ -n "$CONTAINERS" ]; then
    echo "$CONTAINERS" | while IFS=$'\t' read -r cid cname cstatus ccmd; do
        echo "🛑 停止容器: $cname"
        docker stop --time 10 "$cid" 2>/dev/null && {
            echo "- 容器 \`$cname\` ($cid) — 已安全停止" >> "$REPORT_FILE"
            INTERRUPTED=$((INTERRUPTED + 1))
        }
    done
fi

# 终止可能的长时间运行的子进程（温和方式：先SIGTERM，等5秒，再SIGKILL）
# 只终止openclaw sandbox相关的进程，不杀gateway
SANDBOX_PIDS=$(ps aux | grep -E "openclaw.*sandbox|openclaw.*exec" | grep -v grep | grep -v "safe-interrupt" | awk '{print $2}')
if [ -n "$SANDBOX_PIDS" ]; then
    for PID in $SANDBOX_PIDS; do
        CMD=$(ps -p "$PID" -o args= 2>/dev/null || echo "unknown")
        echo "🛑 终止进程 PID=$PID: $CMD"
        kill -TERM "$PID" 2>/dev/null
        echo "- PID \`$PID\`: \`$CMD\` — SIGTERM已发送" >> "$REPORT_FILE"
        INTERRUPTED=$((INTERRUPTED + 1))
    done
    
    # 等待5秒让进程优雅退出
    sleep 5
    
    # 检查是否还活着
    for PID in $SANDBOX_PIDS; do
        if kill -0 "$PID" 2>/dev/null; then
            echo "⚡ 强制终止 PID=$PID"
            kill -KILL "$PID" 2>/dev/null
            echo "- PID \`$PID\` — SIGKILL强制终止" >> "$REPORT_FILE"
        fi
    done
fi

# 完成报告
cat >> "$REPORT_FILE" << EOF

## 统计

- 中断进程/容器数: ${INTERRUPTED}
- 保存的部分产出: 见 \`${SAVE_DIR:-无}\`

## 后续建议

1. 检查子Agent任务看板: \`bash /root/.openclaw/workspace/scripts/show-task-board.sh\`
2. 如需恢复工作，重新派发子Agent执行
EOF

echo ""
echo "✅ 中断完成"
echo "📄 中断报告: $REPORT_FILE"
cat "$REPORT_FILE"
