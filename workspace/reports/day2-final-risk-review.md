# Day2 最终风险复核报告

**审计时间**: 2026-03-06 14:55 CST  
**审计员**: 质量仲裁官（独立子Agent）  
**审计范围**: failover / boom主渠道切换 / cron静默规则  
**数据来源**: 直接读取 `/root/.openclaw/openclaw.json`, `cron/jobs.json`, `workspace/scripts/api-probe.js`, `workspace/skills/public/system-monitor/index.js`，实际运行验证

---

## 结论速览

| # | 检查项 | 结论 | 等级 |
|---|--------|------|------|
| 1 | main agent 是否为 boom-main/gpt-5.4 | ✅ 确认 | — |
| 2 | fallback 链是否指向 claude-main/claude-opus-4-6-thinking | ✅ 确认 | — |
| 3 | api-probe.js 方向正确，有无隐藏切换风险 | ⚠️ 方向正确，存在2项P1风险 | P1 |
| 4 | cron announce HEARTBEAT_OK 修复完整性 | ✅ 完整 | — |
| 5 | system-monitor 路径修复完整性 | ✅ 完整 | — |
| 6 | Day2 是否可以封板 | ⚠️ 基本可封，P1残留需挂入Day3 | P1 |

---

## 1. Main Agent 主模型确认

**结论：✅ 确认 `boom-main/gpt-5.4`**

证据路径：`openclaw.json → agents.list[id="main"].model.primary`

```json
{
  "id": "main",
  "model": {
    "primary": "boom-main/gpt-5.4",
    "fallbacks": ["claude-main/claude-opus-4-6-thinking"]
  }
}
```

同时 `agents.defaults.model.primary` 也为 `"boom-main/gpt-5.4"`，全局默认与 main agent 配置一致。

---

## 2. Fallback 链验证

**结论：✅ main agent fallback 正确指向 `claude-main/claude-opus-4-6-thinking`**

```json
"fallbacks": ["claude-main/claude-opus-4-6-thinking"]
```

`claude-main` provider 已在 providers 中正确注册（baseUrl: `https://api.penguinsaichat.dpdns.org/`，api: `anthropic-messages`，含 `reasoning: true`）。

> **附注：其他 agent fallback 非 opus-thinking**  
> coder → `claude-coder/claude-opus-4-6`（无 thinking）  
> reviewer → `claude-reviewer/claude-sonnet-4-6-thinking`（sonnet）  
> writer → `claude-writer/claude-sonnet-4-6`（sonnet 无 thinking）  
> analyst → `claude-analyst/claude-sonnet-4-6-thinking`（sonnet）  
> 这属于各 agent 按职责分级配置，非缺陷，但**如有统一 thinking fallback 需求，需明确规范**。

---

## 3. api-probe.js 审计

**整体方向：✅ 正确**

- 使用真实 LLM 推理端点（`/v1/messages` 和 `/chat/completions`），**不是 `/models` 列表**
- Anthropic + OpenAI 双协议探测 ✅
- 通过 `id="main"` 查找 main agent（非 name），字段兼容正确 ✅
- 使用 `fallbacks[0]` 作为切换目标 ✅
- 当前运行状态良好（mode: primary, successCount: 10, failCount: 0）✅
- 3个 provider 持续 degraded（非 down）—— 经排查为 zhipu-multimodal 等次要 provider，boom-main 保持 healthy ✅

**发现 2 项 P1 风险：**

### P1-A：api-probe.js 对 openclaw.json 写操作无文件锁

```javascript
// api-probe.js L89
function saveConfig(c){ fs.writeFileSync(CONFIG_PATH, JSON.stringify(c,null,2)+'\n'); }
```

probe 运行时：**读整个 openclaw.json → 修改 → 写回**。如果 openclaw 系统（cron state 更新、gateway 配置同步）在同一时刻也写 openclaw.json，会导致两个写操作互相覆盖，造成**配置丢失或回滚**。

系统 crontab 条目也无 `flock` 保护：
```
*/5 * * * * cd /root/.openclaw/workspace && node scripts/api-probe.js >> /tmp/api-probe.log 2>&1
```

**风险场景**：failover 触发时（恰好 cron 状态写入），切换后的 primary 被覆盖回 boom-main，gateway 重启但 config 实际未切换。

**修复建议**：
```bash
# crontab 条目改为：
*/5 * * * * flock -xn /tmp/api-probe.lock -c 'cd /root/.openclaw/workspace && node scripts/api-probe.js >> /tmp/api-probe.log 2>&1'
```

### P1-B：api-probe cron 双实例风险（无 flock）

当某次 probe 因网络慢导致 API 探测接近 15s timeout（`TIMEOUT_MS=15000`），加上逐 provider 串行，总耗时可能接近或超过 5 分钟，导致下一个 cron instance 在前一个未完成时启动，两个实例同时修改 openclaw.json。

