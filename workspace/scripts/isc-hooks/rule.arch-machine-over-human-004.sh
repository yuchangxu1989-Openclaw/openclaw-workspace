#!/usr/bin/env bash
# Handler: rule.arch-machine-over-human-004
# 机器优先于人工 — 检测手工操作并建议自动化替代
set -euo pipefail

RULE_ID="rule.arch-machine-over-human-004"
WORKSPACE="${WORKSPACE:-$(git rev-parse --show-toplevel 2>/dev/null || echo .)}"
STATUS="pass"

python3 - "$WORKSPACE" << 'PY'
import json, sys, os, re, glob

workspace = sys.argv[1]
manual_patterns = [
    (r'手[动工]', 'manual operation (手动/手工)'),
    (r'人[工肉]', 'human labor (人工/人肉)'),
    (r'manually', 'manual operation (manually)'),
    (r'copy.?paste|复制粘贴', 'copy-paste anti-pattern'),
    (r'手动检查|manual.?check', 'manual check (should automate)'),
    (r'人为判断|human.?judgment', 'human judgment (should codify)'),
    (r'TODO.*manual|FIXME.*manual', 'TODO/FIXME manual marker'),
]

violations = []
scanned = 0

for ext in ['*.md', '*.json', '*.sh', '*.js', '*.py']:
    for fpath in glob.glob(os.path.join(workspace, '**', ext), recursive=True):
        if '.git' in fpath or 'node_modules' in fpath:
            continue
        scanned += 1
        try:
            content = open(fpath, 'r', errors='ignore').read()
        except:
            continue
        for pattern, desc in manual_patterns:
            matches = re.findall(pattern, content, re.IGNORECASE)
            if matches:
                violations.append({
                    'file': os.path.relpath(fpath, workspace),
                    'pattern': desc,
                    'count': len(matches)
                })

status = 'fail' if violations else 'pass'
# Deduplicate and limit
seen = set()
unique = []
for v in violations:
    key = f"{v['file']}:{v['pattern']}"
    if key not in seen:
        seen.add(key)
        unique.append(v)

result = {
    'rule_id': 'rule.arch-machine-over-human-004',
    'status': status,
    'detail': f"scanned {scanned} files, {len(unique)} manual-operation patterns found",
    'violations': unique[:30],
    'recommendation': 'Replace manual operations with automated scripts/hooks/pipelines' if violations else 'No manual operations detected'
}
print(json.dumps(result, ensure_ascii=False))
PY
