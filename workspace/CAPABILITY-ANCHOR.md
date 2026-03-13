# 系统能力锚点 — 三层架构
# 手动维护 — 禁止自动覆盖

> **更新时间**: 2026/3/13 15:37
> **维护方式**: 手动优化 + Plugin注入（计划中）
> **核心原则**: 不允许关键词/正则做意图识别，LLM失败返回unknown

---

## 第一层：基础能力

### 多模态（智谱API）

| 能力 | 模型 | 输入 | 调用方式 |
|------|------|------|----------|
| 语音识别(ASR) | glm-asr | audio | `curl zhipu API, model=glm-asr` |
| 语音合成(TTS) | glm-tts | text | skills/glm-tts/ |
| OCR文字识别 | glm-ocr | image/pdf | skills/glm-ocr/ |
| 图片理解 | glm-4v / glm-vision | image | skills/glm-4v/ |
| 视频理解 | glm-4v | video | skills/glm-4v/ |
| 图片生成 | glm-image / cogview | text | skills/glm-image/ |
| 视频生成 | glm-video / cogvideo | text/image | skills/glm-video/ |

### 搜索与信息获取

| 能力 | 工具 | 状态 |
|------|------|------|
| AI搜索 | tavily-search | ✅ 可用 |
| 网页搜索 | web_search (Brave) | ✅ OpenClaw原生 |
| 网页抓取 | web_fetch | ✅ URL→markdown |

### 记忆系统（MemOS）

| 能力 | 工具 | 说明 |
|------|------|------|
| 记忆搜索 | memory_search | 搜索历史对话 |
| 记忆写入 | memory_write_public | 写入公共记忆，跨Agent可见 |
| 记忆上下文 | memory_timeline | 展开记忆命中点上下文 |
| 任务摘要 | task_summary | 获取完整任务上下文 |
| 技能检索 | skill_search / skill_get | 搜索和获取已验证技能 |

### 文档与通讯（飞书）

| 能力 | 工具 | 说明 |
|------|------|------|
| 文档读写 | feishu_doc | 读/写/追加飞书文档 |
| 多维表格 | feishu_bitable_* | 读写Bitable |
| 知识库 | feishu_wiki | 知识空间操作 |
| 云盘 | feishu_drive | 文件/文件夹管理 |
| 消息发送 | message send | 发送飞书消息 |
| 文件发送 | message send + filePath | 发送文件给用户 |

### 系统工具

| 工具 | 用途 |
|------|------|
| ffmpeg/ffprobe | 音视频转码/探测 |
| playwright | 浏览器自动化 |
| pandoc | 文档格式转换 |
| sqlite3 | 数据库操作 |
| git | 版本控制 |
| python3 (3.12) | Python脚本 |
| node (v22) | Node.js脚本 |
| curl/wget | HTTP请求/下载 |

---

## 第二层：Agent资源

### Agent清单（19个）

| 角色 | 主Agent | 备份 | 职责 |
|------|---------|------|------|
| 调度中枢 | main | — | **只调度不执行** |
| 分析师 | analyst | analyst-02 | 根因分析、诊断、评估、复盘 |
| 开发者 | coder | coder-02 | 代码开发、实现、重构、修复 |
| 研究员 | researcher | researcher-02 | 调研、研究、信息收集 |
| 审查员 | reviewer | reviewer-02 | 代码审查、质量验收 |
| 侦察兵 | scout | scout-02 | 快速扫描、信息探测、健康检查 |
| 写手 | writer | writer-02 | 文档撰写、报告生成 |
| 定时工 | cron-worker | cron-worker-02 | 定时任务执行 |
| 通用工 | worker-03 | worker-04, worker-05, worker-06 | 溢出任务池 |

**合法agentId白名单（共19个）**：main, researcher, researcher-02, coder, coder-02, reviewer, reviewer-02, writer, writer-02, analyst, analyst-02, scout, scout-02, cron-worker, cron-worker-02, worker-03, worker-04, worker-05, worker-06

