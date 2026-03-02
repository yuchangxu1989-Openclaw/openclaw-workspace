#!/bin/bash
# ISC规则整理脚本
# 统一规则格式和目录结构

echo "=========================================="
echo "ISC规则整理"
echo "=========================================="
echo ""

cd /root/.openclaw/workspace/skills/isc-core

# 统计
echo "当前规则分布:"
echo "  rules/: $(find rules -name '*.json' -type f 2>/dev/null | wc -l) 个"
echo "  standards/: $(find standards -name '*.json' -type f 2>/dev/null | wc -l) 个"
echo ""

# 列出所有规则（按domain分组）
echo "按Domain分组:"
for domain in quality naming process interaction security decision detection; do
  count=$(grep -l "\"domain\": *\"$domain\"" rules/*.json standards/*.json 2>/dev/null | wc -l)
  echo "  $domain: $count 个"
done

echo ""
echo "格式不统一的规则:"
ls -1 rules/*.json standards/*.json 2>/dev/null | grep -v "^rule\." | grep -v "^R[0-9]"

echo ""
echo "建议:"
echo "  1. 所有规则统一放到 rules/ 目录"
echo "  2. 命名格式: rule.{domain}-{name}-{version}.json"
echo "  3. 删除子目录，用domain字段分类"
echo "  4. standards/ 只保留标准模板"
echo ""
echo "=========================================="
