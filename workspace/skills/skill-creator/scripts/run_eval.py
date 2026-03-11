#!/usr/bin/env python3
"""Run trigger evaluation for a skill description.

Tests whether a skill's description causes an LLM to trigger (select the skill)
for a set of queries. Outputs results as JSON.

Adapted from Anthropic's official skill-creator to use the Anthropic SDK
directly instead of `claude -p` CLI.
"""

import argparse
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

# Allow running from skill-creator root
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import get_client, get_model
from scripts.utils import parse_skill_md

# System prompt that simulates Claude's skill triggering decision
TRIGGER_SYSTEM_PROMPT = """You are simulating Claude Code's skill selection behavior.

You have access to the following skills (each with a name and description):

{skills_block}

When a user sends a query, you must decide whether to use any of these skills.
If you would use the skill "{target_skill}", respond with EXACTLY:
TRIGGER: YES

If you would NOT use it, respond with EXACTLY:
TRIGGER: NO

Only respond with one of these two lines. Nothing else."""

# Decoy skills to make the evaluation realistic
DECOY_SKILLS = [
    {"name": "git-helper", "description": "Helps with git operations like branching, merging, rebasing, and resolving conflicts."},
    {"name": "docker-compose", "description": "Manages Docker Compose configurations, helps debug container networking and volume issues."},
    {"name": "api-tester", "description": "Tests REST APIs with curl commands, validates responses, and generates API documentation."},
    {"name": "log-analyzer", "description": "Analyzes application logs to find errors, patterns, and performance bottlenecks."},
    {"name": "db-migrator", "description": "Helps create and manage database migrations for PostgreSQL, MySQL, and SQLite."},
]


def run_single_query(
    client,
    query: str,
    skill_name: str,
    skill_description: str,
    timeout: int,
    model: str | None = None,
) -> bool:
    """Run a single query and return whether the skill was triggered."""
    # Build skills block with target + decoys
    skills = [{"name": skill_name, "description": skill_description}] + DECOY_SKILLS
    skills_block = "\n".join(
        f"- **{s['name']}**: {s['description']}" for s in skills
    )

    system = TRIGGER_SYSTEM_PROMPT.format(
        skills_block=skills_block,
        target_skill=skill_name,
    )

    use_model = model or get_model()

    try:
        response = client.messages.create(
            model=use_model,
            max_tokens=50,
            system=system,
            messages=[{"role": "user", "content": query}],
        )
        text = response.content[0].text.strip().upper()
        return "TRIGGER: YES" in text or "YES" in text
    except Exception as e:
        print(f"API error for query '{query[:50]}': {e}", file=sys.stderr)
        return False


def run_eval(
    eval_set: list[dict],
    skill_name: str,
    description: str,
    num_workers: int = 4,
    timeout: int = 30,
    runs_per_query: int = 3,
    trigger_threshold: float = 0.5,
    model: str | None = None,
    **kwargs,  # Accept extra kwargs for compatibility
) -> dict:
    """Run evaluation across all queries with parallel execution."""
    client = get_client()
    results = []

    # Build work items: (query_info, run_index)
    work_items = []
    for q in eval_set:
        for run_idx in range(runs_per_query):
            work_items.append((q, run_idx))

    # Track results per query
    query_triggers: dict[str, list[bool]] = {q["query"]: [] for q in eval_set}

    with ThreadPoolExecutor(max_workers=num_workers) as executor:
        futures = {}
        for q, run_idx in work_items:
            future = executor.submit(
                run_single_query,
                client,
                q["query"],
                skill_name,
                description,
                timeout,
                model,
            )
            futures[future] = q["query"]

        for future in as_completed(futures):
            query = futures[future]
            try:
                triggered = future.result(timeout=timeout + 10)
            except Exception:
                triggered = False
            query_triggers[query].append(triggered)

    # Aggregate results
    passed = 0
    failed = 0
    for q in eval_set:
        triggers_list = query_triggers[q["query"]]
        trigger_count = sum(triggers_list)
        total_runs = len(triggers_list)
        trigger_rate = trigger_count / total_runs if total_runs > 0 else 0

        should_trigger = q.get("should_trigger", True)
        if should_trigger:
            did_pass = trigger_rate >= trigger_threshold
        else:
            did_pass = trigger_rate < trigger_threshold

        if did_pass:
            passed += 1
        else:
            failed += 1

        results.append({
            "query": q["query"],
            "should_trigger": should_trigger,
            "triggers": trigger_count,
            "runs": total_runs,
            "trigger_rate": round(trigger_rate, 3),
            "pass": did_pass,
        })

    return {
        "description": description,
        "results": results,
        "summary": {
            "passed": passed,
            "failed": failed,
            "total": passed + failed,
        },
    }


def main():
    parser = argparse.ArgumentParser(description="Run skill trigger evaluation")
    parser.add_argument("--eval-set", required=True, help="Path to eval set JSON")
    parser.add_argument("--skill-path", required=True, help="Path to skill directory")
    parser.add_argument("--description", default=None, help="Override description")
    parser.add_argument("--num-workers", type=int, default=4, help="Parallel workers")
    parser.add_argument("--timeout", type=int, default=30, help="Timeout per query")
    parser.add_argument("--runs-per-query", type=int, default=3, help="Runs per query")
    parser.add_argument("--trigger-threshold", type=float, default=0.5, help="Trigger rate threshold")
    parser.add_argument("--model", default=None, help="Model to use")
    parser.add_argument("--verbose", action="store_true", help="Print progress")
    args = parser.parse_args()

    eval_set = json.loads(Path(args.eval_set).read_text())
    skill_path = Path(args.skill_path)

    if not (skill_path / "SKILL.md").exists():
        print(f"Error: No SKILL.md found at {skill_path}", file=sys.stderr)
        sys.exit(1)

    name, original_description, content = parse_skill_md(skill_path)
    description = args.description or original_description

    if args.verbose:
        print(f"Evaluating: {description}", file=sys.stderr)

    output = run_eval(
        eval_set=eval_set,
        skill_name=name,
        description=description,
        num_workers=args.num_workers,
        timeout=args.timeout,
        runs_per_query=args.runs_per_query,
        trigger_threshold=args.trigger_threshold,
        model=args.model,
    )

    if args.verbose:
        summary = output["summary"]
        print(f"Results: {summary['passed']}/{summary['total']} passed", file=sys.stderr)
        for r in output["results"]:
            status = "PASS" if r["pass"] else "FAIL"
            rate_str = f"{r['triggers']}/{r['runs']}"
            print(f"  [{status}] rate={rate_str} expected={r['should_trigger']}: {r['query'][:70]}", file=sys.stderr)

    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