### 委派规则

1. **spawn必须传agentId** — 不传会回落到main
2. **spawn禁止传model参数** — 让agent走自己的provider链
3. **任务类型→Agent映射**：分析→analyst / 研究→researcher / 开发→coder / 审查→reviewer / 扫描→scout / 文档→writer
4. **主备切换**：主Agent忙/失败→切-02备份

### Provider配置

| Provider | 模型 | 用途 |
|----------|------|------|
| claude-main | claude-opus-4-6-thinking | main调度 |
| claude-researcher | claude-opus-4-6-thinking | researcher |
| claude-coder | claude-opus-4-6-thinking | coder |
| boom-main | gpt-5.3-codex | main备选 |
| boom-researcher | gpt-5.3-codex | researcher备选 |
| zhipu-cron-worker | glm-5 | cron任务（⚠️网络不稳） |

---

## 第三层：系统机制

### Plugin Hook（运行时拦截）

| Hook | 能力 | 状态 |
|------|------|------|
| before_prompt_build | 注入能力清单/意图到prompt | ❌ 未建 |
| before_tool_call | 阻断工具调用（强制委派） | ❌ 未建 |
| subagent_spawning | 子Agent启动前注入记忆 | ❌ 未建 |
| message_sending | 消息发送前拦截 | ❌ 未建 |

**已安装Plugin**：memos-local-openclaw-plugin（记忆系统）

### ISC规则引擎（197条）

| 类别 | 数量 |
|------|------|
| pipeline-benchmark | 8 |
| intent-* | ~10 |
| isc-skill/rule | 7 |
| pdca-* | 8 |
| 其他 | ~164 |

### Cron定时任务（34个）

| 频率 | 关键任务 |
|------|----------|
| 每1分钟 | git-sensor |
| 每3分钟 | check-stale-tasks |
| 每5分钟 | cron-dispatch, api-probe, git-auto-push, correction-harvester |
| 每10分钟 | alert-rootcause, threshold-scanner, sync-shared-rules |
| 每30分钟 | pipeline-auto-recovery, seef-event-bridge |
| 每小时 | day-completion-scanner |
| 每日 | evalset, cras-daily, research-harvester, evolution-report |
| 每周 | weekly-evolution, theory-to-rule, dead-skill-detector |

### 事件总线

- 核心：bus.js + circuit-breaker + condition-evaluator
- 传感器：git-sensor、threshold-scanner
- 桥接：cron-dispatch-runner、seef-event-bridge

---

## 铁律（来源：SOUL.md + IRONCLAD.md + AGENTS.md + 用户铁令）

### 意图与识别
1. **不允许关键词/正则做意图识别** — LLM失败返回unknown，绝不猜
2. **IC1-IC5是评测难度，不是意图类型**
3. **ISC意图规则不能删** — 缺的是上游识别能力

### 委派与执行
4. **main只调度不执行** — exec≥3次必须spawn；修改型命令即使1次也禁止
5. **spawn必须传agentId**
6. **spawn禁止传model参数**
7. **spawn后原子三连**：spawn → register-task.sh → board-event-hook.sh
8. **completion后必须执行** completion-handler.sh → 质量核查 → 回复用户
9. **直接指令直接执行** — "派人/去修复/删掉"→直接派发，禁止反问
10. **评测角色分离** — 执行者≠评测者
11. **子Agent完成→必须质量审计**

### 设计原则
12. **反熵增** — 每次变更让系统更清晰
13. **可扩展** — 架构必须是生成式的，不是枚举式的
14. **规则全链路展开** — 感知+执行+验真+文档，4项不全=未完成

### 记忆与安全
15. **记忆写入不扭曲原意**
16. **飞书密钥不脱敏**（仓库不公开）
17. **禁止cron膨胀** — 新检查项归入PDCA

### 元规则
18. **本文档是Plugin注入的数据源**
19. **hook注入Plugin本身也在能力清单中**
20. **本文档禁止被cron自动覆盖**
