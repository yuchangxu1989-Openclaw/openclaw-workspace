#!/usr/bin/env bash
# [DEPRECATED] 此文件已被 sync-eval-standard.sh 替代
# 保留仅为兼容旧调用链，新代码请使用 sync-eval-standard.sh
echo "⚠️  sync-v4-standard.sh 已废弃，请使用 sync-eval-standard.sh"
exec "$(dirname "$0")/sync-eval-standard.sh" "$@"
