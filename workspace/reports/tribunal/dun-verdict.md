# 裁决殿「盾」席裁决 — Day2终审

模型: claude-opus-4-6-thinking

## 裁决: 有条件通过

Day2韧性层的代码实现质量中上——错误分类、重试退避、降级策略、死信队列、熔断器、配置自愈均已落地且有测试覆盖。但经深入审查，发现 **1项严重安全缺陷** + **2项高风险** + **4项中风险**，需附条件放行。

---

## 风险安全审查

### 一、韧性层错误恢复机制审查

**结论：机制设计合理，但生产验证为零。**

实际审查了4个韧性模块：

| 模块 | 核心机制 | 代码质量 | 生产验证 |
|------|---------|---------|---------|
| error-handler.js | 三类错误分类 + 指数退避重试(3次/500ms基底/15s上限) + jitter + 降级策略 + 部分响应恢复 | ✅ 扎实 | ❌ 无 |
| resilient-bus.js | 队列深度监控 + 背压(>100丢低优) + 死信队列(3次失败→DLQ) + 优先级分级 | ✅ 扎实 | ❌ 无 |
| resilient-dispatcher.js | Handler崩溃隔离 + per-handler熔断(3次→自动禁用) + 5分钟冷却 + WAL | ✅ 扎实 | ❌ 无 |
| config-self-healer.js | 规则文件逐个容错 + Feature Flags/Routes降级到默认值 + 损坏文件自动备份修复 | ✅ 扎实 | ❌ 无 |
| circuit-breaker.js | 单类型速率限制(50/min) + 链深度限制(10) + 全局速率限制(200/min) + 熔断冷却(60s) | ✅ 扎实 | ❌ 无 |

**关键发现**：
- `heal-log.jsonl`、`dead-letter.jsonl`、`alerts.jsonl` 中的全部记录均来自测试路径（`/tmp/selfheal-test-*`、`test-consumer`），**无一条来自生产环境**。这意味着韧性层可能从未在实际运行中被触发，或者根本没有接入生产路径。
- `pipeline-auto-recovery.log` 显示 `MODULE_NOT_FOUND` 错误——**自动恢复机制本身是坏的**。
- `infrastructure/l3-pipeline/` 目录不存在（`ls` 返回 exit code 2），模块实际在 `infrastructure/resilience/`。质量评估报告的文件验证命令因此失败，这是一个命名/路径不一致问题。

### 二、Workspace合并后身份隔离审查

**结论：🔴 严重缺陷 — 无文件系统隔离。**

实测验证：本次审查以 `reviewer` 子Agent身份运行（workspace: `/root/.openclaw/workspace-reviewer/`），但可以直接读取：
- `/root/.openclaw/workspace/MEMORY.md` — 主Agent的长期记忆（包含用户系统定位、核心认知等敏感上下文）
- `/root/.openclaw/workspace/USER.md` — 用户个人信息（姓名"长煦"、工作模式、核心原则等）
- 所有其他workspace（researcher、analyst、scout、coder、cron-worker）的 `SOUL.md`、`AGENTS.md`、`USER.md`

系统中存在6+个workspace（workspace、workspace-reviewer、workspace-researcher、workspace-analyst、workspace-scout、workspace-coder、workspace-cron-worker），但它们之间没有任何文件系统级隔离。任何子Agent可以读取任意其他Agent的全部文件，包括：
- 用户私人信息
- 决策记忆
- 系统认知（MEMORY.md中的"用户亲授最高优先级"内容）

**这不是理论风险，是实测证实的事实。**

### 三、API Failover机制审查

**结论：🟡 部分存在，不完整。**

- `ZhipuKeys` 模块从 `openclaw.json` 统一读取Key，有用途分组（embedding/multimodal/cron），有60秒缓存。但它是单源读取——如果智谱API整体宕机，没有自动切换到备选API提供商的机制。
- `error-handler.js` 提供了 `withDegradation(primary, fallback)` 函数，但这要求**调用方自行提供fallback函数**。没有基础设施级的多Provider自动failover。
- 57 Key的三层容灾（19 penguin + 19 boom + 19 zhipu）解决了Key级别的负载分散，但不解决Provider级别的整体故障。
- Event Bus有 `circuit-breaker.js`（速率限制+熔断），但这是防内部风暴的，不是API failover。

