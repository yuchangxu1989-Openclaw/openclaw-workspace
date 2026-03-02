# 全系统闭环诊断 Part 3：AEO深度审计 + 文档vs代码一致性

**诊断时间**: 2026-03-03 04:18 GMT+8  
**诊断范围**: AEO深度审计、用户反馈收录机制、文档vs代码一致性

---

## A. AEO深度审计

### A1. AEO完整结构概览

AEO当前为 v2.0.7（Phase 2 双轨运营版），文件结构完整度较高：

```
skills/aeo/
├── aeo.cjs                              # Phase 1 MVP入口
├── check.cjs                            # 准入检查
├── build-sandbox.sh                     # 沙盒构建脚本
├── config/                              # 配置（aeo-config, checklist, dto-subscriptions）
├── src/
│   ├── evaluation/                      # ✅ 核心评测引擎（8个文件）
│   │   ├── selector.cjs                 # 轨道选择器
│   │   ├── ai-effect-evaluator.cjs      # AI效果评测器
│   │   ├── function-quality-evaluator.cjs # 功能质量评测器
│   │   ├── executor.cjs                 # 执行器
│   │   ├── scheduler.cjs               # 调度器
│   │   └── scorer.cjs                   # 评分器
│   ├── core/                            # 核心组件（5个文件）
│   │   ├── aeo-dto-bridge.cjs           # DTO桥接
│   │   ├── registry-manager.cjs         # 评测集注册管理
│   │   ├── notification-sender.cjs      # 通知发送
│   │   ├── thinking-content-manager.cjs # 思维内容管理
│   │   └── cron-model-selector.cjs      # 定时模型选择
│   ├── dashboard/                       # 仪表盘（5个文件）
│   │   ├── feishu-card-renderer.cjs     # 飞书卡片渲染
│   │   ├── realtime-monitor.cjs         # 实时监控
│   │   ├── trend-chart.cjs              # 趋势图
│   │   ├── alert-notifier.cjs           # 告警通知
│   │   └── data-api.cjs                 # 数据API
│   ├── sandbox/                         # 沙盒执行（5个文件）
│   │   ├── container-pool.cjs           # 容器池管理
│   │   ├── process-sandbox.cjs          # 进程沙盒
│   │   ├── sandbox-runtime.js           # 沙盒运行时
│   │   ├── memory-guardian.cjs          # 内存守护
│   │   └── Dockerfile                   # 沙盒镜像
│   ├── remediation/                     # 自动整改
│   │   └── auto-remediation-loop.cjs    # 整改闭环
│   └── aeo-integration.cjs             # 集成入口
├── evaluation-sets/                     # 评测集（30+个技能目录）
├── unified-evaluation-sets/             # 统一评测集（迁移后）
├── reports/                             # 评测报告
├── logs/                                # 日志
└── bin/migrate-evaluation-sets.cjs      # 评测集迁移工具
```

**总计**: 29个源码文件（不含node_modules），30+个评测集，结构成熟度较高。

---

### AI效果运营 vs 功能质量运营区分
- **状态：✅ 已实现**
- **详情**：
  - `selector.cjs` 实现轨道自动选择，按技能类型映射：
    - `llm/chat/generation` → AI效果轨道（置信度 0.95）
    - `tool/workflow/automation` → 功能质量轨道（置信度 0.95）
    - `hybrid/agent` → 混合轨道（置信度 0.8）
  - `ai-effect-evaluator.cjs` 评测维度：相关性(25%)、连贯性(20%)、有用性(25%)、创造性(15%)、安全性(15%)
  - `function-quality-evaluator.cjs` 评测维度：准确性(30%)、响应时间(20%)、错误率(25%)、兼容性(15%)、稳定性(10%)
  - `aeo-dto-bridge.cjs` 实现DTO事件驱动的轨道自动选择
  - 测试套件 `test-dual-track.cjs` 16/16通过
  - **迁移工具** `bin/migrate-evaluation-sets.cjs` 自动按AI效果/功能分类存放
- **不足**：混合轨道（hybrid）的评测逻辑较粗放，未见对混合技能的精细化权重调整机制

