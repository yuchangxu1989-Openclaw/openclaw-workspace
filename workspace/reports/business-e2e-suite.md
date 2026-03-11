# 业务级 E2E 验收套件

**版本**: v1.0
**日期**: 2026-03-06
**编制**: 情报专家 (scout)
**目标**: 验证用户价值闭环——从用户输入到可感知结果的完整路径

---

## 设计原则

本套件不是技术链路覆盖，而是回答一个问题：**用户发出一条消息后，系统是否交付了预期价值？**

每条路径遵循：
```
用户触发 → 意图识别 → 路由决策 → 执行动作 → 可验证结果
```

优先级说明：
- **P0**: 用户核心体验，必须首批自动化
- **P1**: 系统自治能力，第二批自动化
- **P2**: 高级闭环，手动验收后自动化

---

## 路径总览

| # | 路径名称 | 分类 | 优先级 | 自动化建议 |
|---|---------|------|--------|-----------|
| E2E-B01 | 用户指令 → Agent 执行 → 结果交付 | Directive | **P0** | ✅ 首批 |
| E2E-B02 | 用户纠偏 → 规则自动沉淀 → 后续不再犯 | Correction + Ruleify | **P0** | ✅ 首批 |
| E2E-B03 | Cron 静默执行 → 用户无感 → 异常才报告 | Cron 静默 | **P0** | ✅ 首批 |
| E2E-B04 | 用户发图/文件 → 智谱多模态处理 → 结果返回 | ISC 路由 + 多模态 | **P0** | ✅ 首批 |
| E2E-B05 | 模型故障 → 自动 Fallback → 用户无感 | Failover | **P1** | ✅ 第二批 |
| E2E-B06 | 未知意图 → 发现上报 → 扩展意图注册表 | Discovery | **P1** | ✅ 第二批 |
| E2E-B07 | ISC 规则创建 → 命名/去重校验 → Gate 拦截或放行 | Directive + Enforcement | **P1** | ✅ 第二批 |
| E2E-B08 | Handler 崩溃 → 自动禁用 → 自愈恢复 | Auto-repair | **P1** | ✅ 第二批 |
| E2E-B09 | 技能创建 → 版本/架构门禁 → 能力锚点自动同步 | Directive + Ruleify | **P1** | ✅ 第二批 |
| E2E-B10 | 多 Agent 协作 → Subagent 派发 → 结果汇总交付 | Directive + Orchestration | **P2** | 手动后自动化 |
| E2E-B11 | 飞书群聊 @提及 → 上下文感知回复 → 非相关静默 | Channel Policy | **P2** | 手动后自动化 |
| E2E-B12 | 配置文件损坏 → Config Self-Healer 回退 → 服务不中断 | Auto-repair + Failover | **P2** | 手动后自动化 |

---

## 详细路径设计

### E2E-B01: 用户指令 → Agent 执行 → 结果交付

**用户价值**: 我说一句话，系统帮我做完了事，结果直接交到我手上。

| 维度 | 内容 |
|------|------|
| **触发输入** | 用户在飞书发送："帮我搜一下 2026 年最新的 AI Agent 框架对比" |
| **预期意图/事件** | `user.message` → 意图分类为 IC2 (规则触发) 或直接执行型指令；事件 `user.message` 路由到 `user-message-router` |
| **预期执行动作** | 1. Gateway 接收飞书消息 → 2. 分配到 main agent → 3. Agent 调用 `web_search` 工具 → 4. 综合搜索结果生成回复 → 5. 通过飞书 channel 返回 |
| **预期验证结果** | ✅ 用户在飞书收到结构化回复 ✅ 回复包含实际搜索结果（非编造） ✅ 端到端延迟 < 30 秒 ✅ 无错误日志 |
| **失败判定** | ❌ 超时无回复 ❌ 回复"我无法执行"却未尝试调用工具 ❌ 返回空消息 |

**自动化方案**: 模拟飞书 webhook 请求，断言响应消息非空、包含 URL、延迟合理。

---

### E2E-B02: 用户纠偏 → 规则自动沉淀 → 后续不再犯

