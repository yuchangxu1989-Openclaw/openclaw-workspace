#!/bin/bash
# 设置灰度百分比脚本

NEW_PERCENTAGE="$1"

if [ -z "$NEW_PERCENTAGE" ]; then
    echo "用法: ./set-percentage.sh [0|10|50|100]"
    echo ""
    echo "选项:"
    echo "  0   - 回滚到MVP版 (0%)"
    echo "  10  - Phase 1: 内部Agent测试 (10%)"
    echo "  50  - Phase 2: 全量Agent测试 (50%)"
    echo "  100 - Phase 3: 完整版全面上线 (100%)"
    exit 1
fi

CONFIG_FILE="/root/.openclaw/workspace/infrastructure/mr/config/rollout.json"

echo "=== 调整MR灰度比例 ==="
echo ""

# 验证输入
if ! [[ "$NEW_PERCENTAGE" =~ ^[0-9]+$ ]]; then
    echo "✗ 错误: 请输入0-100的数字"
    exit 1
fi

if [ "$NEW_PERCENTAGE" -lt 0 ] || [ "$NEW_PERCENTAGE" -gt 100 ]; then
    echo "✗ 错误: 百分比必须在0-100之间"
    exit 1
fi

echo "目标灰度: $NEW_PERCENTAGE%"
echo ""

# 备份配置
cp "$CONFIG_FILE" "$CONFIG_FILE.bak"
echo "✓ 配置已备份"

# 更新百分比
sed -i "s/\"percentage\": *[0-9]*/\"percentage\": $NEW_PERCENTAGE/" "$CONFIG_FILE"

# 更新阶段
CURRENT_TIME=$(date +%s000)
if [ "$NEW_PERCENTAGE" -eq 0 ]; then
    sed -i 's/"currentPhase": *"[^"]*"/"currentPhase": "rollback"/" "$CONFIG_FILE"
    echo "✓ 已回滚到MVP版"
elif [ "$NEW_PERCENTAGE" -eq 10 ]; then
    sed -i 's/"currentPhase": *"[^"]*"/"currentPhase": "phase1"/" "$CONFIG_FILE"
    echo "✓ 已进入Phase 1 (10%灰度)"
elif [ "$NEW_PERCENTAGE" -eq 50 ]; then
    sed -i 's/"currentPhase": *"[^"]*"/"currentPhase": "phase2"/" "$CONFIG_FILE"
    echo "✓ 已进入Phase 2 (50%灰度)"
elif [ "$NEW_PERCENTAGE" -eq 100 ]; then
    sed -i 's/"currentPhase": *"[^"]*"/"currentPhase": "phase3"/" "$CONFIG_FILE"
    echo "✓ 已进入Phase 3 (100%上线)"
fi

# 更新时间戳
sed -i "s/\"lastUpdated\": *[0-9]*/\"lastUpdated\": $CURRENT_TIME/" "$CONFIG_FILE"

echo ""
echo "✅ 灰度调整完成"
echo ""

# 显示新状态
./check-rollout-status.sh
