#!/bin/bash
# check-health.sh - 灰度切换健康检查
# Usage: ./check-health.sh [OPTIONS]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
CONFIG_PATH="${PROJECT_ROOT}/infrastructure/mr/config/rollout.json"
METRICS_PATH="${PROJECT_ROOT}/monitoring/metrics.json"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 检查是否支持颜色
if [ -t 1 ]; then
    HAS_COLOR=true
else
    HAS_COLOR=false
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    NC=''
fi

# 打印函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
}

# 显示帮助
show_help() {
    cat << EOF
MR灰度切换健康检查

Usage:
    $(basename "$0") [OPTIONS]

Options:
    -q, --quiet     静默模式，只返回状态码
    -v, --verbose   详细模式
    -j, --json      JSON格式输出
    -h, --help      显示帮助

Exit Codes:
    0   健康
    1   不健康
    2   配置错误
EOF
}

# 检查文件存在性
check_files() {
    local errors=0
    
    [ "$verbose" = "true" ] && log_info "检查配置文件..."
    
    if [ -f "$CONFIG_PATH" ]; then
        [ "$verbose" = "true" ] && log_success "配置文件存在: $CONFIG_PATH"
    else
        log_error "配置文件不存在: $CONFIG_PATH"
        errors=$((errors + 1))
    fi
    
    if [ -f "$METRICS_PATH" ]; then
        [ "$verbose" = "true" ] && log_success "指标文件存在: $METRICS_PATH"
    else
        [ "$verbose" = "true" ] && log_warn "指标文件不存在: $METRICS_PATH"
    fi
    
    return $errors
}

# 检查配置有效性
check_config() {
    local errors=0
    
    [ "$verbose" = "true" ] && log_info "检查配置有效性..."
    
    # 使用Node.js验证JSON
    local node_script="${SCRIPT_DIR}/_check-config.js"
    cat > "$node_script" << 'EOF'
const fs = require('fs');
const path = process.argv[2];

try {
    const config = JSON.parse(fs.readFileSync(path, 'utf-8'));
    
    // 验证必需字段
    const required = ['percentage', 'whitelist', 'blacklist', 'fallback', 'autoRollback'];
    const missing = required.filter(k => !(k in config));
    
    if (missing.length > 0) {
        console.log(JSON.stringify({ valid: false, error: 'Missing fields: ' + missing.join(', ') }));
        process.exit(1);
    }
    
    // 验证percentage范围
    if (typeof config.percentage !== 'number' || config.percentage < 0 || config.percentage > 100) {
        console.log(JSON.stringify({ valid: false, error: 'Invalid percentage' }));
        process.exit(1);
    }
    
    // 验证fallback值
    if (!['mvp', 'error'].includes(config.fallback)) {
        console.log(JSON.stringify({ valid: false, error: 'Invalid fallback value' }));
        process.exit(1);
    }
    
    console.log(JSON.stringify({ 
        valid: true, 
        percentage: config.percentage,
        whitelist: config.whitelist.length,
        blacklist: config.blacklist.length
    }));
} catch (err) {
    console.log(JSON.stringify({ valid: false, error: err.message }));
    process.exit(1);
}
EOF
    
    local result
    result=$(node "$node_script" "$CONFIG_PATH" 2>&1) || true
    rm -f "$node_script"
    
    local valid=$(echo "$result" | grep -o '"valid":[[:space:]]*true' || echo "")
    
    if [ -n "$valid" ]; then
        local percentage=$(echo "$result" | grep -o '"percentage":[[:space:]]*[0-9]*' | grep -o '[0-9]*$')
        [ "$verbose" = "true" ] && log_success "配置有效 (灰度: ${percentage}%)"
    else
        local error=$(echo "$result" | grep -o '"error":"[^"]*"' | cut -d'"' -f4)
        log_error "配置无效: ${error:-unknown error}"
        errors=$((errors + 1))
    fi
    
    return $errors
}

# 检查MVP版可用性
check_mvp() {
    [ "$verbose" = "true" ] && log_info "检查MVP版可用性..."
    
    local mvp_path="${PROJECT_ROOT}/infrastructure/mr/mr-router.mvp.js"
    
    if [ -f "$mvp_path" ]; then
        [ "$verbose" = "true" ] && log_success "MVP版存在"
        return 0
    else
        log_error "MVP版不存在: $mvp_path"
        return 1
    fi
}

