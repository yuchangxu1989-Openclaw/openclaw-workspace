#!/usr/bin/env bash
# validate-single-case.sh — 单条 case 的评测标准合规验证（版本从isc-core/config动态读取）
# 用法: 
#   bash validate-single-case.sh '<json_string>'
#   echo '<json>' | bash validate-single-case.sh -
#   bash validate-single-case.sh /path/to/case.json
# 返回: exit 0 合规 (stdout: PASS), exit 1 不合规 (stdout: FAIL: reasons)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG="$SCRIPT_DIR/../config.json"

INPUT="${1:?用法: bash validate-single-case.sh '<json>' | - | file}"

TMPF=$(mktemp)
trap 'rm -f "$TMPF"' EXIT

if [ "$INPUT" = "-" ]; then
  cat > "$TMPF"
elif [ -f "$INPUT" ]; then
  cp "$INPUT" "$TMPF"
else
  echo "$INPUT" > "$TMPF"
fi

python3 - "$CONFIG" "$TMPF" << 'PYEOF'
import json, sys

config_path = sys.argv[1]
case_path = sys.argv[2]

with open(config_path) as f:
    config = json.load(f)

rules = config['quality_rules']

try:
    with open(case_path) as f:
        case = json.load(f)
except Exception:
    print("FAIL: invalid JSON")
    sys.exit(1)

errors = []

# Required fields
for field in rules['required_fields']:
    val = case.get(field)
    if val is None or (isinstance(val, str) and not val.strip()):
        errors.append(f"missing_field:{field}")

# Category
cat = case.get('category', '')
if cat and cat not in rules['valid_categories']:
    errors.append(f"invalid_category:{cat}")

# Difficulty
diff = case.get('difficulty', '')
if diff and diff not in rules['valid_difficulties']:
    errors.append(f"invalid_difficulty:{diff}")

# C2 requirements
c2 = rules['c2_requirements']
inp = case.get('input', '')
if isinstance(inp, str):
    inp_len = len(inp)
elif isinstance(inp, list):
    inp_len = sum(len(str(t)) for t in inp)
else:
    inp_len = 0

if inp_len < c2['min_input_length']:
    errors.append(f"input_too_short:{inp_len}<{c2['min_input_length']}")

if case.get('difficulty') == 'C2':
    steps = case.get('execution_steps', case.get('expected_output', ''))
    if isinstance(steps, list) and len(steps) < c2['min_execution_steps']:
        errors.append(f"too_few_steps:{len(steps)}<{c2['min_execution_steps']}")

if errors:
    print("FAIL: " + "; ".join(errors))
    sys.exit(1)
else:
    print("PASS")
    sys.exit(0)
PYEOF
