#!/usr/bin/env python3
"""
ISC规则Schema迁移脚本
将旧格式规则（action塞在trigger.actions里）迁移到标准格式：
  trigger: { events: {L1/L2/META}, condition }
  action:  { type, handler, on_failure }

作者: ISC审计任务 2026-03-05
"""

import json, glob, os, copy, sys
from datetime import datetime

RULES_DIR = os.path.dirname(os.path.abspath(__file__)) + "/../rules"
REPORT_PATH = os.path.expanduser("~/.openclaw/workspace/reports/isc-schema-migration-report.md")

# trigger.actions type → 推断顶层action.type的映射
ACTION_TYPE_MAP = {
    "gate_check":    "gate",
    "block_on_fail": "gate",
    "auto_trigger":  "auto",
    "auto_fix":      "auto",
    "auto_collect":  "auto",
    "route":         "route",
    "log":           "monitor",
    "notify":        "notify",
    "gate":          "gate",
    "audit":         "audit",
    "pre_flight_check": "gate",
    "health_check":  "monitor",
    "auto_backup":   "auto",
    "auto_sync":     "auto",
    "auto_detect":   "auto",
}

# 根据trigger.actions推断最合适的action.type（取优先级最高的）
ACTION_PRIORITY = ["gate", "auto", "route", "notify", "audit", "monitor"]

def infer_action_type(trigger_actions):
    types = [ACTION_TYPE_MAP.get(a.get("type",""), "auto") for a in trigger_actions]
    for ptype in ACTION_PRIORITY:
        if ptype in types:
            return ptype
    return "auto"

def infer_on_failure(action_type, trigger_actions):
    t_types = {a.get("type","") for a in trigger_actions}
    if "block_on_fail" in t_types or "gate_check" in t_types or "gate" in t_types:
        return "reject"
    if "notify" in t_types:
        return "warn"
    if action_type == "gate":
        return "reject"
    if action_type == "auto":
        return "retry"
    return "warn"

def infer_handler(fname, data, trigger_actions):
    """从规则内容推断handler名称"""
    name = data.get("name", "")
    domain = data.get("domain", "")
    
    # 检查execution里有没有executor
    exec_data = data.get("execution", {})
    if isinstance(exec_data, dict):
        steps = exec_data.get("steps", [])
        if steps and isinstance(steps[0], dict):
            exe = steps[0].get("executor", "")
            if exe:
                return exe
    
    # 检查trigger_actions里有没有script
    for ta in trigger_actions:
        if ta.get("script"):
            return ta["script"]
    
    # 从文件名推断
    base = os.path.splitext(fname)[0]
    base = base.replace("rule.", "").replace("arch.", "")
    parts = base.split("-")
    # 取前3段
    return "-".join(parts[:3]) if len(parts) >= 3 else base

def classify_events(events):
    """把list格式的events分层到L1/L2/META"""
    if not events:
        return {}
    if isinstance(events, dict):
        return events  # 已经是分层格式
    
    # list → 按语义分层
    l1, l2, meta = [], [], []
    for e in events:
        e_str = str(e)
        # META: 系统级、session、agent级
        if any(x in e_str for x in ["system.", "session.", "agent.", "schedule.", "manual", "scheduled"]):
            meta.append(e_str)
        # L2: 质量、流水线、分析、评测、同步
        elif any(x in e_str for x in ["pipeline.", "benchmark.", "quality.", "analysis.", "sync.", 
                                        "aeo.", "feedback.", "insight.", "evaluation.", "report."]):
            l2.append(e_str)
        # L1: 技能、规则、文件、消息、用户操作
        else:
            l1.append(e_str)
    
    result = {}
    if l1: result["L1"] = l1
    if l2: result["L2"] = l2
    if meta: result["META"] = meta
    if not result and events:
        result["L1"] = list(events)
    return result

