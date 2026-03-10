#!/usr/bin/env bash
set -euo pipefail

BASE_REF="${1:-HEAD~1}"
HEAD_REF="${2:-HEAD}"

if ! git rev-parse --verify "$BASE_REF" >/dev/null 2>&1; then
  echo '{"ok":false,"error":"invalid base ref"}'
  exit 2
fi

version_changed=false
changelog_updated=false

diff_names=$(git diff --name-only "$BASE_REF" "$HEAD_REF")
if git diff "$BASE_REF" "$HEAD_REF" | grep -E '^[+-].*(version|版本)' -qi; then
  version_changed=true
fi
if echo "$diff_names" | grep -Eqi '(^|/)CHANGELOG(\.md)?$'; then
  changelog_updated=true
fi

if [[ "$version_changed" == true && "$changelog_updated" == false ]]; then
  jq -n '{ok:false,version_changed:true,changelog_updated:false,message:"检测到版本号变更但未更新CHANGELOG"}'
  exit 1
else
  jq -n --argjson v "$version_changed" --argjson c "$changelog_updated" '{ok:true,version_changed:$v,changelog_updated:$c}'
  exit 0
fi
