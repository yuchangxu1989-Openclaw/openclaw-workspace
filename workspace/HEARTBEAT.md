# HEARTBEAT.md - 定期检查清单

## 每次Heartbeat检查项

### -1. 系统告警主动扫描（最高优先级，必须第一个执行）

**不等 runtime 推送，主动扫描所有告警信号源：**

```bash
# 1. 扫描cron日志中的异常/告警
grep -i 'error\|fail\|alert\|异常\|静默\|blocked' /root/.openclaw/workspace/infrastructure/logs/*.log 2>/dev/null | tail -20

# 2. 扫描事件总线中未处理的告警事件
tail -50 /root/.openclaw/workspace/infrastructure/event-bus/events.jsonl 2>/dev/null | grep -i 'alert\|error\|fail'

# 3. 扫描流水线健康状态
node /root/.openclaw/workspace/skills/lto-core/core/pipeline-auto-recovery.js 2>&1 | grep -v '✅'
```

**处理规则**：
- 发现告警 → 立即根因分析 → 修复 → 不是"已收到"
- 告警 ≠ 通知。告警 = 必须行动的事件
- 不需要用户提醒，自己发现自己解决
- 解决不了的 → 升级到用户，带根因分析和方案

### 0. API Key余额探针（必须第二个执行）
```bash
bash /root/.openclaw/workspace/scripts/api-key-probe.sh
```
- 结果为 `OK` → 继续
- 结果为 `ALERT` → 已自动推飞书通知用户，记录到memory
- 结果为 `ERROR` → 记录异常，继续其他检查

### 1. EvoMap同步清单状态检查
- [ ] 检查清单文件是否存在: `/root/.openclaw/workspace/skills/isc-core/config/evomap-upload-manifest.json`
- [ ] 确认 allowed_skills 列表是否需要更新
- [ ] 检查是否有新技能需要添加到清单

### 2. 系统健康检查
- [ ] Gateway内存状态
- [ ] 会话文件数量
- [ ] Cron任务运行状态

### 3. 记忆维护
- [ ] 检查是否需要更新MEMORY.md
- [ ] 归档旧日志

---

## EvoMap清单提醒

**重要**: EvoMap同步清单路径
`/root/.openclaw/workspace/skills/isc-core/config/evomap-upload-manifest.json`

**当前允许同步的技能 (9个)**:
lto-core, isc-core, evomap-a2a, evomap-publisher, cras, parallel-subagent, seef, aeo, isc-document-quality

**说明**:
- 已从 manifest 中移除 lep-executor 和 lep-subagent（LEP已删除）
- 若后续新增技能，需同步更新 manifest 与本文件中的数量和列表

**配置**:
- auto_discover: true
- update_policy: auto_sync
- managed_by: isc-dto

**如果遗忘此清单，询问用户是否需要查看或更新。**
