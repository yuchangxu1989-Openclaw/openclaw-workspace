# Cron任务审计报告（每小时/高频）

- 审计时间：2026-03-10 08:58 GMT+8
- 审计范围：`/root/.openclaw/workspace`

## 总结

| 任务 | 日志文件 | 判定 | 关键结论 |
|---|---|---|---|
| capability-anchor-sync | `infrastructure/logs/capability-anchor-sync.log` | 正常产出 | 有稳定扫描与文档更新输出（`文档已更新`），仅有Node module type warning |
| cras-intent-insight | `infrastructure/logs/cras-intent-insight.log` | 正常产出 | 按小时运行，持续输出洞察统计（未知意图/纠偏信号/PDCA） |
| day-completion-scanner | `infrastructure/logs/day-scanner.log` | 空转 | 按小时运行，但持续“无新的Day完成事件，跳过” |
| threshold-scanner | `infrastructure/logs/threshold-scanner.log` | 正常产出 | 按10min输出阈值评估结果，含`triggered`状态（非报错） |
| alert-auto-rootcause | `infrastructure/logs/alert-auto-rootcause.log` | 空转 | 按10min运行，但持续“无未响应告警” |
| session-cleanup-governor | `logs/session-cleanup.log` | 报错 | 持续抛`KeyError: 'ARCHIVE_DIR'`，任务逻辑未正常执行 |
| pipeline-auto-recovery | `infrastructure/logs/pipeline-auto-recovery.log` | 报错 | 持续`MODULE_NOT_FOUND`，入口脚本路径缺失 |
| seef-event-bridge | `infrastructure/logs/seef-event-bridge.log` | 正常产出 | 按30min处理事件并给出逐条结果（多为skipped，无匹配子技能） |

---

## 逐项审计

### 1) capability-anchor-sync（每小时）
- 日志：`infrastructure/logs/capability-anchor-sync.log`
- 最后20行观察：
  - 存在有效业务输出：
    - `[CapabilitySync v2] 全量扫描开始...`
    - `智谱路由: 6`
    - `全量技能: 77`
    - `文档已更新: /root/.openclaw/workspace/CAPABILITY-ANCHOR.md`
  - 同时有告警：`[MODULE_TYPELESS_PACKAGE_JSON] Warning`（性能/模块声明告警）
- 最近24h非空产出：有（日志持续更新，mtime `2026-03-10 08:00:01`）
- 报错：未见error/exception级失败
- 判定：**正常产出**

### 2) cras-intent-insight（每小时）
- 日志：`infrastructure/logs/cras-intent-insight.log`
- 最后20行观察：
  - 有完整流程输出：
    - `=== CRAS 意图洞察沉淀 v2.0 ===`
    - `未知意图候选: 0条`
    - `今日纠偏信号: 3条`
    - `新增评测用例: 0条`
    - `PDCA改进建议: 0条`
    - `=== 完成 ===`
- 最近24h非空产出：有（mtime `2026-03-10 08:00:01`）
- 报错：未见报错
- 判定：**正常产出**

### 3) day-completion-scanner（每小时）
- 日志：`infrastructure/logs/day-scanner.log`
- 最后20行观察：
  - 全部为：`自动扫描: 无新的Day完成事件，跳过`
- 最近24h非空产出：有运行痕迹（mtime `2026-03-10 08:00:01`），但无业务增量结果
- 报错：未见报错
- 判定：**空转**

### 4) threshold-scanner（每10min）
- 日志：`infrastructure/logs/threshold-scanner.log`
- 最后20行观察：
  - 持续输出结构化评估结果（JSON片段）
  - 指标含：`status: ok/triggered`，例如`rule-code-pairing-rate`为`triggered`
- 最近24h非空产出：有（mtime `2026-03-10 08:50:01`）
- 报错：未见报错（`triggered`为告警状态非执行失败）
- 判定：**正常产出**

### 5) alert-auto-rootcause（每10min）
- 日志：`infrastructure/logs/alert-auto-rootcause.log`
- 最后20行观察：
  - 周期性输出：`无未响应告警`
- 最近24h非空产出：有运行痕迹（mtime `2026-03-10 08:50:01`），但无根因分析产物
- 报错：未见报错
- 判定：**空转**

### 6) session-cleanup-governor（每10min）
- 日志：`logs/session-cleanup.log`
- 最后20行观察：
  - 每次启动后立即异常：
    - `session governance start`
    - `KeyError: 'ARCHIVE_DIR'`
- 最近24h非空产出：有（mtime `2026-03-10 08:50:01`），但均为错误输出
- 报错：有，持续性报错
- 判定：**报错**

### 7) pipeline-auto-recovery（每30min）
- 日志：`infrastructure/logs/pipeline-auto-recovery.log`
- 最后20行观察：
  - Node启动后报错退出：
    - `Error: Cannot find module '/root/.openclaw/workspace/skills/dto-core/core/pipeline-auto-recovery.js'`
    - `code: 'MODULE_NOT_FOUND'`
- 最近24h非空产出：有（mtime `2026-03-10 08:30:01`），但均为错误日志
- 报错：有，持续性报错
- 判定：**报错**

### 8) seef-event-bridge（每30min）
- 日志：`infrastructure/logs/seef-event-bridge.log`
- 最后20行观察：
  - 有结构化事件处理输出（事件ID/类型/处理状态）
  - 多条`status: skipped, reason: no matching sub-skill`
- 最近24h非空产出：有（mtime `2026-03-10 08:30:40`）
- 报错：未见报错
- 判定：**正常产出**

---

## 备注
- 部分日志存在“重复行”现象（同一时间戳成对出现），疑似stdout/stderr双写或重复重定向；不影响本次判定。
- 本次“最近24h”依据日志内容与文件mtime综合判断；日志时间格式混用（ISO与本地格式）导致简单字符串筛选不可靠，已以人工审阅为准。
