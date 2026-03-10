# 技能 local/public 分类清单（2026-03-07）

判定标准：**能不能不改一行代码给别人用？**
- 能：`public`
- 不能：`local`

说明：本次实际扫描到 `skills/` 顶层 60 个目录，其中 `skills/public/` 下 9 个子技能；去重后的实际技能对象共 **68 个**。用户提到“70个技能”，但当前目录实存为 68 个，以下按实存逐项分类。

## 完整清单

| 技能名 | 分类 | 判断依据 |
|---|---|---|
| aeo | public | `SKILL.md` 标注 `distribution: both`，接口与说明通用，未绑定单一用户身份；虽有本地报告/日志路径，但作为能力本体可直接复用。 |
| agent-mode-enforcer | public | 仅依赖 Node 内置模块和共享路径，输入输出清晰，可直接给别人用。 |
| anti-entropy-checker | public | 通用文本/规则/技能文档检查器，CLI 输入是文本或路径，无特定本地主体依赖。 |
| api | local | `distribution: internal`，且文档仅是“填补能力空白”骨架，泛化交付不完整。 |
| api-aggregator | public | 并发 API 聚合是通用能力，无本地账号、固定用户或私有环境强绑定。 |
| architecture-review-pipeline | local | 默认 reviewer agentId（如 `caijuedian-tribunal`）依赖当前工作区技能生态与 sessions 约定，换环境通常不能即用。 |
| capability-anchor | local | `distribution: internal` 且 `status: placeholder`，明确是本环境能力锚点占位修复件，不能直接售卖。 |
| cogvideo | public | 只要求传入/配置 API Key，能力边界清晰，第三方可直接接入。 |
| cogview | public | 只依赖智谱 API Key，调用方式标准化，可直接复用。 |
| convert-helper | local | 自动生成的极简占位技能，只有 `run()` 骨架，没有足够可售化说明与稳定契约。 |
| cras | public | `distribution: both`；虽然含本地知识与队列目录，但作为“认知进化中枢”本体有完整结构和可迁移设计。 |
| cras-generated-1771827136412 | local | `distribution: internal`，CRAS 自动生成的“填补能力空白”占位技能，能力不完整。 |
| cras-generated-1771827197478 | local | 同上，自动生成内部占位件，不能直接给外部即用。 |
| cras-generated-1772042431830 | local | 同上。 |
| cras-generated-1772128853925 | local | 同上。 |
| daily-ops-report | local | 强绑定 `/root/.openclaw/...` 本机运行数据源、cron、subagents、系统命令，离开当前环境不能零改动使用。 |
| lto-core | public | `distribution: both`，虽系统级复杂，但能力边界、接口、配置结构完整，可作为通用编排平台复用。 |
| etl | local | `distribution: internal`，仅能力空白骨架，不是成品。 |
| evolver | public | 明确声明 environment-agnostic，可通过环境变量/注入适配，且有完整 README、配置、协议与许可证。 |
| evomap-a2a | public | `distribution: both`，WebSocket 连接器能力通用，只需 Hub 地址等配置即可复用。 |
| evomap-publisher | public | `distribution: both`，发布器职责清晰，可通过 本地任务编排/SEEF 输入复用，未锁死单用户。 |
| evomap-uploader | local | 本质是当前仓库的发布产物存储目录，不是可执行成品技能。 |
| feishu-card-sender | local | 文档还是 TODO 骨架，虽然有代码文件，但未形成外部可直接使用的成品契约。 |
| feishu-chat-backup | local | `distribution: internal`，且用途是备份本地飞书聊天记录到本仓库目录，强环境绑定。 |
| feishu-common | local | 仅骨架文档，未达到可直接交付给他人的成品程度。 |
| feishu-evolver-wrapper | local | `distribution: internal`，明确服务于“Master's environment”，并绑定本地 watchdog/Feishu 报告环境。 |
| feishu-report-sender | local | `distribution: internal`，写死读取当前工作区 CRAS/EvoMap 队列并推送飞书，强依赖本地目录结构。 |
| file-downloader | public | 通用下载器，接口清晰，无内部环境依赖。 |
| five-layer-event-model | public | 通用事件分层模型与检查能力，可对任意事件数据应用。 |
| github-api | public | 标准 GitHub API 客户端，只需 `GITHUB_TOKEN`，可直接给别人使用。 |
| glm-4v | public | 只依赖智谱 API 与 `zhipu-keys`/环境变量，能力清晰，可迁移。 |
| glm-image | public | 通用图像生成封装，可通过 API Key 直接复用。 |
| glm-ocr | public | 通用 OCR 技能，输入输出契约完整，无单环境耦合。 |
| glm-tts | public | 通用 TTS 封装，依赖 API Key，接口清晰。 |
| glm-video | public | 通用图生视频技能，零改代码即可在其他项目接入。 |
| glm-vision | public | 通用视觉理解技能，只需配置 API Key/模型。 |
| intent-design-principles | public | 虽源于内部原则，但已落成通用意图治理技能，CRUD/检查/报告接口明确。 |
| isc-capability-anchor-sync | local | `distribution: internal`，直接扫描当前 `skills/isc-core/rules/` 并输出当前工作区 `CAPABILITY-ANCHOR.md`，环境耦合明显。 |
| isc-core | public | `distribution: both`，作为标准中心机制完整，可移植为通用治理核心。 |
| isc-document-quality | public | `distribution: both`，文档质量评估标准化程度高，可直接用于他人仓库。 |
| isc-report-readability | public | 本质是通用重要报告写作钢印与检查模板，可直接复用。 |
| layered-architecture-checker | public | 面向任意技能目录/ISC 规则/设计文档的检查器，输入通用。 |
| lep-executor | public | `distribution: both`，是通用韧性执行中心；虽可桥接本地系统，但核心执行接口具备可迁移性。 |
| new-skill | local | `distribution: internal`，能力空白占位骨架。 |
| new-skill-v2 | local | 同上，仍是内部骨架。 |
| parallel-subagent | public | 明确写明 publishable、通用接口、可选依赖与注入式 sessions API，典型可外售技能。 |
| paths-center | local | `status: placeholder`，需求未清，明显不是可直接外售成品。 |
| pdca-engine | local | `distribution: internal`，围绕本系统每5分钟自运转产出，明显是本地运营机制。 |
| project-mgmt | local | `distribution: internal`，深度耦合裁决殿、AEO、当前角色池与内部流程，不是即插即用商品。 |
| public/convert-helper | local | 虽位于 `skills/public/`，但 `SKILL.md` 仍写 `distribution: internal`，且只是自动生成的极简能力件，外部即用价值不足。 |
| public/file-sender | public | 文档、CLI、API、错误排查、前置条件完整；只需飞书应用配置即可给别人直接用。 |
| public/glm-asr | public | `distribution: public`，配置方式清楚，可直接复用。 |
| public/caijuedian-tribunal | public | 明确 `distribution: publishable`，功能完整、测试完备、可直接调用。 |
| public/multi-agent-dispatch | public | 面向 ACP 的通用调度引擎，接口、状态机、示例齐全，可直接售卖。 |
| public/multi-agent-reporting | public | 通用多 Agent 汇报技能，和调度解耦，接口清晰。 |
| public/pdf-generator | public | PDF 生成流水线完整，输入输出与步骤清楚，适合直接复用。 |
| public/system-monitor | local | 虽在 `public/` 目录，但 `SKILL.md` 写 `distribution: internal`，且默认扫描“所有技能”与本地 Git/报告环境，强本仓库视角。 |
| public/tavily-search | public | `distribution: public`，只需 Tavily API Key，即可直接给他人使用。 |
| rule-hygiene | local | `distribution: agent-only`，且直接扫描当前 `skills/isc-core/` 和 本地任务编排 目录，属于本地治理工具。 |
| ruleify | public | 尽管源于内部方法论，但本体是通用“规则化程序化闭环”方法/脚手架，可直接用于他人系统。 |
| seef | public | `distribution: both`，技能生态进化工厂能力完整，可作为通用技能治理系统复用。 |
| shared | local | 文档已明确“非独立技能”“内部共享库”，不是可单独给别人用的成品。 |
| system-mapping-visualizer | local | `distribution: internal`，输入源直接绑定 OpenClaw/ISC/本地任务编排/CRAS/SEEF 体系与当前仓库路径。 |
| test-skill-for-seef | local | 测试专用示例技能，不是对外产品。 |
| verify-test-skill | local | 验证测试技能，骨架性质明显，不是对外成品。 |
| zhipu-image-gen | public | 通用智谱文生图封装，只需模型/API 能力即可复用。 |
| zhipu-keys | local | 仅骨架文档，且本质是当前环境的 Key 管理配套件，缺少可外售完成度。 |
| zhipu-vision | public | 通用图像理解技能，接口与模型边界明确，可直接复用。 |

## 汇总

- 实际扫描技能总数：**68**
- 判定为 `public`：**37**
- 判定为 `local`：**31**

## 可销售技能净数

按“`public` 才可销售”口径，**可销售技能净数 = 37**。
