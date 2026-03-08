#!/usr/bin/env bash
# badcase→goodcase 自动翻转（全量扫描版）
# 扫描 c2-golden/ 下所有json文件，翻转为goodcase
# 触发方式：ISC rule badcase-auto-flip-001 / pre-commit hook / 手动

set -euo pipefail
DIR="/root/.openclaw/workspace/tests/benchmarks/intent/c2-golden"
OUT="$DIR/goodcases-from-badcases.json"

python3 -c "
import json, os, glob

goodcases = []
src_dir = '$DIR'

for fpath in sorted(glob.glob(f'{src_dir}/*.json')):
    fname = os.path.basename(fpath)
    if fname == 'goodcases-from-badcases.json':
        continue
    try:
        cases = json.load(open(fpath))
        if not isinstance(cases, list): continue
    except: continue
    
    for c in cases:
        if not isinstance(c, dict): continue
        cid = c.get('id', fname.replace('.json',''))
        exp = c.get('expected_behavior') or c.get('expected_chain') or c.get('expected_output') or ''
        act = c.get('actual_behavior') or c.get('actual_chain') or ''
        rc = c.get('root_cause', '')
        inp = c.get('input', '')
        ctx = c.get('context', '')
        if not exp or not inp: continue
        goodcases.append({
            'id': f'goodcase-{cid}',
            'input': inp,
            'context': ctx,
            'expected_output': exp,
            'scoring_rubric': f'系统应执行: {exp[:100]}',
            'negative_example': act,
            'root_cause_to_avoid': rc,
            'difficulty': c.get('difficulty', 'C2'),
            'source': 'badcase_flip',
            'original_badcase_id': cid,
            'original_file': fname
        })

json.dump(goodcases, open('$OUT', 'w'), ensure_ascii=False, indent=2)
print(f'翻转完成: {len(goodcases)} goodcases')
"
