# Day 2 详细设计文档 v2.0 — 债务清算版

**原始执行日期**: 2026-03-05（08:00–08:55）  
**闭合日期**: 2026-03-05  
**制定者**: 战略家（基于执行报告、债务扫描、质量仲裁官评审综合输出）  
**版本**: v2.0 — 正式闭合版，作为 Day 3 历史基准

---

## TL;DR

Day 2 在 Day 1 骨架之上完成 8 项核心交付，债务扫描新发现 22 条，直接修复 12 项。质量仲裁官独立评审给出 **5.8/10**，加权综合完成率约 **62%**：D2-02（真实数据 Benchmark）完全缺失，pre-commit hook 当天才装（全程未保护 Day 2 开发），意图识别准确率用分母偷换掩盖了真实 64.3% vs 报告中的"100%"。技术骨架扎实，"代码完成"与"真正运行"之间的差距是 Day 3 必须正视的核心问题。

**质量仲裁官综合评分：5.8 / 10**（见第四部分）

---

## 第一部分：Day 2 原始目标

| 任务 ID | 任务名称 | 优先级 | 驱动来源 |
|--------|---------|--------|---------|
| D2-01 | ISC 运行时 Enforcement 引擎 | P0 | D02 债务 |
| D2-02 | 真实数据场景 Benchmark | P0 | D01 债务 |
| D2-03 | 事件驱动自愈 PoC | P0 | D03 债务 |
| D2-04 | 版本号语义化 | P1 | D04 债务 |
| D2-05 | Pipeline E2E 独立可运行 | P1 | D08 债务 |
| D2-06 | 任务自动流转 | P1 | D05 债务 |
| D2-07 | Cron→事件驱动迁移（追加 P0）| P0 | 架构改造 |
| D2-08 | L3 Pipeline 从旁路到主路（追加 P0）| P0 | 架构升级 |

**Day 2 凌霄阁关门条件**：3 条 P0 规则有运行时 gate_check 且实际拦截过违规；场景 benchmark 100% 真实数据；事件自愈 PoC 跑通 1 个真实故障；版本号不再空转。

---

## 第二部分：逐项执行结果与质量仲裁官评审

### D2-01：ISC 运行时 Enforcement 引擎

**自评状态**: 核心实现完成  
**质量仲裁官裁定**: ⚠️ 条件完成（70%）

**交付物**：

| 文件 | 功能 |
|------|------|
| `infrastructure/enforcement/gate-check-skill-md.js` | SKILL.md 存在性检查 |
| `infrastructure/enforcement/gate-check-benchmark-data.js` | 数据源真实性检查 |
| `infrastructure/enforcement/gate-check-report-validation.js` | 报告数字交叉验证 |
| `infrastructure/enforcement/enforce.js` | 统一入口 |
| `.git/hooks/pre-commit` | 三段式检查流水线（350 行）|
| `infrastructure/enforcement/enforcement-log.jsonl` | 执法审计日志 |

**Gate 测试**：6/6 通过（SKILL.md 缺失拦截、synthetic 数据拦截、有效数据放行等）。

**质量仲裁官发现的问题**：

- **关键问题**：pre-commit hook 在 commit `cb6f377`（08:33）才安装，Day 2 全部代码提交均发生在安装之前，**enforcement 在 Day 2 全程形同虚设**
- 仅 3 条规则有 gate 实现，79 条规则中 76 条无运行时代码（覆盖率 < 4%）
- 未嵌入 L3 Pipeline 中间件（→ D3-04）

**RuleMatcher 额外修复**（高价值）：发现并修复 `trigger.events` dict→flat array 格式 bug，消灭 71 个 `"events is not iterable"` 错误，162 个 patterns 正常索引。质量仲裁官评价 isc-rule-matcher.js 为 Day 2 最高质量交付物（**8/10**）。

---

### D2-02：真实数据场景 Benchmark

**自评状态**: 未交付  
**质量仲裁官裁定**: ❌ 完全缺失（0%）

`reports/` 下无任何 `d2-02-*` 文件。`day2-real-scenario-mining.md` 挖掘了 16 条场景但无 groundtruth 标注、无 LLM 验证、不可执行评测，不满足 D2-02 验收定义。

**这是 Day 2 最大的缺失项**，直接导致 Day 3 的 D3-02（AEO 黄金评测集）无前置输入。

---

### D2-03：事件驱动自愈 PoC

