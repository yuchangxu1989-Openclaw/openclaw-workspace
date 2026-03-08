#!/usr/bin/env python3
"""Minimal reproducible SWE-bench Lite runner scaffold.

Goals:
- closed-book by default (no web / retrieval usage in solve phase)
- LLM-primary metadata contract
- sandbox-first execution contract
- deterministic artifact packaging for leaderboard-style submission assets

This runner intentionally supports a dry-run path in environments without
Docker / SWE-bench harness installation, so the pipeline can still produce a
submission asset bundle skeleton and validate formats on a minimal batch.
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import subprocess
import sys
import textwrap
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from typing import Any

ROOT = pathlib.Path(__file__).resolve().parents[1]
SUBMISSION_ROOT = ROOT / "submission"


@dataclass
class RunnerConfig:
    dataset_name: str = "princeton-nlp/SWE-bench_Lite"
    split: str = "test"
    model_name: str = "llm-primary-unspecified"
    llm_provider: str = "unspecified"
    closed_book: bool = True
    sandbox: str = "docker"
    network_access: str = "disabled_during_solve"
    max_workers: int = 1
    run_id: str = "dry-run"
    instances: list[str] | None = None
    predictions_path: str = "preds.json"
    traj_dir: str = "trajs"
    logs_dir: str = "logs"
    readme_path: str = "README.md"
    metadata_path: str = "metadata.json"
    dry_run: bool = False


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def shell(cmd: list[str], cwd: pathlib.Path | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, cwd=str(cwd) if cwd else None, text=True, capture_output=True)


def detect_capabilities() -> dict[str, Any]:
    docker = shell(["bash", "-lc", "command -v docker >/dev/null 2>&1 && echo yes || echo no"])
    python_ok = shell([sys.executable, "-c", "print('ok')"])
    return {
        "docker_available": docker.stdout.strip() == "yes",
        "python_executable": sys.executable,
        "python_ok": python_ok.returncode == 0,
    }


def make_prediction_stub(instance_id: str, model_name: str) -> dict[str, str]:
    return {
        "instance_id": instance_id,
        "model_name_or_path": model_name,
        "model_patch": "",
    }


def write_json(path: pathlib.Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


def write_text(path: pathlib.Path, data: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(data)


def build_metadata(cfg: RunnerConfig, capability: dict[str, Any], submission_dir: pathlib.Path, instance_ids: list[str]) -> dict[str, Any]:
    return {
        "benchmark": "SWE-bench Lite",
        "dataset_name": cfg.dataset_name,
        "split": cfg.split,
        "run_id": cfg.run_id,
        "created_at_utc": utc_now(),
        "runner_version": "0.1.0",
        "mode": "dry_run" if cfg.dry_run else "active",
        "method": {
            "llm_primary": True,
            "model_name": cfg.model_name,
            "provider": cfg.llm_provider,
            "closed_book": cfg.closed_book,
            "sandbox": cfg.sandbox,
            "network_access": cfg.network_access,
        },
        "environment": capability,
        "artifacts": {
            "predictions": os.path.relpath(submission_dir / cfg.predictions_path, submission_dir),
            "metadata": os.path.relpath(submission_dir / cfg.metadata_path, submission_dir),
            "readme": os.path.relpath(submission_dir / cfg.readme_path, submission_dir),
            "trajs": os.path.relpath(submission_dir / cfg.traj_dir, submission_dir),
            "logs": os.path.relpath(submission_dir / cfg.logs_dir, submission_dir),
        },
        "instances": instance_ids,
        "constraints_check": {
            "closed_book_enforced": cfg.closed_book,
            "llm_primary_declared": True,
            "sandbox_declared": bool(cfg.sandbox),
        },
    }


def build_readme(cfg: RunnerConfig, capability: dict[str, Any], instance_ids: list[str]) -> str:
    return textwrap.dedent(f"""\
    # SWE-bench Lite submission asset bundle

    - run_id: {cfg.run_id}
    - dataset: {cfg.dataset_name}
    - split: {cfg.split}
    - model: {cfg.model_name}
    - provider: {cfg.llm_provider}
    - closed_book: {cfg.closed_book}
    - sandbox: {cfg.sandbox}
    - network_access: {cfg.network_access}
    - dry_run: {cfg.dry_run}
    - generated_at_utc: {utc_now()}

    ## Included assets
    - preds.json
    - metadata.json
    - trajs/
    - logs/

    ## Minimal batch instances
    {os.linesep.join('- ' + x for x in instance_ids)}

    ## Environment snapshot
    - docker_available: {capability['docker_available']}
    - python_executable: {capability['python_executable']}

    ## Notes
    This bundle is designed to be reproducible. In environments lacking Docker or
    the official harness runtime, the runner falls back to dry-run mode while still
    emitting a complete asset package skeleton suitable for format validation and
    workflow smoke tests.
    """)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--submission-dir", required=True)
    ap.add_argument("--run-id", required=True)
    ap.add_argument("--instance", action="append", dest="instances")
    ap.add_argument("--model-name", default="llm-primary-unspecified")
    ap.add_argument("--llm-provider", default="unspecified")
    ap.add_argument("--dataset-name", default="princeton-nlp/SWE-bench_Lite")
    ap.add_argument("--split", default="test")
    ap.add_argument("--sandbox", default="docker")
    ap.add_argument("--network-access", default="disabled_during_solve")
    ap.add_argument("--allow-open-book", action="store_true")
    ap.add_argument("--active", action="store_true")
    args = ap.parse_args()

    cfg = RunnerConfig(
        dataset_name=args.dataset_name,
        split=args.split,
        model_name=args.model_name,
        llm_provider=args.llm_provider,
        closed_book=not args.allow_open_book,
        sandbox=args.sandbox,
        network_access=args.network_access,
        run_id=args.run_id,
        instances=args.instances or [],
        dry_run=not args.active,
    )
    instance_ids = cfg.instances or ["sympy__sympy-20590"]
    submission_dir = pathlib.Path(args.submission_dir).resolve()
    capability = detect_capabilities()
    if not capability["docker_available"]:
        cfg.dry_run = True

    preds = [make_prediction_stub(i, cfg.model_name) for i in instance_ids]
    metadata = build_metadata(cfg, capability, submission_dir, instance_ids)
    readme = build_readme(cfg, capability, instance_ids)

    write_json(submission_dir / cfg.predictions_path, preds)
    write_json(submission_dir / cfg.metadata_path, metadata)
    write_text(submission_dir / cfg.readme_path, readme)

    for iid in instance_ids:
        traj = {
            "instance_id": iid,
            "run_id": cfg.run_id,
            "created_at_utc": utc_now(),
            "events": [
                {"type": "run_started", "mode": "dry_run" if cfg.dry_run else "active"},
                {"type": "constraint_snapshot", "closed_book": cfg.closed_book, "sandbox": cfg.sandbox, "network_access": cfg.network_access},
                {"type": "prediction_emitted", "model_patch_bytes": 0},
            ],
        }
        write_json(submission_dir / cfg.traj_dir / f"{iid}.traj.json", traj)
        write_text(
            submission_dir / cfg.logs_dir / f"{iid}.log",
            f"[{utc_now()}] run_id={cfg.run_id} instance={iid} mode={'dry_run' if cfg.dry_run else 'active'} docker_available={capability['docker_available']}\n",
        )

    print(json.dumps({"ok": True, "submission_dir": str(submission_dir), "dry_run": cfg.dry_run, "instances": instance_ids}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