### 四、ISC规则冲突检测机制审查

**结论：🟡 有去重但无运行时冲突仲裁。**

- **创建时去重**：`check-rule-dedup.js` 实现了三维度语义去重（event交集→LLM深检condition+action等价性），且有 `batch-dedup-check.sh` 批量检查。质量可接受。
- **运行时冲突**：174条规则中，8个事件类型存在"热点"，最严重的是：
  - `isc.rule.matched` → 20条规则竞争
  - `isc.category.matched` → 20条规则竞争
  - `intent.ruleify` → 18条规则竞争
  - `isc.rule.created` → 11条规则竞争
  - `skill.general.created` → 8条规则竞争
- **没有发现运行时优先级/冲突仲裁机制**。当20条规则同时匹配同一个事件时，执行顺序和冲突解决依赖什么？未见文档或代码说明。

### 五、评测数据源污染风险审查

**结论：🟡 有分离意图但边界不够硬。**

- `c2-golden/` 目录下的 `mined-*.json` 文件（42个）标记了 `data_source: "real_conversation"`，且包含真实用户纠偏场景，数据质量高。
- `eval-stats.sh` 仅统计 `mined-*.json` 文件，已通过 `fix(eval-stats)` 提交移除了5个非mined文件到archive。
- **但**：同一 `tests/benchmarks/intent/` 目录树下同时存在：
  - `auto-generated-from-corrections.json` — 自动生成的数据
  - `c2-golden/gen-03.py` — Python数据生成脚本（内容为合成的"全局改名"场景）
  - `c2-golden/goodcases-split/` — 来源不明的goodcase拆分
- 污染路径：如果未来有人修改 `eval-stats.sh` 的glob或新增 `mined-` 前缀的合成文件，合成数据就会混入。**缺少硬性校验机制**（如数据签名、来源元数据强制校验）。

### 六、Cron任务健康审查

**结论：🔴 31%故障率，无自动恢复。**

16个Cron任务中5个处于error状态（31%）：
1. 能力同步与PDCA-每4小时
2. LEP-韧性日报-每日0900
3. CRAS-A-主动学习引擎
4. CRAS-D-战略调研
5. 运维辅助-清理与向量化-综合

没有发现针对Cron任务持续失败的自动恢复或告警升级机制。韧性层的handler熔断和DLQ机制没有覆盖到Cron任务层。

### 七、密钥安全审查

**结论：🟡 架构合理，一处隐患。**

- 正面：ZhipuKeys从 `openclaw.json` 统一读取，不硬编码Key。Evolver的 `sanitize.js` 有主动脱敏（清洗API keys/tokens/secrets/paths）。`prompt.js` 有硬编码秘钥禁令。
- **隐患**：`a2aProtocol.js` 中 `A2A_NODE_SECRET` 的fallback是 `getNodeId()`——当环境变量未设置时，HMAC签名使用Node ID作为密钥。Node ID通常是确定性/可预测的值，这使得资产发布签名可被伪造。
- `.gitignore` 中没有针对敏感文件（`.env`、`*.key`、`*.pem`、`*.secret`）的过滤规则。虽然当前未发现此类文件存在，但缺少预防性gitignore。

---

## 已识别风险清单（按严重度排序）