**用户价值**: 我纠正了一次错误，系统自动记住，以后不需要我再提醒。

| 维度 | 内容 |
|------|------|
| **触发输入** | 用户发送："以后不要在 cron 任务结果里给我发消息，除非有错误" |
| **预期意图/事件** | 意图分类为 `rule.trigger.self_correction` (IC2)；事件 `user.feedback.correction` → 触发 ruleify 流程 |
| **预期执行动作** | 1. 意图引擎识别为"纠偏+规则沉淀"意图 → 2. 触发 `ruleify` 技能 → 3. 自动生成/更新 ISC 规则（如 `rule.cron-silent-on-success`）→ 4. 规则写入 `skills/isc-core/rules/` → 5. 向用户确认规则已沉淀 |
| **预期验证结果** | ✅ 新规则文件已创建且命名符合 `rule.xxx-xxx-NNN.json` 规范 ✅ 用户收到"已记住"确认 ✅ 后续 cron 成功执行时不再发消息（回归验证） |
| **失败判定** | ❌ 仅口头说"好的"但未生成规则文件 ❌ 规则生成但格式不合规 ❌ 下次 cron 执行后仍然发消息 |

**自动化方案**: 发送纠偏指令 → 检查规则文件目录变更 → 模拟一次 cron 成功事件 → 验证无消息推送。

---

### E2E-B03: Cron 静默执行 → 用户无感 → 异常才报告

**用户价值**: 后台定时任务安静运行，只有出事才找我，不骚扰。

| 维度 | 内容 |
|------|------|
| **触发输入** | Cron 调度器触发一个定时任务（如 `CRAS-A-主动学习引擎`），任务正常完成，返回 `HEARTBEAT_OK` |
| **预期意图/事件** | 系统内部事件：`cron.job.completed` + `status: ok` |
| **预期执行动作** | 1. Cron worker 执行任务 → 2. 任务返回 `HEARTBEAT_OK` → 3. `CRITICAL_ENFORCEMENT_RULES.md` 中 SYSTEM_ROUTINE 规则生效 → 4. **不向用户推送任何消息** → 5. 仅写入内部日志 |
| **预期验证结果** | ✅ 任务执行成功（`lastStatus: "ok"`）✅ **飞书无新消息推送** ✅ `delivery.lastDelivered: false` 或 `lastDeliveryStatus: "not-delivered"` |
| **失败判定** | ❌ 用户收到"cron 任务已完成"的消息 ❌ 用户收到 "NO_REPLY" 文本 ❌ 用户收到任何形式的确认消息 |

**自动化方案**: 触发一个 enabled 的 cron job → 等待执行完成 → 查询飞书消息队列/delivery-queue 确认无新推送。

---

### E2E-B04: 用户发图/文件 → 智谱多模态处理 → 结果返回

**用户价值**: 我发张图片，系统直接告诉我里面是什么，不用我换工具。

| 维度 | 内容 |
|------|------|
| **触发输入** | 用户在飞书发送一张图片 + 文字："这张图里的文字帮我识别出来" |
| **预期意图/事件** | 消息带有图片附件 → ISC 路由 `glm-ocr` 规则匹配（触发词：OCR/识别文字）→ 事件 `user.message` + `attachment.type: image` |
| **预期执行动作** | 1. Gateway 解析飞书图片附件 → 2. ISC 路由匹配 `glm-ocr` 规则 → 3. 调用智谱 OCR 模型处理图片 → 4. 提取文字结果 → 5. 格式化返回给用户 |
| **预期验证结果** | ✅ 用户收到提取的文字内容 ✅ 文字内容与图片实际内容一致 ✅ 使用了 OCR 模型（非纯文本猜测）|
| **失败判定** | ❌ 回复"我无法处理图片" ❌ 忽略图片只回复文字部分 ❌ 调用了错误的模型（如 glm-4v 而非 glm-ocr）|

**自动化方案**: 构造含图片的飞书消息 payload → 验证响应包含提取文字 → 验证调用链日志中包含 glm-ocr。

---

### E2E-B05: 模型故障 → 自动 Fallback → 用户无感

**用户价值**: 后台模型挂了我不关心，只要我的问题能得到回答。

