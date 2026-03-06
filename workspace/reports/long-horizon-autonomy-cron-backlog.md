# 长周期自治进化定时任务 Backlog

> **生成时间：** 2026-03-07  
> **目标：** 无需用户输入，系统可持续自主扩列、演进、维护  
> **原则：** 反熵增 · 可观测 · 可生长 · 可验证

---

## 状态总览

| ID | 任务名 | 周期 | 类别 | 状态 | 脚本 |
|----|--------|------|------|------|------|
| LH-01 | 孤儿任务扫描 | 每天 06:00 | 自治断点扫描 | ✅ 已上线 | `orphaned-task-scanner.sh` |
| LH-02 | 研究信号采集 | 每天 07:00 | 理论研究输入 | ✅ 已上线 | `research-signal-harvester.js` |
| LH-03 | 熵值指数计算 | 每天 00:05 | 长期趋势评估 | ✅ 已上线 | `entropy-index-calculator.sh` |
| LH-04 | 日志归档轮转 | 每天 03:10 | 清理维护 | ✅ 已上线 | `log-archive-rotator.sh` |
| LH-05 | 进化周报 | 每周一 09:00 | 周报 | ✅ 已上线 | `weekly-evolution-report.sh` |
| LH-06 | 理论→规则流水线 | 每周二 10:00 | 理论研究输入 | ✅ 已上线 | `theory-to-rule-pipeline.js` |
| LH-07 | 陈旧Backlog扫描 | 每周三 10:00 | 自治断点扫描 | ✅ 已上线 | `stale-backlog-pruner.sh` |
| LH-08 | 进化检查点审计 | 每周五 17:00 | 自治断点扫描 | ✅ 已上线 | `evolution-checkpoint-audit.js` |
| LH-09 | 死亡技能检测 | 每周六 10:00 | 清理维护 | ✅ 已上线 | `dead-skill-detector.sh` |
| LH-10 | 能力增长追踪 | 每月1号 09:00 | 长期趋势评估 | ✅ 已上线 | `capability-growth-tracker.js` |
| LH-11 | AI竞品格局扫描 | 每周四 09:00 | 长期趋势评估 | 📋 Backlog | — |
| LH-12 | 周趋势摘要 | 每周日 22:00 | 周报 | 📋 Backlog | — |
| LH-13 | 记忆去重整合 | 每周日 10:00 | 清理维护 | 📋 Backlog | — |
| LH-14 | 月度战略反思报告 | 每月最后天 20:00 | 长期趋势评估 | 📋 Backlog | — |
| LH-15 | 自动git提交+归档 | 每天 23:55 | 清理维护 | 📋 Backlog | — |

---

## 已上线任务详情

### LH-01 · 孤儿任务扫描

**目标：** 自动发现超过48h未推进的任务/设计文档，防止工作断点堆积  
**周期：** 每天 06:00  
**输出：** `reports/daily/orphaned-tasks-YYYY-MM-DD.md`  
**脚本：** `scripts/long-horizon/orphaned-task-scanner.sh`  
**Cron：**
```cron
0 6 * * * flock -xn /tmp/lh-orphan.lock /bin/bash /root/.openclaw/workspace/scripts/long-horizon/orphaned-task-scanner.sh >> /root/.openclaw/workspace/infrastructure/logs/orphaned-task-scanner.log 2>&1
```
**扫描范围：** `designs/` · `reports/` · `lep-subagent/` · `council-inputs/` · `evolver/`

---

### LH-02 · 研究信号采集

**目标：** 每日抓取AI/系统/产品领域最新研究信号，为理论→规则流水线提供原料  
**周期：** 每天 07:00  
**输出：** `reports/research-signals/signals-YYYY-MM-DD.md`  
**脚本：** `scripts/long-horizon/research-signal-harvester.js`  
**Cron：**
```cron
0 7 * * * flock -xn /tmp/lh-research.lock /usr/bin/node /root/.openclaw/workspace/scripts/long-horizon/research-signal-harvester.js >> /root/.openclaw/workspace/infrastructure/logs/research-signal-harvester.log 2>&1
```
**信号源：**
- HuggingFace Daily Papers API (`huggingface.co/api/daily_papers`)
- GitHub Trending AI Repos (Search API)

---

### LH-03 · 熵值指数计算