| # | 严重度 | 风险项 | 影响 | 当前状态 |
|---|--------|--------|------|---------|
| 1 | 🔴 严重 | **Workspace身份隔离不存在** — 任何子Agent可读取所有workspace的私密文件（MEMORY.md、USER.md） | 用户隐私泄露、跨Agent信息污染、恶意子Agent可获取全部系统认知 | 已验证，无缓解 |
| 2 | 🔴 高 | **韧性层零生产验证** — 全部heal/DLQ/alert日志均为测试数据，无生产触发记录；auto-recovery自身MODULE_NOT_FOUND | 韧性层可能是"纸面韧性"——代码存在但从未在真实故障中生效 | 需生产验证 |
| 3 | 🔴 高 | **Cron任务31%故障率无自动恢复** — 5/16任务持续error，无告警升级 | 能力同步、学习引擎、战略调研、向量化等关键子系统静默失效 | 未修复 |
| 4 | 🟡 中 | **ISC 174条规则无运行时冲突仲裁** — 8个事件热点（最高20条竞争），无优先级/互斥/冲突检测 | 规则执行顺序不可预期，多条规则可能产生矛盾动作 | 有去重无仲裁 |
| 5 | 🟡 中 | **A2A_NODE_SECRET fallback弱密钥** — 无环境变量时用Node ID做HMAC密钥 | 资产发布签名可伪造 | 需强制环境变量 |
| 6 | 🟡 中 | **API Provider级failover缺失** — 单Provider故障无自动切换 | 智谱API整体宕机时系统停摆 | 有Key级分散，无Provider级容灾 |
| 7 | 🟡 中 | **评测数据硬边界缺失** — 合成脚本与真实数据共处一目录，无签名/强制来源校验 | 未来可能合成数据混入benchmark导致评测失真 | 有软分离(命名约定)，无硬隔离 |
| 8 | 🟢 低 | **路径命名不一致** — 质量报告引用 `l3-pipeline/` 但实际为 `resilience/` | 审计验证失败，文档与实际脱节 | 命名纠正即可 |
| 9 | 🟢 低 | **.gitignore无敏感文件过滤** — 缺少 `.env`/`*.key`/`*.pem` 的预防性规则 | 未来可能意外提交敏感文件 | 预防性措施 |

---

## 条件/建议

### 放行条件（必须在Day3前完成）

1. **[P0] Cron故障修复或降级处理** — 5个error状态任务必须修复或有意识地禁用+记录原因。31%静默故障不可接受。
2. **[P0] 韧性层生产接入验证** — 需证明resilience模块确实在生产event-bus路径中被调用（非仅测试），修复 `pipeline-auto-recovery.log` 中的 `MODULE_NOT_FOUND`。

### 强烈建议（Day3范围内排期）

3. **[P1] Workspace隔离方案** — 至少实现以下之一：
   - 文件系统级权限隔离（chown/chmod per workspace）
   - 应用层沙箱（子Agent进程chroot或namespace）
   - 最低限度：MEMORY.md、USER.md 加密或移出共享文件系统
4. **[P1] ISC规则运行时冲突仲裁** — 为20条规则竞争的事件热点建立优先级排序+互斥声明+冲突检测告警。
5. **[P1] A2A_NODE_SECRET强制化** — 移除 `getNodeId()` fallback，无环境变量时应拒绝签名而非使用弱密钥。

### 建议（Day3-4逐步改进）

6. **[P2] API Provider级failover** — 在ZhipuKeys或上层封装中实现Provider级自动切换（智谱→OpenAI→本地模型）。
7. **[P2] 评测数据硬隔离** — 将 `gen-03.py` 和合成数据移出 `c2-golden/`，或在eval-stats中增加 `data_source` 强制校验。
8. **[P2] .gitignore安全加固** — 添加 `*.env`、`*.key`、`*.pem`、`*.secret` 预防性过滤。
9. **[P2] 路径命名统一** — 将文档/报告中的 `l3-pipeline` 引用统一为 `resilience`。

---

*「盾」席结语：Day2的韧性层在代码层面是认真写的——错误分类精细、重试策略合理、降级路径完整、死信队列和熔断器齐全。但"写了"不等于"有效"。全部运维日志只有测试数据、auto-recovery自身MODULE_NOT_FOUND、31%的Cron静默故障——这些事实说明韧性层目前更像是"精心建造但从未通电的防火系统"。最严重的是workspace零隔离——这不是架构遗留，这是安全事故等待发生。有条件放行，但上述P0条件不满足前，Day2不应宣告完成。*
