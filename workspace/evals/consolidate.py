#!/usr/bin/env python3
"""评测集大盘点+归拢统一脚本"""
import json, glob, os, hashlib, datetime

WORKSPACE = '/root/.openclaw/workspace'
OUTPUT_DIR = os.path.join(WORKSPACE, 'evals/unified')
os.makedirs(OUTPUT_DIR, exist_ok=True)

all_cases = []       # All normalized cases
source_stats = {}    # source -> {raw, v4, duped}
seen_hashes = {}     # content_hash -> first case id

def content_hash(case):
    """Hash by input+expected content for dedup"""
    inp = case.get('input', '')
    exp = case.get('expected', '')
    if isinstance(inp, dict): inp = json.dumps(inp, sort_keys=True, ensure_ascii=False)
    if isinstance(exp, dict): exp = json.dumps(exp, sort_keys=True, ensure_ascii=False)
    raw = f"{inp}|||{exp}"
    return hashlib.md5(raw.encode()).hexdigest()[:16]

def normalize(case, skill, source, seq):
    """Normalize any format to unified schema"""
    cid = case.get('id', case.get('case_id', f'eval-{skill}-{seq:03d}'))
    
    # Extract input - various field names
    inp = case.get('input', case.get('description', case.get('chunk', case.get('query', case.get('utterance', '')))))
    if isinstance(inp, dict):
        inp_str = inp.get('description', inp.get('utterance', inp.get('action', json.dumps(inp, ensure_ascii=False))))
    else:
        inp_str = str(inp)
    
    # Extract expected
    exp = case.get('expected', case.get('expectedOutput', ''))
    if isinstance(exp, dict):
        exp_str = json.dumps(exp, ensure_ascii=False)
    elif isinstance(exp, bool):
        exp_str = str(exp)
    else:
        exp_str = str(exp)
    
    # Type
    tp = case.get('type', case.get('verdict_expectation', 'positive'))
    if tp in ('SUCCESS', True, 'true'):
        tp = 'positive'
    elif tp in ('FAILURE', False, 'false'):
        tp = 'negative'
    
    # V4 fields
    scoring = case.get('scoring_rubric', '')
    north_star = case.get('north_star_indicator', '')
    gate = case.get('gate', '')
    
    return {
        'id': str(cid),
        'skill': skill,
        'type': tp,
        'input': inp_str,
        'expected': exp_str,
        'scoring_rubric': scoring,
        'north_star_indicator': north_star,
        'gate': gate,
        'source': source
    }

def track_source(source_name, count, v4_count):
    source_stats[source_name] = {'raw': count, 'v4': v4_count, 'duped': 0}

def add_cases(cases_list, skill, source_name):
    v4 = 0
    for i, c in enumerate(cases_list):
        nc = normalize(c, skill, source_name, i+1)
        if nc.get('scoring_rubric') or nc.get('north_star_indicator') or nc.get('gate'):
            v4 += 1
        ch = content_hash(nc)
        if ch in seen_hashes:
            source_stats.setdefault(source_name, {'raw': 0, 'v4': 0, 'duped': 0})
            source_stats[source_name]['duped'] = source_stats[source_name].get('duped', 0) + 1
        else:
            seen_hashes[ch] = nc['id']
            all_cases.append(nc)
    track_source(source_name, len(cases_list), v4)

def load_json(path):
    with open(path) as f:
        return json.load(f)

def extract_cases(data):
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ('evaluations', 'cases', 'testCases', 'test_cases'):
            if key in data and isinstance(data[key], list):
                return data[key]
    return []

# ============================================================
# Source 1: skills/*/evals/evals.json
# ============================================================
for f in sorted(glob.glob(os.path.join(WORKSPACE, 'skills/*/evals/evals.json'))):
    skill = f.split('/')[-3]
    try:
        d = load_json(f)
        cases = extract_cases(d)
        add_cases(cases, skill, f'skill-evals/{skill}')
    except: pass

# ============================================================
# Source 2: skills/aeo/evaluation-sets/*/test-cases.json
# ============================================================
for f in sorted(glob.glob(os.path.join(WORKSPACE, 'skills/aeo/evaluation-sets/*/test-cases.json'))):
    skill = f.split('/')[-2]
    try:
        d = load_json(f)
        cases = extract_cases(d)
        add_cases(cases, skill, f'evaluation-sets/{skill}')
    except: pass

# ============================================================
# Source 3: unified-evaluation-sets sub-dirs (function-tests, ai-effect-tests)
# ============================================================
for f in sorted(glob.glob(os.path.join(WORKSPACE, 'skills/aeo/unified-evaluation-sets/*/*.json'))):
    name = '/'.join(f.split('/')[-2:])
    try:
        d = load_json(f)
        cases = extract_cases(d)
        if cases:
            skill = os.path.splitext(os.path.basename(f))[0].replace('-cases', '')
            add_cases(cases, skill, f'unified/{name}')
    except: pass

# ============================================================
# Source 4: registry inline cases
# ============================================================
try:
    reg = load_json(os.path.join(WORKSPACE, 'skills/aeo/unified-evaluation-sets/registry.json'))
    for sid, s in reg.get('sets', {}).items():
        if s.get('location', {}).get('type') == 'inline':
            cases = s.get('cases', s.get('testCases', []))
            if cases:
                skill = s.get('targetSkill', sid)
                add_cases(cases, skill, f'registry-inline/{sid}')
