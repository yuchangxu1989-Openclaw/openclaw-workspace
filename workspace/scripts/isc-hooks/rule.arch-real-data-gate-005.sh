#!/usr/bin/env bash
# Handler: rule.arch-real-data-gate-005
# 真实数据门禁 — 检测合成/模拟数据，确保验收使用真实数据
set -euo pipefail

RULE_ID="rule.arch-real-data-gate-005"
WORKSPACE="${WORKSPACE:-$(git rev-parse --show-toplevel 2>/dev/null || echo .)}"

python3 - "$WORKSPACE" << 'PY'
import json, sys, os, re, glob

workspace = sys.argv[1]
synthetic_markers = [
    (r'mock|模拟|伪造|fake|dummy|placeholder', 'synthetic/mock data marker'),
    (r'sample.?data|示例数据|测试数据|test.?data', 'sample/test data'),
    (r'lorem.?ipsum|xxx+|placeholder', 'placeholder content'),
    (r'硬编码|hardcod', 'hardcoded data'),
    (r'随机生成|random.?generat', 'randomly generated data'),
]

# Focus on eval/benchmark/acceptance files
target_dirs = ['eval', 'benchmark', 'acceptance', 'test', 'data']
violations = []
scanned = 0

for tdir in target_dirs:
    for ext in ['*.json', '*.md', '*.csv', '*.yaml', '*.yml']:
        pattern = os.path.join(workspace, '**', tdir, '**', ext)
        for fpath in glob.glob(pattern, recursive=True):
            if '.git' in fpath:
                continue
            scanned += 1
            try:
                content = open(fpath, 'r', errors='ignore').read()
            except:
                continue
            for pat, desc in synthetic_markers:
                if re.search(pat, content, re.IGNORECASE):
                    violations.append({
                        'file': os.path.relpath(fpath, workspace),
                        'marker': desc
                    })
                    break  # one violation per file is enough

# Also scan root-level data files
for ext in ['*.json', '*.csv']:
    for fpath in glob.glob(os.path.join(workspace, ext)):
        scanned += 1
        try:
            content = open(fpath, 'r', errors='ignore').read()
        except:
            continue
        for pat, desc in synthetic_markers:
            if re.search(pat, content, re.IGNORECASE):
                violations.append({'file': os.path.relpath(fpath, workspace), 'marker': desc})
                break

status = 'fail' if violations else 'pass'
result = {
    'rule_id': 'rule.arch-real-data-gate-005',
    'status': status,
    'detail': f"scanned {scanned} data files, {len(violations)} synthetic data indicators found",
    'violations': violations[:30],
    'recommendation': 'Replace synthetic/mock data with real production data for acceptance testing' if violations else 'All data appears to be real'
}
print(json.dumps(result, ensure_ascii=False))
PY
