#!/usr/bin/env bash
# ============================================================================
# model-router.sh — 模型路由决策脚本
# 根据任务描述关键词，输出建议的 model 参数和 agentId
#
# 用法：
#   ./scripts/model-router.sh "修复这个 JSON 格式错误"
#   ./scripts/model-router.sh "设计微服务架构方案"
#   echo "批量翻译文档" | ./scripts/model-router.sh
#
# 路由规则（基于 GLM-5 路由方案 2026-03-10）：
#   Tier 1 (GLM-5)：格式修复|字段补全|批量|翻译|模板|摘要|提取|润色|lint|简单修复
#   Tier 3 (Opus) ：架构|裁决|深度|推理|设计|编排|安全审计|分析|评审
#   默认           ：claude（安全兜底）
# ============================================================================

set -euo pipefail

# ── 颜色 ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ── 读取输入 ──
if [[ $# -ge 1 ]]; then
    TASK="$*"
elif [[ ! -t 0 ]]; then
    TASK="$(cat)"
else
    echo -e "${RED}错误：请提供任务描述${NC}"
    echo ""
    echo "用法："
    echo "  $0 \"任务描述\""
    echo "  echo \"任务描述\" | $0"
    echo ""
    echo "示例："
    echo "  $0 \"修复这个 JSON 格式错误\""
    echo "  $0 \"设计微服务架构方案\""
    echo "  $0 \"批量翻译所有文档为英文\""
    exit 1
fi

# 去除首尾空白
TASK="$(echo "$TASK" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"

if [[ -z "$TASK" ]]; then
    echo -e "${RED}错误：任务描述不能为空${NC}"
    exit 1
fi

# ============================================================================
# 19 个可用 Agent
# ============================================================================
# ID              | 名称           | 擅长领域
# main            | 战略家         | 总调度、用户对话、战略决策
# researcher      | 洞察分析师     | 信息搜索、调研、数据分析
# coder           | 开发工程师     | 编码、代码修复、开发
# reviewer        | 质量仲裁官     | 代码审查、质量评审
# writer          | 创作大师       | 写作、翻译、文案
# analyst         | 系统架构师     | 架构设计、系统分析
# scout           | 情报专家       | 侦察、信息收集、监控
# cron-worker     | 定时任务执行者 | 定时任务、周期性工作
# researcher-02   | 架构师-02      | 研究（备用）
# coder-02~06     | 工程师-02      | 编码（备用/并行）
# reviewer-02     | 仲裁官-02      | 审查（备用）
# writer-02       | 创作师-02      | 写作（备用）
# analyst-02      | 分析师-02      | 分析（备用）
# scout-02        | 侦察兵-02      | 侦察（备用）
# cron-worker-02  | 定时器-02      | 定时（备用）
# worker-03~06    | 执行者-02~05   | 通用执行（并行 worker）

# ============================================================================
# 路由决策函数
# ============================================================================

choose_model() {
    local task="$1"

    # ── Tier 1: GLM-5 任务（低复杂度、结构化、重复性） ──
    # 关键词匹配（中文）
    local glm5_pattern="格式.{0,2}(修复|错误|修正|转换|化)|字段.{0,2}(补全|填充|映射|纠正)|批量|翻译|模板|摘要|提取|润色|lint|简单.{0,2}(修复|修正)|格式化|重命名|正则|填充|补全|数据清洗|模板渲染|JSON|YAML|TOML|类型转换|字段补全"

    # ── Tier 3: Opus 任务（高复杂度、需要深度推理） ──
    local opus_pattern="架构|裁决|深度.{0,2}(分析|推理|思考)|推理|设计.{0,2}(方案|系统)|编排|安全.{0,2}(审计|审查)|根因|方案.{0,2}(评审|规划)|技术决策|系统设计|复杂分析|多维度|逻辑推导|数学证明|工作流设计|权限分析"

    if echo "$task" | grep -qiP "$glm5_pattern"; then
        echo "glm5"
    elif echo "$task" | grep -qiP "$opus_pattern"; then
        echo "opus"
    else
        echo "default"
    fi
}

choose_agent() {
    local task="$1"

    # 按任务关键词匹配最合适的 agentId
    # 优先匹配专业 agent，通用任务分配给 worker

    # 审查/评审/安全（优先级最高，避免被 coder 抢走）
    if echo "$task" | grep -qiE "审查|评审|review|裁决|质量|合规|安全审计|安全审查|权限分析"; then
        echo "reviewer"
        return
    fi

    # 架构/系统设计 → analyst
    if echo "$task" | grep -qiE "架构|系统设计|方案规划|技术选型|拓扑|全局"; then
        echo "analyst"
        return
    fi

    # 代码相关 → coder
    if echo "$task" | grep -qiE "代码|编码|开发|实现|编程|code|fix|bug|lint|import|重构|函数|脚本|编译"; then
        echo "coder"
        return
    fi

    # 写作/翻译/文案 → writer
    if echo "$task" | grep -qiE "翻译|写作|文案|润色|文档|摘要|报告|邮件|创作|copywriting"; then
        echo "writer"
        return
    fi

    # 研究/调研/分析 → researcher
    if echo "$task" | grep -qiE "调研|研究|搜索|信息收集|数据分析|对比|竞品|趋势"; then
        echo "researcher"
        return
    fi

    # 侦察/监控 → scout
    if echo "$task" | grep -qiE "侦察|监控|巡检|探测|扫描|状态检查|健康检查"; then
        echo "scout"
        return
    fi

    # 定时/周期 → cron-worker
    if echo "$task" | grep -qiE "定时|周期|cron|定期|计划任务|调度"; then
        echo "cron-worker"
        return
    fi

    # 批量/并行执行 → worker（轮询 worker-03~06）
    if echo "$task" | grep -qiE "批量|并行|大量|bulk|batch"; then
        # 随机选一个 worker 实现简单负载均衡
        local workers=("worker-03" "worker-04" "worker-05" "worker-06")
        local idx=$(( RANDOM % ${#workers[@]} ))
        echo "${workers[$idx]}"
        return
    fi

    # 格式修复/数据处理 → coder（结构化任务）
    if echo "$task" | grep -qiE "格式修复|格式化|JSON|YAML|TOML|字段补全|数据清洗|提取|模板|填充"; then
        echo "coder"
        return
    fi

    # 深度推理/复杂分析 → analyst
    if echo "$task" | grep -qiE "深度|推理|分析|根因|多维度|逻辑|证明"; then
        echo "analyst"
        return
    fi

    # 兜底 → main
    echo "main"
}

# ============================================================================
# 构建 model 参数
# ============================================================================

build_model_param() {
    local tier="$1"
    local agent_id="$2"

    # zhipu provider 映射表
    # agent_id → zhipu provider name
    local zhipu_provider=""
    case "$agent_id" in
        main)           zhipu_provider="zhipu-main" ;;
        researcher|researcher-02) zhipu_provider="zhipu-researcher" ;;
        coder|coder-02) zhipu_provider="zhipu-coder" ;;
        reviewer|reviewer-02) zhipu_provider="zhipu-reviewer" ;;
        writer|writer-02) zhipu_provider="zhipu-writer" ;;
        analyst|analyst-02) zhipu_provider="zhipu-analyst" ;;
        scout|scout-02) zhipu_provider="zhipu-scout" ;;
        cron-worker|cron-worker-02) zhipu_provider="zhipu-cron-worker" ;;
        worker-03)      zhipu_provider="zhipu-worker-03" ;;
        worker-04)      zhipu_provider="zhipu-worker-04" ;;
        worker-05)      zhipu_provider="zhipu-worker-05" ;;
        worker-06)      zhipu_provider="zhipu-worker-06" ;;
        *)              zhipu_provider="zhipu-main" ;;
    esac

    # claude provider 映射
    local claude_provider=""
    case "$agent_id" in
        main)           claude_provider="claude-main" ;;
        researcher)     claude_provider="claude-researcher" ;;
        researcher-02)  claude_provider="claude-researcher-02" ;;
        coder)          claude_provider="claude-coder" ;;
        coder-02)       claude_provider="claude-coder-02" ;;
        reviewer)       claude_provider="claude-reviewer" ;;
        reviewer-02)    claude_provider="claude-reviewer-02" ;;
        writer)         claude_provider="claude-writer" ;;
        writer-02)      claude_provider="claude-writer-02" ;;
        analyst)        claude_provider="claude-analyst" ;;
        analyst-02)     claude_provider="claude-analyst-02" ;;
        scout)          claude_provider="claude-scout" ;;
        scout-02)       claude_provider="claude-scout-02" ;;
        cron-worker)    claude_provider="claude-cron-worker" ;;
        cron-worker-02) claude_provider="claude-cron-worker-02" ;;
        worker-03)      claude_provider="claude-worker-03" ;;
        worker-04)      claude_provider="claude-worker-04" ;;
        worker-05)      claude_provider="claude-worker-05" ;;
        worker-06)      claude_provider="claude-worker-06" ;;
        *)              claude_provider="claude-main" ;;
    esac

    case "$tier" in
        glm5)
            echo "${zhipu_provider}/glm-5"
            ;;
        opus)
            echo "${claude_provider}/claude-opus-4-6-thinking"
            ;;
        default)
            # 安全兜底：走 claude
            echo "${claude_provider}/claude-opus-4-6-thinking"
            ;;
    esac
}