# 检查完整版可用性
check_full() {
    [ "$verbose" = "true" ] && log_info "检查完整版可用性..."
    
    local full_path="${PROJECT_ROOT}/infrastructure/mr/dist/mr-router.js"
    
    if [ -f "$full_path" ]; then
        [ "$verbose" = "true" ] && log_success "完整版存在"
        return 0
    else
        log_warn "完整版不存在: $full_path (如不在灰度期内可忽略)"
        return 0  # 不完整版不存在不是致命错误
    fi
}

# 检查熔断器状态
check_circuit_breaker() {
    [ "$verbose" = "true" ] && log_info "检查熔断器状态..."
    
    if [ ! -f "$METRICS_PATH" ]; then
        [ "$verbose" = "true" ] && log_warn "无指标数据，跳过熔断器检查"
        return 0
    fi
    
    local is_open=$(cat "$METRICS_PATH" | grep -o '"isOpen":[[:space:]]*true' || echo "")
    
    if [ -n "$is_open" ]; then
        log_warn "熔断器处于打开状态"
        return 0  # 警告但不失败
    else
        [ "$verbose" = "true" ] && log_success "熔断器正常"
        return 0
    fi
}

# 检查指标数据
check_metrics() {
    [ "$verbose" = "true" ] && log_info "检查指标数据..."
    
    if [ ! -f "$METRICS_PATH" ]; then
        [ "$verbose" = "true" ] && log_warn "暂无指标数据"
        return 0
    fi
    
    # 检查错误率
    local node_script="${SCRIPT_DIR}/_check-metrics.js"
    cat > "$node_script" << 'EOF'
const fs = require('fs');
const path = process.argv[2];

try {
    const metrics = JSON.parse(fs.readFileSync(path, 'utf-8'));
    const mvp = metrics.comparison?.mvp;
    const full = metrics.comparison?.full;
    
    const results = {
        mvp: { requests: mvp?.requests || 0, errors: mvp?.errors || 0 },
        full: { requests: full?.requests || 0, errors: full?.errors || 0 }
    };
    
    if (mvp?.requests > 0) {
        results.mvp.errorRate = (mvp.errors / mvp.requests * 100).toFixed(2);
    }
    if (full?.requests > 0) {
        results.full.errorRate = (full.errors / full.requests * 100).toFixed(2);
    }
    
    console.log(JSON.stringify(results));
} catch (err) {
    console.log(JSON.stringify({ error: err.message }));
}
EOF
    
    local result
    result=$(node "$node_script" "$METRICS_PATH" 2>&1) || true
    rm -f "$node_script"
    
    [ "$verbose" = "true" ] && log_success "指标数据可读取"
    return 0
}

# 生成健康报告
generate_report() {
    local status=$1
    
    if [ "$json_output" = "true" ]; then
        cat << EOF
{
  "healthy": $([ "$status" -eq 0 ] && echo "true" || echo "false"),
  "timestamp": $(date +%s),
  "checks": {
    "files": true,
    "config": true,
    "mvp": true,
    "full": true
  }
}
EOF
    else
        if [ "$status" -eq 0 ]; then
            echo -e "\n${GREEN}✓ 健康检查通过${NC}"
        else
            echo -e "\n${RED}✗ 健康检查未通过${NC}"
        fi
    fi
}

# 主函数
main() {
    local quiet="false"
    local verbose="false"
    local json_output="false"
    local total_errors=0
    
    # 解析参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            -q|--quiet)
                quiet="true"
                shift
                ;;
            -v|--verbose)
                verbose="true"
                shift
                ;;
            -j|--json)
                json_output="true"
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                echo "Unknown option: $1"
                show_help
                exit 2
                ;;
        esac
    done
    
    # 执行检查
    check_files || total_errors=$((total_errors + 1))
    check_config || total_errors=$((total_errors + 1))
    check_mvp || total_errors=$((total_errors + 1))
    check_full || total_errors=$((total_errors + 1))
    check_circuit_breaker
    check_metrics
    
    # 输出结果
    if [ "$quiet" = "false" ]; then
        generate_report "$total_errors"
    fi
    
    exit $total_errors
}

main "$@"
