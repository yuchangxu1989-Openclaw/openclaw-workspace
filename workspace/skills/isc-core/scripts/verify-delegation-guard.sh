#!/bin/bash
echo "=== 主Agent委派守卫全局部署验证 ==="
echo ""

PASS=0
FAIL=0

echo -n "1. ISC规则 rule.main-agent-delegation-001.json: "
if [ -f "/root/.openclaw/workspace/skills/isc-core/rules/rule.main-agent-delegation-001.json" ]; then
  echo "✅"; ((PASS++))
else
  echo "❌"; ((FAIL++))
fi

echo -n "2. ISC规则 rule.doc-quality-gate-001.json: "
if [ -f "/root/.openclaw/workspace/skills/isc-core/rules/rule.doc-quality-gate-001.json" ]; then
  echo "✅"; ((PASS++))
else
  echo "❌"; ((FAIL++))
fi

echo -n "3. SOUL.md含委派铁律: "
if grep -q "MAIN-AGENT-DELEGATION" /root/.openclaw/workspace/SOUL.md 2>/dev/null; then
  echo "✅"; ((PASS++))
else
  echo "❌"; ((FAIL++))
fi

echo -n "4. CAPABILITY-ANCHOR.md含行为边界: "
if grep -q "主Agent行为边界" /root/.openclaw/workspace/CAPABILITY-ANCHOR.md 2>/dev/null; then
  echo "✅"; ((PASS++))
else
  echo "❌"; ((FAIL++))
fi

echo -n "5. AGENTS.md含委派自检: "
if grep -q "委派" /root/.openclaw/workspace/AGENTS.md 2>/dev/null; then
  echo "✅"; ((PASS++))
else
  echo "❌"; ((FAIL++))
fi

echo -n "6. startup-self-check.sh含委派检查: "
if grep -q "委派守卫" /root/.openclaw/workspace/scripts/startup-self-check.sh 2>/dev/null; then
  echo "✅"; ((PASS++))
else
  echo "❌"; ((FAIL++))
fi

echo -n "7. delegation-guard-check.sh存在且可执行: "
if [ -x "/root/.openclaw/workspace/scripts/delegation-guard-check.sh" ]; then
  echo "✅"; ((PASS++))
else
  echo "❌"; ((FAIL++))
fi

echo ""
echo "=== 结果: $PASS 通过 / $FAIL 失败 / 共 $((PASS+FAIL)) 项 ==="

if [ $FAIL -eq 0 ]; then
  echo "🛡️ 主Agent委派守卫全局部署完整！"
else
  echo "⚠️ 有 $FAIL 项未通过，需要修复！"
fi