**目标：** 每日计算系统有序度代理指标，追踪反熵增进展  
**周期：** 每天 00:05  
**输出：** `reports/trends/entropy-index.jsonl`（追加写入，保持历史序列）  
**脚本：** `scripts/long-horizon/entropy-index-calculator.sh`  
**Cron：**
```cron
5 0 * * * flock -xn /tmp/lh-entropy.lock /bin/bash /root/.openclaw/workspace/scripts/long-horizon/entropy-index-calculator.sh >> /root/.openclaw/workspace/infrastructure/logs/entropy-index.log 2>&1
```
**度量维度：**
- `rule_count` 规则文件密度
- `script_count` 自动化脚本数
- `git_commits_24h` 近24h提交活跃度
- `order_score` 综合有序度分（加权公式）

---

### LH-04 · 日志归档轮转

**目标：** 压缩归档7天以上的日志，删除30天以上的归档，防止磁盘膨胀  
**周期：** 每天 03:10  
**输出：** `logs/archive/*.gz`  
**脚本：** `scripts/long-horizon/log-archive-rotator.sh`  
**Cron：**
```cron
10 3 * * * flock -xn /tmp/lh-logrota.lock /bin/bash /root/.openclaw/workspace/scripts/long-horizon/log-archive-rotator.sh >> /root/.openclaw/workspace/infrastructure/logs/log-archive-rotator.log 2>&1
```
**与现有任务关系：** 补充 `backup-rotate.sh`，专门处理 `logs/` 目录（原脚本聚焦数据备份）

---

### LH-05 · 进化周报

**目标：** 每周一自动汇总上周系统演化状态，为周策略决策提供数据支撑  
**周期：** 每周一 09:00  
**输出：** `reports/weekly/evolution-weekly-YYYY-MM-DD.md`  
**脚本：** `scripts/long-horizon/weekly-evolution-report.sh`  
**Cron：**
```cron
0 9 * * 1 flock -xn /tmp/lh-weekly-evo.lock /bin/bash /root/.openclaw/workspace/scripts/long-horizon/weekly-evolution-report.sh >> /root/.openclaw/workspace/infrastructure/logs/weekly-evolution-report.log 2>&1
```
**内容：** Git提交量 · 新增技能/脚本 · 新增报告 · 系统状态快照 · 下周优先事项清单

---

### LH-06 · 理论→规则流水线

**目标：** 将近7天研究信号转化为ISC规则草稿，驱动知识→执行规则的闭环  
**周期：** 每周二 10:00  
**输出：** `reports/weekly/theory-to-rule-YYYY-MM-DD.md`  
**脚本：** `scripts/long-horizon/theory-to-rule-pipeline.js`  
**Cron：**
```cron
0 10 * * 2 flock -xn /tmp/lh-theory-rule.lock /usr/bin/node /root/.openclaw/workspace/scripts/long-horizon/theory-to-rule-pipeline.js >> /root/.openclaw/workspace/infrastructure/logs/theory-to-rule.log 2>&1
```
**分类关键词映射：** Agent自治 · 知识检索 · 推理增强 · 评估体系 · 对齐微调 · 效率优化 · 安全防护 · 记忆/上下文

---

### LH-07 · 陈旧Backlog扫描

**目标：** 识别30天以上未触碰的backlog条目，标记归档候选，防止任务淤积  
**周期：** 每周三 10:00  
**输出：** `reports/weekly/stale-backlog-YYYY-MM-DD.md`  
**脚本：** `scripts/long-horizon/stale-backlog-pruner.sh`  
**Cron：**
```cron
0 10 * * 3 flock -xn /tmp/lh-stale-bl.lock /bin/bash /root/.openclaw/workspace/scripts/long-horizon/stale-backlog-pruner.sh >> /root/.openclaw/workspace/infrastructure/logs/stale-backlog.log 2>&1
```

---

### LH-08 · 进化检查点审计

**目标：** 每周五自动验证核心系统（SOUL/MEMORY/CRAS/ISC/Cron健康度/研究信号/熵值趋势）是否在轨  
**周期：** 每周五 17:00  
**输出：** `reports/weekly/evolution-checkpoint-YYYY-MM-DD.md`  
**脚本：** `scripts/long-horizon/evolution-checkpoint-audit.js`  
**Cron：**
```cron
0 17 * * 5 flock -xn /tmp/lh-evo-audit.lock /usr/bin/node /root/.openclaw/workspace/scripts/long-horizon/evolution-checkpoint-audit.js >> /root/.openclaw/workspace/infrastructure/logs/evolution-checkpoint.log 2>&1
```
**检查项：** SOUL.md · MEMORY.md · CRITICAL-MEMORY.md · HEARTBEAT.md · CRAS Skill · ISC规则密度 · Cron日志活跃度 · 本周Git提交 · 研究信号采集率 · 有序度指数趋势

---

### LH-09 · 死亡技能检测

