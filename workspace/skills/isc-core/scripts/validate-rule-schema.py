#!/usr/bin/env python3
"""
ISC规则Schema校验脚本 v2.0
用法:
  python3 validate-rule-schema.py [--fix] [--file <rule.json>] [--report]
  
选项:
  --fix     自动修复可修复的问题（添加缺失的schema_version等）
  --file    只校验指定文件
  --report  输出JSON格式报告到stdout
  --strict  严格模式：handler必须指向实际存在的脚本/模块
"""

import json, glob, os, sys, argparse
from datetime import datetime

RULES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "rules")

# ──────────────────────────────────────────
#  Schema定义
# ──────────────────────────────────────────
SCHEMA = {
    "required_fields": ["id", "description", "trigger", "action"],
    "recommended_fields": ["name", "severity", "enforcement_tier", "schema_version"],
    "trigger": {
        "required": ["events"],
        "recommended": ["condition"],
        "events_format": "dict",          # 必须是 {L1/L2/META: [...]} 格式
        "events_keys": ["L1", "L2", "META"],
    },
    "action": {
        "required": ["type", "handler"],
        "recommended": ["on_failure"],
        "valid_types": ["gate", "auto", "route", "monitor", "notify", "audit", "enforce", "block"],
        "valid_on_failure": ["reject", "retry", "warn", "escalate", "skip"],
    },
    "severity": {
        "valid_values": ["critical", "high", "medium", "low"]
    },
    "enforcement_tier": {
        "valid_values": ["P0_gate", "P1_process", "P1_monitor"]
    },
}

# ──────────────────────────────────────────
#  校验函数
# ──────────────────────────────────────────
def validate_rule(data, fname, strict=False):
    errors = []
    warnings = []
    
    if isinstance(data, list):
        return [], ["bundle/array格式，跳过校验"]
    
    # 1. 必填字段
    for field in SCHEMA["required_fields"]:
        if field not in data:
            errors.append(f"缺少必填字段: '{field}'")
    
    # 2. 推荐字段
    for field in SCHEMA["recommended_fields"]:
        if field not in data:
            warnings.append(f"缺少推荐字段: '{field}'")
    
    # 3. trigger校验
    trigger = data.get("trigger", {})
    if isinstance(trigger, dict):
        # 3a. trigger必填字段
        for field in SCHEMA["trigger"]["required"]:
            if field not in trigger:
                errors.append(f"trigger缺少必填字段: '{field}'")
        
        # 3b. trigger.actions是旧格式（应已迁移到顶层）
        if "actions" in trigger:
            errors.append("trigger.actions仍存在 — action未迁移到顶层（需运行migrate-rule-schema.py）")
        
        # 3c. trigger.events格式
        t_events = trigger.get("events")
        if t_events is not None:
            if isinstance(t_events, list):
                errors.append(f"trigger.events是list格式，应为分层dict {{L1/L2/META: [...]}}（需运行migrate-rule-schema.py）")
            elif isinstance(t_events, dict):
                valid_keys = set(SCHEMA["trigger"]["events_keys"])
                used_keys = set(t_events.keys())
                unknown_keys = used_keys - valid_keys
                if unknown_keys:
                    warnings.append(f"trigger.events包含非标准分层键: {unknown_keys}，标准为 {valid_keys}")
                for k, v in t_events.items():
                    if not isinstance(v, list):
                        errors.append(f"trigger.events.{k} 应为list，实为 {type(v).__name__}")
                    elif not v:
                        warnings.append(f"trigger.events.{k} 为空list")
        
        # 3d. trigger.condition推荐
        if not trigger.get("condition"):
            warnings.append("trigger.condition缺失（推荐填写触发判断条件）")
    else:
        errors.append(f"trigger应为dict，实为 {type(trigger).__name__}")
    
    # 4. action校验
    action = data.get("action")
    if action is not None:
        if isinstance(action, str):
            errors.append(f"action是string格式 '{action}'，应为dict {{type, handler, on_failure}}（需运行migrate-rule-schema.py）")
        elif isinstance(action, list):
            errors.append("action是list格式，应为单个dict（需运行migrate-rule-schema.py）")
        elif isinstance(action, dict):
            # 必填字段
            for field in SCHEMA["action"]["required"]:
                if field not in action:
                    errors.append(f"action缺少必填字段: '{field}'")
            
            # action.type合法性
            atype = action.get("type", "")
            valid_types = SCHEMA["action"]["valid_types"]
            if atype and atype not in valid_types:
                warnings.append(f"action.type='{atype}' 不在标准类型列表 {valid_types}")
            
            # action.on_failure推荐
            if "on_failure" not in action:
                warnings.append("action.on_failure缺失（推荐: reject|retry|warn|escalate）")
            else:
                of = action.get("on_failure")
                if of not in SCHEMA["action"]["valid_on_failure"]:
                    warnings.append(f"action.on_failure='{of}' 不在标准值 {SCHEMA['action']['valid_on_failure']}")
            
            # strict模式: handler必须指向实际文件
            if strict:
                handler = action.get("handler", "")
                if handler and ("/" in handler or handler.endswith(".sh") or handler.endswith(".js") or handler.endswith(".py")):
                    handler_path = os.path.join(RULES_DIR, "..", handler.lstrip("/"))
                    if not os.path.exists(handler_path):
                        warnings.append(f"action.handler='{handler}' 文件不存在（strict模式）")
    else:
        if "action" in SCHEMA["required_fields"]:
            errors.append("缺少必填字段: 'action'（已在required_fields中）")
    
    # 5. severity合法性
    sev = data.get("severity")
    if sev and sev not in SCHEMA["severity"]["valid_values"]:
        warnings.append(f"severity='{sev}' 不在标准值 {SCHEMA['severity']['valid_values']}")
    
    # 6. enforcement_tier合法性
    tier = data.get("enforcement_tier")
    if tier and tier not in SCHEMA["enforcement_tier"]["valid_values"]:
        warnings.append(f"enforcement_tier='{tier}' 不在标准值 {SCHEMA['enforcement_tier']['valid_values']}")
    
    # 7. schema_version检查
    sv = data.get("schema_version")
    if sv != "2.0":
        warnings.append(f"schema_version='{sv}'，标准为'2.0'（可运行migrate-rule-schema.py自动补充）")
    
    # 8. id与filename一致性
    rule_id = data.get("id", "")
    expected_stem = os.path.splitext(fname)[0]
    if rule_id and rule_id != expected_stem:
        warnings.append(f"id='{rule_id}' 与文件名 '{expected_stem}' 不一致")
    
    return errors, warnings