| 维度 | 内容 |
|------|------|
| **触发输入** | 用户发送正常指令，但 primary 模型 `boom-main/gpt-5.4` 返回 500/超时 |
| **预期意图/事件** | 事件 `model.request.failed` → 触发 fallback 链：`boom-main/gpt-5.4` → `claude-main/claude-opus-4-6-thinking` |
| **预期执行动作** | 1. Gateway 向 boom 发送请求 → 2. boom 返回错误/超时 → 3. **自动切换到 fallback 模型** `claude-main/claude-opus-4-6-thinking` → 4. 重新发送请求 → 5. 获得结果返回用户 → 6. 记录 fallback 事件到日志 |
| **预期验证结果** | ✅ 用户正常收到回复（可能延迟稍长但不感知故障）✅ 日志记录 fallback 切换事件 ✅ boom 恢复后自动回到 primary（无需人工干预）|
| **失败判定** | ❌ 用户收到"模型服务不可用"错误 ❌ 请求直接失败未尝试 fallback ❌ 卡在 fallback 不回切 primary |

**自动化方案**: 用隔离脚本模拟 boom API 超时（参考 `day3-failover-drill-plan.md` 的最小扰动方案）→ 发送测试消息 → 验证回复正常 → 检查日志确认 fallback 触发。

---

### E2E-B06: 未知意图 → 发现上报 → 扩展意图注册表

**用户价值**: 系统越用越聪明，我的新用法它能自动学会。

| 维度 | 内容 |
|------|------|
| **触发输入** | 用户发送一条当前意图注册表未覆盖的消息，如："帮我把这个 PDF 翻译成英文" |
| **预期意图/事件** | 意图分类置信度 < 阈值 → 事件 `intent.unknown.detected` → 触发 `intent-unknown-discovery` handler |
| **预期执行动作** | 1. 意图引擎无法高置信度匹配已有 17 个意图类型 → 2. 触发 `intent-unknown-discovery` handler → 3. 记录未知意图样本到发现队列 → 4. 当积累 N 个同类样本后，建议新增意图类型 → 5. 同时仍然尝试尽力回复用户（不因未知意图而拒绝服务）|
| **预期验证结果** | ✅ 用户仍收到合理回复（即使是 best-effort）✅ 未知意图被记录到发现队列/日志 ✅ 发现队列累积后产生新意图注册建议 |
| **失败判定** | ❌ 用户收到"我不理解你的意思" ❌ 未知意图被静默丢弃无记录 ❌ 系统错误分类为已有意图（置信度虚高）|

**自动化方案**: 构造 5 条确定不在注册表中的消息 → 验证发现队列有新增记录 → 验证用户均收到回复。

---

### E2E-B07: ISC 规则创建 → 命名/去重校验 → Gate 拦截或放行

**用户价值**: 规则质量有保证，命名乱的、重复的自动拦住，不用人盯。

| 维度 | 内容 |
|------|------|
| **触发输入（case A - 拦截）** | 尝试创建规则文件 `rule.bad_naming.json`（下划线命名，违反 kebab-case 规范）|
| **触发输入（case B - 放行）** | 创建规则文件 `rule.new-feature-validation-001.json`（命名合规、内容不重复）|
| **预期意图/事件** | 事件 `isc.rule.created` → 触发 10 条规则匹配（含 `isc-naming-convention-001`, `isc-rule-creation-dedup-gate-001` 等）|
| **预期执行动作** | 1. Event Bus 接收规则创建事件 → 2. 命名规范检查 handler 执行 → 3. 去重扫描 handler 执行 → 4. Case A: 命名违规 → **enforcement-engine 返回 block** → 5. Case B: 全部通过 → **返回 pass** |
| **预期验证结果** | ✅ Case A: 收到 block 结果 + 具体违规原因 ✅ Case B: 收到 pass 结果 ✅ 10 条相关规则全部触发（参考 e2e-dispatch-suite 中 e2e-004/005 的 handler 调用链）|
| **失败判定** | ❌ 命名违规却放行 ❌ 合规规则却被拦截 ❌ 部分 handler 未触发（规则匹配遗漏）|

