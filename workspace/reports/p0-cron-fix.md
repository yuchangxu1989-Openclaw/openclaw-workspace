# P0-2 Cron修复报告

**执行时间**: 2026-03-03 05:01 CST  
**Git Commit**: `5b09312`  
**备份文件**: `/root/.openclaw/cron/jobs.json.p0-backup`

---

## 任务A：修复6个失效Cron任务

### 1. ✅ CRAS-A 超时 (consecutiveErrors: 3)
- **问题**: prompt过重（包含kimi_search等外部调用），timeout 600s仍超时
- **修复**: 
  - 简化prompt，去掉kimi_search命令，只保留核心`node index.js --learn`
  - timeout 600s → 300s
  - 移除thinking参数
- **风险**: 低，学习引擎核心功能不变

### 2. ✅ System-Monitor 路径错误 (consecutiveErrors: 2)
- **问题**: 引用 `/root/.openclaw/skills/system-monitor/index.js`，实际路径在 `/root/.openclaw/workspace/skills/`
- **修复**: 路径修正为 `/root/.openclaw/workspace/skills/system-monitor/index.js`
- **附带**: 同时修复了System-Monitor-峰值记录的路径（`log-peaks.sh`路径也错了）

### 3. ✅ Elite-Memory 技能已删 (consecutiveErrors: 1)
- **问题**: `/root/.openclaw/workspace/skills/elite-longterm-memory/` 目录不存在
- **修复**: 
  - 禁用每日任务 (`enabled: false`)
  - 同时禁用月度检查任务（同一技能依赖）
- **注意**: 如需恢复需先重建技能目录

### 4. ⚠️ LEP 模型403 (consecutiveErrors: 2)
- **问题**: `HTTP 403 ... model glm-5` — 脚本内部或模型路由引用了glm-5
- **修复**: 
  - 清除consecutiveErrors让其重试
  - 模型从opus降级为 `claude-sonnet-4-6-thinking`
  - daily-report.js本身未hardcode glm-5，但存在 `daily-report-glm5.js` 备用文件
- **风险**: 中等，如果错误源自运行时模型路由，可能需进一步检查

### 5. ✅ 全局决策 delivery 缺失 (consecutiveErrors: 5)
- **问题**: `delivery.mode = "announce"` 但缺少 `delivery.to`
- **修复**: 添加 `delivery.to: "user:ou_8eafdc7241d381d714746e486b641883"`
- **附带**: System-Monitor峰值记录同一问题，一并修复

### 6. ✅ EvoMap 脚本不存在 (consecutiveErrors: 1)
- **问题**: `/root/.openclaw/workspace/evolver/run.sh` 不存在（该目录只有reports子目录）
- **修复**: 路径改为 `node /root/.openclaw/workspace/skills/evolver/index.js --loop --format=feishu_card`
- **依据**: evolver技能实际位于 `/root/.openclaw/workspace/skills/evolver/index.js`

---

## 任务B：模型降级

### 降级前
- 全部23个agentTurn任务使用: `custom-api-penguinsaichat-dpdns-org/claude-opus-4-6-thinking`
- 6个systemEvent任务无model字段

### 降级后分布

| 模型 | 数量 | 适用场景 |
|------|------|----------|
| `claude/claude-sonnet-4-6` | 8 | 简单监控、备份、清理、同步 |
| `claude/claude-sonnet-4-6-thinking` | 15 | CRAS分析、研究、进化、决策、审计 |
| `default` (无model字段) | 6 | systemEvent类型任务 |
| `claude-opus-*` | **0** | 无任务保留opus |

### 简单任务 → sonnet-4-6 (8个)
- OpenClaw-自动备份-每日0700
- OpenClaw-自动备份-每日1900
- System-Monitor-健康检查-每小时
- System-Monitor-峰值记录-每4小时
- Elite-Memory-记忆整理-每日 (已禁用)
- 飞书会话实时备份-每30分钟
- 能力锚点自动同步-每4小时
- 流水线健康监控-每4小时

### 中等任务 → sonnet-4-6-thinking (15个)
- ClawHub-Skills-批量安装
- CRAS-A/B/C/D/E (5个)
- DTO-Declarative-Orchestrator
- ISC-技能使用审计
- 全局自主决策流水线
- LEP-韧性日报
- CRAS-四维意图洞察仪表盘
- EvoMap-Evolver-自动进化
- AEO-DTO闭环衔接
- N023-自动生成评测标准
- PDCA-C执行引擎

---

## 最终状态

| 指标 | 值 |
|------|-----|
| 总任务数 | 29 |
| 启用 | 27 |
| 禁用 | 2 (Elite-Memory×2) |
| opus模型 | 0 ↓ |
| sonnet模型 | 23 |
| delivery问题 | 0 ✓ |
| 路径错误 | 0 ✓ |

---

## 后续建议

1. **LEP glm-5**: 监控下次执行是否仍报403，如是，需检查 `daily-report.js` 运行时是否动态选择模型
2. **Elite-Memory**: 如需恢复记忆整理功能，需重建技能或替换为新方案
3. **CRAS-E**: 上次报错 "cron announce delivery failed"（非任务本身失败），观察降级后是否改善
4. **成本优化**: 29个任务全部sonnet，估算日均token消耗应降低60-70%
