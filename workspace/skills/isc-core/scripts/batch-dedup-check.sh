#!/bin/bash
# batch-dedup-check.sh — 批量验证废弃规则
# 对每条废弃规则运行 check-rule-dedup.js，输出结构化结果
# 输出格式: JSONL，每行一条记录

DEPRECATED_DIR="/root/.openclaw/workspace/skills/isc-core/rules/_deprecated"
RULES_DIR="/root/.openclaw/workspace/skills/isc-core/rules"
SCRIPT="/root/.openclaw/workspace/skills/isc-core/scripts/check-rule-dedup.js"
OUTPUT_JSONL="/root/.openclaw/workspace/reports/dedup-batch-results.jsonl"

mkdir -p /root/.openclaw/workspace/reports

echo "[]" > /tmp/dedup-results.json

for FILE in "$DEPRECATED_DIR"/*.json; do
  BASENAME=$(basename "$FILE")
  echo "===CHECKING: $BASENAME===" >&2
  
  # Run check-rule-dedup.js and capture output + exit code
  OUTPUT=$(node "$SCRIPT" "$FILE" --rules-dir "$RULES_DIR" 2>/dev/null)
  EXIT_CODE=$?
  
  # Extract the DEDUP_RESULT_JSON section
  RESULT_JSON=$(echo "$OUTPUT" | sed -n '/^DEDUP_RESULT_JSON:/,$ p' | tail -n +2)
  
  # Build our record
  RECORD=$(node -e "
    const result = JSON.parse(process.argv[1] || '{}');
    const out = {
      file: '$BASENAME',
      exit_code: $EXIT_CODE,
      status: result.status || 'UNKNOWN',
      duplicates: result.duplicates || [],
      scanned: result.scanned || 0,
      candidates: result.candidates || 0,
      api_failures: result.api_failures || 0
    };
    console.log(JSON.stringify(out));
  " "$RESULT_JSON" 2>/dev/null || echo "{\"file\":\"$BASENAME\",\"exit_code\":$EXIT_CODE,\"status\":\"PARSE_ERROR\",\"duplicates\":[]}")
  
  echo "$RECORD" >> "$OUTPUT_JSONL"
  echo "$BASENAME -> exit=$EXIT_CODE status=$(echo $RECORD | node -e 'const d=JSON.parse(require("fs").readFileSync("/dev/stdin","utf8")); console.log(d.status)' 2>/dev/null)" >&2
done

echo "Done. Results in $OUTPUT_JSONL" >&2
