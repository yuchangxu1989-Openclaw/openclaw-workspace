#!/usr/bin/env bash
# rule.report-readability-001 — ISC-REPORT-READABILITY-001
# 扫描报告文件，检查可读性结构要素
RULE_ID="rule.report-readability-001"
WORKSPACE="/root/.openclaw/workspace"
REPORTS_DIR="$WORKSPACE/reports"
FAIL=0
VIOLATIONS=""

if [ ! -d "$REPORTS_DIR" ]; then
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"reports目录不存在，跳过\"}"
  exit 0
fi

for report in "$REPORTS_DIR"/*.md; do
  [ ! -f "$report" ] && continue
  name=$(basename "$report")
  
  # 检查必需结构: 结论/摘要, 背景, 核心发现, 建议
  HAS_CONCLUSION=$(grep -ci '结论\|摘要\|Summary\|Conclusion' "$report" 2>/dev/null || echo 0)
  HAS_BACKGROUND=$(grep -ci '背景\|Background\|目标' "$report" 2>/dev/null || echo 0)
  HAS_FINDINGS=$(grep -ci '发现\|Finding\|分析' "$report" 2>/dev/null || echo 0)
  
  MISSING_SECTIONS=0
  [ "$HAS_CONCLUSION" -eq 0 ] && MISSING_SECTIONS=$((MISSING_SECTIONS+1))
  [ "$HAS_BACKGROUND" -eq 0 ] && MISSING_SECTIONS=$((MISSING_SECTIONS+1))
  
  if [ "$MISSING_SECTIONS" -ge 2 ]; then
    VIOLATIONS="${VIOLATIONS}${name}:missing_key_sections; "
    FAIL=1
  fi
  
  # 检查是否有大段代码块（>20行）—— R3: 少提代码
  LONG_CODE=$(awk '/^```/{start=NR;lang=$0;next}/^```/{if(NR-start>20)count++}END{print count+0}' "$report" 2>/dev/null || echo 0)
  if [ "$LONG_CODE" -gt 0 ]; then
    VIOLATIONS="${VIOLATIONS}${name}:long_code_blocks(${LONG_CODE}); "
    FAIL=1
  fi
done

if [ "$FAIL" -eq 1 ]; then
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"fail\",\"detail\":\"可读性问题: ${VIOLATIONS}\"}"
  exit 1
else
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"报告可读性检查通过\"}"
  exit 0
fi
