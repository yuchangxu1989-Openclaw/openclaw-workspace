#!/usr/bin/env bash
# ISC Rule Handler: rule.version-integrity-gate-001
# 版本诚实性门禁 — git diff 检测版本号变更时是否伴随 CHANGELOG 更新
# 输入: JSON via stdin  输出: JSON to stdout  退出码: 0=pass 1=fail 2=error
set -euo pipefail

# ── 输入解析 ──────────────────────────────────────────────
INPUT="$(cat)"
SKILL_NAME="$(echo "$INPUT" | jq -r '.params.skillName // empty')"
DIFF_REF="$(echo "$INPUT" | jq -r '.params.diffRef // "HEAD~1"')"

if [[ -z "$SKILL_NAME" ]]; then
  echo '{"status":"error","message":"缺少 skillName 参数"}' | jq .
  exit 2
fi

# ── 条件判断 ──────────────────────────────────────────────
# 检查 git diff 中是否有版本号相关文件变更
VERSION_CHANGED=false
CHANGELOG_CHANGED=false

# 获取变更文件列表
CHANGED_FILES="$(git diff --name-only "$DIFF_REF" -- . 2>/dev/null || true)"

if [[ -z "$CHANGED_FILES" ]]; then
  # 无变更，直接通过
  echo '{"status":"pass","message":"无文件变更，跳过检查"}' | jq .
  exit 0
fi

# 检测版本号变更（package.json / SKILL.md / *.json 中的 version 字段）
for f in $CHANGED_FILES; do
  case "$f" in
    *package.json|*skill.json|*SKILL.md|*manifest.json)
      # 进一步确认是否有 version 字段变更
      if git diff "$DIFF_REF" -- "$f" 2>/dev/null | grep -qE '^\+.*"version":|^\+.*version:'; then
        VERSION_CHANGED=true
      fi
      ;;
  esac
  case "$f" in
    *CHANGELOG*|*changelog*|*CHANGES*|*HISTORY*)
      CHANGELOG_CHANGED=true
      ;;
  esac
done

# ── 判定与输出 ─────────────────────────────────────────────
if [[ "$VERSION_CHANGED" == "true" && "$CHANGELOG_CHANGED" == "false" ]]; then
  jq -n \
    --arg skill "$SKILL_NAME" \
    '{
      status: "fail",
      rule: "rule.version-integrity-gate-001",
      skill: $skill,
      message: "版本号已变更但未更新 CHANGELOG，请补充变更记录后重试",
      enforcement: "block"
    }'
  exit 1
fi

if [[ "$VERSION_CHANGED" == "true" && "$CHANGELOG_CHANGED" == "true" ]]; then
  jq -n \
    --arg skill "$SKILL_NAME" \
    '{
      status: "pass",
      rule: "rule.version-integrity-gate-001",
      skill: $skill,
      message: "版本号变更伴随 CHANGELOG 更新，检查通过"
    }'
  exit 0
fi

# 无版本号变更，通过
jq -n \
  --arg skill "$SKILL_NAME" \
  '{
    status: "pass",
    rule: "rule.version-integrity-gate-001",
    skill: $skill,
    message: "未检测到版本号变更，跳过门禁"
  }'
exit 0
