# 全系统闭环诊断 Part 2：孤儿检测 + 硬编码扫描 + Cron审计

> 生成时间：2026-03-03 04:17 CST
> 执行者：Scout 情报专家

---

## A. 孤儿检测结果

### A1. 空壳技能（有目录无代码）

| 技能名 | 文件数 | 有SKILL.md | 有代码 | 建议 |
|--------|--------|------------|--------|------|
| capability-anchor | 1 | Y | ❌ NONE | 🔴 仅有SKILL.md，无任何实现代码。建议删除或补充实现 |
| paths-center | 1 | Y | ❌ NONE | 🔴 仅有SKILL.md，无任何实现代码。建议删除或补充实现 |
| evomap-uploader | 614 | N | ❌ NONE | 🟡 614个JSON数据文件（gene/capsule），无SKILL.md无代码。实际是数据存储目录，不是技能。建议重命名为data目录或归档 |

### A2. ISC规则引用了但不存在的技能/目标

ISC规则目录共有 **82个规则文件**。通过规则内容分析，ISC规则主要以声明式描述为主，引用的技能目标与现有技能目录基本匹配。以下为发现的异常引用：

| 规则/引用 | 引用内容 | 状态 | 说明 |
|-----------|----------|------|------|
| ISC rules → `charglm-video` | 技能引用 | ❌ 不存在 | 规则引用了不存在的技能 `charglm-video` |
| ISC rules → `charglm-voice` | 技能引用 | ❌ 不存在 | 规则引用了不存在的技能 `charglm-voice` |
| ISC rules → CRAS insight command | `cd /root/.openclaw/workspace/skills/cras && node index.js --insight` | ⚠️ 路径硬编码 | 路径写死在规则JSON中 |

### A3. DTO订阅了但不存在的目标

DTO共有 **68个订阅文件**，覆盖ISC规则订阅和向量化事件订阅。分析发现：

| 订阅 | 目标 | 状态 | 说明 |
|------|------|------|------|
| `sub-vectorization-*` (6个) | `/root/.openclaw/workspace/infrastructure/vector-service/vectorize.sh` | ✅ 存在 | 向量化脚本存在 |
| `seef-skill-registered` | `seef` 技能的 `evaluator` 子技能 | ⚠️ 待验证 | seef存在但evaluator子技能需确认运行时可达性 |
| `isc-$rule.json` | 文件名异常 | 🔴 异常 | 订阅文件名包含 `$` 符号，疑似模板变量未展开 |
| 所有ISC订阅 | 各ISC规则 | ✅ 大部分匹配 | 规则文件均存在 |

---

## B. 硬编码问题

### B1. 硬编码路径

共发现 **40+处** 绝对路径硬编码，分布在以下文件中：

| 文件 | 行号 | 硬编码内容 | 风险等级 |
|------|------|-----------|----------|
| `system-monitor/log-peaks.sh` | 3,5 | `/root/.openclaw/workspace/logs/system-monitor-peaks/` | 🟡 中 |
| `system-monitor/index.js` | 17-19 | `/root/.openclaw/cron/jobs.json`, `/root/.openclaw/agents/main/sessions`, `/root/.openclaw/workspace` | 🟡 中 |
| `feishu-report-sender/send.sh` | 5-6 | `/root/.openclaw/workspace/feishu_send_queue`, `feishu_sent_cards` | 🟡 中 |
| `feishu-report-sender/cron-send.sh` | 5-6 | 同上 | 🟡 中 |
| `feishu-report-sender/index.js` | 12-16,76 | 多个队列/报告路径 | 🟡 中 |
| `feishu-report-sender/push.js` | 10-11 | 发送队列路径 | 🟡 中 |
| `pdca-engine/index.js` | 26,84,107,129 | 记忆路径、技能路径、CAPABILITY-ANCHOR.md | 🟡 中 |
| `lep-executor/src/daily-report-glm5.js` | 14,45,378 | workspace路径、secrets路径、feishu队列 | 🔴 高（包含secrets路径） |
| `lep-executor/src/daily-report.js` | 13 | workspace根路径 | 🟡 中 |
| `lep-executor/src/send-daily-report.js` | 11,98 | workspace根路径 | 🟡 中 |
| `isc-core/bin/skill-usage-audit.sh` | 16,37 | 技能目录、cron目录 | 🟡 中 |
| `isc-core/bin/isc-rule-created-hook.sh` | 5-7,34 | 规则目录、标准目录、DTO事件路径 | 🟡 中 |
| `isc-core/bin/evomap-auto-sync-executor.js` | 12-14 | uploader路径、技能路径、registry路径 | 🟡 中 |
| `isc-core/bin/n023-executor.js` | 11-13 | 技能路径、AEO路径 | 🟡 中 |
| `isc-core/bin/skill-health-prober.js` | 12,202 | 技能路径、CRAS信号路径 | 🟡 中 |
| `isc-core/bin/isc-distribution-center.js` | 12-18 | 标准路径、DTO/CRAS/SEEF路径 | 🟡 中 |
| `isc-core/bin/audit-rules.sh` | 10 | ISC核心目录 | 🟡 中 |
| `isc-core/bin/isc-validator.js` | 11 | 标准路径 | 🟡 中 |
| `isc-core/bin/isc-dto-alignment-checker.js` | 12-15 | 规则/标准多个路径 | 🟡 中 |

