# 审计报告：僵尸任务永久根治方案

- 日期：2026-03-11
- 审计对象：commits 6cc5375, d29f463, e2b74dd + cron配置
- 执行者：researcher
- 审计者：reviewer

---

## 1. BUG-1修复（commit 6cc5375）：stopReason终止判定

### 改动内容
将 `terminalReasons` 从 `['stop', 'end_turn']` 扩展为 `['stop', 'end_turn', 'aborted', 'length']`。

### 审计结果：❌ 有遗漏（major）

**问题：缺少 `error` 状态。**

实际session数据中的stopReason分布（从 `/root/.openclaw/agents/` 下所有 `.jsonl` 统计）：

| stopReason | 出现次数 |
|------------|---------|
| toolUse    | 3980    |
| stop       | 3220    |
| **error**  | **32**  |
| aborted    | 13      |
| length     | 3       |

`stopReason: "error"` 出现了32次，这是session因错误终止的状态。当前 `terminalReasons` 未包含 `error`，意味着：
- 因错误终止的session不会被识别为zombie
- 这些任务会在看板上永远保持 `running` 状态，直到超时阈值（10分钟）后才被标记为 `stale`→`timeout`

**根因**：修复时只考虑了API文档中的常见终止状态，未从实际数据中统计所有可能的stopReason值。

**修复建议**：
```javascript
const terminalReasons = ['stop', 'end_turn', 'aborted', 'length', 'error'];
```

**防止再犯**：修改终止状态列表前，应先统计实际session数据中所有出现过的stopReason值。

---

## 2. BUG-3修复（commit d29f463）：fallback的mtime>spawnTime校验

### 改动内容
兜底查找agent最新session文件时，增加 `candidateMtime > spawnMs` 校验，避免匹配到上一个任务的session。

### 审计结果：✅ 通过

**逻辑正确性**：
- `candidateMtime` 来自 `fs.statSync(candidate).mtimeMs`，返回UTC毫秒时间戳
- `spawnMs` 来自 `new Date(spawnTime).getTime()`，同样返回UTC毫秒时间戳
- 两者都是UTC基准，不存在时区问题

**边界处理**：
- `spawnTime` 为空/undefined时：`new Date(undefined).getTime()` 返回 `NaN`，`NaN > 0` 为 `false`，但代码用了 `spawnTime ? ... : 0`，所以 spawnTime 为空时 spawnMs=0，任何文件都能匹配 → 降级为旧行为，合理
- session文件不存在时：`findLatestSession` 返回 `null`，`if (candidate)` 为 false，跳过整个兜底逻辑 → 进入"找不到session文件"分支，按 spawnAge 判定 → 正确处理

**一个小瑕疵（suggestion）**：如果 `findLatestSession` 返回的文件在 `statSync` 之前被删除，会抛异常。概率极低，且外层有 try-catch 兜底，不影响功能。

---

## 3. Cron配置

### 当前配置
```cron
*/3 * * * * flock -xn /tmp/check-stale-tasks.lock bash -c "node /root/.openclaw/workspace/scripts/check-stale-tasks.sh --fix --quiet >> /root/.openclaw/workspace/logs/stale-task-check.log 2>&1"
```

### 审计结果：✅ 通过（附2个minor）

**flock防并发**：正确。
- `-x` 排他锁，`-n` 非阻塞（已有实例运行时直接跳过）
- 锁文件 `/tmp/check-stale-tasks.lock` 用于防止cron并发
- 脚本内部写看板时用 `/tmp/task-board.lock`，两把锁职责分离，正确

**日志增长**：不会无限增长。
- stdout重定向到 `stale-task-check.log`，但 `--quiet` 模式下几乎无stdout输出（当前文件0字节）
- 脚本内部 `appendLog` 写入 `check-stale-tasks.log`（当前1.2KB），仅在发现异常或修正时写入
- 已有 `log-archive-rotator.sh`（每天03:10运行），会归档>7天的 `.log` 文件并压缩，30天后删除归档
- 不需要额外logrotate

**minor-1：文件扩展名误导**
脚本实际是Node.js代码（shebang `#!/usr/bin/env node`），但文件名为 `.sh`。cron中显式用 `node` 调用所以不影响功能，但对维护者有误导性。建议重命名为 `.js`。

**minor-2：两个日志文件**
cron的stdout重定向写 `stale-task-check.log`，脚本内部appendLog写 `check-stale-tasks.log`。名字相似但不同，容易混淆。由于 `--quiet` 模式下stdout几乎为空，`stale-task-check.log` 实际无用。建议统一。

---

## 4. HEARTBEAT.md新增第5项检查（commit e2b74dd）

### 改动内容
新增 `### 5. 僵尸任务扫描` 检查项，包含命令、说明和处理规则。

### 审计结果：✅ 通过（附1个minor）

**内容完整性**：
- 命令正确：`node /root/.openclaw/workspace/scripts/check-stale-tasks.sh --fix`
- 说明了cron自动扫描与heartbeat手动扫描的关系
- 处理规则清晰（僵尸→修正，超时→标记）

**minor：编号顺序**
第5项插在第4项（Git Push健康检查）之前，阅读顺序为 -1, 0, 1, 2, 3, **5, 4**。应调整顺序或重新编号。

---

## 总结

| 检查项 | 结论 | 级别 |
|--------|------|------|
| BUG-1 stopReason判定 | ❌ 缺少 `error` 状态 | **major** |
| BUG-3 fallback校验 | ✅ 通过 | — |
| Cron flock防并发 | ✅ 通过 | — |
| Cron日志增长 | ✅ 有归档机制 | — |
| 文件扩展名 .sh→.js | ⚠️ 误导性 | minor |
| 两个日志文件命名 | ⚠️ 易混淆 | minor |
| HEARTBEAT.md内容 | ✅ 通过 | — |
| HEARTBEAT.md编号顺序 | ⚠️ 5在4前面 | minor |

### 结论：❌ 打回

**必须修复**：`terminalReasons` 数组补充 `'error'`，否则因错误终止的session（实际数据中有32例）仍会成为僵尸任务。

修复后可重新提交审计。