**目标：** 检测30天未修改且引用次数<2的技能文件，输出待归档候选表  
**周期：** 每周六 10:00  
**输出：** `reports/weekly/dead-skill-report-YYYY-MM-DD.md`  
**脚本：** `scripts/long-horizon/dead-skill-detector.sh`  
**Cron：**
```cron
0 10 * * 6 flock -xn /tmp/lh-dead-skill.lock /bin/bash /root/.openclaw/workspace/scripts/long-horizon/dead-skill-detector.sh >> /root/.openclaw/workspace/infrastructure/logs/dead-skill-detector.log 2>&1
```

---

### LH-10 · 能力增长追踪

**目标：** 每月1号生成四维能力指数报告，追踪系统长期增长曲线  
**周期：** 每月1号 09:00  
**输出：**
- `reports/trends/capability-growth-YYYY-MM-DD.md`（月度报告）
- `reports/trends/capability-growth.jsonl`（历史序列，追加写入）

**脚本：** `scripts/long-horizon/capability-growth-tracker.js`  
**Cron：**
```cron
0 9 1 * * flock -xn /tmp/lh-cap-growth.lock /usr/bin/node /root/.openclaw/workspace/scripts/long-horizon/capability-growth-tracker.js >> /root/.openclaw/workspace/infrastructure/logs/capability-growth.log 2>&1
```
**四维指标：**
- **知识沉淀维度**：规则文件数 · MEMORY.md行数 · 设计文档数
- **自动化维度**：Cron任务数 · 脚本数量 · 基础设施文件数
- **输出维度**：报告总数 · 飞书卡片数 · 飞书报告数
- **演化速度维度**：Git总提交 · 近30天提交数
- **综合能力指数**：加权计算，0-100分

---

## Backlog（待开发）

### LH-11 · AI竞品格局扫描 📋

**目标：** 每周四追踪主要AI竞品/框架动态，为竞争战略提供数据  
**周期：** 每周四 09:00  
**输出：** `reports/weekly/competitive-scan-YYYY-MM-DD.md`  
**设计要点：**
- 监控对象：OpenAI/Anthropic/Google/Meta/Mistral 博客RSS
- 监控维度：新模型发布 · 定价变化 · API能力更新 · 生态扩展
- 输出格式：结构化竞品动态表 + 影响评估
- 实现方案：解析公开RSS/博客JSON，结合关键词过滤
- **依赖：** LH-02研究信号采集（可复用部分采集逻辑）

---

### LH-12 · 周趋势摘要 📋

**目标：** 每周日22:00汇总当周所有LH任务输出，生成高密度趋势摘要  
**周期：** 每周日 22:00  
**输出：** `reports/weekly/weekly-trend-digest-YYYY-MM-DD.md`  
**设计要点：**
- 聚合来源：LH-01孤儿任务 + LH-06规则草稿 + LH-07陈旧backlog + LH-08检查点
- 生成"本周变化最大的3个维度"快照
- 输出一份可以直接飞书推送的摘要卡片（Markdown格式）
- **前置：** LH-05/06/07/08 本周必须至少3个完成

---

### LH-13 · 记忆去重整合 📋

**目标：** 每周日对MEMORY.md做去重和压缩，防止记忆文件膨胀失真  
**周期：** 每周日 10:00  
**输出：** `memory/memory-dedup-log-YYYY-MM-DD.md`（操作日志）  
**设计要点：**
- 检测重复/相似段落（基于行级哈希）
- 统计压缩前后行数变化
- **安全约束：** 操作前备份 `MEMORY.md` 到 `memory/backups/`
- **实现挑战：** 需要语义相似性判断（不能纯字符串匹配），考虑用 Node.js + 简单TF-IDF
- **优先级：** Medium（MEMORY.md未超过500行前可推迟）

---

### LH-14 · 月度战略反思报告 📋

**目标：** 每月最后一天20:00，自动汇总本月所有进化数据，生成月度战略反思  
**周期：** 每月最后天 20:00（`0 20 28-31 * * [ "$(date +%d)" = "$(cal | awk '/[0-9]/{last=$NF} END{print last}')" ]`）  
**输出：** `reports/monthly/strategy-reflection-YYYY-MM.md`  
**内容框架：**
- 月度能力指数变化（对比上月LH-10数据）
- 最重要的3个进化事件（来自git log + 检查点报告）
- 当月研究信号Top趋势（来自LH-02 JSONL聚合）
- 下月战略聚焦点（模板化）
- **实现挑战：** 需要聚合多个JSONL数据源，需要简单数据分析逻辑

---

### LH-15 · 自动git提交+归档 📋

