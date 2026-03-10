# 质量核查报告：僵尸任务检测脚本

- 核查时间：2026-03-10 23:25 CST
- 核查人：reviewer
- 核查对象：
  1. `scripts/check-stale-tasks.sh`（实际为Node.js脚本）
  2. `scripts/completion-handler.sh`（增强部分）

---

## 一、功能正确性

### 1.1 默认模式运行 — ✅ 通过

```
node scripts/check-stale-tasks.sh
```

输出正常，正确识别当前1个running任务（qa-stale-task-checker，即本次核查session），判定为healthy（stopReason=toolUse）。

### 1.2 --fix --timeout 5 模式 — ✅ 通过

```
node scripts/check-stale-tasks.sh --fix --timeout 5
```

输出正常，当前唯一running任务刚启动且stopReason=toolUse，未被误判为僵尸。逻辑正确：toolUse状态下只有超过 `3×timeout`（15分钟）才标记stale。

### 1.3 当前看板running数 — ✅ 通过

看板710条记录，running=1（即本次核查任务自身），其余全部为done/timeout/failed/archived。符合预期。

---

## 二、检测逻辑验证

### 2.1 "子Agent已完成"的判断方式 — ⚠️ 有问题

判断流程：
1. 通过 `findSessionByLabel(agentId, label)` 在 `/root/.openclaw/agents/{agentId}/sessions/sessions.json` 中按label精确匹配找sessionId
2. 读取对应 `.jsonl` 文件的最后一行
3. 解析 `message.stopReason` 字段
4. `stopReason === 'stop' || stopReason === 'end_turn'` → 判定为zombie

**BUG-1（major）：`stopReason=aborted` 未被识别为已完成**

实际环境中存在4种stopReason值：
| stopReason | 出现次数 | 含义 |
|---|---|---|
| `stop` | 136 | 正常完成 |
| `aborted` | 8 | 被中止（session已结束） |
| `length` | 1 | 上下文长度超限（session已结束） |
| `NONE`/空 | 4 | 未知 |

脚本只把 `stop` 和 `end_turn` 视为已完成。但 `aborted` 和 `length` 同样意味着session已终止。如果一个任务的session以 `aborted` 结束，看板仍为running，该脚本不会将其识别为zombie，只会在超时后标记为stale（状态设为timeout而非done）。

**影响**：aborted的任务会被错误地标记为timeout而非done/aborted，fixed_reason也不准确。

**建议**：zombie判定条件改为：
```javascript
if (['stop', 'end_turn', 'aborted', 'length'].includes(stopReason)) {
  status = 'zombie';
}
```

### 2.2 label匹配可靠性 — ⚠️ 有问题

**BUG-2（major）：sessions.json中大量label为"N/A"，导致精确匹配失败**

实测数据：
- coder: 10个session，前5个label全部为 `N/A`
- reviewer: 6个session，前3个label为 `N/A`

当label匹配失败时，脚本fallback到 `findLatestSession(agentId)`，即取该agent目录下最新的 `.jsonl` 文件。

**BUG-3（major）：fallback逻辑在多任务并发时会匹配到错误的session**

coder agent历史上有284个任务。如果coder同时有2个running任务（task-A和task-B），且两者的label在sessions.json中都是N/A，那么 `findLatestSession('coder')` 对两个任务都会返回同一个最新session文件。这意味着：
- 如果最新session已完成 → 两个任务都被判为zombie
- 如果最新session还在跑 → 两个任务都被判为healthy

这是一个严重的误判风险。

**label特殊字符** — ✅ 无问题

label匹配使用JavaScript严格相等（`===`），不涉及正则或shell展开。实测看板中存在含中文的label（如 `rca-badcase-口头不入库`），匹配逻辑不受影响。

---

## 三、并发安全

### 3.1 并发写入风险 — 🔴 有问题（blocker级别）

**BUG-4（blocker）：无文件锁机制，存在并发写入数据损坏风险**

写入 `subagent-task-board.json` 的路径有3条：
1. `completion-handler.sh` → `update-task.sh` → `fs.writeFileSync(BOARD_FILE, ...)`
2. `completion-handler.sh` → 后台 `node check-stale-tasks.sh --fix --quiet` → `fs.writeFileSync(BOARD_FILE, ...)`
3. `completion-handler.sh` → Step 5.5 → `jq ... > ${BOARD_FILE}.tmp && mv ...`

当两个completion事件同时到达时：
- 两个completion-handler.sh进程各自读取board → 各自修改 → 各自写回
- 后写入的会覆盖先写入的修改（lost update）
- 更糟的是，后台的check-stale-tasks.sh也在写同一个文件

**实际场景**：19个并发slot，多个任务可能在几秒内先后完成，触发多个completion-handler并发执行。

**搜索结果**：三个脚本中均无 `flock`、`lockfile`、`mutex` 等锁机制。

**建议**：
```bash
# 在所有写入task-board.json的地方加文件锁
(
  flock -x 200
  # ... 读取、修改、写入 ...
) 200>/tmp/task-board.lock
```

---

## 四、边界情况

### 4.1 task-board.json不存在 — ✅ 通过

