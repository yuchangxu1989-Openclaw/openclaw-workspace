#!/usr/bin/env bash
# eval-stats.sh — 评测集实时统计，供cron报告调用（版本从isc-core/config动态读取）
# 输出 markdown 表格段落
set -euo pipefail

# 动态读取评测标准版本
source "$(cd "$(dirname "$0")/../../isc-core/config" && pwd)/read-eval-version.sh"

node -e "
const fs = require("fs"), path = require("path");
const dir = "/root/.openclaw/workspace/tests/benchmarks/intent/c2-golden/";
const files = fs.readdirSync(dir).filter(f => f.startsWith("mined-") && f.endsWith(".json"));

let active = 0, c2 = 0, realConv = 0, multiTurn = 0;
for (const f of files) {
  let data;
  try { data = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { continue; }
  if (!Array.isArray(data)) continue;
  for (const r of data) {
    if (r.deleted) continue;
    active++;
    if (r.difficulty === "C2") c2++;
    if (r.data_source === "real_conversation") realConv++;
    if (r.multi_turn) multiTurn++;
  }
}

const pct = (n) => active ? Math.round(100 * n / active) : 0;
const status = (val, target) => val >= target ? "✅" : "⚠️";

console.log("### 3️⃣ 评测集" + (process.env.EVAL_VERSION || "V?") + "对齐状态");
console.log("| 指标 | 当前 | 目标 | 状态 |");
console.log("|------|------|------|------|");
console.log(`| 总条数(活跃) | ${active} | ≥500 | ${status(active, 500)} |`);
console.log(`| C2占比 | ${pct(c2)}% | ≥80% | ${status(pct(c2), 80)} |`);
console.log(`| 真实对话占比 | ${pct(realConv)}% | ≥80% | ${status(pct(realConv), 80)} |`);
console.log(`| 多轮占比 | ${pct(multiTurn)}% | ≥80% | ${status(pct(multiTurn), 80)} |`);
'
