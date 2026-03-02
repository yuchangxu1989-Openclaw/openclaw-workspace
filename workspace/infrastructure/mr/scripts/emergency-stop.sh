#!/bin/bash
# emergency-stop.sh - 紧急停止完整版MR
# Usage: ./emergency-stop.sh [OPTIONS]
# 
# 这是最高优先级的回滚命令，用于紧急情况
# 它会立即停止所有完整版请求，无论当前状态如何

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

log_emergency() {
    echo -e "${RED}${BOLD}[EMERGENCY]${NC}${RED} $1${NC}"
}

# 显示帮助
show_help() {
    cat << EOF
MR紧急停止工具

Usage:
    $(basename "$0") [OPTIONS]

Description:
    紧急情况下立即停止完整版MR，立即回滚到MVP版
    此操作会：
      1. 将灰度比例强制设置为 0%
      2. 触发熔断器
      3. 清空白名单 (可选)
      4. 发送紧急通知 (如配置了通知渠道)

    ⚠️  仅在紧急情况下使用！

Options:
    -c, --clear     清空白名单
    -f, --force     不确认直接执行
    -n, --notify    发送通知 (如果配置了)
    -r, --reason    停止原因 (用于记录)
    -h, --help      显示帮助

Examples:
    $(basename "$0")                       # 交互式紧急停止
    $(basename "$0") --force               # 立即紧急停止
    $(basename "$0") --reason "严重bug"     # 记录停止原因
    $(basename "$0") --force --clear       # 停止并清空白名单

Exit Codes:
    0   成功
    1   失败
    2   用户取消

EOF
}

# 发送通知 (占位符，可根据需要实现)
send_notification() {
    local reason=$1
    
    # 这里可以实现通知逻辑，例如：
    # - 发送Webhook到告警系统
    # - 写入日志文件
    # - 发送到消息队列
    
    local log_file="${PROJECT_ROOT}/logs/emergency-stops.log"
    mkdir -p "$(dirname "$log_file")" 2>/dev/null || true
    
    echo "[$(date -Iseconds)] EMERGENCY STOP: ${reason:-unknown}" >> "$log_file" 2>/dev/null || true
}

# 执行紧急停止
emergency_stop() {
    local force=$1
    local clear_whitelist=$2
    local notify=$3
    local reason=$4
    
    local config_path="${PROJECT_ROOT}/infrastructure/mr/config/rollout.json"
    local metrics_path="${PROJECT_ROOT}/monitoring/metrics.json"
    
    # 显示警告
    echo -e "\n${RED}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${RED}${BOLD}          ⚠️  紧急停止模式 ⚠️           ${NC}"
    echo -e "${RED}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
    
    if [ "$force" != "true" ]; then
        log_emergency "即将执行紧急停止操作！"
        echo ""
        echo "这将立即："
        echo -e "  ${RED}1. 停止所有完整版请求${NC}"
        echo -e "  ${RED}2. 强制回滚到MVP版 (0%)${NC}"
        echo -e "  ${RED}3. 触发熔断器${NC}"
        
        if [ "$clear_whitelist" = "true" ]; then
            echo -e "  ${RED}4. 清空白名单${NC}"
        fi
        
        echo ""
        read -p "确定要执行紧急停止? 输入 'STOP' 确认: " confirm
        
        if [ "$confirm" != "STOP" ]; then
            log_info "紧急停止已取消"
            exit 2
        fi
    fi
    
    local start_time
    start_time=$(date +%s%N)
    
    log_emergency "执行紧急停止..."
    
    # 1. 强制设置灰度为0
    local node_script="${SCRIPT_DIR}/_emergency-stop.js"
    cat > "$node_script" << 'EOF'
const fs = require('fs');
const path = require('path');

const configPath = process.argv[2];
const metricsPath = process.argv[3];
const clearWhitelist = process.argv[4] === 'true';
const reason = process.argv[5] || 'emergency';

try {
    // 更新配置
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const oldPercentage = config.percentage;
    
    config.percentage = 0;
    config.lastUpdated = Date.now();
    config.updatedBy = 'emergency-stop.sh';
    config.emergencyStop = {
        triggeredAt: Date.now(),
        reason: reason,
        previousPercentage: oldPercentage
    };
    
    if (clearWhitelist) {
        config.whitelist = [];
    }
    
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    
    // 更新熔断器状态
    if (fs.existsSync(metricsPath)) {
        const metrics = JSON.parse(fs.readFileSync(metricsPath, 'utf-8'));
        if (metrics.config?.circuitBreaker) {
            metrics.config.circuitBreaker.isOpen = true;
            metrics.config.circuitBreaker.openedAt = Date.now();
            metrics.config.circuitBreaker.reason = 'emergency-stop';
            metrics.circuitBreakerTrips = (metrics.circuitBreakerTrips || 0) + 1;
            fs.writeFileSync(metricsPath, JSON.stringify(metrics, null, 2));
        }
    }
    
    console.log(JSON.stringify({
        success: true,
        oldPercentage,
        newPercentage: 0,
        whitelistCleared: clearWhitelist,
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
    
    local result
    result=$(node "$node_script" "$config_path" "$metrics_path" "$clear_whitelist" "$reason" 2>&1)
    rm -f "$node_script"
    
    local success=$(echo "$result" | grep -o '"success":[[:space:]]*true' || echo "")
    
    if [ -n "$success" ]; then
        local old_percentage=$(echo "$result" | grep -o '"oldPercentage":[[:space:]]*[0-9]*' | grep -o '[0-9]*$' || echo "0")
        
        local end_time
        end_time=$(date +%s%N)
        local duration_ms=$(( (end_time - start_time) / 1000000 ))
        
        # 发送通知
        if [ "$notify" = "true" ]; then
            send_notification "$reason"
        fi
        
        # 输出结果
        echo ""
        echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${GREEN}${BOLD}        ✓ 紧急停止执行成功            ${NC}"
        echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo ""
        echo -e "  灰度比例: ${RED}${old_percentage}%${NC} → ${GREEN}0%${NC}"
        echo -e "  熔断器: ${RED}已触发${NC}"
        echo -e "  执行耗时: ${duration_ms}ms"
        
        if [ "$clear_whitelist" = "true" ]; then
            echo -e "  白名单: ${YELLOW}已清空${NC}"
        fi
        
        if [ -n "$reason" ] && [ "$reason" != "emergency" ]; then
            echo -e "  停止原因: ${YELLOW}${reason}${NC}"
        fi
        
        echo ""
        log_success "系统已安全回滚到MVP版"
        
    else
        log_error "紧急停止失败！"
        exit 1
    fi
}

# 主函数
main() {
    local force="false"
    local clear_whitelist="false"
    local notify="false"
    local reason="emergency"
    
    # 解析参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            -c|--clear)
                clear_whitelist="true"
                shift
                ;;
            -f|--force)
                force="true"
                shift
                ;;
            -n|--notify)
                notify="true"
                shift
                ;;
            -r|--reason)
                if [ -n "$2" ] && [ "${2:0:1}" != "-" ]; then
                    reason="$2"
                    shift 2
                else
                    log_error "--reason 需要一个值"
                    exit 1
                fi
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
    
    emergency_stop "$force" "$clear_whitelist" "$notify" "$reason"
}

main "$@"