# ============================================================================
# 执行路由
# ============================================================================

TIER=$(choose_model "$TASK")
AGENT_ID=$(choose_agent "$TASK")
MODEL_PARAM=$(build_model_param "$TIER" "$AGENT_ID")

# 路由原因
case "$TIER" in
    glm5)    REASON="匹配 Tier 1 关键词 → GLM-5（低成本、结构化任务）" ;;
    opus)    REASON="匹配 Tier 3 关键词 → Claude Opus（深度推理任务）" ;;
    default) REASON="未匹配特定关键词 → Claude 安全兜底" ;;
esac

# ============================================================================
# 输出结果
# ============================================================================

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║              🧭 模型路由决策结果                        ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${CYAN}📝 任务描述：${NC}${TASK}"
echo ""
echo -e "  ${GREEN}🤖 建议模型：${NC}${BOLD}${MODEL_PARAM}${NC}"
echo -e "  ${GREEN}👤 建议Agent：${NC}${BOLD}${AGENT_ID}${NC}"
echo -e "  ${YELLOW}📊 路由层级：${NC}${TIER^^}"
echo -e "  ${YELLOW}💡 路由原因：${NC}${REASON}"
echo ""

# 输出可直接用于 sessions_spawn 的参数
echo -e "${BOLD}── 可复制参数 ──${NC}"
echo ""
echo -e "  model:   \"${MODEL_PARAM}\""
echo -e "  agentId: \"${AGENT_ID}\""
echo ""

# JSON 格式输出（方便程序调用）
if [[ "${JSON_OUTPUT:-}" == "1" || "${1:-}" == "--json" ]]; then
    echo -e "${BOLD}── JSON 输出 ──${NC}"
    cat <<EOF
{
  "task": "$(echo "$TASK" | sed 's/"/\\"/g')",
  "model": "$MODEL_PARAM",
  "agentId": "$AGENT_ID",
  "tier": "$TIER",
  "reason": "$REASON"
}
EOF
fi
