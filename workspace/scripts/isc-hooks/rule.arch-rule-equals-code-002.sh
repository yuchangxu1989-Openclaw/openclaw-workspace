#!/usr/bin/env bash
# Handler: rule.arch-rule-equals-code-002
# 规则=代码审计 — 扫描ISC规则与handler脚本的配对率
set -euo pipefail

RULE_ID="rule.arch-rule-equals-code-002"
WORKSPACE="${WORKSPACE:-$(git rev-parse --show-toplevel 2>/dev/null || echo .)}"

python3 - "$WORKSPACE" << 'PY'
import json, sys, os, glob

workspace = sys.argv[1]
rules_dir = os.path.join(workspace, 'skills', 'isc-core', 'rules')
hooks_dir = os.path.join(workspace, 'scripts', 'isc-hooks')

# Collect all rule IDs
rules = {}
for f in glob.glob(os.path.join(rules_dir, '*.json')):
    try:
        d = json.load(open(f))
        rid = d.get('id', os.path.basename(f).replace('.json',''))
        handler = d.get('handler', '')
        rules[rid] = {'file': os.path.basename(f), 'handler': handler}
    except:
        continue

# Collect all hook scripts
hooks = set()
for f in glob.glob(os.path.join(hooks_dir, '*.sh')) + glob.glob(os.path.join(hooks_dir, '*.js')):
    hooks.add(os.path.basename(f).replace('.sh','').replace('.js',''))

# Compute pairing
paired = []
unpaired_rules = []
orphan_hooks = []

for rid, info in rules.items():
    if rid in hooks:
        paired.append(rid)
    else:
        unpaired_rules.append(rid)

for h in hooks:
    if h not in rules:
        orphan_hooks.append(h)

total = len(rules)
paired_count = len(paired)
rate = (paired_count / total * 100) if total > 0 else 0

status = 'pass' if rate >= 80 else 'fail'
result = {
    'rule_id': 'rule.arch-rule-equals-code-002',
    'status': status,
    'detail': f"pairing rate: {rate:.1f}% ({paired_count}/{total} rules have handler scripts)",
    'pairing_rate': round(rate, 1),
    'total_rules': total,
    'paired': paired_count,
    'unpaired_rules': unpaired_rules[:30],
    'orphan_hooks': orphan_hooks[:10]
}
print(json.dumps(result, ensure_ascii=False))
PY