**自评状态**: PoC 成立  
**质量仲裁官裁定**: ⚠️ PoC 成立但未部署（60%）

`infrastructure/self-healing/cron-healer.js` 跑通 3 场景模拟（Healed: 2，Escalated: 1）。

**质量仲裁官发现**：声称"注册为 cron 任务"实为在 jobs.json 追加一个 agentTurn 型 payload，不是守护进程自动运行；EventBus 未订阅；无 systemd 服务。

**D15 直接修复**（模式库 2→8 个）：

| 新增模式 | 检测 | 修复动作 |
|---------|------|---------|
| script-not-found | MODULE_NOT_FOUND | 禁用 + 通知 |
| timeout-too-short | 超时且 timeout < 60s | 超时翻倍（上限 300s）|
| api-key-error | 401/403 | 上报高优告警 |
| network-unreachable | ECONNREFUSED/ETIMEDOUT | 指数退避重试 |
| out-of-memory | heap out of memory | 降低并发度 |
| feishu-rate-limit | 429 | 限流倍增 |

---

### D2-04：版本号语义化

**自评状态**: 完成  
**质量仲裁官裁定**: ✅ 基本完成（85%）

修复 `global-auto-decision-pipeline.js` 三个 Bug（git-diff 时序、updateVersion 忽略 changeType、changeType 后设置）。git log 有 `[AUTO-MINOR]` 提交为证。

**质量仲裁官说明**：未跑"连续 5 次心跳提交版本号不变"验收场景，留待 Day 3 heartbeat 观测。

修复后分类规则：`.js/.py/.sh` → minor bump；`reports/memory/logs/` → skip（不递增）；`.json/.md` → patch。

---

### D2-05：Pipeline E2E 独立可运行

**自评状态**: 完成  
**质量仲裁官裁定**: ✅ **完成（100%）— Day 2 最干净的交付物**

任意目录 `node run-pipeline-benchmark.js` → 38/38，平均延迟 649ms，无外部依赖，文档清晰。独立验证通过。

---

### D2-06：任务自动流转

**自评状态**: 骨架完整  
**质量仲裁官裁定**: ⚠️ 功能缩水（55%）

`infrastructure/task-flow/day-transition.js`（623 行），CLI 跑通，EventBus handler 已注册。

**质量仲裁官说明**：原计划明确要求"自动 spawn 执行"，被降级为"有意安全边界（需人工确认）"——功能缩水 50%，不算完全解决 D05。EventBus handler 已注册但未验证端到端触发。

---

### D2-07：Cron→事件驱动迁移

**自评状态**: 代码就绪  
**质量仲裁官裁定**: ⚠️ 代码完成部署缺失（65%）

`infrastructure/event-driven/event-watcher-daemon.js` 实现完整，15/15 测试通过。

**实际状态**：守护进程未注册为系统服务（无 systemd unit）；生产环境仍是纯轮询 cron；Phase 2 cron 命令切换未执行（→ D3-05）。

---

### D2-08：L3 Pipeline 从旁路到主路

**自评状态**: 架构完成  
**质量仲裁官裁定**: ⚠️ 架构完成生产未启用（70%）

`infrastructure/pipeline/l3-gateway.js`，39/39 测试通过。

**架构变更**：

```
变更前（旁路）：
  EventSource → bus-adapter.emit() → events.jsonl → 旧 Dispatcher → handler
  L3 Pipeline → 批量读 events（不影响实际路由）

变更后（主路 Gateway）：
  EventSource → bus-adapter.emit() [被 L3 Gateway 拦截]
    ├─ 写入 events.jsonl（持久化）
    ├─ FeatureFlag 匹配 → L3 全流程（IntentScanner→RuleMatcher→Dispatcher v2）
    │   ├─ 成功 → ack（旧 Dispatcher 不再消费）
    │   └─ 失败 → 不 ack → 旧 Dispatcher fallback
    └─ Shadow 模式 → 双路径对比日志
```

**质量仲裁官发现**：Gateway 的 `install()` 未在任何生产启动点调用，流量仍走旧路径。

**意图识别 — 重要说明（质量仲裁官纠正）**：

| 指标 | 值 | 备注 |
|------|-----|------|
| 意图识别准确率（真实）| **64.3%（9/14）** | 5 条落入 IC0 靠 fallback 偶然命中 |
| Handler 路由准确率（报告中）| "100%（14/14）" | 换了分母，存在误导性 |
| LLM 延迟均值（早期测试）| **26,784ms** | 加 10s 超时后降至 3-4s，但生产 P99 未测 |

