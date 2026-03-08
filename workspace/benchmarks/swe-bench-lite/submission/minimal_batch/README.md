# SWE-bench Lite submission asset bundle

- run_id: smoke-20260307
- dataset: princeton-nlp/SWE-bench_Lite
- split: test
- model: claude-opus-placeholder
- provider: anthropic
- closed_book: True
- sandbox: docker
- network_access: disabled_during_solve
- dry_run: True
- generated_at_utc: 2026-03-07T14:43:31+00:00

## Included assets
- preds.json
- metadata.json
- trajs/
- logs/

## Minimal batch instances
- sympy__sympy-20590

## Environment snapshot
- docker_available: False
- python_executable: /usr/bin/python3

## Notes
This bundle is designed to be reproducible. In environments lacking Docker or
the official harness runtime, the runner falls back to dry-run mode while still
emitting a complete asset package skeleton suitable for format validation and
workflow smoke tests.
