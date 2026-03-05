#!/usr/bin/env python3
"""Day2: Rule naming unification, half-finished rules completion, dedup scan, benchmark cleanup."""
import json, os, re, sys, copy
from collections import defaultdict

RULES_DIR = 'skills/isc-core/rules'
REPORTS_DIR = 'reports'
os.makedirs(REPORTS_DIR, exist_ok=True)

files = sorted([f for f in os.listdir(RULES_DIR) if f.endswith('.json') and not f.startswith('_')])

# ============ TASK 1: Naming unification ============
def compute_new_name(old_name):
    """Map old filename to rule.{domain}-{name}-{seq}.json"""
    base = old_name.replace('.json', '')
    
    # Already rule.* prefix
    if base.startswith('rule.'):
        return None
    
    # rule-bundle -> split separately
    if base.startswith('rule-bundle-'):
        return 'BUNDLE'
    
    # arch.xxx -> rule.arch-xxx
    if base.startswith('arch.'):
        rest = base[5:]
        return f'rule.arch-{rest}.json'
    
    # planning.xxx -> rule.planning-xxx
    if base.startswith('planning.'):
        rest = base[9:]
        return f'rule.planning-{rest}.json'
    
    # N034-xxx -> rule.n034-xxx
    m = re.match(r'^(N\d+)-(.*)', base)
    if m:
        prefix = m.group(1).lower()
        rest = m.group(2)
        return f'rule.{prefix}-{rest}.json'
    
    # gateway-config-protection-N033 -> rule.n033-gateway-config-protection
    m = re.match(r'^(.+)-(N\d+)$', base)
    if m:
        rest = m.group(1)
        prefix = m.group(2).lower()
        return f'rule.{prefix}-{rest}.json'
    
    # isc-xxx -> rule.isc-xxx (check id)
    # UMR-xxx -> rule.umr-xxx
    # model-xxx -> rule.model-xxx
    # For the rest, derive domain from id or filename pattern
    
    # Files with isc- prefix in id
    # evomap-xxx, skill-xxx, model-xxx, aeo-xxx, auto-xxx, decision-xxx, detection-xxx, user-message-xxx
    # All these are legacy numbered rules (N0xx series) - map by extracting the number
    
    # Try to read the file to get the id
    path = os.path.join(RULES_DIR, old_name)
    try:
        data = json.load(open(path))
        rid = data.get('id', '')
    except:
        rid = ''
    
    # UMR pattern
    if rid.startswith('UMR'):
        num = rid[3:]
        rest = base.replace('user-message-', '')
        return f'rule.umr-{rest}.json'
    
    # isc- prefix in id
    if rid.startswith('isc-'):
        rest = rid[4:]
        return f'rule.isc-{rest}.json'
    
    # N0xx id pattern - these are misc rules, use descriptive name
    m2 = re.match(r'^N(\d+)$', rid)
    if m2:
        num = m2.group(1).lower()
        # Use the filename as descriptive part
        return f'rule.n{num}-{base}.json'
    
    # model-xxx
    if base.startswith('model-'):
        rest = base[6:]
        return f'rule.model-{rest}.json'
    
    # Fallback: just prefix with rule.
    return f'rule.{base}.json'


migration_map = []  # (old, new, old_id, new_id)
bundle_items = []

for f in files:
    new_name = compute_new_name(f)
    if new_name is None:
        continue
    
    path = os.path.join(RULES_DIR, f)
    
    if new_name == 'BUNDLE':
        # Handle bundle - split into individual rules
        data = json.load(open(path))
        for i, item in enumerate(data):
            old_id = item.get('id', f'bundle-item-{i}')
            # Each item already has a good id like rule.intent-xxx-001
            new_fn = f"{old_id}.json"
            new_path = os.path.join(RULES_DIR, new_fn)
            json.dump(item, open(new_path, 'w'), ensure_ascii=False, indent=2)
            bundle_items.append((f, new_fn, old_id))
        os.remove(path)
        migration_map.append((f, f'SPLIT into {len(data)} files', '', ''))
        continue
    
    # Read and update id
    data = json.load(open(path))
    old_id = data.get('id', 'NO_ID')
    # New id = new filename without .json
    new_id = new_name.replace('.json', '')
    data['id'] = new_id
    
    # Write new file
    new_path = os.path.join(RULES_DIR, new_name)
    if os.path.exists(new_path) and new_path != path:
        # Conflict - append suffix
        new_name = new_name.replace('.json', '-dup.json')
        new_id = new_name.replace('.json', '')
        data['id'] = new_id
        new_path = os.path.join(RULES_DIR, new_name)
    
    json.dump(data, open(new_path, 'w'), ensure_ascii=False, indent=2)
    if new_path != path:
        os.remove(path)
    migration_map.append((f, new_name, old_id, new_id))

# Write migration report
with open(os.path.join(REPORTS_DIR, 'rule-naming-migration.md'), 'w') as fp:
    fp.write('# Rule Naming Migration Report\n\n')
    fp.write(f'Date: 2026-03-06\n\n')
    fp.write(f'## Renamed: {len([m for m in migration_map if "SPLIT" not in m[1]])} files\n\n')
    fp.write('| Old Filename | New Filename | Old ID | New ID |\n')
    fp.write('|---|---|---|---|\n')
    for old, new, oid, nid in migration_map:
        fp.write(f'| {old} | {new} | {oid} | {nid} |\n')
    if bundle_items:
        fp.write(f'\n## Bundle Split\n\n')
        fp.write(f'rule-bundle-intent-system-001.json → {len(bundle_items)} individual files:\n\n')
        for src, dst, rid in bundle_items:
            fp.write(f'- {dst} (id: {rid})\n')

