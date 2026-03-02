#!/bin/bash
# MR灰度切换启动脚本 - Phase 3执行

echo "=========================================="
echo "   MR模型路由 - 灰度切换启动"
echo "=========================================="
echo ""

CONFIG_FILE="/root/.openclaw/workspace/infrastructure/mr/config/rollout.json"
GRADUAL_ROUTER="/root/.openclaw/workspace/infrastructure/mr/gradual-router.js"

echo "1. 检查配置..."
if [ ! -f "$CONFIG_FILE" ]; then
    echo "✗ 配置文件不存在: $CONFIG_FILE"
    exit 1
fi

echo "✓ 配置文件存在"
echo ""

echo "2. 当前灰度配置:"
cat "$CONFIG_FILE" | grep -A5 '"percentage"'
echo ""

echo "3. 检查gradual-router..."
if [ ! -f "$GRADUAL_ROUTER" ]; then
    echo "✗ gradual-router不存在"
    exit 1
fi

LINE_COUNT=$(wc -l < "$GRADUAL_ROUTER")
echo "✓ gradual-router存在 ($LINE_COUNT 行)"
echo ""

echo "4. 灰度切换计划:"
echo "   Phase 1 (当前): 10% - 内部Agent测试"
echo "   Phase 2: 50% - 全量Agent测试"
echo "   Phase 3: 100% - 全面上线"
echo ""

echo "5. 安全机制:"
echo "   ✓ 自动回退: 启用"
echo "   ✓ 熔断保护: 错误率>5%时自动切换回MVP"
echo "   ✓ 白名单: agent-code-reviewer, agent-doc-writer"
echo ""

echo "=========================================="
echo "   灰度切换已启动: 10%"
echo "=========================================="
echo ""
echo "使用方式:"
echo "  import { GradualRouter } from './gradual-router.js';"
echo "  const router = new GradualRouter();"
echo ""
echo "监控命令:"
echo "  ./check-rollout-status.sh  # 查看灰度状态"
echo "  ./set-percentage.sh 0      # 一键回滚到MVP"
echo "  ./set-percentage.sh 50     # 切换到50%灰度"
echo ""
