#!/bin/bash
# 灰度状态检查脚本

CONFIG_FILE="/root/.openclaw/workspace/infrastructure/mr/config/rollout.json"

echo "=== MR灰度切换状态 ==="
echo ""

if [ ! -f "$CONFIG_FILE" ]; then
    echo "✗ 配置文件不存在"
    exit 1
fi

echo "当前配置:"
echo ""

# 解析JSON显示关键信息
cat "$CONFIG_FILE" | grep -E '"percentage"|"whitelist"|"currentPhase"|"autoRollback"|"enabled"' | head -10

echo ""
echo "灰度阶段:"

PERCENTAGE=$(cat "$CONFIG_FILE" | grep '"percentage"' | head -1 | sed 's/.*: *\([0-9]*\).*/\1/')

case $PERCENTAGE in
    0)
        echo "  状态: 🔴 MVP版 (0% - 完整版未启用)"
        ;;
    10)
        echo "  状态: 🟡 Phase 1 (10% - 内部Agent测试)"
        echo "  目标: agent-code-reviewer, agent-doc-writer"
        ;;
    50)
        echo "  状态: 🟠 Phase 2 (50% - 全量Agent测试)"
        echo "  目标: 所有Agent"
        ;;
    100)
        echo "  状态: 🟢 Phase 3 (100% - 完整版全面上线)"
        echo "  目标: 所有Agent"
        ;;
    *)
        echo "  状态: ⚪ 自定义灰度 ($PERCENTAGE%)"
        ;;
esac

echo ""
echo "安全机制:"
if grep -q '"autoRollback": *true' "$CONFIG_FILE"; then
    echo "  ✓ 自动回退: 启用"
else
    echo "  ✗ 自动回退: 禁用"
fi

if grep -q '"enabled": *true' "$CONFIG_FILE"; then
    echo "  ✓ 熔断保护: 启用"
else
    echo "  ✗ 熔断保护: 禁用"
fi

echo ""
echo "最后更新: $(stat -c %y "$CONFIG_FILE" 2>/dev/null | cut -d' ' -f1,2 | cut -d'.' -f1)"
