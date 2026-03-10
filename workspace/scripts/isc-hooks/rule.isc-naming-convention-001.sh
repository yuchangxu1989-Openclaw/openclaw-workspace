#!/usr/bin/env bash
# Handler: rule.isc-naming-convention-001
# Validates rule ID naming format: rule.{domain}-{name}-{number}.json
# Input: JSON on stdin with "rule_id" field
# Output: JSON verdict on stdout
# Exit: 0 = pass, 1 = fail, 2 = error

set -euo pipefail

INPUT=$(cat)

RULE_ID=$(printf '%s' "$INPUT" | grep -oP '"rule_id"\s*:\s*"[^"]*"' | head -1 | sed 's/.*:.*"\(.*\)"/\1/' || true)

if [ -z "$RULE_ID" ]; then
  printf '{"status":"error","rule":"rule.isc-naming-convention-001","message":"missing rule_id field"}\n'
  exit 2
fi

# Pattern: rule.{domain}-{name}-{number}.json
# domain: lowercase alpha
# name: lowercase alpha/digits/hyphens (at least one segment)
# number: 3 digits
PATTERN='^rule\.[a-z]+-[a-z0-9]+(-[a-z0-9]+)*-[0-9]{3}\.json$'

if [[ "$RULE_ID" =~ $PATTERN ]]; then
  printf '{"status":"pass","rule":"rule.isc-naming-convention-001","rule_id":"%s","message":"naming convention valid"}\n' "$RULE_ID"
  exit 0
else
  printf '{"status":"fail","rule":"rule.isc-naming-convention-001","rule_id":"%s","message":"invalid format, expected: rule.{domain}-{name}-{number}.json","expected_pattern":"%s"}\n' "$RULE_ID" "$PATTERN"
  exit 1
fi
