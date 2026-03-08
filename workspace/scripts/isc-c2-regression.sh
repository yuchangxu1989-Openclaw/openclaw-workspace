#!/bin/bash
# ============================================================
# C2 自动采集 回归测试 v2 (快速回归 - 16个核心case)
# ============================================================
# 快速烟雾测试，验证intent-probe.sh v2基本功能
# 完整128case评测集: tests/benchmarks/intent/benchmark_runner.py
# 通过标准: 16/16 全部通过
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PASS=0
FAIL=0
TOTAL=0

test_case() {
    local desc="$1"
    local msg="$2"
    local expected_harvest="$3"

    TOTAL=$((TOTAL+1))
    RESULT=$(echo "$msg" | bash "$SCRIPT_DIR/intent-probe.sh")
    ACTUAL=$(echo "$RESULT" | jq -r '.should_harvest')
    INTENT=$(echo "$RESULT" | jq -r '.intent_type')
    ENGINE=$(echo "$RESULT" | jq -r '.engine // "unknown"')

    if [ "$ACTUAL" = "$expected_harvest" ]; then
        echo "✅ [$TOTAL] $desc → $INTENT (harvest=$ACTUAL) [$ENGINE]"
        PASS=$((PASS+1))
    else
        echo "❌ [$TOTAL] $desc → $INTENT (expected=$expected_harvest actual=$ACTUAL) [$ENGINE]"
        echo "   完整响应: $RESULT"
        FAIL=$((FAIL+1))
    fi
}

echo "=========================================================="
echo " C2 自动采集 v2 快速回归测试 (16 核心case)"
echo " 引擎: v2-llm / v1-keyword-fallback"
echo " 时间: $(date -Iseconds)"
echo "=========================================================="
echo ""

# === 8种场景正例 (should_harvest=true) ===
echo "--- 正例 (should_harvest=true) ---"
test_case "纠偏:直接指出错误"        "任务刷新有误，产品洞察任务早就好了"            "true"
test_case "否定:明确拒绝"              "不要这样做，停下来"                            "true"
test_case "反复未果:多次出错"          "这是第三次出这个问题了"                        "true"
test_case "自主性缺失:不该我提醒"      "这个不应该我来提醒，你自己应该检查到"          "true"
test_case "教学:传授规则"              "记住这个铁律：先写测试再写代码"                "true"
test_case "交付质量:半成品"            "这个报告写了一半就交了，不完整"                "true"
test_case "认知错误:理解偏差"          "我说的不是这个意思，你理解错了"                "true"
test_case "连锁跷跷板:修A坏B"         "你修了登录页面，结果注册页挂了"                "true"
echo ""

# === 反例 (should_harvest=false) ===
echo "--- 反例 (should_harvest=false) ---"
test_case "正常指令"                    "帮我查一下明天的日程"                          "false"
test_case "正常闲聊"                    "今天天气真好"                                  "false"
test_case "根因请求(不harvest)"         "为什么会出现这个报错"                          "false"
test_case "正常方案讨论"                "我觉得这个方案还不错"                          "false"
test_case "正常技术提问"                "帮我列一下这个项目用了哪些依赖"                "false"
test_case "正常格式要求"                "导出为CSV格式"                                 "false"
test_case "正常补充说明"                "我的邮箱是test@example.com，用这个"            "false"
test_case "正常请求帮助"                "帮我检查一下这段代码有没有bug"                 "false"

echo ""
echo "=========================================================="
echo " 结果: $PASS/$TOTAL 通过 ($FAIL 失败)"
echo "=========================================================="

if [ "$FAIL" -gt 0 ]; then
    echo "⚠️  存在失败case"
    exit 1
else
    echo "✅ 全部通过！"
    exit 0
fi
