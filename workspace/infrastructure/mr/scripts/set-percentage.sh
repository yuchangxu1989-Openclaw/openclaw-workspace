#!/bin/bash
# set-percentage.sh - 设置灰度比例
# Usage: ./set-percentage.sh [0-100] [--force]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
CONFIG_PATH="${PROJECT_ROOT}/infrastructure/mr/config/rollout.json"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的消息
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 显示帮助信息
show_help() {
    cat << EOF
设置MR灰度切换比例

Usage: 
    $(basename "$0") [PERCENTAGE] [OPTIONS]

Arguments:
    PERCENTAGE      灰度比例 (0-100)
                    0   = 100%使用MVP版
                    10  = 10%使用完整版 (Week 1)
                    50  = 50%使用完整版 (Week 2)
                    100 = 100%使用完整版 (Week 3)

Options:
    -f, --force     强制设置，不检查健康状态
    -h, --help      显示帮助信息
    -v, --verbose   显示详细信息

Examples:
    $(basename "$0") 0      # 立即回滚到MVP
    $(basename "$0") 10     # Week 1: 10%灰度
    $(basename "$0") 50     # Week 2: 50%灰度
    $(basename "$0") 100    # Week 3: 100%上线
    
Rollout Plan:
    Week 1 (10%):  内部Agent测试
    Week 2 (50%):  全量Agent测试  
    Week 3 (100%): 全面上线

EOF
}

# 验证输入
validate_percentage() {
    local percentage=$1
    
    if ! [[ "$percentage" =~ ^[0-9]+$ ]]; then
        log_error "无效的百分比: $percentage (必须是0-100的整数)"
        exit 1
    fi
    
    if [ "$percentage" -lt 0 ] || [ "$percentage" -gt 100 ]; then
        log_error "百分比必须在0-100之间"
        exit 1
    fi
}

# 检查配置文件是否存在
check_config() {
    if [ ! -f "$CONFIG_PATH" ]; then
        log_error "配置文件不存在: $CONFIG_PATH"
        exit 1
    fi
}

# 健康检查
check_health() {
    log_info "执行健康检查..."
    
    local health_script="${SCRIPT_DIR}/check-health.sh"
    if [ -x "$health_script" ]; then
        if ! "$health_script" --quiet; then
            log_error "健康检查失败，无法设置灰度比例"
            log_info "使用 --force 选项跳过健康检查 (不推荐)"
            exit 1
        fi
        log_success "健康检查通过"
    else
        log_warn "健康检查脚本不存在，跳过"
    fi
}

# 读取当前配置
get_current_percentage() {
    if [ -f "$CONFIG_PATH" ]; then
        cat "$CONFIG_PATH" | grep -o '"percentage"[[:space:]]*:[[:space:]]*[0-9]*' | grep -o '[0-9]*$' || echo "0"
    else
        echo "0"
    fi
}

# 设置灰度比例
set_percentage() {
    local percentage=$1
    local force=$2
    local verbose=$3
    
    local current_percentage
    current_percentage=$(get_current_percentage)
    
    log_info "当前灰度比例: ${current_percentage}%"
    log_info "目标灰度比例: ${percentage}%"
    
    # 检查是否需要切换
    if [ "$current_percentage" -eq "$percentage" ]; then
        log_warn "已经是 $percentage%，无需更改"
        exit 0
    fi
    
    # 健康检查 (除非强制模式)
    if [ "$force" != "true" ]; then
        check_health
    fi
    
    # 警告提示
    if [ "$percentage" -eq 0 ]; then
        log_warn "⚠️  即将回滚到MVP版 (0%)"
    elif [ "$percentage" -eq 100 ]; then
        log_warn "⚠️  即将全面上线完整版 (100%)"
    fi
    
    # 执行设置
    local node_script="${SCRIPT_DIR}/_set-percentage.js"
    
    # 创建临时Node脚本
    cat > "$node_script" << 'EOF'
const fs = require('fs');
const path = require('path');

const percentage = parseInt(process.argv[2], 10);
const configPath = process.argv[3];

try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const oldPercentage = config.percentage;
    config.percentage = percentage;
    config.lastUpdated = Date.now();
    config.updatedBy = 'set-percentage.sh';
    
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    
    console.log(JSON.stringify({
        success: true,
        oldPercentage,
        newPercentage: percentage,
        timestamp: Date.now()
    }));
} catch (err) {
    console.error(JSON.stringify({
        success: false,
        error: err.message
    }));
    process.exit(1);
}
EOF
    
    # 执行Node脚本
    if [ "$verbose" = "true" ]; then
        node "$node_script" "$percentage" "$CONFIG_PATH"
    else
        node "$node_script" "$percentage" "$CONFIG_PATH" > /dev/null 2>&1
    fi
    
    local result=$?
    rm -f "$node_script"
    
    if [ $result -eq 0 ]; then
        log_success "灰度比例已更新: ${current_percentage}% → ${percentage}%"
        
        # 输出切换计划信息
        case $percentage in
            0)
                log_info "状态: 已回滚到MVP版"
                ;;
            10)
                log_info "状态: Week 1 - 内部Agent测试 (10%)"
                ;;
            50)
                log_info "状态: Week 2 - 全量Agent测试 (50%)"
                ;;
            100)
                log_info "状态: Week 3 - 全面上线 (100%)"
                ;;
            *)
                log_info "状态: 自定义灰度比例 (${percentage}%)"
                ;;
        esac
    else
        log_error "设置失败"
        exit 1
    fi
}

# 主函数
main() {
    local percentage=""
    local force="false"
    local verbose="false"
    
    # 解析参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            -f|--force)
                force="true"
                shift
                ;;
            -v|--verbose)
                verbose="true"
                shift
                ;;
            -*)
                log_error "未知选项: $1"
                show_help
                exit 1
                ;;
            *)
                if [ -z "$percentage" ]; then
                    percentage="$1"
                else
                    log_error "多余的参数: $1"
                    exit 1
                fi
                shift
                ;;
        esac
    done
    
    # 检查参数
    if [ -z "$percentage" ]; then
        log_error "缺少百分比参数"
        show_help
        exit 1
    fi
    
    check_config
    validate_percentage "$percentage"
    set_percentage "$percentage" "$force" "$verbose"
}

main "$@"
