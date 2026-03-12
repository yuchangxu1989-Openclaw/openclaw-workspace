#!/usr/bin/env bash
# 评测标准版本动态读取器 (bash)
# source 此文件后可用 $EVAL_VERSION / $EVAL_DOC_TOKEN
# 升级版本只需改 eval-standard-version.json

_EVAL_CONFIG="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/eval-standard-version.json"

if [ -f "$_EVAL_CONFIG" ] && command -v jq &>/dev/null; then
  EVAL_VERSION="$(jq -r '.version' "$_EVAL_CONFIG")"
  EVAL_DOC_TOKEN="$(jq -r '.doc_token' "$_EVAL_CONFIG")"
else
  echo "WARN: 无法读取评测标准配置 $_EVAL_CONFIG" >&2
  EVAL_VERSION="UNKNOWN"
  EVAL_DOC_TOKEN=""
fi

export EVAL_VERSION EVAL_DOC_TOKEN