# ──────────────────────────────────────────
#  主流程
# ──────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="ISC规则Schema校验")
    parser.add_argument("--fix", action="store_true", help="自动修复可修复问题")
    parser.add_argument("--file", help="只校验指定文件")
    parser.add_argument("--report", action="store_true", help="JSON格式报告")
    parser.add_argument("--strict", action="store_true", help="严格模式")
    args = parser.parse_args()
    
    os.chdir(RULES_DIR)
    
    if args.file:
        files = [args.file]
    else:
        files = sorted(glob.glob("*.json"))
    
    results = []
    total_errors = 0
    total_warnings = 0
    
    for fname in files:
        try:
            data = json.loads(open(fname).read())
        except Exception as e:
            results.append({"file": fname, "errors": [f"JSON解析失败: {e}"], "warnings": [], "status": "PARSE_ERROR"})
            total_errors += 1
            continue
        
        errors, warnings = validate_rule(data, fname, strict=args.strict)
        
        # 自动修复
        if args.fix and not errors and isinstance(data, dict):
            changed = False
            if data.get("schema_version") != "2.0":
                data["schema_version"] = "2.0"
                changed = True
            if changed:
                with open(fname, "w") as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                warnings = [w for w in warnings if "schema_version" not in w]
        
        status = "PASS" if not errors else "FAIL"
        results.append({
            "file": fname,
            "errors": errors,
            "warnings": warnings,
            "status": status
        })
        total_errors += len(errors)
        total_warnings += len(warnings)
    
    # 输出
    if args.report:
        print(json.dumps({
            "timestamp": datetime.now().isoformat(),
            "summary": {
                "total": len(results),
                "pass": sum(1 for r in results if r["status"] == "PASS"),
                "fail": sum(1 for r in results if r["status"] == "FAIL"),
                "parse_error": sum(1 for r in results if r["status"] == "PARSE_ERROR"),
                "total_errors": total_errors,
                "total_warnings": total_warnings,
            },
            "results": results
        }, ensure_ascii=False, indent=2))
    else:
        # 人类可读输出
        pass_count = sum(1 for r in results if r["status"] == "PASS")
        fail_count = sum(1 for r in results if r["status"] == "FAIL")
        
        print(f"\n{'='*60}")
        print(f"ISC规则Schema校验报告  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"{'='*60}")
        print(f"总计: {len(results)} 条 | ✅ PASS: {pass_count} | ❌ FAIL: {fail_count}")
        print(f"总错误: {total_errors} | 总警告: {total_warnings}")
        print(f"{'='*60}\n")
        
        # 先输出失败的
        for r in results:
            if r["status"] == "FAIL":
                print(f"❌ {r['file']}")
                for e in r["errors"]:
                    print(f"   ERROR: {e}")
                for w in r["warnings"]:
                    print(f"   WARN:  {w}")
                print()
        
        # 再输出有警告的通过项
        for r in results:
            if r["status"] == "PASS" and r["warnings"]:
                print(f"⚠️  {r['file']}")
                for w in r["warnings"]:
                    print(f"   WARN:  {w}")
                print()
        
        # 最后输出全部通过的
        clean = [r for r in results if r["status"] == "PASS" and not r["warnings"]]
        if clean:
            print(f"✅ 完全合规 ({len(clean)}条):")
            for r in clean:
                print(f"   {r['file']}")
        
        print(f"\n合规率: {round(pass_count/len(results)*100,1)}%  警告覆盖率: {round(sum(1 for r in results if r['warnings'])/len(results)*100,1)}%")
    
    # 退出码
    sys.exit(0 if total_errors == 0 else 1)

if __name__ == "__main__":
    main()