**自动化方案**: 已有 `e2e-dispatch-suite` 覆盖（e2e-004/005 通过率 100%），扩展为业务级验证：加入实际文件写入 + 回读验证。

---

### E2E-B08: Handler 崩溃 → 自动禁用 → 自愈恢复

**用户价值**: 系统某个零件坏了不影响整体，自动修好，我完全不知道。

| 维度 | 内容 |
|------|------|
| **触发输入** | Event Bus 中某个 handler（如 `capability-anchor-sync`）连续 3 次抛出异常 |
| **预期意图/事件** | 事件 `handler.failure.consecutive` → 触发 resilient-bus 的自动禁用逻辑 |
| **预期执行动作** | 1. Handler 连续失败 3 次 → 2. `resilient-dispatcher` 检测到 consecutiveFailures > 阈值 → 3. **自动禁用该 handler**（`disabled: true`）→ 4. 写入 `handler-state.json` → 5. 记录到 `dead-letter.jsonl` → 6. 定期探活：尝试恢复 → 7. Handler 恢复正常后自动启用 |
| **预期验证结果** | ✅ handler-state.json 中 `disabled: true` ✅ 后续事件不再路由到该 handler（不会连锁崩溃）✅ dead-letter 中有完整的失败记录 ✅ handler 恢复后 `disabled` 自动变回 `false` |
| **失败判定** | ❌ Handler 崩溃导致整个 Event Bus 挂掉 ❌ 崩溃的 handler 持续被调用（无熔断）❌ 恢复后仍处于禁用状态 |

**自动化方案**: 注入一个必然失败的 mock handler → 触发 3 次事件 → 验证 handler-state.json 变化 → 修复 handler → 验证自动恢复。

---

### E2E-B09: 技能创建 → 版本/架构门禁 → 能力锚点自动同步

**用户价值**: 新技能上线有质量保障，能力清单自动更新，不会遗漏。

| 维度 | 内容 |
|------|------|
| **触发输入** | 用户/Agent 创建新技能目录 `skills/new-analyzer/`，含 `SKILL.md` + `index.js`，声明版本 `v1.0.0` |
| **预期意图/事件** | 事件 `skill.created` → 触发 7 条规则（`arch-gate-before-action-001`, `capability-anchor-lifecycle-sync-001`, `version-integrity-gate-001` 等）|
| **预期执行动作** | 1. 事件触发规则链 → 2. `enforcement-engine` 执行架构门禁检查 → 3. `check-version-integrity` 验证版本号合理性 → 4. `capability-anchor-sync` 将新技能写入 `CAPABILITY-ANCHOR.md` → 5. `classify-skill-distribution` 自动分类技能归属层 |
| **预期验证结果** | ✅ 版本合理 → pass（参考 e2e-001）✅ `CAPABILITY-ANCHOR.md` 中出现新技能条目 ✅ 技能分类已标注（核心/扩展/实验）✅ 版本虚标 → block（参考 e2e-002）|
| **失败判定** | ❌ 技能创建后能力锚点未更新 ❌ 版本虚标但通过了门禁 ❌ handler 链部分跳过 |

**自动化方案**: 已有 `e2e-dispatch-suite` 的 e2e-001/002/003 覆盖核心路径，扩展为：实际创建技能目录 → 验证 CAPABILITY-ANCHOR.md 变化。

---

### E2E-B10: 多 Agent 协作 → Subagent 派发 → 结果汇总交付

**用户价值**: 一个复杂任务，系统自动拆分给不同专家并行执行，最终给我一个完整答案。

| 维度 | 内容 |
|------|------|
| **触发输入** | 用户发送："帮我做一个系统健康度全面诊断，包括 cron 状态、规则覆盖率、模型可用性" |
| **预期意图/事件** | 意图分类为 IC3（复杂意图）或 IC5（多意图）；main agent 判断需要多 agent 协作 |
| **预期执行动作** | 1. Main agent 分解任务 → 2. `sessions_spawn` 派发 subagent：scout 检查模型可用性、analyst 分析规则覆盖率、researcher 诊断 cron → 3. 各 subagent 并行执行 → 4. 结果自动 announce 回 main → 5. Main agent 综合结果 → 6. 格式化交付用户 |
| **预期验证结果** | ✅ 至少 2 个 subagent 被派发 ✅ 各 subagent 在 `maxConcurrent: 16` 限制内 ✅ 用户收到综合诊断报告 ✅ 报告包含三个维度的具体数据 |
| **失败判定** | ❌ Main agent 自己做所有事（未并行化）❌ Subagent 超时无响应 ❌ 结果丢失（announce 失败）❌ 汇总报告缺少某个维度 |

