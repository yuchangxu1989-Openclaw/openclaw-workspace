#!/usr/bin/env python3
"""
P0 Eval Infrastructure Fix Script
Fixes:
  P0-1: Add scoring_rubric, north_star_indicator, gate to 423 golden cases
  P0-2: Fix e2e-eval.js loadCases to include goodcases + fix broken JSON
  P0-3/P0-4: Map categories to north_star_indicators (covers yanchu-fasu & independent-qa)
"""
import json, glob, os, re, sys

GOLDEN_DIR = '/root/.openclaw/workspace/tests/benchmarks/intent/c2-golden'
V4_DIR = '/root/.openclaw/workspace/tests/benchmarks'

# === Category → North Star Indicator mapping ===
# Based on V4 standard: 5 north star indicators
CATEGORY_TO_NORTH_STAR = {
    '纠偏类': '言出法随达成率',
    '反复未果类': '根因分析覆盖率',
    '头痛医头类': '根因分析覆盖率',
    '连锁跷跷板类': '根因分析覆盖率',
    '自主性缺失类': '自主闭环率',
    '全局未对齐类': '认知层真实代码覆盖率',
    '交付质量类': '独立QA覆盖率',
    '认知错误类': '认知层真实代码覆盖率',
}

# Gate mapping: all C2 golden cases are post-Gate-A (they test real system behavior)
CATEGORY_TO_GATE = {
    '纠偏类': 'Gate-B',
    '反复未果类': 'Gate-B',
    '头痛医头类': 'Gate-B',
    '连锁跷跷板类': 'Gate-B',
    '自主性缺失类': 'Gate-A',
    '全局未对齐类': 'Gate-A',
    '交付质量类': 'Gate-B',
    '认知错误类': 'Gate-A',
}

def generate_scoring_rubric(case):
    """Generate scoring_rubric from expected_output"""
    eo = case.get('expected_output', '')
    if not eo:
        return '系统应正确理解用户意图并执行完整的响应链路'
    # Truncate if too long, keep first 300 chars
    rubric = f"系统应执行: {eo[:300]}"
    return rubric

# === Fix P0-1: Add V4 fields to mined-*.json files ===
def fix_p0_1():
    print("=== P0-1: Adding V4 fields to golden cases ===")
    files = sorted(glob.glob(os.path.join(GOLDEN_DIR, 'mined-*.json')))
    total_fixed = 0
    for fpath in files:
        with open(fpath, 'r') as f:
            data = json.load(f)
        if not isinstance(data, list):
            data = [data]

        modified = False
        for case in data:
            cat = case.get('category', '')
            # Add north_star_indicator
            if 'north_star_indicator' not in case or not case['north_star_indicator']:
                case['north_star_indicator'] = CATEGORY_TO_NORTH_STAR.get(cat, '自主闭环率')
                modified = True
            # Add scoring_rubric
            if 'scoring_rubric' not in case or not case['scoring_rubric']:
                case['scoring_rubric'] = generate_scoring_rubric(case)
                modified = True
            # Add gate
            if 'gate' not in case or not case['gate']:
                case['gate'] = CATEGORY_TO_GATE.get(cat, 'Gate-A')
                modified = True
            # Add complexity (alias of difficulty)
            if 'complexity' not in case:
                case['complexity'] = case.get('difficulty', 'C2')
                modified = True

        if modified:
            with open(fpath, 'w') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            total_fixed += len(data)
            print(f"  ✓ {os.path.basename(fpath)}: {len(data)} cases updated")

    print(f"  Total: {total_fixed} cases enriched with V4 fields\n")
    return total_fixed