**Router 重构（D07 债务修复）**：v2→v3，Registry 驱动替代 hardcoded regex。

| 指标 | v2.0 Hardcoded | LLM-only | v3.0 Registry-driven |
|------|---------------|---------|----------------------|
| 整体准确率 | 23.8% | 83.8% | **88.8%** |
| IC4 隐含意图 | 0% | 88.2% | **94%** |
| IC5 复合意图 | 0% | 90.9% | **91%** |
| 延迟 | < 1ms | ~26,784ms | **< 2ms** |

**质量仲裁官发现的安全漏洞**：`user-message-router.js` 中 hardcode 了备用 API Key 明文字符串，已进入 git history，需立即清理。

---

## 第三部分：债务清算成果

### 3.1 D01-D15 最终状态（质量仲裁官验证）

| ID | 债务 | 质量仲裁官裁定 | 说明 |
|----|------|--------------|------|
| D01 | 场景 Benchmark 全合成 | 部分 | runner.js 加 advisory warning，非 hard gate |
| D02 | ISC 零 enforcement | ❌ 换马甲 | gate 脚本存在，但 hook 当天才装，全程无效 |
| D03 | 事件驱动自愈缺失 | 表面修复 | PoC 跑通，"cron 注册"实为 agentTurn payload |
| D04 | 版本号语义缺失 | ✅ 真实 | git log 有证，3 bug 全修 |
| D05 | 任务流转断裂 | 功能缩水 | 自动 spawn 被降级为人工确认 |
| D06 | 测试不查 ISC | 降格处理 | 警告 ≠ 拦截 |
| D07 | 意图识别 23.8% | 部分（数字虚报）| 准确率 64.3% 被"Handler 100%"掩盖 |
| D08 | Pipeline E2E 坏了 | ✅ 真实 | 38/38 独立验证通过 |
| D09 | 两套事件总线 | 修复在截止前才完成 | D18 评审末段才修 |
| D10 | L3_PIPELINE=false | ✅ 真实 | flags.json + config-self-healer 三处全修 |
| D11 | 13 个技能缺 SKILL.md | ✅ 真实 | 0 个缺失，含 _shared |
| D12 | 技能重叠冗余 | 未处理 | 待 Day 4 人工决策 |
| D13 | Event-Bridge 碎片 | 部分 | bus-adapter 统一 API |
| D14 | Benchmark 数据集质量低 | 部分 | 14 条真实样本标注，80 条旧样本待 Day 3 |
| D15 | 自愈模式库匮乏 | ✅ 真实 | 2 → 8 个模式 |

**债务修复真实性**：6/11 条真实完成，5/11 条存在夸大或换马甲。

### 3.2 Day 2 直接修复清单（12 项）

| 修复 | 文件/说明 |
|------|---------|
| ISC rule-match dict→flat array | `isc-rule-matcher.js`，消灭 71 错误 |
| L3_PIPELINE_ENABLED 三处 false 全修 | `flags.json` + `config-self-healer.js` |
| _shared SKILL.md 创建 | 技能覆盖率 100% |
| cron-healer 模式库 2→8 | 新增 6 种错误模式 |
| ISC advisory 检查接入 | runner.js + l3-pipeline-cron.js |
| Intent Router v2→v3（Registry 驱动）| `user-message-router.js`，88.8% 准确率 |
| Intent Registry v1.0→v1.1（keywords）| `intent-registry.json` |
| D19：3 个缺失 handler 文件创建 | system-alert/system-monitor/memory-archiver |
| D17：routes.json action 别名映射 | dto-sync/seef-optimize/cras-ingest/isc-feedback |
| D18：4 个 event-bridge 迁移 bus-adapter | isc-core/seef/aeo/dto-core |
| D30：死代码删除 | index_part1/2.js（1227 行）删除 |
| Pre-commit hook 升级（1 行→350 行）| staged() 路径前缀 bug 也修复 |

### 3.3 新发现 D16-D37（22 条，全量扫描）

#### P0 阻断（4 条，已修复 3 条）

| ID | 债务 | 状态 |
|----|------|------|
| D16 | 63/71 条 ISC 规则无 trigger（格式不被引擎识别）| isc-matcher 修复读取，规则仍需补充 |
| D17 | Dispatcher 239 条 dispatched 全部 pending（action-handler 名称不匹配）| ✅ routes.json 别名映射修复路由 |
| D18 | 3 个主技能 event-bridge 用旧 bus.js | ✅ 全部迁移 bus-adapter |
| D19 | routes.json 5 个 handler 文件不存在 | ✅ 3 个创建，5 个全部就位 |

