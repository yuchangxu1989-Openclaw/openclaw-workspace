#!/usr/bin/env bash
#
# api-failover-probe.sh — API Provider 失败自动探测和告警
#
# 功能:
#   1. 读取 openclaw.json 中所有 provider 的 API 配置
#   2. 对每个 provider 发送轻量级探测请求
#   3. 如果主 provider 失败，记录日志并通过飞书通知
#   4. 输出 JSON 格式的探测结果
#
# 用法:
#   ./api-failover-probe.sh                          # 默认配置
#   ./api-failover-probe.sh --webhook <飞书webhook>  # 指定飞书 webhook
#   ./api-failover-probe.sh --config <path>          # 指定配置文件
#   ./api-failover-probe.sh --timeout 10000          # 超时毫秒数
#   ./api-failover-probe.sh --quiet                  # 静默模式（仅输出JSON）
#   ./api-failover-probe.sh --cron                   # cron 模式（静默 + 仅失败时输出）
#
# 环境变量:
#   FEISHU_PROBE_WEBHOOK  — 飞书 webhook URL（也可用 --webhook 传入）
#   OPENCLAW_CONFIG       — 配置文件路径（也可用 --config 传入）
#
# 退出码:
#   0 — 所有主 provider 正常
#   1 — 有主 provider 异常
#   2 — 脚本执行错误
#

set -euo pipefail

# ─── 路径设置 ─────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROBE_JS="${SCRIPT_DIR}/api-probe.js"
LOG_DIR="${SCRIPT_DIR}/logs"
LOG_FILE="${LOG_DIR}/api-failover-probe.log"
RESULT_DIR="${SCRIPT_DIR}/results"

# ─── 默认参数 ─────────────────────────────────────────────────────────────────

CONFIG="${OPENCLAW_CONFIG:-/root/.openclaw/openclaw.json}"
WEBHOOK="${FEISHU_PROBE_WEBHOOK:-}"
TIMEOUT=15000
QUIET=false
CRON=false
NODE_BIN="node"

# ─── 参数解析 ─────────────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case "$1" in
    --config)
      CONFIG="$2"; shift 2 ;;
    --webhook)
      WEBHOOK="$2"; shift 2 ;;
    --timeout)
      TIMEOUT="$2"; shift 2 ;;
    --quiet)
      QUIET=true; shift ;;
    --cron)
      CRON=true; QUIET=true; shift ;;
    --help|-h)
      head -30 "$0" | grep '^#' | sed 's/^# \?//'; exit 0 ;;
    *)
      echo "未知参数: $1" >&2; exit 2 ;;
  esac
done

# ─── 辅助函数 ─────────────────────────────────────────────────────────────────

timestamp() {
  date '+%Y-%m-%d %H:%M:%S %Z'
}

log() {
  local msg="[$(timestamp)] $*"
  mkdir -p "${LOG_DIR}"
  echo "${msg}" >> "${LOG_FILE}"
  if [[ "${QUIET}" != "true" ]]; then
    echo "${msg}" >&2
  fi
}

die() {
  log "FATAL: $*"
  echo "{\"success\":false,\"error\":\"$*\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
  exit 2
}

# ─── 前置检查 ─────────────────────────────────────────────────────────────────

[[ -f "${CONFIG}" ]]    || die "配置文件不存在: ${CONFIG}"
[[ -f "${PROBE_JS}" ]]  || die "探测脚本不存在: ${PROBE_JS}"
command -v "${NODE_BIN}" &>/dev/null || die "Node.js 未安装或不在 PATH 中"

# ─── 日志轮转（保留最近 7 天） ────────────────────────────────────────────────

rotate_logs() {
  if [[ -f "${LOG_FILE}" ]]; then
    local size
    size=$(stat -f%z "${LOG_FILE}" 2>/dev/null || stat -c%s "${LOG_FILE}" 2>/dev/null || echo 0)
    # 超过 10MB 则轮转
    if [[ "${size}" -gt 10485760 ]]; then
      mv "${LOG_FILE}" "${LOG_FILE}.$(date +%Y%m%d%H%M%S).bak"
      log "日志已轮转"
    fi
  fi
  # 清理 7 天以前的备份
  find "${LOG_DIR}" -name "*.bak" -mtime +7 -delete 2>/dev/null || true
}

# ─── 保存结果快照 ─────────────────────────────────────────────────────────────

save_result() {
  local json="$1"
  mkdir -p "${RESULT_DIR}"
  local filename="probe-$(date +%Y%m%d-%H%M%S).json"
  echo "${json}" > "${RESULT_DIR}/${filename}"
  # 保留最近 100 个结果文件
  ls -1t "${RESULT_DIR}"/probe-*.json 2>/dev/null | tail -n +101 | xargs -r rm -f
  log "结果已保存: ${RESULT_DIR}/${filename}"
}

# ─── 主流程 ───────────────────────────────────────────────────────────────────

main() {
  log "========== API 探测开始 =========="
  log "配置: ${CONFIG}"
  log "超时: ${TIMEOUT}ms"
  [[ -n "${WEBHOOK}" ]] && log "飞书 Webhook: 已配置" || log "飞书 Webhook: 未配置"

  rotate_logs

  # 构建 Node.js 探测参数
  local node_args=("${PROBE_JS}" "--config" "${CONFIG}" "--timeout" "${TIMEOUT}")
  [[ -n "${WEBHOOK}" ]] && node_args+=("--feishu-webhook" "${WEBHOOK}")
  [[ "${QUIET}" == "true" ]] && node_args+=("--quiet")

  # 执行探测
  local result exit_code=0
  result=$("${NODE_BIN}" "${node_args[@]}" 2>>"${LOG_FILE}") || exit_code=$?

  if [[ -z "${result}" ]]; then
    die "探测脚本无输出"
  fi

  # 保存结果
  save_result "${result}"

  # 解析摘要（使用 Node.js 内联解析，避免依赖 jq）
  local summary
  summary=$("${NODE_BIN}" -e "
    const r = JSON.parse(process.argv[1]);
    const s = r.summary || {};
    console.log('总计:' + s.total + ' 健康:' + s.healthy + ' 降级:' + s.degraded + ' 宕机:' + s.down + ' 错误:' + s.error);
    if (r.primaryFailures && r.primaryFailures.length > 0) {
      r.primaryFailures.forEach(f => console.log('  ⚠️  主Provider异常: ' + f.provider + ' [' + f.status + '] ' + (f.error || '')));
    }
  " "${result}" 2>/dev/null) || true

  log "${summary}"

  # cron 模式：只在失败时输出
  if [[ "${CRON}" == "true" ]]; then
    if [[ ${exit_code} -ne 0 ]]; then
      echo "${result}"
    fi
  else
    echo "${result}"
  fi

  log "========== API 探测完成 (exit: ${exit_code}) =========="
  return ${exit_code}
}

main