### 评测集管理
- **状态：✅ 基本完善**
- **详情**：
  - `evaluation-sets/` 覆盖 30+ 个技能，包括CRAS自动生成的评测集（`cras-generated-*`）
  - `unified-evaluation-sets/` 统一注册表（`registry.json`），支持按技能/轨道/标准三维索引
  - `registry-manager.cjs` 实现评测集的注册、索引、查询
  - 标准级别分为：golden（黄金标准）、standard（标准）、experimental（实验）
- **不足**：实际注册的统一评测集仅3个（weather, chat-bot, file-tool），与30+个旧格式评测集的迁移率低

### 评测结果自动入库
- **状态：⚠️ 部分实现**
- **详情**：
  - `registry-manager.cjs` 有 `_saveRegistry()` 和 `_saveTestCasesToFile()` 方法，将评测集持久化到文件
  - `thinking-content-manager.cjs` 有 `storeThinking()` 方法存储思维过程
  - `alert-notifier.cjs` 有 `_saveHistory()` 保存告警历史
  - `reports/` 目录存有JSON和TXT格式的评测报告
- **不足**：
  - ❌ 无向量数据库入库（仅文件持久化）
  - ❌ 无结构化历史趋势数据库
  - ❌ 评测结果不与ISC标准演进联动

### 沙盒测试
- **状态：✅ 已实现（代码完整，运行未验证）**
- **详情**：
  - `src/sandbox/` 完整沙盒体系：
    - `container-pool.cjs` - Docker容器池管理，预创建容器池
    - `process-sandbox.cjs` - 进程级沙盒隔离
    - `sandbox-runtime.js` - 容器内运行时
    - `memory-guardian.cjs` - 内存使用监控与自动释放
    - `Dockerfile` - 沙盒镜像定义
    - `build-sandbox.sh` - 构建脚本
  - 支持内存压力自动响应（90%释放、80%缩减）
- **不足**：
  - ⚠️ 未见Docker镜像实际构建记录，可能从未在生产中运行
  - ⚠️ `build-sandbox.sh` 是否执行过需要进一步验证

### 多模块变更自动回归
- **状态：❌ 未实现**
- **详情**：
  - `auto-remediation-loop.cjs` 有回归测试步骤定义（`{ action: 'test', description: '回归测试' }`），但仅为策略声明
  - `unified-evaluation-sets/registry.json` 有"常规回归测试"描述
  - DTO的 `declarative-orchestrator.js` 有文件变更检测触发R005/R009机制
  - **但**：无跨模块变更自动触发受影响模块回归的完整机制
  - **但**：变更检测 → 评测集选择 → 评测执行 → 报告的自动化链路不完整

---

## B. 用户反馈收录

### 收录机制
- **状态：⚠️ 有框架，未成闭环**
- **详情**：
  - **CRAS模块B**（用户洞察分析中枢）声明了反馈闭环能力：
    - "用户反馈自动关联到优化建议验证"
    - 四维意图洞察仪表盘
    - 每30分钟异步分析用户交互
    - 意图分类：query, command, feedback, exploration
  - **AEO入口** `aeo.cjs` 有 `feedback()` 方法，支持手动收录反馈
  - **飞书聊天备份** `feishu-chat-backup` 保存原始聊天记录
  - **管道反馈文件** `.pipeline-feedback.jsonl` 记录管道级反馈
- **关键缺陷**：
  - ❌ 无主动从用户对话中提取问题/痛点的自动化机制
  - ❌ CRAS-B的"反馈闭环"仅为SKILL.md声明，实际代码中未见自动关联逻辑
  - ❌ 反馈未分类（功能bug vs 体验问题 vs 需求建议）
  - ❌ 反馈与AEO评测、SEEF优化之间无自动联动

### 来源覆盖评估
| 来源 | 状态 | 说明 |
|------|------|------|
| 系统内部自动发现 | ⚠️ 部分 | CRAS有扫描框架，SEEF有发现器，但自动化程度低 |
| 用户洞察 | ⚠️ 框架级 | CRAS-B声明了意图分析，但实际运行的用户反馈采集有限 |
| EvoMap | ❌ 未实现 | EvoMap A2A仅连接器，无从社区反向收集问题的机制 |
| CRAS | ⚠️ 部分 | CRAS-B用户洞察模块存在但闭环不完整 |
| ClawHub | ⚠️ 有入口 | evolver有ClawHub CLI集成（`clawhub update`），但仅用于更新，无反向反馈 |
| AEO评测结果 | ⚠️ 部分 | 评测报告生成但不自动转化为改进任务 |