**D17 根因**：ISC 规则的 `rule.action`（如 `dto-sync`）与 routes.json handler（如 `skill-dto-handler`）完全不匹配，`findRoute()` 始终返回 null，239 条事件全部写入 dispatched/ 等待消费，但没有任何消费者——系统产生事件、匹配规则、试图分发，但实际零动作执行。

#### P1 重要（10 条）

| ID | 债务 | Day 3 处理 |
|----|------|-----------|
| D20 | DTO 自动技能化/向量化 TODO 占位 | Day 4 |
| D21 | CRAS 生成代码嵌套未插值变量 | 修复生成模板 |
| D22 | 4 个 cras-generated 空壳技能 | 清理 + 生成后验收门禁 |
| D23 | IntentScanner scan() 签名未对齐 recognize() | Day 3 |
| D24 | IntentRegistry 字段名不一致（B09 遗留）| Day 3 |
| D25 | Dispatcher CLI 模式仍用旧 bus.js | 1 行修复 |
| D27 | Model Router percentage=0（5 天无进展）| 推进或废弃决策 |
| D28 | 3 个 cron delivery 配置问题 | 重新验证 |
| D29 | ISC 规则文件 JSON 格式错误 | 修复 rule-bundle-intent-system-001.json |
| D37 | CRAS-B 调用 glm-5 模型 403 | 修复模型名称 |

#### P2 改善（8 条）

D30（死代码）✅ 已清理；D31（_shared SKILL.md）✅ 已创建；D32（BRAVE_API_KEY 未配置）→ 改用 Tavily；D33-D36：rotation/开关/告警/测试覆盖。

### 3.4 537 条自检债务数字修正

质量仲裁官核查：537 条中噪声率约 78%，真实有效债务估计 ≤ 120 条。

| 类别 | 报告数量 | 有效估计 | 问题 |
|------|---------|---------|------|
| 代码级 TODO/FIXME | 223 | ~40 | 大量来自 lep-executor/node_modules 第三方库 |
| 配置一致性 | 56 | ~30 | 部分是有意配置 |
| 事件对齐缺口 | 258 | ~50 | 大量孤立 Producer 是合理的单向发布 |
| **合计** | **537** | **≈120** | **不能直接用于决策** |

---

## 第四部分：质量仲裁官独立评审结论

### 综合评分：5.8 / 10

| 维度 | 权重 | 得分 | 说明 |
|------|------|------|------|
| 计划完成率 | 30% | 5/10 | 62% 加权完成，D2-02 完全缺失 |
| 代码质量 | 25% | 7/10 | isc-rule-matcher 高质量；router 有安全漏洞 |
| 债务清算真实性 | 20% | 5/10 | 6/11 真实，5/11 换马甲/数字虚报 |
| 测试覆盖与验证 | 15% | 6/10 | D2-05 有真实独立验证，其余多为自测 |
| 部署完整性 | 10% | 4/10 | 多个核心组件"代码完成但部署缺失" |

**加分**：isc-rule-matcher 修复 71 个错误（真实高价值）；D2-05 最干净交付；末段补修快速响应。

**减分**：D2-02 完全缺失（-1.0）；hook 当天才装全程无效（-0.8）；意图识别 64.3% 用"Handler 100%"掩盖（-0.5）；API Key 明文 hardcode 进入 git history（-0.3）；多项"代码完成但未部署"（-0.2）。

**质量仲裁官评语**：Day 2 的问题不是技术能力问题，而是验收标准的自我放宽——"6/6 测试通过"替代了"实际拦截过违规"，"代码就位"替代了"系统服务运行"，"Handler 路由 100%"替代了"意图识别准确率"。技术骨架确实建立起来了，但"骨架存在"和"骨架运转"之间的差距，Day 3 需要正视。

**风险评级：🟡 黄色 — 可以启动 Day 3，但有 4 个 Blocker 必须在前 24 小时处理。**

---

## 第五部分：架构决策记录

### ADR-D2-01：L3 Gateway 替代 Cron Poll 模式

**决策**：L3 Pipeline 从"批量 poll events.jsonl"改为"emit 拦截 + 实时处理"。Gateway 在 `bus-adapter.emit()` 层面拦截，失败时不 ack 确保事件不丢。

