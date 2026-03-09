#!/usr/bin/env bash
# Handler: ISC-EVAL-ROLE-SEPARATION-001 — 评测角色分离铁律
# Trigger: eval.case.execution.completed
# Enforcement: evaluator.agentId !== executor.agentId → auto_badcase on violation
#
# Input (via env or stdin JSON):
#   EVENT_PAYLOAD - JSON with { executor: { agentId }, evaluator: { agentId }, caseId }

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RULE_ID="ISC-EVAL-ROLE-SEPARATION-001"

# Parse payload
if [[ -n "${EVENT_PAYLOAD:-}" ]]; then
  payload="$EVENT_PAYLOAD"
else
  payload="$(cat)"
fi

executor_id=$(echo "$payload" | jq -r '.executor.agentId // empty')
evaluator_id=$(echo "$payload" | jq -r '.evaluator.agentId // empty')
case_id=$(echo "$payload" | jq -r '.caseId // "unknown"')

if [[ -z "$executor_id" || -z "$evaluator_id" ]]; then
  echo "[${RULE_ID}] ERROR: missing executor.agentId or evaluator.agentId" >&2
  exit 1
fi

# Core check: evaluator must differ from executor
if [[ "$evaluator_id" == "$executor_id" ]]; then
  echo "[${RULE_ID}] VIOLATION: executor '$executor_id' cannot self-evaluate (case: $case_id)"
  echo "[${RULE_ID}] Action: auto_badcase"
  # Emit violation event
  echo "{\"event\":\"isc.violation\",\"rule\":\"${RULE_ID}\",\"action\":\"auto_badcase\",\"caseId\":\"${case_id}\",\"executor\":\"${executor_id}\",\"evaluator\":\"${evaluator_id}\",\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
  exit 2
fi

echo "[${RULE_ID}] PASS: executor='$executor_id' evaluator='$evaluator_id' (case: $case_id)"
exit 0