**自动化方案**: 发送复杂指令 → 通过 `subagents list` 验证派发 → 等待 announce → 验证最终回复完整性。

---

### E2E-B11: 飞书群聊 @提及 → 上下文感知回复 → 非相关静默

**用户价值**: 群里 @我才回，不 @我的时候安安静静，像个正常群成员。

| 维度 | 内容 |
|------|------|
| **触发输入（case A）** | 飞书群聊中有人发送不 @bot 的普通消息："大家中午吃什么？" |
| **触发输入（case B）** | 飞书群聊中有人 @bot："@战略家 帮我查一下明天的天气" |
| **预期意图/事件** | 群聊策略 `groups.requireMention: true` + `groups.allowAll: true` |
| **预期执行动作** | Case A: Gateway 收到群消息 → 检查 `requireMention` → **未 @bot → 静默丢弃** Case B: Gateway 收到 @mention 消息 → 正常处理 → 调用天气技能 → 回复 |
| **预期验证结果** | ✅ Case A: 无任何回复/反应 ✅ Case B: 在群聊中收到天气查询结果 ✅ Case B 回复 < 15 秒 |
| **失败判定** | ❌ 未 @bot 的消息收到了回复 ❌ @bot 的消息被忽略 ❌ 回复内容与问题无关 |

**自动化方案**: 模拟群聊 webhook 两种 payload（有/无 mention）→ 验证仅 mention 场景产生响应。

---

### E2E-B12: 配置文件损坏 → Config Self-Healer 回退 → 服务不中断

**用户价值**: 系统配置出了问题我不知道也不用知道，服务一直在线。

| 维度 | 内容 |
|------|------|
| **触发输入** | `infrastructure/feature-flags/flags.json` 被意外写入非法 JSON |
| **预期意图/事件** | `config-self-healer` 模块在加载时检测到 JSON parse 失败 |
| **预期执行动作** | 1. 某个组件尝试读取 flags.json → 2. JSON.parse 失败 → 3. `config-self-healer` 捕获异常 → 4. **回退到内置默认值**（`llm_intent_classification: true` 等）→ 5. 记录 heal 事件到 `heal-log.jsonl` → 6. 系统继续正常运行 → 7. 对 routes.json 损坏同理：回退到 `DEFAULT_ROUTES` |
| **预期验证结果** | ✅ 系统未崩溃 ✅ Feature flags 使用默认值（功能可用）✅ `heal-log.jsonl` 有记录 ✅ 管理员可从日志发现问题并修复 |
| **失败判定** | ❌ 系统崩溃/Event Bus 停止工作 ❌ 静默使用损坏值导致行为异常 ❌ 无任何日志记录（黑箱）|

**自动化方案**: 备份 flags.json → 写入损坏内容 → 触发一次需要读取 flags 的操作 → 验证系统正常 + heal-log 有记录 → 恢复原文件。

---

## 优先级排序与自动化路线图

### 第一批：P0 - 用户核心体验（立即自动化）

```
┌─────────────────────────────────────────────────────────────────┐
│  E2E-B01  用户指令→执行→交付        ← 最基本的价值闭环          │
│  E2E-B02  纠偏→规则沉淀→不再犯      ← 系统学习能力的证明        │
│  E2E-B03  Cron静默→不骚扰          ← 用户满意度直接相关         │
│  E2E-B04  多模态路由→结果返回       ← ISC路由核心价值验证        │
└─────────────────────────────────────────────────────────────────┘
```

