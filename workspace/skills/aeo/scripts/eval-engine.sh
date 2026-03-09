#!/usr/bin/env bash
# eval-engine.sh — 评测用例角色分离引擎
# 核心原则：执行者 ≠ 评测者
# 流程：读取c2-golden用例 → 派开发Agent执行 → 派质量分析Agent评测 → 汇总报告

set -euo pipefail

WORKSPACE="/root/.openclaw/workspace"
CASE_DIR="${WORKSPACE}/c2-golden"
RESULTS_DIR="${WORKSPACE}/scripts/results/eval-runs"
REPORT_FILE="${RESULTS_DIR}/eval-report-$(date +%Y%m%d-%H%M%S).json"
RUNNER_SCRIPT="${WORKSPACE}/scripts/eval-case-runner.js"

mkdir -p "$RESULTS_DIR"

echo "=========================================="
echo " 评测用例角色分离引擎"
echo " 执行者 ≠ 评测者"
echo "=========================================="
echo ""

# 收集所有评测用例
CASES=$(find "$CASE_DIR" -name '*.json' -type f 2>/dev/null | sort)
TOTAL=$(echo "$CASES" | grep -c . || echo 0)

if [ "$TOTAL" -eq 0 ]; then
  echo "[ERROR] 未找到评测用例: $CASE_DIR/*.json"
  exit 1
fi

echo "[INFO] 共发现 $TOTAL 个评测用例"
echo ""

# 初始化报告
cat > "$REPORT_FILE" <<EOF
{
  "engine": "eval-role-separation-engine",
  "timestamp": "$(date -Iseconds)",
  "principle": "执行者≠评测者",
  "total_cases": $TOTAL,
  "results": []
}
EOF

PASS=0
PARTIAL=0
BADCASE=0

for CASE_FILE in $CASES; do
  CASE_ID=$(basename "$CASE_FILE" .json)
  echo "────────────────────────────────────"
  echo "[CASE] $CASE_ID"
  echo "  文件: $CASE_FILE"

  # 调用eval-case-runner.js处理单个用例
  # 它会：1) 派开发Agent执行 2) 派质量Agent评测 3) 输出verdict
  RESULT=$(node "$RUNNER_SCRIPT" "$CASE_FILE" 2>&1) || {
    echo "  [ERROR] 用例运行失败: $RESULT"
    BADCASE=$((BADCASE + 1))
    continue
  }

  # 解析verdict
  VERDICT=$(echo "$RESULT" | grep -oP '"verdict"\s*:\s*"\K[^"]+' | head -1 || echo "unknown")

  case "$VERDICT" in
    Pass)    PASS=$((PASS + 1)) ;;
    Partial) PARTIAL=$((PARTIAL + 1)) ;;
    *)       BADCASE=$((BADCASE + 1)) ;;
  esac

  echo "  [VERDICT] $VERDICT"
  echo ""
done

echo "=========================================="
echo " 评测汇总"
echo "=========================================="
echo "  总用例:  $TOTAL"
echo "  Pass:    $PASS"
echo "  Partial: $PARTIAL"
echo "  Badcase: $BADCASE"
echo ""

# 角色分离覆盖率（本引擎所有用例均角色分离）
echo "  角色分离覆盖率: 100% (引擎强制)"
echo ""
echo "  报告: $REPORT_FILE"
echo "=========================================="