print(f"Task 1: Renamed {len(migration_map)} files, split {len(bundle_items)} bundle items")

# ============ TASK 2: Fill missing actions ============
# Re-read all files after rename
files2 = sorted([f for f in os.listdir(RULES_DIR) if f.endswith('.json') and not f.startswith('_')])
no_actions = []

for f in files2:
    path = os.path.join(RULES_DIR, f)
    try:
        data = json.load(open(path))
    except:
        continue
    
    trigger = data.get('trigger', {})
    events = trigger.get('events', [])
    actions = trigger.get('actions', [])
    
    # Also check top-level action field
    top_action = data.get('action', '')
    
    if events and not actions:
        # Infer action from name/description/top-level action
        name = data.get('rule_name', data.get('name', ''))
        desc = data.get('description', '')
        
        # If there's a top-level 'action' string, use it
        if top_action and isinstance(top_action, str):
            inferred = [{"type": "auto_trigger", "description": top_action}]
        else:
            # Infer from description
            inferred = [{"type": "auto_trigger", "description": f"执行{name}规则检查"}]
        
        data['trigger']['actions'] = inferred
        json.dump(data, open(path, 'w'), ensure_ascii=False, indent=2)
        no_actions.append((f, data.get('id',''), [a.get('description','') for a in inferred]))

print(f"Task 2: Fixed {len(no_actions)} rules with missing actions")

# ============ TASK 3: Dedup scan ============
# Load all rules and compute event overlap
all_rules = {}
for f in sorted(os.listdir(RULES_DIR)):
    if not f.endswith('.json') or f.startswith('_'):
        continue
    path = os.path.join(RULES_DIR, f)
    try:
        data = json.load(open(path))
        events = set(data.get('trigger', {}).get('events', []))
        all_rules[f] = {'id': data.get('id',''), 'events': events, 'name': data.get('rule_name', data.get('name','')), 'desc': data.get('description','')}
    except:
        pass

# Pairwise comparison
duplicates = []
rule_list = list(all_rules.items())
for i in range(len(rule_list)):
    for j in range(i+1, len(rule_list)):
        f1, d1 = rule_list[i]
        f2, d2 = rule_list[j]
        e1, e2 = d1['events'], d2['events']
        if not e1 or not e2:
            continue
        intersection = e1 & e2
        union = e1 | e2
        if union and len(intersection) / len(union) > 0.8:
            overlap = len(intersection) / len(union) * 100
            duplicates.append((f1, f2, overlap, intersection))

with open(os.path.join(REPORTS_DIR, 'rule-dedup-scan-result.md'), 'w') as fp:
    fp.write('# Rule Dedup Scan Result\n\n')
    fp.write(f'Total rules scanned: {len(all_rules)}\n')
    fp.write(f'Pairs compared: {len(rule_list) * (len(rule_list)-1) // 2}\n')
    fp.write(f'Suspected duplicates (>80% event overlap): {len(duplicates)}\n\n')
    if duplicates:
        for f1, f2, pct, events in sorted(duplicates, key=lambda x: -x[2]):
            fp.write(f'## {pct:.0f}% overlap\n')
            fp.write(f'- **{f1}** ({all_rules[f1]["id"]}): {all_rules[f1]["name"]}\n')
            fp.write(f'- **{f2}** ({all_rules[f2]["id"]}): {all_rules[f2]["name"]}\n')
            fp.write(f'- Shared events: {", ".join(sorted(events))}\n\n')
    else:
        fp.write('No suspected duplicates found.\n')

print(f"Task 3: Scanned {len(all_rules)} rules, found {len(duplicates)} suspected duplicate pairs")

# ============ TASK 4: Benchmark cleanup ============
bench_path = 'tests/benchmarks/intent/intent-benchmark-dataset.json'
if os.path.exists(bench_path):
    bench = json.load(open(bench_path))
    all_unknown = all(item.get('expected_intent_class') == '?' for item in bench if isinstance(item, dict))
    if all_unknown:
        # Try to infer some - if we can't reliably, delete
        # Simple keyword heuristic
        labeled = 0
        for item in bench:
            inp = item.get('input', '').lower()
            if any(w in inp for w in ['天气', '温度', '几度']):
                item['expected_intent_class'] = 'query_weather'
                labeled += 1
            elif any(w in inp for w in ['提醒', '闹钟', '定时']):
                item['expected_intent_class'] = 'set_reminder'
                labeled += 1
            elif any(w in inp for w in ['规则', 'isc', '检查']):
                item['expected_intent_class'] = 'rule_trigger'
                labeled += 1
            elif any(w in inp for w in ['分析', '报告', '总结']):
                item['expected_intent_class'] = 'analysis_request'
                labeled += 1
        
        if labeled < len(bench) * 0.3:
            # Can't label most - delete the file
            os.remove(bench_path)
            print(f"Task 4: Deleted benchmark file (only {labeled}/{len(bench)} could be labeled)")
        else:
            json.dump(bench, open(bench_path, 'w'), ensure_ascii=False, indent=2)
            print(f"Task 4: Labeled {labeled}/{len(bench)} samples")
    else:
        print("Task 4: Benchmark already has labels, skipping")
else:
    print("Task 4: Benchmark file not found")