def migrate_rule(fname, data):
    """迁移单条规则，返回(migrated_data, changes)"""
    changes = []
    d = copy.deepcopy(data)
    
    trigger = d.get("trigger", {})
    trigger_actions = trigger.get("actions", [])
    top_action = d.get("action")
    
    # === 1. 迁移 trigger.events → 分层dict ===
    t_events = trigger.get("events")
    if isinstance(t_events, list):
        layered = classify_events(t_events)
        trigger["events"] = layered
        changes.append(f"trigger.events: list({len(t_events)}) → 分层dict{list(layered.keys())}")
    
    # === 2. 从trigger.actions提取action信息，构建顶层action ===
    if trigger_actions:
        inferred_type = infer_action_type(trigger_actions)
        inferred_on_failure = infer_on_failure(inferred_type, trigger_actions)
        inferred_handler = infer_handler(fname, d, trigger_actions)
        
        # 构建顶层action
        if top_action is None:
            # 完全缺失 → 从trigger_actions提取
            new_action = {
                "type": inferred_type,
                "handler": inferred_handler,
                "on_failure": inferred_on_failure
            }
            # 保留trigger_actions的description作为补充
            descriptions = [a.get("description","") for a in trigger_actions if a.get("description")]
            if descriptions:
                new_action["description"] = descriptions[0]
            d["action"] = new_action
            changes.append(f"顶层action: 新建 {{type:{inferred_type}, handler:{inferred_handler}, on_failure:{inferred_on_failure}}}")
        
        elif isinstance(top_action, str):
            # string → dict
            new_action = {
                "type": inferred_type,
                "handler": top_action,  # 原字符串值作为handler
                "on_failure": inferred_on_failure
            }
            d["action"] = new_action
            changes.append(f"顶层action: string→dict (handler={top_action})")
        
        elif isinstance(top_action, dict):
            # dict但缺字段
            if "type" not in top_action:
                top_action["type"] = inferred_type
                changes.append(f"顶层action.type: 补充 {inferred_type}")
            if "handler" not in top_action:
                top_action["handler"] = inferred_handler
                changes.append(f"顶层action.handler: 补充 {inferred_handler}")
            if "on_failure" not in top_action:
                top_action["on_failure"] = inferred_on_failure
                changes.append(f"顶层action.on_failure: 补充 {inferred_on_failure}")
        
        elif isinstance(top_action, list):
            # list → 合并为单dict
            types = list({a.get("type","auto") for a in top_action if isinstance(a,dict)})
            new_action = {
                "type": inferred_type,
                "handler": infer_handler(fname, d, top_action),
                "on_failure": inferred_on_failure,
                "steps": top_action
            }
            d["action"] = new_action
            changes.append(f"顶层action: list({len(top_action)})→dict with steps")
        
        # 从trigger里移除actions（已提升到顶层）
        del trigger["actions"]
        changes.append(f"trigger.actions: 已提升到顶层action，从trigger中移除")
    
    # === 3. 补充 trigger.condition（如缺失且有condition字段可推断）===
    if not trigger.get("condition"):
        # 从规则内容推断condition
        condition = None
        if d.get("condition"):
            condition = str(d["condition"])
        elif d.get("check"):
            condition = "check_required"
        elif top_action and isinstance(top_action, dict) and top_action.get("type") == "gate":
            condition = "gate_check_required"
        elif d.get("type") in ("detection", "detection-standard"):
            condition = "detection_active"
        
        if condition:
            trigger["condition"] = condition
            changes.append(f"trigger.condition: 补充 '{condition}'")
    
    d["trigger"] = trigger
    
    # === 4. 补充schema_version标记迁移 ===
    d["schema_version"] = "2.0"
    d["migrated_at"] = datetime.now().strftime("%Y-%m-%dT%H:%M:%S+08:00")
    
    return d, changes

