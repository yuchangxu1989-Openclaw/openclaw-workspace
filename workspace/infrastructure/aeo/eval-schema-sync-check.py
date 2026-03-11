#!/usr/bin/env python3
"""
eval-schema-sync-check.py — 校验所有评测技能config与V4 schema的一致性
用法: python3 eval-schema-sync-check.py [--fix]
  默认只读检查，--fix 自动同步 quality_rules 和 eval_dimensions
"""
import json, sys, os

WORKSPACE = "/root/.openclaw/workspace"
SCHEMA_PATH = os.path.join(WORKSPACE, "infrastructure/aeo/eval-standard-schema.json")

DOWNSTREAM_CONFIGS = [
    "skills/public/eval-mining/config.json",
    "skills/public/eval-runner/config.json",
    "skills/public/auto-badcase-harvest/config.json",
    "skills/public/badcase-to-goodcase/config.json",
]

def load_json(path):
    with open(path) as f:
        return json.load(f)

def save_json(path, data):
    with open(path, 'w') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write('\n')

def check():
    fix_mode = "--fix" in sys.argv
    schema = load_json(SCHEMA_PATH)
    errors = []
    fixed = []

    # Extract canonical values from schema
    schema_categories = schema["quality_rules"]["valid_categories"]
    schema_difficulties = schema["quality_rules"]["valid_difficulties"]
    schema_required = schema["required_fields"]
    schema_dimensions = [d["id"] for d in schema["scoring_dimensions"]]
    schema_version = schema["version"]

    for rel_path in DOWNSTREAM_CONFIGS:
        full_path = os.path.join(WORKSPACE, rel_path)
        if not os.path.exists(full_path):
            errors.append(f"MISSING: {rel_path}")
            continue

        cfg = load_json(full_path)
        name = rel_path.split("/")[-2]

        # Check schema reference
        if cfg.get("eval_standard_schema") != "infrastructure/aeo/eval-standard-schema.json":
            errors.append(f"{name}: missing or wrong eval_standard_schema reference")
            if fix_mode:
                cfg["eval_standard_schema"] = "infrastructure/aeo/eval-standard-schema.json"
                cfg["eval_standard_version"] = schema_version
                save_json(full_path, cfg)
                fixed.append(f"{name}: added schema reference")

        # Check version
        if cfg.get("eval_standard_version") != schema_version:
            errors.append(f"{name}: version mismatch (has {cfg.get('eval_standard_version')}, schema has {schema_version})")

        # Check quality_rules sync (eval-mining)
        if "quality_rules" in cfg:
            qr = cfg["quality_rules"]
            if qr.get("valid_categories") != schema_categories:
                errors.append(f"{name}: valid_categories out of sync")
                if fix_mode:
                    qr["valid_categories"] = schema_categories
                    fixed.append(f"{name}: synced valid_categories")
            if qr.get("valid_difficulties") != schema_difficulties:
                errors.append(f"{name}: valid_difficulties out of sync")
                if fix_mode:
                    qr["valid_difficulties"] = schema_difficulties
                    fixed.append(f"{name}: synced valid_difficulties")
            if qr.get("required_fields") != schema_required:
                errors.append(f"{name}: required_fields out of sync")
                if fix_mode:
                    qr["required_fields"] = schema_required
                    fixed.append(f"{name}: synced required_fields")
            if fix_mode and (f"{name}: synced valid_categories" in fixed or
                            f"{name}: synced valid_difficulties" in fixed or
                            f"{name}: synced required_fields" in fixed):
                save_json(full_path, cfg)

        # Check eval_dimensions sync (eval-runner)
        if "eval_dimensions" in cfg:
            if cfg["eval_dimensions"] != schema_dimensions:
                errors.append(f"{name}: eval_dimensions out of sync (has {cfg['eval_dimensions']}, schema has {schema_dimensions})")
                if fix_mode:
                    cfg["eval_dimensions"] = schema_dimensions
                    save_json(full_path, cfg)
                    fixed.append(f"{name}: synced eval_dimensions")

    # Report
    if errors:
        print(f"⚠️  {len(errors)} issue(s) found:")
        for e in errors:
            print(f"  - {e}")
    else:
        print("✅ All downstream configs aligned with V4 schema")

    if fixed:
        print(f"\n🔧 Fixed {len(fixed)} issue(s):")
        for f_ in fixed:
            print(f"  - {f_}")

    print(f"\nSchema version: {schema_version} ({SCHEMA_PATH})")
    return 0 if not errors else 1

if __name__ == "__main__":
    sys.exit(check())