**目标：** 每天23:55将当天变更（reports/memory/skills/scripts）自动提交git  
**周期：** 每天 23:55  
**设计要点：**
- `git add reports/ memory/ skills/`（不包含 `tmp-*` 和日志）
- 提交信息模板：`chore(auto): daily snapshot YYYY-MM-DD [LH-15]`
- 如果无变更则跳过
- **安全约束：** 只提交，不push（避免覆盖远程）
- **实现：** 5行bash，复杂度极低，优先级高
- **现状：** 检查现有git cron是否已覆盖

---

## 任务节奏全览

```
周一  09:00  LH-05 进化周报
周二  10:00  LH-06 理论→规则流水线
周三  10:00  LH-07 陈旧Backlog扫描
周四  09:00  LH-11 竞品格局扫描 [BACKLOG]
周五  17:00  LH-08 进化检查点审计
周六  10:00  LH-09 死亡技能检测
周日  10:00  LH-13 记忆去重 [BACKLOG]
周日  22:00  LH-12 周趋势摘要 [BACKLOG]

每天  00:05  LH-03 熵值指数计算
每天  03:10  LH-04 日志归档轮转
每天  06:00  LH-01 孤儿任务扫描
每天  07:00  LH-02 研究信号采集

每月  01日 09:00  LH-10 能力增长追踪
每月  最后天 20:00  LH-14 月度战略反思 [BACKLOG]
```

---

## 数据流向图

```
外部研究信号
    ↓
[LH-02 研究信号采集]
    ↓
reports/research-signals/*.md
    ↓
[LH-06 理论→规则流水线]
    ↓
reports/weekly/theory-to-rule-*.md  ←→  skills/ ISC规则合并
    
Git Activity + 文件系统变化
    ↓
[LH-03 熵值指数] → trends/entropy-index.jsonl
[LH-10 能力增长] → trends/capability-growth.jsonl
    ↓
[LH-08 进化检查点审计] (聚合多维度健康状态)
    ↓
[LH-12 周趋势摘要 BACKLOG]
    ↓
飞书推送 (人工确认后触发)

Workspace文件
    ↓
[LH-01 孤儿任务扫描] → 断点清单
[LH-07 陈旧Backlog] → 归档候选
[LH-09 死亡技能] → 清理候选
```

---

## 输出目录结构

```
workspace/
├── reports/
│   ├── daily/
│   │   └── orphaned-tasks-YYYY-MM-DD.md        [LH-01]
│   ├── weekly/
│   │   ├── evolution-weekly-YYYY-MM-DD.md       [LH-05]
│   │   ├── theory-to-rule-YYYY-MM-DD.md         [LH-06]
│   │   ├── stale-backlog-YYYY-MM-DD.md          [LH-07]
│   │   ├── evolution-checkpoint-YYYY-MM-DD.md   [LH-08]
│   │   └── dead-skill-report-YYYY-MM-DD.md      [LH-09]
│   ├── research-signals/
│   │   └── signals-YYYY-MM-DD.md               [LH-02]
│   └── trends/
│       ├── entropy-index.jsonl                  [LH-03] 追加
│       ├── capability-growth.jsonl              [LH-10] 追加
│       └── capability-growth-YYYY-MM-DD.md      [LH-10]
├── logs/
│   ├── archive/
│   │   └── *.gz                                [LH-04] 归档
└── scripts/long-horizon/
    ├── orphaned-task-scanner.sh                 [LH-01]
    ├── research-signal-harvester.js             [LH-02]
    ├── entropy-index-calculator.sh              [LH-03]
    ├── log-archive-rotator.sh                   [LH-04]
    ├── weekly-evolution-report.sh               [LH-05]
    ├── theory-to-rule-pipeline.js               [LH-06]
    ├── stale-backlog-pruner.sh                  [LH-07]
    ├── evolution-checkpoint-audit.js            [LH-08]
    ├── dead-skill-detector.sh                   [LH-09]
    └── capability-growth-tracker.js             [LH-10]
```

---

## 设计原则

1. **全自治**：所有已上线任务零用户输入即可运行，仅输出报告不修改核心文件
2. **幂等性**：重复运行安全，使用 `flock` 防竞态，日期标记防重复
3. **可观测**：每个任务有独立日志文件，便于诊断
4. **渐进增强**：Backlog任务按价值优先级排序，下一个实现LH-15（最简单）
5. **反熵增**：LH-03/LH-10度量有序度本身，形成进化闭环的仪表盘

---

_由洞察分析师 subagent 自动生成 | 2026-03-07 | 已落 cron 10条_
