#!/bin/bash
# key-management.sh - API Key统一管理脚本
# 设计原则：不直接存储Key，只记录位置和验证状态

KEY_REGISTRY="/root/.openclaw/workspace/.key-registry.json"
SECRETS_DIR="/root/.openclaw/.secrets"

# 初始化目录
init() {
    mkdir -p "$SECRETS_DIR"
    chmod 700 "$SECRETS_DIR"
}

# 注册新Key（不存储值，只记录元数据）
register_key() {
    local name=$1
    local source=$2  # env|file|gateway
    local location=$3
    local purpose=$4
    
    echo "注册Key: $name"
    echo "  来源: $source"
    echo "  位置: $location"
    echo "  用途: $purpose"
    
    # 验证Key是否存在
    case $source in
        env)
            if [ -z "$(eval echo \$$location)" ]; then
                echo "  ❌ 环境变量 $location 未设置"
                return 1
            fi
            ;;
        file)
            if [ ! -f "$location" ]; then
                echo "  ❌ 文件 $location 不存在"
                return 1
            fi
            ;;
    esac
    
    echo "  ✅ Key验证通过"
    
    # 更新注册表
    local timestamp=$(date -Iseconds)
    jq --arg name "$name" \
       --arg source "$source" \
       --arg location "$location" \
       --arg purpose "$purpose" \
       --arg timestamp "$timestamp" \
       '.keys[$name] = {source, location, purpose, registered_at: $timestamp}' \
       "$KEY_REGISTRY" 2>/dev/null > "${KEY_REGISTRY}.tmp" && \
       mv "${KEY_REGISTRY}.tmp" "$KEY_REGISTRY"
    
    return 0
}

# 验证所有已注册Key
verify_all() {
    echo "验证所有已注册Key..."
    
    if [ ! -f "$KEY_REGISTRY" ]; then
        echo "  暂无Key注册"
        return 0
    fi
    
    local failed=0
    
    jq -r '.keys | to_entries[] | "\(.key)|\(.value.source)|\(.value.location)"' "$KEY_REGISTRY" | \
    while IFS='|' read -r name source location; do
        case $source in
            env)
                if [ -n "$(eval echo \$$location)" ]; then
                    echo "  ✅ $name: 环境变量 $location 存在"
                else
                    echo "  ❌ $name: 环境变量 $location 缺失!"
                    ((failed++))
                fi
                ;;
            file)
                if [ -f "$location" ]; then
                    echo "  ✅ $name: 文件 $location 存在"
                else
                    echo "  ❌ $name: 文件 $location 缺失!"
                    ((failed++))
                fi
                ;;
        esac
    done
    
    return $failed
}

# 获取Key（用于脚本调用）
get_key() {
    local name=$1
    
    if [ ! -f "$KEY_REGISTRY" ]; then
        echo "错误: Key注册表不存在" >&2
        return 1
    fi
    
    local source=$(jq -r ".keys[\"$name\"].source" "$KEY_REGISTRY")
    local location=$(jq -r ".keys[\"$name\"].location" "$KEY_REGISTRY")
    
    case $source in
        env)
            eval echo "\$$location"
            ;;
        file)
            cat "$location"
            ;;
        *)
            echo "错误: 未知来源 $source" >&2
            return 1
            ;;
    esac
}

# 初始化注册表
init_registry() {
    if [ ! -f "$KEY_REGISTRY" ]; then
        echo '{"keys": {}}' > "$KEY_REGISTRY"
        chmod 600 "$KEY_REGISTRY"
    fi
}

# 主逻辑
case "${1:-}" in
    init)
        init
        init_registry
        echo "Key管理系统初始化完成"
        ;;
    register)
        init_registry
        register_key "$2" "$3" "$4" "$5"
        ;;
    verify)
        verify_all
        ;;
    get)
        get_key "$2"
        ;;
    *)
        echo "用法: $0 {init|register|verify|get}"
        echo ""
        echo "  init                    - 初始化Key管理系统"
        echo "  register <name> <source> <location> <purpose> - 注册新Key"
        echo "  verify                  - 验证所有已注册Key"
        echo "  get <name>              - 获取Key值"
        echo ""
        echo "示例:"
        echo "  $0 init"
        echo "  $0 register kimi_api env KIMI_API_KEY '主模型调用'"
        echo "  $0 register glm5_api env ZHIPU_API_KEY 'GLM-5编码'"
        echo "  $0 verify"
        ;;
esac
