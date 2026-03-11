#!/usr/bin/env bash
# auto-grant-feishu-perm — 飞书文档创建后自动授权指定用户full_access权限
# 用法: bash index.sh <doc_token> [doc_type]
# doc_type: docx(默认) | sheet | bitable
set -euo pipefail
exec bash "$(dirname "$0")/scripts/auto-grant-feishu-perm.sh" "$@"