---

## C. 文档vs代码一致性

### 审计汇总表

| 模块 | SKILL.md声明功能数 | 代码实现文件数 | 一致率 | 关键差距 |
|------|-------------------|---------------|--------|----------|
| **isc-core** | 6大能力 | 18个源文件 | 🟢 85% | 代码超出文档：额外包含skill-health-prober、evomap-auto-sync等未在SKILL.md提及的工具 |
| **dto-core** | 8项核心功能 | 47个源文件 | 🟢 80% | 代码丰富度远超文档；SKILL.md未充分描述declarative-parallel-orchestrator、pipeline-auto-recovery等高级功能 |
| **cras** | 5大模块(A-E) | 8个源文件 | 🟡 60% | 文档承诺过多：论文知识库、语义检索、向量化等声明完整但代码实现简化；cloud-storage模块仅有两个文件 |
| **seef** | 7大子技能 | 68个源文件 | 🟢 85% | Python子技能(7个)和JS子技能(5个cjs)并存，有冗余；evolution-pipeline大量测试代码但核心逻辑分散 |
| **lep-executor** | 3项核心功能 | 12个源文件 | 🟢 80% | 执行器N016/N017/N018已实现；daily-report为额外功能未在SKILL.md声明 |
| **aeo** | 5项Phase2功能 | 29个源文件 | 🟢 90% | 代码实现超出文档声明：dashboard(5文件)、sandbox(5文件)、remediation等在SKILL.md未充分描述 |
| **evomap-a2a** | 5个API方法 | 1个源文件 | 🟢 90% | 精简模块，文档与代码高度一致；但EvoMap Hub实际是否可连通未知 |
| **parallel-subagent** | 5项核心特性 | 2个源文件 | 🟡 70% | SKILL.md声明了连接池复用，但代码中import路径硬编码OpenClaw内部模块（sessions_spawn），实际调用链存疑 |

### 逐模块详情

#### ISC-CORE (v3.1.20)
- **SKILL.md声明**：6大能力（标准定义、标准生成、标准分发、反思改进、模板管理、版本控制）+ 血缘追踪 + 偏移检测 + 失效处理
- **代码实现**：
  - `index.js` - 大成版入口，融合USC+ISC-Core+SCNM
  - `core/version-change-publisher.js` - 版本变更发布
  - `core/isc-dto-alignment-engine.js` - ISC-DTO对齐引擎
  - `bin/` 下10个工具脚本（验证器、分发中心、健康探针等）
- **差距**：代码实现超出文档描述，特别是bin/目录的工具集未在SKILL.md充分说明

#### DTO-CORE (v3.0.11)
- **SKILL.md声明**：声明式任务定义、ISC规则订阅(6条)、命名对齐、DAG/Linear/Adaptive执行模式、多模态触发
- **代码实现**：
  - 5种触发器（cron, event, interval, conditional, webhook）
  - 3种引擎（DAG, Linear, Adaptive）
  - 丰富的核心组件（事件总线、资源调度、管道恢复等）
  - `lib/` 目录13个库文件
- **差距**：`platform-v3.js` 和许多lib组件功能未在SKILL.md充分暴露；构造函数拼写错误（`construdtor`）

#### CRAS (v1.1.0)
- **SKILL.md声明**：5大模块（主动学习、用户洞察、知识治理、战略行研、自主进化）
- **代码实现**：
  - `index.js` - 核心系统入口
  - `modules/` - 仅3个模块文件（first-principle-learning, vectorization-optimized, zhipu-embedding）
  - `cloud-storage/` - 2个文件（notion.js, feishu-doc.js）
  - `insight-enhancer.js` 和 `cras-b-fixed.js`
- **差距**：⚠️ SKILL.md承诺的5大模块在代码中高度简化，论文知识库和语义检索缺乏完整实现

