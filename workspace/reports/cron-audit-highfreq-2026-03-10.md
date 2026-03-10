# 高频 Cron 任务审计报告（2026-03-10）

- 审计时间：2026-03-10 08:59 CST（GMT+8）
- 工作目录：`/root/.openclaw/workspace`
- 审计范围：1~5 分钟级高频任务（共 8 个）

## 总览

| 任务 | 周期 | 日志路径 | 最后20行观察 | 近24h非空产出 | 报错 | 判定 |
|---|---:|---|---|---|---|---|
| git-sensor | 1min | `/tmp/git-sensor.log` | 持续 `{"processed":0,"events":[]}` | 未见有效业务产出 | 未见报错 | **空转（跑了但没产出）** |
| intent-extractor | 5min | `infrastructure/logs/intent-extractor.log` | 持续“开始增量扫描 / 无新增内容，跳过” | 未见新增提取结果 | 未见报错 | **空转（跑了但没产出）** |
| correction-harvester | 5min | `infrastructure/logs/correction-harvester.log` | 持续“总计: 0 个纠偏信号 / 无新纠偏信号” | 有运行日志，但无业务结果 | 未见报错 | **空转（跑了但没产出）** |
| rework-analyzer | 5min | `infrastructure/logs/rework-analyzer.log` | 交替出现“0 个返工信号”与“211 个返工信号，生成报告” | 有（多次生成 `reports/rework-analysis-2026-03-10.md`） | 未见报错 | **正常产出** |
| api-probe | 5min | `/tmp/api-probe.log` | 反复 `SyntaxError: Invalid or unexpected token`（`scripts/api-probe.js:2`） | 无 | **有（持续语法错误）** | **报错** |
| gateway-memory-governor | 5min | `logs/gateway-memory-governor.log` | 持续记录网关 PID 与内存值，均“内存正常” | 有（稳定监控记录） | 未见报错 | **正常产出** |
| cron-dispatch-runner | 5min | `infrastructure/logs/cron-dispatch.log` | 大量 handler 执行记录；汇总 `656/656`，`failed:1` | 有（持续调度与执行） | 有失败计数（1） | **正常产出（存在少量失败）** |
| dispatch-cron-runner | 5min | `infrastructure/logs/dispatch-cron-runner.log` | 持续 `ok=true ... spawned=0`，并提示 `sessions_spawn not available in cron env` | 未见实际spawn/跟进产出 | 未见显式 error | **空转（受环境能力限制）** |

---

## 分任务详情

### 1) git-sensor（每1min）
- 日志：`/tmp/git-sensor.log`
- 最后20行：全部为 `{"processed":0,"events":[]}`
- 结论：任务在运行，但持续无事件输入，无有效产出。
- 判定：**空转（跑了但没产出）**

### 2) intent-extractor（每5min）
- 日志：`infrastructure/logs/intent-extractor.log`
- 最后20行：反复“无新增内容，跳过”。
- 结论：任务运行正常，但当前窗口内没有新增可提取数据。
- 判定：**空转（跑了但没产出）**

### 3) correction-harvester（每5min）
- 日志：`infrastructure/logs/correction-harvester.log`
- 最后20行：反复“0 个纠偏信号 / 无新纠偏信号，退出”。
- 结论：任务运行正常，但没有检测到新纠偏信号。
- 判定：**空转（跑了但没产出）**

### 4) rework-analyzer（每5min）
- 日志：`infrastructure/logs/rework-analyzer.log`
- 最后20行：可见多次“检测到 211 个返工信号”并输出报告路径；也有部分轮次为0。
- 结论：存在真实分析产出，任务有效。
- 判定：**正常产出**

### 5) api-probe（每5min）
- 日志：`/tmp/api-probe.log`
- 最后20行：重复 Node.js 语法错误，定位 `scripts/api-probe.js:2`，提示 `SyntaxError: Invalid or unexpected token`。
- 结论：任务持续失败，未形成有效产出。
- 判定：**报错**

### 6) gateway-memory-governor（每5min）
- 日志：`logs/gateway-memory-governor.log`
- 最后20行：持续记录内存（约 639MB~675MB），状态为“内存正常”。
- 结论：任务稳定运行并产生监控数据。
- 判定：**正常产出**

### 7) cron-dispatch-runner（每5min）
- 日志：`infrastructure/logs/cron-dispatch.log`
- 最后20行：多条 handler 执行成功；末尾汇总 `Done: 656/656`，`failed:1`。
- 结论：总体调度成功且有大量实际执行，存在少量失败需跟踪。
- 判定：**正常产出（存在少量失败）**

### 8) dispatch-cron-runner（每5min）
- 日志：`infrastructure/logs/dispatch-cron-runner.log`
- 最后20行：重复 `spawned=0`，并提示 `sessions_spawn not available in cron env, spawn deferred to runtime`。
- 结论：任务在跑，但核心动作被环境能力限制，实际业务推进有限。
- 判定：**空转（跑了但没产出）**

---

## 风险与建议（简要）

1. **api-probe 故障优先修复**
   - 现状：持续语法错误，等于完全不可用。
   - 建议：检查 `scripts/api-probe.js` 第2行是否含非JS注释/非法字符（如 `#`）并改为合法 JS 注释或移除。

2. **dispatch-cron-runner 环境能力不匹配**
   - 现状：cron 环境不可用 `sessions_spawn`，导致长期 `spawned=0`。
   - 建议：将 spawn 步骤迁移到支持该能力的 runtime，或为 cron 注入替代执行器能力。

3. **空转任务需增加“输入缺失告警阈值”**
   - git-sensor / intent-extractor / correction-harvester 连续空转时，建议按阈值告警，避免“看似健康、实则无数据流入”。