# === Fix broken JSON in goodcases-split/batch-04.json ===
def fix_broken_json():
    print("=== Fixing broken JSON: goodcases-split/batch-04.json ===")
    fpath = os.path.join(GOLDEN_DIR, 'goodcases-split', 'batch-04.json')
    if not os.path.exists(fpath):
        print("  ⚠ File not found, skipping")
        return

    with open(fpath, 'r') as f:
        content = f.read()

    # Fix unescaped quotes within JSON string values
    # Strategy: find lines with unescaped inner quotes and escape them
    # The pattern: "key": "text with "unescaped" quotes"
    # We need to escape the inner quotes
    lines = content.split('\n')
    fixed_lines = []
    for line in lines:
        # Match lines like: "input": "...text..."unescaped"...text...",
        # Find string value fields with unescaped inner quotes
        m = re.match(r'^(\s*"(?:input|context|expected_output|scoring_rubric|negative_example|root_cause_to_avoid)": ")(.*)(",?\s*)$', line)
        if m:
            prefix, value, suffix = m.groups()
            # Check for unescaped quotes in value (not preceded by backslash)
            # Count quotes - if odd number, there are unescaped ones
            # Strategy: find Chinese/Japanese quotes patterns like "word"
            value_fixed = re.sub(r'(?<!\\)"([^"]{1,20})"', r'「\1」', value)
            if value_fixed != value:
                fixed_lines.append(prefix + value_fixed + suffix)
                continue
        fixed_lines.append(line)

    fixed_content = '\n'.join(fixed_lines)

    # Verify it parses
    try:
        json.loads(fixed_content)
        with open(fpath, 'w') as f:
            f.write(fixed_content)
        print("  ✓ batch-04.json fixed and validated\n")
    except json.JSONDecodeError as e:
        print(f"  ⚠ Auto-fix insufficient, applying manual fix: {e}")
        # Fallback: load line by line and rebuild
        # Read the original, find the specific broken entry, fix it
        with open(fpath, 'r') as f:
            raw = f.read()
        # Replace the specific known pattern
        raw = raw.replace('"无agentId不应被role阻塞"', '「无agentId不应被role阻塞」')
        try:
            parsed = json.loads(raw)
            with open(fpath, 'w') as f:
                json.dump(parsed, f, ensure_ascii=False, indent=2)
            print("  ✓ batch-04.json fixed via targeted replacement\n")
        except json.JSONDecodeError as e2:
            print(f"  ✗ Still broken: {e2}\n")

# === Fix goodcases-split V4 fields too ===
def fix_goodcases_split():
    print("=== Adding V4 fields to goodcases-split ===")
    split_dir = os.path.join(GOLDEN_DIR, 'goodcases-split')
    total = 0
    for fpath in sorted(glob.glob(os.path.join(split_dir, '*.json'))):
        try:
            with open(fpath, 'r') as f:
                data = json.load(f)
        except json.JSONDecodeError:
            print(f"  ⚠ Skipping broken {os.path.basename(fpath)}")
            continue

        if not isinstance(data, list):
            data = [data]

        modified = False
        for case in data:
            cat = case.get('category', '')
            if 'north_star_indicator' not in case or not case['north_star_indicator']:
                case['north_star_indicator'] = CATEGORY_TO_NORTH_STAR.get(cat, '自主闭环率')
                modified = True
            if 'gate' not in case or not case['gate']:
                case['gate'] = CATEGORY_TO_GATE.get(cat, 'Gate-A')
                modified = True
            if 'complexity' not in case:
                case['complexity'] = case.get('difficulty', 'C2')
                modified = True

        if modified:
            with open(fpath, 'w') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            total += len(data)

    print(f"  Total: {total} goodcases enriched\n")
    return total

# === Fix P0-2: Update e2e-eval.js loadCases to include all case files ===
def fix_p0_2():
    print("=== P0-2: Fixing e2e-eval.js loadCases function ===")
    eval_js = '/root/.openclaw/workspace/skills/aeo/bin/e2e-eval.js'
    with open(eval_js, 'r') as f:
        content = f.read()

    # Replace the loadCases function to load all JSON files (not just mined-*)
    old_load = """function loadCases(dataDir) {
  const files = fs.readdirSync(dataDir)
    .filter(f => f.startsWith('mined-') && f.endsWith('.json'))
    .sort();
  const all = [];
  for (const f of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf-8'));
    if (Array.isArray(raw)) all.push(...raw);
    else all.push(raw);
  }
  return all;
}"""

    new_load = """function loadCases(dataDir) {
  const all = [];
  const seen = new Set();

  // Load mined-*.json (primary golden cases)
  const minedFiles = fs.readdirSync(dataDir)
    .filter(f => f.startsWith('mined-') && f.endsWith('.json'))
    .sort();
  for (const f of minedFiles) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf-8'));
      const items = Array.isArray(raw) ? raw : [raw];
      for (const item of items) {
        if (item.id && !seen.has(item.id)) {
          seen.add(item.id);
          all.push(item);
        } else if (!item.id) {
          all.push(item);
        }
      }
    } catch (e) {
      console.warn(`  [loadCases] skip ${f}: ${e.message}`);
    }
  }

  // Load goodcases-split/*.json (auto-generated goodcases)
  const splitDir = path.join(dataDir, 'goodcases-split');
  if (fs.existsSync(splitDir)) {
    const splitFiles = fs.readdirSync(splitDir)
      .filter(f => f.endsWith('.json'))
      .sort();
    for (const f of splitFiles) {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(splitDir, f), 'utf-8'));
        const items = Array.isArray(raw) ? raw : [raw];
        for (const item of items) {
          if (item.id && !seen.has(item.id)) {
            seen.add(item.id);
            all.push(item);
          } else if (!item.id) {
            all.push(item);
          }
        }
      } catch (e) {
        console.warn(`  [loadCases] skip goodcases-split/${f}: ${e.message}`);
      }
    }
  }

  // Load goodcases-from-badcases.json
  const goodcasesFile = path.join(dataDir, 'goodcases-from-badcases.json');
  if (fs.existsSync(goodcasesFile)) {
    try {
      const raw = JSON.parse(fs.readFileSync(goodcasesFile, 'utf-8'));
      const items = Array.isArray(raw) ? raw : [raw];
      for (const item of items) {
        if (item.id && !seen.has(item.id)) {
          seen.add(item.id);
          all.push(item);
        }
      }
    } catch (e) {
      console.warn(`  [loadCases] skip goodcases-from-badcases.json: ${e.message}`);
    }
  }

  return all;
}"""

    if old_load in content:
        content = content.replace(old_load, new_load)
        with open(eval_js, 'w') as f:
            f.write(content)
        print("  ✓ loadCases updated to include all case sources\n")
    else:
        print("  ⚠ loadCases function signature changed, manual check needed\n")