#### SEEF (v3.0.3)
- **SKILL.md声明**：7大子技能（evaluator, discoverer, optimizer, creator, aligner, validator, recorder）+ PDCA闭环
- **代码实现**：
  - `seef.py` - Python主程序，完整导入7个子技能
  - `subskills/` - 8个Python文件（含evaluator_v2）
  - `sub-skills/` - 5个JS/CJS实现
  - `evolution-pipeline/` - 完整的JS管道系统（40+文件含测试）
- **差距**：Python和JS双实现体系并存，可能导致不一致；无统一index.js入口

#### LEP-EXECUTOR (v1.0.0)
- **SKILL.md声明**：统一执行接口、ISC规则执行、系统集成 + 韧性特性（重试、熔断、WAL日志、回滚）
- **代码实现**：
  - `src/core/LEPExecutor.js` - 核心执行器
  - `src/executors/` - 3个执行器（N016修复、N017复现模式、N018全局对齐）
  - `src/daily-report*.js` - 日报功能（3个文件）
  - `index.js` - 单例入口
- **差距**：日报功能未在SKILL.md声明但已实现

#### AEO (v2.0.7)
- **SKILL.md声明**：Phase 2三大组件（轨道选择器、AI效果评测器、功能质量评测器）
- **代码实现**：远超SKILL.md声明
  - 评测引擎（8文件）
  - 核心组件（5文件：DTO桥接、注册管理、通知、思维管理、定时选择）
  - 仪表盘（5文件：飞书卡片、实时监控、趋势图、告警、数据API）
  - 沙盒（5文件：容器池、进程沙盒、运行时、内存守护、Dockerfile）
  - 自动整改闭环
- **差距**：SKILL.md仅描述Phase 2核心，未更新以反映dashboard、sandbox、remediation等已实现模块

#### EVOMAP-A2A (v1.0.5)
- **SKILL.md声明**：5个API（connect, disconnect, send, publishGene, publishCapsule）+ 自动重连 + 消息队列
- **代码实现**：
  - `index.js` - 单文件实现，GEP-A2A协议完整封装
  - 包含消息类型定义、自动重连、心跳保活
- **差距**：代码与文档一致度高，但实际Hub连接能力未验证

#### PARALLEL-SUBAGENT
- **SKILL.md声明**：5项特性（信号量并发、连接池、失败重试、熔断器、优先级队列）
- **代码实现**：
  - `index.js` - v3.0实现，含完整的Semaphore、AgentPool、RetryPolicy、CircuitBreaker
  - `index-v2.js` - 旧版本保留
- **差距**：代码import依赖OpenClaw内部路径（`require('../../../../../.openclaw/extensions/openclaw-sessions')`），路径脆弱

---

## 总评与关键发现

### 🔴 高优先级问题

1. **多模块变更自动回归缺失**：变更检测存在但无法自动触发跨模块回归评测
2. **用户反馈闭环断裂**：CRAS-B声明的反馈闭环在代码中未完整实现
3. **评测集迁移率低**：30+旧格式评测集仅3个迁移到统一格式
4. **CRAS文档严重过度承诺**：5大模块声明但代码实现简化，一致率仅60%

### 🟡 中优先级问题

5. **AEO SKILL.md严重滞后**：代码已演进到包含dashboard/sandbox/remediation，但文档停留在Phase 2核心
6. **SEEF双实现体系**：Python和JS并存，无统一入口，维护成本高
7. **沙盒从未实际运行**：Docker容器池代码完整但无运行证据
8. **反馈来源单一**：仅有文件级持久化，无结构化反馈数据库

### 🟢 正面发现

9. **AEO双轨评测架构成熟**：AI效果/功能质量双轨自动选择已完整实现并通过测试
10. **ISC-CORE代码超出文档**：实际能力丰富（18个源文件），包含许多实用工具
11. **DTO-CORE实现丰富**：47个源文件，远超SKILL.md描述的能力
12. **评测集覆盖广**：30+个技能有对应评测集，包括CRAS自动生成的

---

**诊断结论**：系统代码实现能力普遍超出文档描述（代码 > 文档），但关键闭环链路（变更→回归、反馈→改进、评测→入库）仍有断裂。建议优先修复闭环断点，其次更新滞后文档。
