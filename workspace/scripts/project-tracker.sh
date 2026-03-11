#!/usr/bin/env bash
# project-tracker.sh — 从 task-board.json 生成项目进度报告
# 用法: bash project-tracker.sh [--json] [--update-md]
#   --json      输出JSON格式
#   --update-md 同时更新 PROJECT-TRACKER.md

set -euo pipefail

BOARD_FILE="/root/.openclaw/workspace/skills/public/multi-agent-dispatch/state/task-board.json"
TRACKER_MD="/root/.openclaw/workspace/PROJECT-TRACKER.md"
NOW_EPOCH=$(date +%s)
BLOCK_THRESHOLD_MIN=30
RISK_THRESHOLD=50  # 失败率>50%标红

JSON_MODE=false
UPDATE_MD=false
for arg in "$@"; do
  case "$arg" in
    --json) JSON_MODE=true ;;
    --update-md) UPDATE_MD=true ;;
  esac
done

if [ ! -f "$BOARD_FILE" ]; then
  echo "❌ task-board.json 不存在: $BOARD_FILE" >&2
  exit 1
fi

# 用 node 解析（jq 可能不装）
node -e '
const fs = require("fs");
const board = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const nowEpoch = parseInt(process.argv[2]);
const blockMin = parseInt(process.argv[3]);
const riskThreshold = parseInt(process.argv[4]);
const jsonMode = process.argv[5] === "true";

// 合并所有任务
const allTasks = [
  ...board.active.map(t => ({ ...t, _pool: "active" })),
  ...board.queued.map(t => ({ ...t, _pool: "queued" })),
  ...board.history.map(t => ({ ...t, _pool: "history" })),
];

if (allTasks.length === 0) {
  if (jsonMode) {
    console.log(JSON.stringify({ projects: [], blocked: [], risks: [], generated: new Date().toISOString() }));
  } else {
    console.log("📋 task-board 为空，暂无项目数据。");
    console.log(`\n📊 Board 概要: slots=${board.summary.maxSlots}, 已注册=${board.summary.totalRegistered}, 完成=${board.summary.totalCompleted}, 失败=${board.summary.totalFailed}`);
  }
  process.exit(0);
}

// 按 label 前缀聚合项目
function getProject(task) {
  const label = task.label || task.taskLabel || task.id || "unknown";
  const m = label.match(/^([a-zA-Z0-9_]+-)/);
  return m ? m[1].replace(/-$/, "") : "misc";
}

const projects = {};
const blocked = [];

for (const t of allTasks) {
  const proj = getProject(t);
  if (!projects[proj]) projects[proj] = { total: 0, done: 0, failed: 0, cancelled: 0, running: 0, queued: 0, timedOut: 0 };
  const p = projects[proj];
  p.total++;

  const status = (t.status || t._pool).toLowerCase();
  if (status === "done" || status === "completed") p.done++;
  else if (status === "failed") p.failed++;
  else if (status === "cancelled") p.cancelled++;
  else if (t._pool === "queued") p.queued++;
  else if (t._pool === "active") {
    p.running++;
    // 检查阻塞
    const startStr = t.startedAt || t.createdAt || t.registeredAt;
    if (startStr) {
      const startEpoch = Math.floor(new Date(startStr).getTime() / 1000);
      const runMin = (nowEpoch - startEpoch) / 60;
      if (runMin > blockMin) {
        blocked.push({
          project: proj,
          task: t.label || t.id,
          runningMin: Math.round(runMin),
          startedAt: startStr,
        });
      }
    }
  }
}

// 计算指标 & 风险
const rows = [];
const risks = [];
for (const [name, p] of Object.entries(projects).sort((a, b) => b[1].total - a[1].total)) {
  const finished = p.done + p.failed + p.cancelled;
  const completionRate = finished > 0 ? Math.round((p.done / finished) * 100) : (p.total === p.queued ? 0 : 0);
  const failRate = finished > 0 ? Math.round((p.failed / finished) * 100) : 0;
  // 超时：用 timedOut 或近似（cancelled 可能含超时）
  const row = { name, ...p, completionRate, failRate };
  rows.push(row);
  if (failRate > riskThreshold) risks.push({ project: name, failRate, failed: p.failed, total: p.total });
}

