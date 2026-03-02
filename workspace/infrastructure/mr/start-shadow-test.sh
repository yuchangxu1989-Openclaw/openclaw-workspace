#!/bin/bash
#
# Shadow Test Startup Script
# MR Phase 2: 影子测试启动脚本
#

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 脚本路径
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MR_DIR="$SCRIPT_DIR"
CONFIG_FILE="$MR_DIR/config/shadow-test.json"
REPORT_FILE="$MR_DIR/shadow-test-report.json"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  MR Phase 2: 影子测试框架${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 检查Node.js版本
echo -e "${BLUE}[1/5] 检查Node.js环境...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}错误: Node.js未安装${NC}"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2)
echo "Node.js版本: $NODE_VERSION"

# 检查配置文件
echo -e "${BLUE}[2/5] 检查配置文件...${NC}"
if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "${YELLOW}警告: 配置文件不存在，将使用默认配置${NC}"
else
    echo -e "${GREEN}配置文件: $CONFIG_FILE${NC}"
    # 显示配置摘要
    if command -v jq &> /dev/null; then
        SAMPLE_RATE=$(jq -r '.sampleRatePercent // 1' "$CONFIG_FILE")
        ENABLED=$(jq -r '.enabled // true' "$CONFIG_FILE")
        echo "  - 采样率: ${SAMPLE_RATE}%"
        echo "  - 状态: $([ "$ENABLED" = "true" ] && echo "启用" || echo "禁用")"
    fi
fi

# 检查必要文件
echo -e "${BLUE}[3/5] 检查必要文件...${NC}"
MVP_FILE="$MR_DIR/mr-router.mvp.js"
FULL_FILE="$MR_DIR/dist/mr-router.js"
SHADOW_FILE="$MR_DIR/shadow-tester.js"

if [ ! -f "$MVP_FILE" ]; then
    echo -e "${RED}错误: MVP版文件不存在: $MVP_FILE${NC}"
    exit 1
fi
echo -e "${GREEN}✓ MVP版: $MVP_FILE${NC}"

if [ ! -f "$FULL_FILE" ]; then
    echo -e "${RED}错误: 完整版文件不存在: $FULL_FILE${NC}"
    exit 1
fi
echo -e "${GREEN}✓ 完整版: $FULL_FILE${NC}"

if [ ! -f "$SHADOW_FILE" ]; then
    echo -e "${RED}错误: 影子测试器不存在: $SHADOW_FILE${NC}"
    exit 1
fi
echo -e "${GREEN}✓ 影子测试器: $SHADOW_FILE${NC}"

# 清理旧报告
echo -e "${BLUE}[4/5] 初始化报告文件...${NC}"
if [ -f "$REPORT_FILE" ]; then
    mv "$REPORT_FILE" "${REPORT_FILE}.bak.$(date +%Y%m%d%H%M%S)"
    echo "旧报告已备份"
fi

# 创建初始报告
cat > "$REPORT_FILE" << 'EOF'
{
  "summary": {
    "totalRequests": 0,
    "shadowRequests": 0,
    "bypassSuccess": 0,
    "bypassFailed": 0,
    "bypassSuccessRate": 0,
    "intentConsistency": 0,
    "modelSelectionConsistency": 0,
    "timeouts": 0,
    "circuitOpen": false,
    "lastUpdated": ""
  },
  "reports": [],
  "lastUpdated": ""
}
EOF
echo -e "${GREEN}报告文件已初始化: $REPORT_FILE${NC}"

# 启动测试
echo -e "${BLUE}[5/5] 启动影子测试...${NC}"
echo ""

node << NODE_SCRIPT
const path = require('path');
const fs = require('fs');

// 加载影子测试器
const { ShadowTester, health } = require('./shadow-tester.js');

async function startShadowTest() {
    console.log('正在初始化影子测试器...\n');
    
    const tester = new ShadowTester();
    
    // 等待初始化完成
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('\n========================================');
    console.log('影子测试框架已启动');
    console.log('========================================');
    console.log('');
    
    const healthStatus = await health();
    console.log('健康状态:');
    console.log('  - 启用状态:', healthStatus.enabled ? '✓ 是' : '✗ 否');
    console.log('  - 初始化:', healthStatus.initialized ? '✓ 成功' : '✗ 失败');
    console.log('  - 熔断器:', healthStatus.circuitOpen ? '⚠ 开启' : '✓ 关闭');
    console.log('');
    
    if (healthStatus.initialized) {
        console.log('\n配置信息:');
        console.log('  - 采样率: 1% (每100个请求采样1个)');
        console.log('  - 对比维度: intent, modelChain, duration');
        console.log('  - 完整版超时: 5000ms');
        console.log('');
        console.log('成功标准:');
        console.log('  - 旁路成功率 > 95%');
        console.log('  - 意图分类一致性 > 90%');
        console.log('  - 模型选择一致性 > 95%');
        console.log('');
        console.log('报告文件: ./shadow-test-report.json');
        console.log('');
        console.log('按 Ctrl+C 停止测试');
        console.log('');
        
        // 启动定时状态报告
        setInterval(async () => {
            const stats = tester.getSummary();
            if (stats.shadowRequests > 0) {
                console.log(\`[\${new Date().toLocaleTimeString()}] 采样: \${stats.shadowRequests}, 成功率: \${(stats.bypassSuccessRate * 100).toFixed(1)}%, 意图一致性: \${(stats.intentConsistency * 100).toFixed(1)}%\`);
            }
        }, 30000);
        
    } else {
        console.log('⚠ 初始化未完成，请检查模块加载');
        process.exit(1);
    }
}

startShadowTest().catch(err => {
    console.error('启动失败:', err);
    process.exit(1);
});
NODE_SCRIPT