**建议**：创建统一的 `paths.js` 或环境变量配置，集中管理所有路径。当前 `paths-center` 技能虽有SKILL.md但无代码实现——正是这个用途。

### B2. 硬编码API Key

| 文件 | 行号 | Key类型 | 建议 |
|------|------|---------|------|
| `lep-executor/src/daily-report-glm5.js` | 40-57 | ZHIPU_API_KEY_3（从secrets文件读取） | 🟡 实现尚可，但secrets文件 `/root/.openclaw/.secrets/zhipu-keys.env` **不存在** |
| `cogview/index.js` | 10-11 | ZHIPU_API_KEY（从env读取） | ✅ 正确做法 |
| `glm-video/index.js` | 14 | ZhipuKeys.getKey('vision') | ✅ 使用密钥管理器 |
| `glm-ocr/index.js` | 14 | ZhipuKeys.getKey('vision') | ✅ 使用密钥管理器 |
| `glm-image/index.js` | 13 | ZhipuKeys.getKey('vision') | ✅ 使用密钥管理器 |
| `glm-4v/index.js` | 13 | ZhipuKeys.getKey('vision') | ✅ 使用密钥管理器 |
| `glm-asr/index.js` | 114 | apiKey（来源未明） | 🟡 需确认密钥来源 |
| `evolver/src/evolve.js` | 294 | 检查 `GEMINI_API_KEY` 环境变量 | ✅ 仅检查不硬编码 |
| `evolver/src/gep/sanitize.js` | 9 | sk-格式的正则清理 | ✅ 安全清理逻辑 |
| `feishu-evolver-wrapper/feishu-helper.js` | 5 | sk-ant-api03格式正则 | ✅ 安全过滤逻辑 |
| `isc-core/services/zhipu_embedding.py` | 17,46 | api_key参数传入 | ✅ 参数化 |

**关键发现**：`/root/.openclaw/.secrets/zhipu-keys.env` **不存在**！只有 `github.env`。`daily-report-glm5.js` 会因此失败。

### B3. 硬编码模型/Provider

| 文件 | 行号 | 内容 | 建议 |
|------|------|------|------|
| `lep-executor/src/daily-report-glm5.js` | 27 | `glm-5` | 🔴 **已导致错误** - Cron报告 "no access to model glm-5" |
| `parallel-subagent/index.js` | 273,394 | `kimi-coding/k2p5` | 🟡 应可配置 |
| `parallel-subagent/index-v2.js` | 11 | `kimi-coding/k2p5` | 🟡 应可配置 |
| `isc-core/extract_templates.js` | 20,57 | `kimi-coding/k2p5` | 🟡 应可配置 |
| `agent-mode-enforcer/index.cjs` | 193 | `kimi-coding` (文本引用) | ✅ 仅文本描述 |
| `glm-4v/index.js` | 15 | `glm-4.6v` | 🟡 模型版本硬编码 |
| `glm-vision/index.js` | 13 | `glm-4v-plus` | 🟡 模型版本硬编码 |
| `seef/.../phase3-integration-test.js` | 40 | `glm-5` | 🟡 测试代码，风险较低 |
| `dto-core/core/declarative-parallel-orchestrator.js` | 13 | `kimi-coding/k2p5` | 🟡 应可配置 |
| `dto-core/lib/adaptive-scheduler.js` | 153 | `kimi` (注释引用) | ✅ 仅注释 |
| `dto-core/lib/executor.js` | 224 | `kimi-coding/k2p5` | 🟡 应可配置 |
| `aeo/src/core/cron-model-selector.cjs` | 43 | `kimi-coding/k2p5` | 🟡 作为默认值尚可 |
| `aeo/evaluation-sets/fix-test-cases.cjs` | 13 | `glm-5-coder` | 🟡 测试代码 |
| `cras/index.js` | 74,75,139,900 | `kimi_search`/`kimi_fetch` (工具名引用) | ✅ 工具引用非硬编码 |

**关键问题**：`glm-5` 模型硬编码直接导致 LEP韧性日报 Cron任务持续报错 (HTTP 403)。

---

## C. Cron审计

### C1. 任务清单与健康度

