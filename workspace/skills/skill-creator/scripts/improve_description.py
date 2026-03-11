#!/usr/bin/env python3
"""Improve a skill description based on eval results.

Takes eval results (from run_eval.py) and generates an improved description
by calling the Anthropic API directly.

Adapted from Anthropic's official skill-creator to use the Anthropic SDK
instead of `claude -p` CLI.
"""

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import get_client, get_model
from scripts.utils import parse_skill_md


def _call_llm(prompt: str, model: str | None = None, timeout: int = 300) -> str:
    """Call the Anthropic API with the given prompt and return text response."""
    client = get_client()
    use_model = model or get_model()

    response = client.messages.create(
        model=use_model,
        max_tokens=2048,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.content[0].text


def improve_description(
    skill_name: str,
    skill_content: str,
    current_description: str,
    eval_results: dict,
    history: list[dict],
    model: str | None = None,
    test_results: dict | None = None,
    log_dir: Path | None = None,
    iteration: int | None = None,
) -> str:
    """Call LLM to improve the description based on eval results."""
    failed_triggers = [
        r for r in eval_results["results"]
        if r["should_trigger"] and not r["pass"]
    ]
    false_triggers = [
        r for r in eval_results["results"]
        if not r["should_trigger"] and not r["pass"]
    ]

    # Build scores summary
    train_score = f"{eval_results['summary']['passed']}/{eval_results['summary']['total']}"
    if test_results:
        test_score = f"{test_results['summary']['passed']}/{test_results['summary']['total']}"
        scores_summary = f"Train: {train_score}, Test: {test_score}"
    else:
        scores_summary = f"Train: {train_score}"

    prompt = f"""You are optimizing a skill description for a skill called "{skill_name}". A "skill" is a prompt with progressive disclosure -- there's a title and description that the agent sees when deciding whether to use the skill, and then if it does use the skill, it reads the SKILL.md file which has lots more details.

The description appears in the agent's "available_skills" list. When a user sends a query, the agent decides whether to invoke the skill based solely on the title and on this description. Your goal is to write a description that triggers for relevant queries, and doesn't trigger for irrelevant ones.

Here's the current description:
<current_description>
"{current_description}"
</current_description>

Current scores ({scores_summary}):
<scores_summary>
"""
    if failed_triggers:
        prompt += "FAILED TO TRIGGER (should have triggered but didn't):\n"
        for r in failed_triggers:
            prompt += f'  - "{r["query"]}" (triggered {r["triggers"]}/{r["runs"]} times)\n'
        prompt += "\n"

    if false_triggers:
        prompt += "FALSE TRIGGERS (triggered but shouldn't have):\n"
        for r in false_triggers:
            prompt += f'  - "{r["query"]}" (triggered {r["triggers"]}/{r["runs"]} times)\n'
        prompt += "\n"

    if history:
        prompt += "PREVIOUS ATTEMPTS (do NOT repeat these — try something structurally different):\n\n"
        for h in history:
            train_s = f"{h.get('train_passed', h.get('passed', 0))}/{h.get('train_total', h.get('total', 0))}"
            test_s = f"{h.get('test_passed', '?')}/{h.get('test_total', '?')}" if h.get('test_passed') is not None else None
            score_str = f"train={train_s}" + (f", test={test_s}" if test_s else "")
            prompt += f'<attempt {score_str}>\n'
            prompt += f'Description: "{h["description"]}"\n'
            if "results" in h:
                prompt += "Train results:\n"
                for r in h["results"]:
                    status = "PASS" if r["pass"] else "FAIL"
                    prompt += f'  [{status}] should_trigger={r["should_trigger"]} rate={r["triggers"]}/{r["runs"]}: {r["query"]}\n'
            if "train_results" in h:
                prompt += "Train results:\n"
                for r in h["train_results"]:
                    status = "PASS" if r["pass"] else "FAIL"
                    prompt += f'  [{status}] should_trigger={r["should_trigger"]} rate={r["triggers"]}/{r["runs"]}: {r["query"]}\n'
            if h.get("test_results"):
                prompt += "Test results:\n"
                for r in h["test_results"]:
                    status = "PASS" if r["pass"] else "FAIL"
                    prompt += f'  [{status}] should_trigger={r["should_trigger"]} rate={r["triggers"]}/{r["runs"]}: {r["query"]}\n'
            prompt += "</attempt>\n\n"

    prompt += f"""</scores_summary>

Here's the full SKILL.md content for context (the description should accurately represent what this skill does):
<skill_content>
{skill_content[:8000]}
</skill_content>

RULES:
1. The description MUST be under 1024 characters
2. Do NOT use angle brackets (< or >)
3. Focus on WHAT the skill does and WHEN to use it
4. Include key terms that would appear in relevant queries
5. Be specific enough to avoid false triggers
6. If previous attempts failed on certain queries, ensure the new description addresses those

Respond with ONLY the new description text, nothing else. No quotes, no explanation."""

    # Log the prompt if log_dir is set
    if log_dir and iteration is not None:
        log_dir.mkdir(parents=True, exist_ok=True)
        (log_dir / f"improve_prompt_iter{iteration}.txt").write_text(prompt)

    response = _call_llm(prompt, model)

    # Clean up the response
    new_description = response.strip().strip('"').strip("'")
    # Remove any markdown formatting
    new_description = re.sub(r'^```.*\n?', '', new_description)
    new_description = re.sub(r'\n?```$', '', new_description)
    new_description = new_description.strip()

    # Enforce length limit
    if len(new_description) > 1024:
        new_description = new_description[:1021] + "..."

    # Log the result
    if log_dir and iteration is not None:
        (log_dir / f"improve_result_iter{iteration}.txt").write_text(new_description)

    return new_description


def main():
    parser = argparse.ArgumentParser(description="Improve skill description")
    parser.add_argument("--eval-results", required=True, help="Path to eval results JSON")
    parser.add_argument("--skill-path", required=True, help="Path to skill directory")
    parser.add_argument("--history", default=None, help="Path to history JSON")
    parser.add_argument("--model", default=None, help="Model for improvement")
    parser.add_argument("--verbose", action="store_true", help="Print thinking to stderr")
    args = parser.parse_args()

    skill_path = Path(args.skill_path)
    if not (skill_path / "SKILL.md").exists():
        print(f"Error: No SKILL.md found at {skill_path}", file=sys.stderr)
        sys.exit(1)

    eval_results = json.loads(Path(args.eval_results).read_text())
    history = []
    if args.history:
        history = json.loads(Path(args.history).read_text())

    name, _, content = parse_skill_md(skill_path)
    current_description = eval_results["description"]

    if args.verbose:
        print(f"Current: {current_description}", file=sys.stderr)
        print(f"Score: {eval_results['summary']['passed']}/{eval_results['summary']['total']}", file=sys.stderr)

    new_description = improve_description(
        skill_name=name,
        skill_content=content,
        current_description=current_description,
        eval_results=eval_results,
        history=history,
        model=args.model,
    )

    if args.verbose:
        print(f"Improved: {new_description}", file=sys.stderr)

    output = {
        "description": new_description,
        "history": history + [{
            "description": current_description,
            "passed": eval_results["summary"]["passed"],
            "failed": eval_results["summary"]["failed"],
            "total": eval_results["summary"]["total"],
            "results": eval_results["results"],
        }],
    }
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
