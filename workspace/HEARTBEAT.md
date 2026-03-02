# HEARTBEAT.md - 定期检查清单

## 每次Heartbeat检查项

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

**当前允许同步的技能 (10个)**:
dto-core, isc-core, evomap-a2a, lep-executor, lep-subagent, cras, parallel-subagent, seef, aeo, isc-document-quality

**配置**:
- auto_discover: true
- update_policy: auto_sync
- managed_by: isc-dto

**如果遗忘此清单，询问用户是否需要查看或更新。**