共 **27个Cron任务**，全部 enabled=true。

| # | 任务名 | 频率 | 脚本/命令 | 路径存在 | 最近运行状态 | 连续错误 | 输出价值 |
|---|--------|------|-----------|----------|-------------|----------|----------|
| 1 | ClawHub-Skills-批量安装 | 每日13:00 | cat日志 + ls | ✅ | ✅ ok | 0 | 🟡 低（仅检查安装进度） |
| 2 | CRAS-A-主动学习引擎 | 每日09:00 | cras/index.js --learn | ✅ | 🔴 error | **3** | 🔴 持续超时(600s)，完全失效 |
| 3 | CRAS-B-用户洞察分析-每日 | 每日21:00 | cras/index.js --insight | ✅ | ✅ ok | 0 | ✅ 正常运行 |
| 4 | CRAS-C-知识治理 | 每6小时 | cras/index.js --govern | ✅ | ✅ ok | 0 | ✅ 正常运行 |
| 5 | CRAS-E-自主进化 | 每日02:00 | cras/index.js --evolve | ✅ | 🔴 error | 1 | 🟡 delivery失败 |
| 6 | DTO-Declarative-Orche... | 每小时 | dto-core/declarative-orchestrator.js | ✅ | ✅ ok | 0 | ✅ 核心编排 |
| 7 | OpenClaw-自动备份-0700 | 每日07:00 | scripts/backup.sh | ✅ | 🔴 error | **2** | 🟡 写文件失败 |
| 8 | OpenClaw-自动备份-1900 | 每日19:00 | scripts/backup.sh | ✅ | ✅ ok | 0 | ✅ 正常 |
| 9 | System-Monitor-健康检查 | 每小时 | `/root/.openclaw/skills/system-monitor/index.js` | **❌ 路径错误** | 🔴 error | **2** | 🔴 路径写错（少了workspace） |
| 10 | CRAS-洞察复盘-每周 | 周一三五18:00 | cras/modules/insight-enhancer.js | **❌ 路径错误** | ✅ ok（?） | 0 | 🟡 实际文件在cras/insight-enhancer.js而非modules/ |
| 11 | Elite-Memory-记忆整理 | 每日22:00 | `elite-longterm-memory/init.sh` | **❌ 不存在** | 🔴 error | 1 | 🔴 技能目录已删除，任务失效 |
| 12 | ISC-技能使用审计 | 每日20:00 | isc-core/bin/skill-usage-audit.sh | ✅ | ✅ ok | 0 | ✅ 正常运行 |
| 13 | 全局自主决策流水线 | 每30分钟 | dto-core/global-auto-decision-pipeline.js | ✅ | 🔴 error | **3** | 🔴 delivery.to未设置 |
| 14 | 飞书会话实时备份 | 每30分钟 | feishu-chat-backup/index.js | ✅ | ✅ ok | 0 | ✅ 正常 |
| 15 | 能力锚点自动同步 | 每4小时 | isc-capability-anchor-sync/index.js | ✅ | ✅ ok | 0 | ✅ 正常 |
| 16 | LEP-韧性日报 | 每日09:00 | lep-executor/src/daily-report.js | ✅ | 🔴 error | **2** | 🔴 glm-5模型无权限 (403) |
| 17 | System-Monitor-峰值记录 | 每4小时 | system-monitor/log-peaks.sh | ✅ | 🔴 error | 1 | 🟡 delivery.to未设置 |
| 18 | Elite-Memory-重新评估 | 每月1日 | systemEvent | ✅ | ✅ ok | 0 | ✅ 正常 |
| 19 | 统一向量化服务 | 每6小时 | infrastructure/vector-service/vectorize.sh | ✅ | ✅ ok | 0 | ✅ 正常 |
| 20 | 系统维护-每日清理 | 每日02:00 | scripts/system-maintenance.sh | ✅ | ✅ ok | 0 | ✅ 正常 |
| 21 | Gateway内存监控增强-v2 | 每小时 | scripts/gateway-monitor-v2.sh | ✅ | ⏭️ skipped | 0 | 🟡 被跳过(disabled?) |
| 22 | 会话文件自动清理 | 每小时 | scripts/session-cleanup.sh | ✅ | ⏭️ skipped | 0 | 🟡 被跳过(disabled?) |
| 23 | CRAS-四维意图洞察仪表盘 | 每6小时 | cras/cron_entry.py | ✅ | ✅ ok | 0 | ✅ 正常，有delivery |
| 24 | EvoMap-Evolver-自动进化 | 每4小时 | `evolver/run.sh` | **❌ 不存在** | 🔴 error | 1 | 🔴 脚本不存在 |
| 25 | CRAS-D-战略调研 | 每日10:00 | cras/index.js --research | ✅ | ✅ ok | 0 | ✅ 正常 |
| 26 | AEO-DTO闭环衔接 | 每小时 | aeo/src/core/aeo-dto-bridge.cjs | ✅ | ✅ ok | 0 | ✅ 正常 |
| 27 | N023-自动生成评测标准 | 每日06:00 | isc-core/bin/n023-executor.js | ✅ | ✅ ok | 0 | ✅ 正常 |
| 28 | PDCA-C执行引擎 | 每4小时 | pdca-engine/index.js | ✅ | ✅ ok | 0 | ✅ 正常 |
| 29 | 流水线健康监控 | 每4小时 | dto-core/pipeline-auto-recovery.js | ✅ | ✅ ok | 0 | ✅ 正常 |