if (jsonMode) {
  console.log(JSON.stringify({ projects: rows, blocked, risks, board_summary: board.summary, generated: new Date().toISOString() }, null, 2));
  process.exit(0);
}

// 文本报告
console.log("╔══════════════════════════════════════════════════════════╗");
console.log("║            📊 项目进度报告 (Project Tracker)            ║");
console.log("╚══════════════════════════════════════════════════════════╝");
console.log(`  生成时间: ${new Date().toISOString()}`);
console.log(`  Board: slots=${board.summary.maxSlots} occupied=${board.summary.occupied} queued=${board.summary.queued}`);
console.log("");

// 项目表
console.log("┌─────────────┬──────┬──────┬──────┬──────┬────────┬────────┐");
console.log("│ 项目        │ 总数 │ 完成 │ 失败 │ 运行 │ 完成率 │ 失败率 │");
console.log("├─────────────┼──────┼──────┼──────┼──────┼────────┼────────┤");
for (const r of rows) {
  const warn = r.failRate > riskThreshold ? " 🔴" : "";
  console.log(`│ ${(r.name).padEnd(11)} │ ${String(r.total).padStart(4)} │ ${String(r.done).padStart(4)} │ ${String(r.failed).padStart(4)} │ ${String(r.running).padStart(4)} │ ${String(r.completionRate + "%").padStart(6)} │ ${String(r.failRate + "%").padStart(5)}${warn} │`);
}
console.log("└─────────────┴──────┴──────┴──────┴──────┴────────┴────────┘");

if (blocked.length > 0) {
  console.log("\n⚠️  疑似阻塞任务 (running > " + blockMin + "min):");
  for (const b of blocked) {
    console.log(`  🚧 [${b.project}] ${b.task} — 已运行 ${b.runningMin} 分钟 (since ${b.startedAt})`);
  }
}

if (risks.length > 0) {
  console.log("\n🔴 风险预警 (失败率 > " + riskThreshold + "%):");
  for (const r of risks) {
    console.log(`  ⛔ ${r.project}: 失败率 ${r.failRate}% (${r.failed}/${r.total})`);
  }
}

if (blocked.length === 0 && risks.length === 0) {
  console.log("\n✅ 无阻塞或高风险项目。");
}
' "$BOARD_FILE" "$NOW_EPOCH" "$BLOCK_THRESHOLD_MIN" "$RISK_THRESHOLD" "$JSON_MODE"

# 更新 PROJECT-TRACKER.md
if $UPDATE_MD && [ -f "$TRACKER_MD" ]; then
  STATS=$(node -e '
const fs = require("fs");
const board = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const all = [...board.active, ...board.queued, ...board.history];
const now = new Date().toISOString().slice(0,16).replace("T"," ");
let lines = [];
lines.push("| 指标 | 值 |");
lines.push("|------|-----|");
lines.push("| 最大并发槽位 | " + board.summary.maxSlots + " |");
lines.push("| 当前占用 | " + board.summary.occupied + " |");
lines.push("| 排队中 | " + board.summary.queued + " |");
lines.push("| 更新时间 | " + now + " |");
console.log(lines.join("\n"));
' "$BOARD_FILE")

  # 替换 AUTO-STATS 区块
  if grep -q '<!-- AUTO-STATS-START -->' "$TRACKER_MD"; then
    awk -v stats="$STATS" '
      /<!-- AUTO-STATS-START -->/{print; print stats; skip=1; next}
      /<!-- AUTO-STATS-END -->/{skip=0}
      !skip{print}
    ' "$TRACKER_MD" > "${TRACKER_MD}.tmp" && mv "${TRACKER_MD}.tmp" "$TRACKER_MD"
    echo ""
    echo "✅ 已更新 PROJECT-TRACKER.md 统计区块。"
  fi
fi
