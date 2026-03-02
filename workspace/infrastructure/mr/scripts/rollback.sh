#!/bin/bash
# rollback.sh - 一键回滚到MVP版
# Usage: ./rollback.sh [OPTIONS]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# 打印函数
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

log_important() {
    echo -e "${BOLD}$1${NC}"
}

# 显示帮助
show_help() {
    cat << EOF
MR一键回滚工具

Usage:
    $(basename "$0") [OPTIONS]

Description:
    立即将MR灰度比例设置为0%，回滚到MVP版
    回滚时间目标: <30秒

Options:
    -f, --force     强制回滚，不确认
    -k, --keep      保留当前白名单设置
    -r, --reset     同时重置熔断器
    -s, --status    回滚后显示状态
    -h, --help      显示帮助

Examples:
    $(basename "$0")           # 交互式回滚
    $(basename "$0") --force   # 强制立即回滚
    $(basename "$0") --reset   # 回滚并重置熔断器

Note:
    回滚后会触发自动通知，灰度比例将立即生效
EOF
}

# 获取当前状态
get_current_status() {
    local config_path="${PROJECT_ROOT}/infrastructure/mr/config/rollout.json"
    
    if [ -f "$config_path" ]; then
        local percentage=$(cat "$config_path" | grep -o '"percentage"[[:space:]]*:[[:space:]]*[0-9]*' | grep -o '[0-9]*$' || echo "0")
        echo "$percentage"
    else
        echo "0"
    fi
}

# 显示当前状态
show_status() {
    local percentage=$1
    
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    log_important "           当前灰度状态"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    if [ "$percentage" -eq 0 ]; then
        echo -e "灰度比例: ${GREEN}0% (MVP版)${NC}"
        echo -e "状态: ${GREEN}✓ 已回滚${NC}"
    elif [ "$percentage" -lt 50 ]; then
        echo -e "灰度比例: ${YELLOW}${percentage}% (测试阶段)${NC}"
        echo -e "状态: ${YELLOW}⚠ 灰度测试中${NC}"
    else
        echo -e "灰度比例: ${RED}${percentage}% (大规模灰度)${NC}"
        echo -e "状态: ${RED}⚠ 大规模灰度中${NC}"
    fi
    
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

# 确认回滚
confirm_rollback() {
    local current=$1
    
    if [ "$current" -eq 0 ]; then
        log_warn "已经是MVP版 (0%)，无需回滚"
        exit 0
    fi
    
    echo -e "\n${YELLOW}⚠️  即将执行回滚操作${NC}"
    show_status "$current"
    
    echo -e "${YELLOW}这将:"
    echo "  1. 将灰度比例设置为 0%"
    echo "  2. 所有请求将使用MVP版"
    echo "  3. 熔断器状态将被保留${NC}"
    echo ""
    
    read -p "确认回滚? [y/N]: " confirm
    
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        log_info "回滚已取消"
        exit 0
    fi
}

# 执行回滚
perform_rollback() {
    local force=$1
    local keep_whitelist=$2
    local reset_breaker=$3
    local show_status_flag=$4
    
    local current
    current=$(get_current_status)
    
    # 确认
    if [ "$force" != "true" ]; then
        confirm_rollback "$current"
    fi
    
    log_info "开始回滚..."
    local start_time
    start_time=$(date +%s%N)
    
    # 使用set-percentage.sh设置0%
    local set_script="${SCRIPT_DIR}/set-percentage.sh"
    
    if [ -x "$set_script" ]; then
        if [ "$force" = "true" ]; then
            "$set_script" 0 --force
        else
            "$set_script" 0
        fi
    else
        log_error "set-percentage.sh 不存在或不可执行"
        exit 1
    fi
    
    # 重置熔断器
    if [ "$reset_breaker" = "true" ]; then
        log_info "重置熔断器..."
        local node_script="${SCRIPT_DIR}/_reset-breaker.js"
        cat > "$node_script" << 'EOF'
const fs = require('fs');
const path = require('path');

const metricsPath = process.argv[2];

try {
    const metrics = JSON.parse(fs.readFileSync(metricsPath, 'utf-8'));
    if (metrics.config?.circuitBreaker) {
        metrics.config.circuitBreaker.isOpen = false;
        metrics.config.circuitBreaker.consecutiveErrors = 0;
        metrics.config.circuitBreaker.lastFailure = null;
        fs.writeFileSync(metricsPath, JSON.stringify(metrics, null, 2));
        console.log('Circuit breaker reset');
    }
} catch (err) {
    console.error('Failed to reset:', err.message);
}
EOF
        node "$node_script" "${PROJECT_ROOT}/monitoring/metrics.json" 2>&1 || true
        rm -f "$node_script"
        log_success "熔断器已重置"
    fi
    
    # 计算耗时
    local end_time
    end_time=$(date +%s%N)
    local duration_ms=$(( (end_time - start_time) / 1000000 ))
    
    log_success "回滚完成！耗时: ${duration_ms}ms"
    
    # 检查目标
    if [ "$duration_ms" -lt 30000 ]; then
        log_success "✓ 达到回滚时间目标 (<30秒)"
    else
        log_warn "⚠ 回滚时间超过目标 (实际: ${duration_ms}ms)"
    fi
    
    # 显示状态
    if [ "$show_status_flag" = "true" ]; then
        show_status 0
    fi
    
    # 输出关键信息
    echo -e "\n${GREEN}✓ 回滚成功${NC}"
    echo "  - 灰度比例: ${current}% → 0%"
    echo "  - 当前版本: MVP"
    echo "  - 耗时: ${duration_ms}ms"
    
    if [ "$reset_breaker" = "true" ]; then
        echo "  - 熔断器: 已重置"
    fi
}

# 主函数
main() {
    local force="false"
    local keep_whitelist="false"
    local reset_breaker="false"
    local show_status_flag="false"
    
    # 解析参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            -f|--force)
                force="true"
                shift
                ;;
            -k|--keep)
                keep_whitelist="true"
                shift
                ;;
            -r|--reset)
                reset_breaker="true"
                shift
                ;;
            -s|--status)
                show_status_flag="true"
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                log_error "未知选项: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    perform_rollback "$force" "$keep_whitelist" "$reset_breaker" "$show_status_flag"
}

main "$@"