### C2. 失效任务汇总

| 任务名 | 失效原因 | 严重度 | 建议 |
|--------|----------|--------|------|
| **CRAS-A-主动学习引擎** | 持续超时(600s)，连续3次错误 | 🔴 高 | 优化执行逻辑或增加超时时间；命令中包含kimi_search工具调用在cron隔离环境中不可用 |
| **System-Monitor-健康检查** | 路径错误：`/root/.openclaw/skills/` 应为 `/root/.openclaw/workspace/skills/` | 🔴 高 | 修正路径 |
| **Elite-Memory-记忆整理** | `elite-longterm-memory/init.sh` 技能目录不存在 | 🔴 高 | 技能已删除，禁用此Cron任务 |
| **LEP-韧性日报** | `glm-5` 模型无访问权限 (HTTP 403) | 🔴 高 | 更换为可用模型或从配置读取模型名 |
| **全局自主决策流水线** | `delivery.to` 未设置，连续3次错误 | 🔴 高 | 设置 `delivery.to` 或改为 `mode: "none"` |
| **EvoMap-Evolver-自动进化** | `/root/.openclaw/workspace/evolver/run.sh` 不存在 | 🔴 高 | 创建脚本或修正入口路径 |
| **OpenClaw-自动备份-0700** | 写文件失败，连续2次错误 | 🟡 中 | 检查/tmp权限或备份逻辑 |
| **CRAS-E-自主进化** | delivery失败 | 🟡 中 | 检查飞书delivery通道 |
| **System-Monitor-峰值记录** | `delivery.to` 未设置 | 🟡 中 | 设置delivery目标 |
| **Gateway内存监控增强-v2** | 状态skipped(disabled) | 🟡 低 | 确认是否故意禁用，若是则设enabled=false |
| **会话文件自动清理** | 状态skipped(disabled) | 🟡 低 | 同上 |
| **CRAS-洞察复盘-每周** | insight-enhancer.js路径可能错误 | 🟡 中 | 文件实际在`cras/insight-enhancer.js`而非`cras/modules/insight-enhancer.js` |

### C3. Cron资源消耗评估

| 维度 | 数据 | 评估 |
|------|------|------|
| 总任务数 | 27个（全enabled） | 🔴 过多，部分任务功能重叠 |
| 每小时触发 | ~6-8个任务 | 🟡 较密集 |
| 使用Opus模型 | 24/27个任务使用 `claude-opus-4-6-thinking` | 🔴 **严重浪费** - 大部分任务是执行脚本，不需要顶级推理模型 |
| 无效消耗 | 至少6个任务持续失败仍在运行 | 🔴 每次执行消耗token但无产出 |
| 功能重叠 | CRAS有5个子任务 + 意图仪表盘、DTO有2个编排任务 | 🟡 考虑合并 |

---

## 总结：关键发现

### 🔴 P0 - 立即修复

1. **6个Cron任务持续失败**（CRAS-A、System-Monitor、Elite-Memory、LEP日报、全局决策、EvoMap进化）
2. **glm-5模型无权限** - 硬编码在daily-report-glm5.js中
3. **System-Monitor路径错误** - 少了`/workspace`
4. **Elite-Memory技能已删除** - Cron仍在调度

### 🟡 P1 - 尽快处理

5. **40+处路径硬编码** - `paths-center`技能应实现为路径配置中心
6. **evomap-uploader** - 614个文件的数据目录被当作技能
7. **2个空壳技能**（capability-anchor、paths-center）
8. **ISC引用不存在的技能**（charglm-video、charglm-voice）
9. **DTO订阅文件名异常**（isc-$rule.json）
10. **zhipu-keys.env不存在** - daily-report-glm5.js的secrets文件缺失

### 🟢 P2 - 后续优化

11. **Cron模型降级** - 脚本执行类任务不需要opus级别模型
12. **kimi-coding/k2p5硬编码** - 分布在5+个文件中
13. **Cron任务合并** - 减少总数和频率
14. **skipped任务清理** - Gateway监控和会话清理应明确enabled=false