except: pass

# ============================================================
# Source 5: eval.file-tool.001.json standalone
# ============================================================
try:
    d = load_json(os.path.join(WORKSPACE, 'skills/aeo/unified-evaluation-sets/eval.file-tool.001.json'))
    cases = extract_cases(d)
    if cases:
        add_cases(cases, 'file-tool', 'unified/eval.file-tool.001')
except: pass

# ============================================================
# Source 6: generated/evalset-refresh-batch
# ============================================================
try:
    d = load_json(os.path.join(WORKSPACE, 'skills/aeo/generated/evalset-refresh/evalset-refresh-batch.json'))
    cases = d if isinstance(d, list) else []
    if cases:
        add_cases(cases, 'evalset-refresh', 'generated/evalset-refresh-batch')
except: pass

# ============================================================
# Write unified output
# ============================================================
# Sort by skill then id
all_cases.sort(key=lambda c: (c['skill'], c['id']))

# Reassign sequential IDs
for i, c in enumerate(all_cases):
    c['id'] = f'eval-{i+1:04d}'

# Write main file
out_path = os.path.join(OUTPUT_DIR, 'all-cases.json')
with open(out_path, 'w') as f:
    json.dump(all_cases, f, indent=2, ensure_ascii=False)

# Write per-skill files
skills_dir = os.path.join(OUTPUT_DIR, 'by-skill')
os.makedirs(skills_dir, exist_ok=True)
by_skill = {}
for c in all_cases:
    by_skill.setdefault(c['skill'], []).append(c)
for skill, cases in by_skill.items():
    with open(os.path.join(skills_dir, f'{skill}.json'), 'w') as f:
        json.dump(cases, f, indent=2, ensure_ascii=False)

# ============================================================
# Generate report
# ============================================================
total_raw = sum(s['raw'] for s in source_stats.values())
total_duped = sum(s.get('duped', 0) for s in source_stats.values())
total_v4_raw = sum(s['v4'] for s in source_stats.values())
total_after_dedup = len(all_cases)
total_v4_after = sum(1 for c in all_cases if c.get('scoring_rubric') or c.get('north_star_indicator') or c.get('gate'))

report_lines = []
report_lines.append("# 评测集大盘点报告")
report_lines.append(f"生成时间: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
report_lines.append("")
report_lines.append("## 总览")
report_lines.append(f"| 指标 | 数值 |")
report_lines.append(f"|------|------|")
report_lines.append(f"| 来源数 | {len(source_stats)} |")
report_lines.append(f"| 原始总条数 | {total_raw} |")
report_lines.append(f"| 重复条数 | {total_duped} |")
report_lines.append(f"| 去重后条数 | {total_after_dedup} |")
report_lines.append(f"| V4字段覆盖(去重后) | {total_v4_after}/{total_after_dedup} ({total_v4_after*100//max(total_after_dedup,1)}%) |")
report_lines.append(f"| 覆盖技能数 | {len(by_skill)} |")
report_lines.append("")

# By category
report_lines.append("## 按来源分类")
report_lines.append("| 来源类别 | 来源数 | 原始条数 | V4条数 | 重复条数 |")
report_lines.append("|----------|--------|----------|--------|----------|")
cats = {}
for k, v in source_stats.items():
    cat = k.split('/')[0]
    if cat not in cats:
        cats[cat] = {'sources': 0, 'raw': 0, 'v4': 0, 'duped': 0}
    cats[cat]['sources'] += 1
    cats[cat]['raw'] += v['raw']
    cats[cat]['v4'] += v['v4']
    cats[cat]['duped'] += v.get('duped', 0)
for cat, v in sorted(cats.items()):
    report_lines.append(f"| {cat} | {v['sources']} | {v['raw']} | {v['v4']} | {v['duped']} |")
report_lines.append("")

# By skill (top 20)
report_lines.append("## 按技能分布 (去重后)")
report_lines.append("| 技能 | 条数 | V4覆盖 |")
report_lines.append("|------|------|--------|")
for skill in sorted(by_skill.keys()):
    cases = by_skill[skill]
    v4c = sum(1 for c in cases if c.get('scoring_rubric') or c.get('north_star_indicator') or c.get('gate'))
    report_lines.append(f"| {skill} | {len(cases)} | {v4c}/{len(cases)} |")
report_lines.append("")

# V4 gap analysis
report_lines.append("## V4字段缺失分析")
no_v4_skills = [s for s, cs in by_skill.items() if not any(c.get('scoring_rubric') or c.get('north_star_indicator') or c.get('gate') for c in cs)]
report_lines.append(f"完全无V4字段的技能: {len(no_v4_skills)}个")
for s in sorted(no_v4_skills):
    report_lines.append(f"  - {s} ({len(by_skill[s])}条)")
report_lines.append("")

report_lines.append("## 输出文件")
report_lines.append(f"- 统一评测集: `evals/unified/all-cases.json` ({total_after_dedup}条)")
report_lines.append(f"- 按技能拆分: `evals/unified/by-skill/` ({len(by_skill)}个文件)")

report = '\n'.join(report_lines)
with open(os.path.join(WORKSPACE, 'evals/unified/inventory-report.md'), 'w') as f:
    f.write(report)

print(report)