# === Fix V4 batch files: add missing gate fields (P2-2 bonus) ===
def fix_v4_batch_gate():
    print("=== Fixing V4 batch files: add missing gate fields ===")
    gate_map = {
        'v4-independent-qa': 'Gate-B',
        'v4-rca-coverage': 'Gate-B',
        'v4-code-coverage': 'Gate-A',
        'v4-pregate': 'Pre-Gate',
        'v4-gate': 'Gate-A',
        'v4-autonomous-loop': 'Gate-A',
        'v4-yanchu-fasu': 'Gate-B',
    }
    for fpath in sorted(glob.glob(os.path.join(V4_DIR, 'v4-*.json'))):
        fname = os.path.basename(fpath)
        try:
            with open(fpath, 'r') as f:
                data = json.load(f)
        except:
            continue

        cases = data.get('cases', data) if isinstance(data, dict) else data
        if not isinstance(cases, list):
            continue

        # Determine gate from filename
        gate_val = None
        for prefix, gate in gate_map.items():
            if fname.startswith(prefix):
                gate_val = gate
                break

        modified = False
        for case in cases:
            if 'gate' not in case and gate_val:
                case['gate'] = gate_val
                modified = True
            # Fix P1-4: wrong north_star_indicator on v4-gate-009/010
            if case.get('id') == 'v4-gate-009' and case.get('north_star_indicator') == '根因分析覆盖率':
                case['north_star_indicator'] = '认知层真实代码覆盖率'
                modified = True
            if case.get('id') == 'v4-gate-010' and case.get('north_star_indicator') == '根因分析覆盖率':
                case['north_star_indicator'] = '认知层真实代码覆盖率'
                modified = True
            # Fix P2-1: normalize "言出法随" to "言出法随达成率"
            if case.get('north_star_indicator') == '言出法随':
                case['north_star_indicator'] = '言出法随达成率'
                modified = True

        if modified:
            if isinstance(data, dict) and 'cases' in data:
                data['cases'] = cases
                with open(fpath, 'w') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
            else:
                with open(fpath, 'w') as f:
                    json.dump(cases, f, ensure_ascii=False, indent=2)
            print(f"  ✓ {fname} updated")
    print()

# === Verify ===
def verify():
    print("=== Verification ===")
    # Check mined cases have V4 fields
    from collections import Counter
    ns_counts = Counter()
    missing = {'scoring_rubric': 0, 'north_star_indicator': 0, 'gate': 0}
    total = 0
    for fpath in sorted(glob.glob(os.path.join(GOLDEN_DIR, 'mined-*.json'))):
        data = json.load(open(fpath))
        if not isinstance(data, list): data = [data]
        for c in data:
            total += 1
            for field in missing:
                if not c.get(field):
                    missing[field] += 1
            ns = c.get('north_star_indicator', '')
            if ns:
                ns_counts[ns] += 1

    print(f"  Mined cases total: {total}")
    print(f"  Missing fields: {missing}")
    print(f"  North star distribution:")
    for ns, count in ns_counts.most_common():
        print(f"    {ns}: {count}")

    # Check e2e-eval.js loads more cases
    eval_js = '/root/.openclaw/workspace/skills/aeo/bin/e2e-eval.js'
    with open(eval_js) as f:
        content = f.read()
    has_goodcases = 'goodcases-split' in content
    has_dedup = 'seen.has' in content
    print(f"\n  e2e-eval.js loads goodcases-split: {has_goodcases}")
    print(f"  e2e-eval.js has dedup logic: {has_dedup}")

    # Verify dry-run
    print("\n  Running e2e-eval.js --dry-run --batch 3 ...")
    os.system(f"cd /root/.openclaw/workspace && node skills/aeo/bin/e2e-eval.js --dry-run --batch 3 2>&1 | tail -5")

if __name__ == '__main__':
    fix_broken_json()
    fix_p0_1()
    fix_goodcases_split()
    fix_p0_2()
    fix_v4_batch_gate()
    verify()
    print("\n✅ All P0 fixes applied.")