def main():
    os.chdir(RULES_DIR)
    files = sorted(glob.glob("*.json"))
    
    results = []
    migrated = 0
    skipped = 0
    already_ok = 0
    errors = 0
    
    for fname in files:
        try:
            raw = open(fname).read()
            data = json.loads(raw)
        except Exception as e:
            results.append({"file": fname, "status": "ERROR", "error": str(e)})
            errors += 1
            continue
        
        # Bundle跳过
        if isinstance(data, list):
            results.append({"file": fname, "status": "SKIPPED", "reason": "bundle/array格式"})
            skipped += 1
            continue
        
        # 已是arch.*格式且有schema_version → 跳过
        if fname.startswith("arch.") or data.get("schema_version") == "2.0":
            results.append({"file": fname, "status": "ALREADY_OK", "changes": []})
            already_ok += 1
            continue
        
        # 执行迁移
        migrated_data, changes = migrate_rule(fname, data)
        
        if not changes:
            results.append({"file": fname, "status": "ALREADY_OK", "changes": []})
            already_ok += 1
            continue
        
        # 写回文件
        with open(fname, "w") as f:
            json.dump(migrated_data, f, ensure_ascii=False, indent=2)
        
        results.append({"file": fname, "status": "MIGRATED", "changes": changes})
        migrated += 1
        print(f"✓ 迁移: {fname} ({len(changes)}处变更)")
    
    print(f"\n完成: 迁移{migrated}条 | 已OK{already_ok}条 | 跳过{skipped}条 | 错误{errors}条")
    
    # 生成报告
    os.makedirs(os.path.dirname(REPORT_PATH), exist_ok=True)
    write_report(results, migrated, already_ok, skipped, errors)
    print(f"报告: {REPORT_PATH}")
    
    return results

def write_report(results, migrated, already_ok, skipped, errors):
    lines = [
        "# ISC规则Schema迁移报告",
        f"\n生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        "\n## 概览",
        f"\n| 指标 | 数量 |",
        "| --- | --- |",
        f"| 总规则数 | {len(results)} |",
        f"| 已迁移 | {migrated} |",
        f"| 已符合标准 | {already_ok} |",
        f"| 跳过(bundle等) | {skipped} |",
        f"| 错误 | {errors} |",
        f"| 迁移后合规率 | {round((migrated+already_ok)/max(len(results)-skipped-errors,1)*100,1)}% |",
        "\n## 统一Schema标准 (v2.0)",
        "\n```json",
        '{',
        '  "id":          "rule.{domain}-{name}-{version}",',
        '  "name":        "snake_case_name",',
        '  "description": "至少20字的规则描述",',
        '  "severity":    "critical|high|medium|low",',
        '  "trigger": {',
        '    "events": {',
        '      "L1": ["skill.lifecycle.*", "user.*", "file.*"],',
        '      "L2": ["pipeline.*", "quality.*", "benchmark.*"],',
        '      "META": ["system.*", "schedule.*", "agent.*"]',
        '    },',
        '    "condition": "触发判断条件"',
        '  },',
        '  "action": {',
        '    "type":       "gate|auto|route|monitor|notify|audit",',
        '    "handler":    "处理器名称或脚本路径",',
        '    "on_failure": "reject|retry|warn|escalate"',
        '  },',
        '  "enforcement_tier": "P0_gate|P1_process|P1_monitor",',
        '  "schema_version":   "2.0"',
        '}',
        "```",
        "\n## 迁移变更详情",
    ]
    
    for r in results:
        if r["status"] == "MIGRATED":
            lines.append(f"\n### ✅ {r['file']}")
            for c in r.get("changes", []):
                lines.append(f"- {c}")
    
    lines.append("\n## 已符合标准（无需迁移）")
    for r in results:
        if r["status"] == "ALREADY_OK":
            lines.append(f"- ✓ `{r['file']}`")
    
    if any(r["status"] == "SKIPPED" for r in results):
        lines.append("\n## 跳过（bundle/array格式）")
        for r in results:
            if r["status"] == "SKIPPED":
                lines.append(f"- ~ `{r['file']}`: {r.get('reason','')}")
    
    if any(r["status"] == "ERROR" for r in results):
        lines.append("\n## 错误")
        for r in results:
            if r["status"] == "ERROR":
                lines.append(f"- ✗ `{r['file']}`: {r.get('error','')}")
    
    with open(REPORT_PATH, "w") as f:
        f.write("\n".join(lines))

if __name__ == "__main__":
    main()
