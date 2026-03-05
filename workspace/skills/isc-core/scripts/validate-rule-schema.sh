#!/usr/bin/env bash
# ============================================================
#  validate-rule-schema.sh  —  ISC规则Schema校验入口
#  用法:
#    ./validate-rule-schema.sh            # 校验全部规则
#    ./validate-rule-schema.sh --fix      # 自动修复schema_version
#    ./validate-rule-schema.sh --file rule.anti-entropy-design-principle-001.json
#    ./validate-rule-schema.sh --report   # 输出JSON报告
#    ./validate-rule-schema.sh --strict   # 严格模式（验证handler路径）
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VALIDATOR="${SCRIPT_DIR}/validate-rule-schema.py"

if [ ! -f "$VALIDATOR" ]; then
  echo "❌ 校验脚本不存在: $VALIDATOR"
  exit 1
fi

exec python3 "$VALIDATOR" "$@"