脚本第87行：
```javascript
if (!fs.existsSync(BOARD_FILE)) {
  if (!quiet) console.log('⚠️ 看板文件不存在:', BOARD_FILE);
  process.exit(0);
}
```
正确处理，优雅退出。

### 4.2 task-board.json为空或格式错误 — 🔴 有问题

**BUG-5（major）：JSON解析无try-catch保护**

第92行：
```javascript
const board = JSON.parse(fs.readFileSync(BOARD_FILE, 'utf8'));
```

如果文件内容为空字符串、损坏的JSON、或被并发写入截断，`JSON.parse` 会抛出异常，脚本直接崩溃（unhandled exception）。

实测验证：空文件 → `Unexpected end of JSON input` 异常。

**建议**：
```javascript
let board;
try {
  board = JSON.parse(fs.readFileSync(BOARD_FILE, 'utf8'));
} catch (e) {
  console.error('⚠️ 看板文件解析失败:', e.message);
  process.exit(0);
}
if (!Array.isArray(board)) {
  console.error('⚠️ 看板文件格式异常（非数组）');
  process.exit(0);
}
```

### 4.3 session目录下无匹配session — ✅ 通过

`findSessionByLabel` 返回null → `findLatestSession` 返回null → 进入"找不到session文件"分支 → 根据spawnTime判断是否超时。逻辑完整。

### 4.4 --fix模式写入正确性 — ✅ 通过

修正逻辑：
- zombie → `status='done'`，设置默认result_summary
- stale → `status='timeout'`，设置默认result_summary
- 使用 `task.result_summary || '...'` 不覆盖已有摘要
- 写入完整board数组，格式化JSON + 换行符

---

## 五、审计完整性

### 5.1 auto_fixed字段 — ✅ 通过

```javascript
task.auto_fixed = true;
```
布尔值，语义清晰，可用于后续过滤自动修正的记录。

### 5.2 fixed_at时间戳格式 — ✅ 通过

```javascript
task.fixed_at = new Date().toISOString();
```
ISO 8601格式（如 `2026-03-10T15:24:22.343Z`），标准且可排序。

### 5.3 fixed_reason — ✅ 通过

```javascript
task.fixed_reason = item.reason;
```
reason字段包含具体诊断信息，如：
- `session已完成(stopReason=stop)，看板仍为running，距完成5分钟`
- `session 15分钟未更新(stopReason=N/A)`

信息充分，可追溯。

---

## 六、其他发现

### 6.1 文件命名误导 — minor

`check-stale-tasks.sh` 实际是Node.js脚本（`#!/usr/bin/env node`），但扩展名为 `.sh`。`completion-handler.sh` 中用 `node` 命令调用它，所以功能不受影响，但命名不规范。

**建议**：重命名为 `check-stale-tasks.js`，或至少在文件头注释中说明。

### 6.2 日志路径硬编码 — minor

`BOARD_FILE`、`AGENTS_DIR`、`LOG_FILE` 全部硬编码绝对路径。如果workspace迁移，需要手动修改。

**建议**：使用环境变量或相对于脚本目录的路径。

---

## 汇总

| # | 检查项 | 级别 | 结论 |
|---|---|---|---|
| 1.1 | 默认模式运行 | — | ✅ 通过 |
| 1.2 | --fix --timeout 5 | — | ✅ 通过 |
| 1.3 | 看板running=0 | — | ✅ 通过（running=1为本次核查自身） |
| 2.1 | stopReason判断 | major | ⚠️ BUG-1: aborted/length未识别为已完成 |
| 2.2 | label匹配 | major | ⚠️ BUG-2: sessions.json中大量label为N/A |
| 2.3 | fallback逻辑 | major | ⚠️ BUG-3: 多任务并发时匹配错误session |
| 2.4 | 特殊字符 | — | ✅ 无问题 |
| 3.1 | 并发写入 | blocker | 🔴 BUG-4: 无文件锁，3条写入路径可并发 |
| 4.1 | board不存在 | — | ✅ 通过 |
| 4.2 | board为空/损坏 | major | 🔴 BUG-5: JSON.parse无异常保护 |
| 4.3 | 无匹配session | — | ✅ 通过 |
| 4.4 | --fix写入正确性 | — | ✅ 通过 |
| 5.1 | auto_fixed字段 | — | ✅ 通过 |
| 5.2 | fixed_at格式 | — | ✅ 通过 |
| 5.3 | fixed_reason | — | ✅ 通过 |
| 6.1 | 文件命名 | minor | ⚠️ .sh扩展名但实际是Node.js |
| 6.2 | 路径硬编码 | minor | ⚠️ 建议用环境变量 |

## 结论

**总体评价：基本可用，但有1个blocker和4个major问题需要修复。**

- blocker × 1：并发写入无锁保护（BUG-4）— 在高并发场景下可能导致task-board.json数据丢失
- major × 4：stopReason覆盖不全（BUG-1）、label匹配率低（BUG-2）、fallback误判（BUG-3）、JSON解析无保护（BUG-5）
- minor × 2：文件命名、路径硬编码

**建议**：先修BUG-4（加flock文件锁）和BUG-5（加try-catch），这两个是数据安全问题。BUG-1~3属于检测精度问题，可在下一轮迭代中改进。