**自动化实现建议**:
- 使用现有 `e2e-dispatch-suite` 框架扩展
- 构建 Feishu webhook mock 层（模拟消息收发）
- 每条测试 < 60 秒超时
- CI 触发：每次 ISC 规则变更 / 配置变更时自动运行

### 第二批：P1 - 系统自治能力（一周内自动化）

```
┌─────────────────────────────────────────────────────────────────┐
│  E2E-B05  模型Failover→无感切换     ← 韧性核心证明              │
│  E2E-B06  未知意图发现→注册扩展     ← 进化能力证明               │
│  E2E-B07  ISC门禁→拦截/放行        ← 已有基础，扩展到业务级      │
│  E2E-B08  Handler自愈→自动恢复     ← 自治能力证明               │
│  E2E-B09  技能门禁→锚点同步        ← 已有基础，扩展到业务级      │
└─────────────────────────────────────────────────────────────────┘
```

**自动化实现建议**:
- E2E-B07/B09 基于现有 `e2e-dispatch-suite` 12 个 case 直接扩展
- E2E-B05 参考 `day3-failover-drill-plan.md` 的隔离脚本法
- E2E-B08 需要构建 handler mock 注入框架

### 第三批：P2 - 高级闭环（两周内，手动验收后自动化）

```
┌─────────────────────────────────────────────────────────────────┐
│  E2E-B10  多Agent协作→汇总交付     ← 依赖 subagent 稳定性      │
│  E2E-B11  群聊策略→@才回复         ← 需要飞书群环境              │
│  E2E-B12  配置自愈→服务不中断       ← 破坏性测试需谨慎           │
└─────────────────────────────────────────────────────────────────┘
```

**自动化实现建议**:
- E2E-B10 需等 subagent announce 机制稳定后再自动化
- E2E-B11 需飞书测试群 + webhook mock
- E2E-B12 需严格的 backup/restore 流程

---

## 与现有测试的关系

| 现有测试 | 覆盖范围 | 本套件补充 |
|---------|---------|-----------|
| `e2e-dispatch-suite` (12 cases, 100% pass) | 事件分发 → 规则匹配 → handler 调用链 | 本套件从"用户发消息"开始，到"用户收到回复"结束，覆盖 dispatch 上下游 |
| `handler-coverage-audit` (68.6% handler 覆盖) | Handler 是否存在、文件是否可达 | 本套件验证 handler 执行后的**业务效果**，不仅仅是"调用了" |
| `day3-failover-drill-plan` | Failover 切换延迟和可观测性 | 本套件从用户视角验证：failover 后**用户是否正常收到回复** |
| `intent-benchmark` (90% target) | 意图分类准确率 | 本套件验证：分类之后**执行链路是否走通、结果是否正确** |

---

## 测试执行框架建议

```javascript
// business-e2e-runner.js 骨架
const tests = [
  { id: 'E2E-B01', name: '用户指令执行交付', priority: 'P0', fn: testDirectiveExecution },
  { id: 'E2E-B02', name: '纠偏规则沉淀', priority: 'P0', fn: testCorrectionRuleify },
  { id: 'E2E-B03', name: 'Cron静默', priority: 'P0', fn: testCronSilence },
  // ...
];

async function run() {
  for (const t of tests) {
    const start = Date.now();
    try {
      await t.fn();
      console.log(`✅ ${t.id}: ${t.name} (${Date.now() - start}ms)`);
    } catch (e) {
      console.log(`❌ ${t.id}: ${t.name} — ${e.message}`);
    }
  }
}
```

---

## 验收标准

| 指标 | 目标 |
|------|------|
| P0 路径通过率 | ≥ 100%（4/4 全过才算验收通过）|
| P1 路径通过率 | ≥ 80%（4/5 通过）|
| P2 路径通过率 | ≥ 60%（2/3 通过，允许部分降级）|
| 端到端延迟 P95 | < 30 秒（用户指令类）|
| Cron 静默误报率 | 0%（任何误推送都是 P0 bug）|
| Failover 无感率 | 100%（用户不应感知到切换）|

---

*本文档由情报专家 (scout) 基于 /root/.openclaw 仓库实际代码和配置生成，所有路径设计基于真实的 ISC 规则、handler、dispatcher routes 和 cron jobs。*