此风险与 P1-A 叠加后，**failover 切换可能被覆写或重复执行 gateway restart**。

---

## 4. Cron Announce HEARTBEAT_OK 修复

**结论：✅ 完整**

检查方法：遍历 `cron/jobs.json` 所有 `enabled: true` + `delivery.mode: "announce"` 的任务，验证 `payload.message` 是否包含 HEARTBEAT_OK 指令。

```
已启用的 announce 模式任务（共11个）：
✅ CRAS-A-主动学习引擎
✅ CRAS-E-自主进化
✅ LEP-韧性日报-每日0900
✅ 系统维护-每日清理
✅ CRAS-D-战略调研
✅ 系统监控-综合-每小时
✅ 系统状态与流水线监控-每4小时
✅ 本地任务编排-AEO-智能流水线-每小时
✅ OpenClaw-自动备份-每日两次
✅ 能力同步与PDCA-每4小时
✅ ISC-技能质量管理-每日

HEARTBEAT_OK 覆盖率：11/11（100%）
```

---

## 5. System-Monitor 路径修复

**结论：✅ 完整**

最近 commit `3af2fcd`（14:52, 今日）：`fix(system-monitor): correct cron path and silence HEARTBEAT_OK announce`

验证：
1. 路径 `/root/.openclaw/workspace/skills/public/system-monitor/index.js` 存在 ✅
2. `../../shared/paths` 模块实际解析到 `/root/.openclaw/workspace/skills/shared/paths.js` ✅  
   CRON_DIR → `/root/.openclaw/cron` ✅
3. 实际运行测试：

```
$ node /root/.openclaw/workspace/skills/public/system-monitor/index.js health
[SystemMonitor] 开始健康检查...
  Cron任务检查: 24 个任务
  磁盘使用: 13%
[SystemMonitor] 健康报告:
  状态: healthy
  问题: 0 错误, 0 警告
EXIT: 0
```

---

## 6. Day2 封板判断

**结论：⚠️ 基本可封板，但有 2 项 P1 残留需挂入 Day3**

### 已完成项（基于 day2-qa-report.md，13:10 审计）

- D2-01 ISC运行时Enforcement引擎：105/105 规则有 handler 绑定 ✅
- D2-02 真实数据场景Benchmark：40/40 E2E 通过 ✅
- D2-03 事件驱动自愈PoC：cron-healer.js 已部署 ✅
- D2-04/05/06/07/08：QA 报告覆盖 ✅
- HEARTBEAT_OK 静默：完整 ✅
- system-monitor 路径：修复完整 ✅

### P1 残留项（阻塞 Day3 前须解决）

#### P1-1：api-probe.js 无 flock 保护（见第 3 节 P1-A/P1-B）

**危害**：failover 切换时配置竞争写覆盖，可能导致主渠道切换失效或 gateway 多次重启  
**修复时间**：<30 分钟  
**修复方式**：在 crontab 条目添加 `flock -xn /tmp/api-probe.lock`

#### P1-2：`能力同步与PDCA-每4小时` 连续超时（consecutiveErrors: 2）

```json
"name": "能力同步与PDCA-每4小时",
"enabled": true,
"lastError": "cron: job execution timed out",
"consecutiveErrors": 2,
"timeoutSeconds": 600
```

该任务 enabled=true，每次超时 600s，浪费资源且 consecutiveErrors 还会继续累积。  
当 `consecutiveErrors > 3` 时，system-monitor 会上报 error。  
**风险**：下次触发（nextRunAtMs: 1772784300000 ≈ 约20分钟后）将变为 consecutiveErrors: 3，触发监控告警。  
**修复方式**：临时 disable 或查明 `skills/pdca-engine/index.js` + `isc-capability-anchor-sync/index.js` 超时原因。

### 非阻塞（记录在案）

- `运维辅助-清理与向量化-综合`：consecutiveErrors: 1，超时，delivery: none，非告警触发
- 3 个 provider 持续 degraded（zhipu 次要 provider），不影响主链路
- `handler-executor/circuit-breaker` 无独立单元测试（QA 报告标注为 MISSING，Day3 优化项）

---

## 总结

| 状态 | 项目 |
|------|------|
| ✅ 正常 | main agent 主模型、fallback 链、HEARTBEAT_OK 修复、system-monitor 路径修复 |
| ⚠️ P1 需修复 | api-probe flock 保护缺失（P1-A/B）、PDCA cron 连续超时将触发告警（P1-2） |
| 🔒 封板建议 | Day2 核心功能已交付，P1 残留为运维稳定性风险，非功能性阻塞。**建议封板 + P1 进入 Day3 首批处理**。 |
