#!/usr/bin/env python3
"""Post-creation integration for OpenClaw environment.

After a skill is created/improved, this script:
1. Registers the skill in CAPABILITY-ANCHOR.md
2. Creates ISC intent route rule (if triggers defined)
3. Validates the registration

This implements the skill-creator-addon requirements:
ISC-SKILL-POST-CREATION-GUARD-001
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scripts.utils import parse_skill_md

WORKSPACE = Path(os.environ.get("OPENCLAW_WORKSPACE", "/root/.openclaw/workspace"))
ANCHOR_PATH = WORKSPACE / "CAPABILITY-ANCHOR.md"
ISC_RULES_DIR = WORKSPACE / "isc-core" / "rules"


def extract_triggers(skill_content: str) -> list[str]:
    """Extract trigger keywords/patterns from SKILL.md content."""
    triggers = []
    # Look for trigger section in content
    trigger_section = re.search(
        r'(?:触发|trigger|when to use|使用场景)[^\n]*\n((?:[-*].*\n)*)',
        skill_content, re.IGNORECASE
    )
    if trigger_section:
        for line in trigger_section.group(1).strip().split('\n'):
            line = line.strip().lstrip('-*').strip()
            if line:
                triggers.append(line)
    return triggers


def register_anchor(skill_name: str, description: str, skill_path: str, triggers: list[str]) -> bool:
    """Register skill in CAPABILITY-ANCHOR.md."""
    if not ANCHOR_PATH.exists():
        print(f"Warning: {ANCHOR_PATH} not found, creating.", file=sys.stderr)
        ANCHOR_PATH.write_text("# 系统能力锚点 - 根治遗忘\n\n")

    content = ANCHOR_PATH.read_text()

    # Check if already registered
    if skill_name in content:
        print(f"Skill '{skill_name}' already in CAPABILITY-ANCHOR.md, updating.", file=sys.stderr)
        # Remove old entry (from ### skill_name to next ### or end)
        pattern = rf'### {re.escape(skill_name)}\n(?:(?!### ).)*'
        content = re.sub(pattern, '', content, flags=re.DOTALL)

    # Build entry
    trigger_str = ", ".join(triggers[:5]) if triggers else "N/A"
    entry = f"""### {skill_name}
- **描述**: {description}
- **路径**: {skill_path}
- **触发词**: {trigger_str}
- **注册时间**: {datetime.now().strftime('%Y-%m-%d %H:%M')}

"""

    # Append before the last section or at end
    content = content.rstrip() + "\n\n" + entry
    ANCHOR_PATH.write_text(content)
    return True


def create_isc_rule(skill_name: str, description: str, triggers: list[str]) -> bool:
    """Create ISC intent route rule for the skill."""
    if not triggers:
        print(f"No triggers defined, skipping ISC rule creation.", file=sys.stderr)
        return True

    ISC_RULES_DIR.mkdir(parents=True, exist_ok=True)
    rule_file = ISC_RULES_DIR / f"intent-route-{skill_name}.json"

    # Build trigger patterns from keywords
    patterns = []
    for t in triggers[:10]:
        # Convert natural language trigger to regex-like pattern
        words = t.split()[:4]  # Take first 4 words
        pattern = ".*".join(re.escape(w) for w in words)
        patterns.append(pattern)

    rule = {
        "id": f"ISC-ROUTE-{skill_name.upper()}",
        "type": "intent-route",
        "skill": skill_name,
        "description": description[:200],
        "trigger_patterns": patterns,
        "trigger_keywords": triggers[:10],
        "priority": 50,
        "created_at": datetime.now().isoformat(),
        "auto_generated": True,
    }

    rule_file.write_text(json.dumps(rule, indent=2, ensure_ascii=False))
    print(f"Created ISC rule: {rule_file}", file=sys.stderr)
    return True


def validate_registration(skill_name: str) -> bool:
    """Validate that the skill is properly registered."""
    errors = []

    # Check CAPABILITY-ANCHOR.md
    if ANCHOR_PATH.exists():
        content = ANCHOR_PATH.read_text()
        if skill_name not in content:
            errors.append(f"Skill '{skill_name}' not found in CAPABILITY-ANCHOR.md")
    else:
        errors.append("CAPABILITY-ANCHOR.md not found")

    if errors:
        for e in errors:
            print(f"VALIDATION ERROR: {e}", file=sys.stderr)
        return False

    print(f"Validation passed: '{skill_name}' registered in CAPABILITY-ANCHOR.md", file=sys.stderr)
    return True


def post_create(skill_path: Path) -> dict:
    """Run all post-creation steps for a skill."""
    name, description, content = parse_skill_md(skill_path)
    triggers = extract_triggers(content)
    rel_path = str(skill_path.relative_to(WORKSPACE)) if str(skill_path).startswith(str(WORKSPACE)) else str(skill_path)

    results = {
        "skill_name": name,
        "description": description,
        "triggers": triggers,
        "steps": {},
    }

    # Step 1: Register in CAPABILITY-ANCHOR.md
    try:
        results["steps"]["anchor"] = register_anchor(name, description, rel_path, triggers)
    except Exception as e:
        results["steps"]["anchor"] = False
        print(f"Anchor registration failed: {e}", file=sys.stderr)

    # Step 2: Create ISC intent route rule
    try:
        results["steps"]["isc_rule"] = create_isc_rule(name, description, triggers)
    except Exception as e:
        results["steps"]["isc_rule"] = False
        print(f"ISC rule creation failed: {e}", file=sys.stderr)

    # Step 3: Validate
    try:
        results["steps"]["validation"] = validate_registration(name)
    except Exception as e:
        results["steps"]["validation"] = False
        print(f"Validation failed: {e}", file=sys.stderr)

    results["success"] = all(results["steps"].values())
    return results


def main():
    parser = argparse.ArgumentParser(description="Post-creation skill integration")
    parser.add_argument("skill_path", help="Path to skill directory")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be done")
    args = parser.parse_args()

    skill_path = Path(args.skill_path)
    if not (skill_path / "SKILL.md").exists():
        print(f"Error: No SKILL.md found at {skill_path}", file=sys.stderr)
        sys.exit(1)

    if args.dry_run:
        name, description, content = parse_skill_md(skill_path)
        triggers = extract_triggers(content)
        print(f"Skill: {name}")
        print(f"Description: {description}")
        print(f"Triggers: {triggers}")
        print(f"Would register in: {ANCHOR_PATH}")
        print(f"Would create ISC rule in: {ISC_RULES_DIR}")
        sys.exit(0)

    results = post_create(skill_path)
    print(json.dumps(results, indent=2, ensure_ascii=False))

    if not results["success"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