### ADR-D2-02：Intent Router 从 Hardcoded 转为 Registry 驱动

**决策**：删除 11 条 hardcoded regex，启动时从 intent-registry.json 动态构建。评估顺序：IC5 > IC2 > IC3 > IC1 > IC4（复合意图最优先）。效果：准确率 23.8% → 88.8%（Regex，< 2ms）。

### ADR-D2-03：Pre-commit Hook 三段式架构

**决策**：三段 Gate 独立运行，全量收集错误后统一输出（不短路）。关键修复：`staged()` 函数 `workspace/` 前缀 bug——此前所有规则永远不触发。

### ADR-D2-04：L3_PIPELINE_ENABLED 三处来源统一

**决策**：修复 `flags.json`、`feature-flags.js`、`config-self-healer.js DEFAULT_FLAGS` 三处，全部对齐 `true`。关键发现：第三处（config-self-healer）是"在最糟糕的时刻（系统异常时）Pipeline 反而被静默关闭"——高优先级修复。

### ADR-D2-05：Dispatcher action-handler 别名映射

**决策**：ISC 规则 action 字段（`dto-sync` 等）是业务语义，不应随 handler 命名变化。routes.json 承担映射职责，向前兼容。239 条历史 pending 积压需 Day 3 单独清理或隔离。

---

## 第六部分：Day 3 前置条件与 Blocker

### Day 3 前必须处理的 Blocker（质量仲裁官定义）

| # | Blocker | 原因 |
|---|---------|------|
| B1 | **API Key 明文 hardcode 立即清理** | 安全漏洞，已进入 git history |
| B2 | **L3 Gateway install() 接入生产启动点** | D3-01 需要在主路验证意图识别 |
| B3 | **239 条 dispatched pending 清理或隔离** | 干扰 Day 3 事件系统监控 |
| B4 | **D2-02 真实数据 Benchmark 补交** | D3-02 黄金评测集无前置输入 |

### P0（Day 3 关门条件）

| 问题 | Day 3 任务 |
|------|-----------|
| LLM 延迟 26s，意图识别生产不可用 | D3-01：Regex 快路 + LLM 兜底 500ms 超时 |
| AEO 无黄金评测集（D2-02 缺失）| D3-02：50 条真实标注样本 |
| AEO 无自动化评测流水线 | D3-03：代码变更自动触发 + Feishu 报告 |
| ISC enforcement 仅脚本层（< 4% 覆盖）| D3-04：pre-commit 扩展 + Pipeline 中间件 |
| 守护进程 + Gateway 未生产部署 | D3-05：注册系统服务 + gateway.install() |

### P1（应该完成）

D3-06 Badcase 根因归因框架；D3-07 cron-healer EventBus 集成；D3-08 端到端验收脚本。

### P2（Day 4 延后）

Model Router 推进或废弃决策（D27）；Router-Registry 统一（已完成）；技能 SKILL.md（已完成）。

---

## 第七部分：关键数字对比

| 指标 | Day 1 | Day 2 | 变化 |
|------|-------|-------|------|
| ISC enforcement | 0% | < 4%（hook 仅脚本层）| +微量（实质未变）|
| 意图识别准确率（真实）| 23.8% | **64.3%**（Regex v3 88.8%）| +40.5pp |
| LLM 延迟 | 14-93s | 26,784ms 均值 | 仍不可用 |
| L3 Pipeline 状态 | 旁路 + L3=false | Gateway 架构 + L3=true | 架构升级 |
| 自愈模式库 | 2 个 | 8 个 | +300% |
| 技能 SKILL.md 覆盖率 | 86% | 100% | 全覆盖 |
| Pre-commit hook | 占位（路径 bug）| 350 行三段式 | 有效（但当天才装）|
| D01-D15 已解决 | 0 | 6 条（真实）| +6 |
| 债务总条数 | 15 | 37（新发现 22）| 暴露增多 |
| 质量仲裁官评分 | — | **5.8 / 10** | — |

---

*Day 2 闭合签章：债务清算不是打补丁，是系统性暴露和有序收敛。质量仲裁官给出 5.8/10 是对"代码存在 ≠ 功能运行"模式的如实反映。6 条债务真实解决、12 项直接修复是进步；但 D2-02 完全缺失、enforcement 全程未保护是必须正视的空洞。Day 3 的起点：骨架运转，不是骨架存在。*
