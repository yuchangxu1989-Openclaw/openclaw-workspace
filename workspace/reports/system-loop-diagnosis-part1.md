# 全系统闭环诊断 Part 1：核心流水线调用链追踪

> 诊断时间: 2026-03-03 04:17 CST  
> 诊断者: 系统架构师 (researcher)  
> 方法论: 第一性原理 — 从源代码追踪实际调用链，区分"设计文档"与"可执行代码"

---

## 诊断摘要

| 模块 | 代码存在 | 可独立运行 | 闭环完整性 | 关键缺陷 |
|:-----|:--------:|:----------:|:----------:|:---------|
| ISC  | ✅ 有实码 | ⚠️ 部分 | ⚠️ 60% | 规则是JSON声明，执行依赖外部调用 |
| DTO  | ✅ 有实码 | ❌ 不可运行 | ⚠️ 40% | **`construdtor` 拼写错误**导致类无法实例化 |
| CRAS | ⚠️ 有框架 | ⚠️ 部分 | ⚠️ 30% | 学习引擎核心为模拟数据，非真实调用 |
| SEEF | ✅ 有实码 | ⚠️ 部分 | ⚠️ 50% | Python子技能完整，但JS pipeline测试缺依赖 |
| LEP  | ✅ 有实码 | ⚠️ 部分 | ⚠️ 55% | 核心执行器完整，但依赖parallel-subagent链路 |
| AEO  | ✅ 有实码 | ✅ 可运行 | ⚠️ 60% | 双轨选择器和评测器完整，整改闭环待验证 |
| 向量化 | ✅ 有实码 | ✅ 可运行 | ✅ 80% | shell脚本+智谱API实际可用，51个向量文件 |

---

## 1. ISC（智能标准中心）

### 设计意图（文档描述的）
- 自主决策规则、自动化检测标准、统一命名规范的**唯一管理源**
- 六大能力：标准定义、生成、分发、反思改进、模板管理、版本控制
- 78条规则（R001-R005决策规则 + N016-N036检测规则 + 命名/质量规则）
- ISC规则变更时自动通知DTO订阅

### 实际实现（代码中真正做到的）
- **规则存储**：✅ 78个JSON文件，结构规范（含id, name, domain, governance等字段）
- **规则创建闸门**：✅ `rule.isc-creation-gate-001.json` 定义了准入校验规则（命名/schema/governance）
- **ISC-DTO对齐引擎**：✅ `core/isc-dto-alignment-engine.js` — 扫描ISC规则目录，自动生成DTO订阅
- **版本变更发布器**：✅ `core/version-change-publisher.js` — 监听版本变更，发布到GitHub/EvoMap
- **ISC index.js**：✅ 完整的ISC核心类（~80+行），定义R001-R005决策规则的阈值和动作
- **bin工具集**：✅ isc-validator.js, isc-dto-alignment-checker.js, isc-file-watcher.js, isc-smart-creator.js 等
- **向量化集成**：✅ `services/zhipu_embedding.py` — 真实智谱API调用

### 闭环状态
- 与上游模块的连接（CRAS洞察→规则生成）：⚠️ 部分 — CRAS报告存在，但无自动转规则的代码管道
- 与下游模块的连接（规则→DTO订阅）：✅ 实现 — alignment-engine + rule-created-listener 双重机制
- 准入校验：⚠️ 部分 — 规则定义了creation-gate，但执行依赖**Agent读取JSON判断**而非代码自动拦截
- 准出校验：❌ 未实现 — 无代码级强制校验

### 关键断点
1. **准入校验是声明式的**：`rule.isc-creation-gate-001.json` 描述了"文件名必须符合xxx"，但没有Git hook或CI阻止不合规文件入库
2. **规则执行依赖Agent上下文**：ISC规则本质是JSON配置，需要Agent在会话中读取并遵循，而非代码自动强制执行
3. **CRAS→ISC反馈断裂**：没有代码将CRAS洞察自动转化为ISC规则提案

---

## 2. DTO（声明式任务编排中心）

### 设计意图（文档描述的）
- 声明式任务编排平台，支持DAG/Linear/Adaptive三种执行模式
- ISC规则全自动订阅执行（R001-R007及独立规则）
- 多模态触发机制（Temporal/Eventual/Manual/Conditional/ISC Rule）
- 支持未来800个任务的可扩展架构

### 实际实现（代码中真正做到的）
- **核心框架**：✅ `index.js` (~430行) — DTOPlatform类，含registerTask/execute/validateTask等方法
- **执行引擎**：✅ DAGEngine/LinearEngine/AdaptiveEngine 三个引擎实现
- **事件总线**：✅ `core/event-bus.js` — 基于EventEmitter的事件发布/订阅
- **ISC订阅机制**：✅ `subscriptions/` 目录含73个订阅JSON文件，覆盖大部分ISC规则
- **ISC监听器**：✅ `core/isc-rule-created-listener.js` — 监听新规则并自动订阅
- **ISC-DTO对齐器**：✅ `core/isc-dto-aligner.js` — 诊断并修复对齐问题
- **握手响应器**：✅ `core/dto-auto-handshake-responder.js` — 自动响应ISC通知
- **全局决策流水线**：✅ `core/global-auto-decision-pipeline.js` (~100+行) — Git变更检测+自动触发
- **触发器**：✅ cron/interval/event/webhook/conditional 五种触发器
- **AEO-DTO桥接**：✅ `aeo-dto-bridge.cjs` 在AEO侧实现了监听逻辑

### 闭环状态
- 与上游模块的连接（ISC规则→DTO订阅）：✅ 实现 — 73个订阅文件+自动对齐引擎
- 与下游模块的连接（DTO调度→SEEF/AEO/LEP执行）：⚠️ 部分 — 事件总线架构存在，但**实际调度尚未运行**
- 准入校验：❌ — 无任务准入校验代码
- 准出校验：❌ — 无任务执行结果校验代码

### 关键断点 🔴
1. **致命Bug — `construdtor` 拼写错误**：
   - `index.js:25` 和 `platform-v3.js:7,145,176` 中 `constructor` 拼写为 `construdtor`
   - **这意味着 DTOPlatform 类无法正确实例化**，所有属性初始化都不会执行
   - `new DTOPlatform()` 创建的对象是空的，调用任何方法都会报错
   - **这是整个系统最严重的单点故障**
2. **事件总线是进程内的**：EventBus基于Node.js EventEmitter，只在同一进程内有效。跨进程/跨模块通信依赖文件系统（JSONL事件文件），无实时性
3. **订阅文件是静态的**：73个订阅JSON只是声明"要订阅"，但没有常驻进程持续监听并执行
4. **缺少任务定义文件**：`tasks/` 目录存在但未检查内容——DAG编排的核心是任务定义文件，但文档中的YAML示例可能没有对应的真实task文件

---

## 3. SEEF（技能生态进化工厂）

### 设计意图（文档描述的）
- 七大独立子技能：Evaluator, Discoverer, Optimizer, Creator, Aligner, Validator, Recorder
- 两种模式：固定闭环模式（7步顺序）、自由编排模式（任意组合）
- 所有运行必须满足"标准合规"与"调度许可"双重条件
- DTO EventBus集成 + PDCA闭环状态机

### 实际实现（代码中真正做到的）

#### Python子技能（主体）
| 子技能 | 文件 | 行数 | 实际功能 |
|:-------|:-----|:----:|:---------|
| evaluator | evaluator.py | 182 | ✅ 文件完整性+文档结构+标准符合性检查，ISC标准检查**为模拟返回** |
| discoverer | discoverer.py | 669 | ✅ 目录扫描+能力覆盖分析+冗余检测，DTO EventBus集成 |
| optimizer | optimizer.py | 895 | ✅ 修复方案生成逻辑 |
| creator | creator.py + creator_v2.py | 920 | ✅ 新技能原型生成 |
| aligner | aligner.py | 872 | ✅ 全局标准化对齐 |
| validator | validator.py | 856 | ✅ 三重达标验证 |
| recorder | recorder.py | 689 | ✅ 进化知识库记录 |

#### JS进化流水线（附加）
- **pipeline-engine.js**：✅ 完整的流水线引擎，含ISC校验+EvoMap上传+状态机
- **isc-validator.js**：✅ 四维度质量评分（基础完整性40%、标准合规30%、内容准确20%、扩展完整10%）
- **state-machine.js, error-handler.js, watcher.js, trigger.js**：✅ 辅助模块完整
- **测试文件**：❌ 缺少@jest/globals依赖，测试无法运行

#### 主入口
- **seef.py**：✅ 完整的PDCA状态机 + DTOEventBus集成 + 七步流水线编排

### 闭环状态
- 与上游模块的连接（ISC标准→SEEF校验）：⚠️ 部分 — ISC校验器存在，但evaluator中标准检查**返回模拟数据**
- 与下游模块的连接（SEEF→DTO事件发布）：⚠️ 部分 — EventBus是**文件写入式**（写JSON到events/目录），非实时
- 准入校验：⚠️ 部分 — evaluator有文件检查，但ISC阈值为硬编码模拟值
- 准出校验：⚠️ 部分 — validator有三重检查逻辑，但实际标准来源不是动态读取ISC

### 关键断点
1. **ISC标准检查为模拟值**：evaluator._check_standard_compliance() 返回 `{'status': 'passed', 'compliance_score': 0.85}`，没有真正读取ISC规则
2. **EventBus为文件系统模拟**：SEEF的DTOEventBus写入JSON文件到`events/`目录，但没有消费者持续读取这些事件
3. **测试基础设施缺失**：evolution-pipeline的JS测试缺少jest依赖，无法验证代码正确性
4. **Python与JS双轨并存**：子技能用Python实现，进化流水线用JS实现，两者并行但缺少统一入口

---

## 4. CRAS（认知进化伙伴）

### 设计意图（文档描述的）
- 五大模块：主动学习引擎、用户洞察分析、知识治理、战略行研、自主进化
- Agent领域前沿学术论文学习
- 结合系统状态生成主动优化建议
- 知识向量化入库（智谱 Embedding-3）

### 实际实现（代码中真正做到的）
- **index.js**：✅ 完整的CRAS核心类，含ActiveLearningEngine/UserInsightHub等模块
- **学习引擎**：⚠️ 框架存在，但`crawlSource()`返回`requiresExternalSearch: true`——**等待外部搜索工具注入**
- **被动学习**：⚠️ 框架存在，但文件解析仅`fs.readFileSync`
- **洞察报告**：✅ `reports/` 目录含24+份洞察报告（2026-02-26至2026-03-02连续产出）
- **向量化模块**：✅ `modules/zhipu-embedding.js` — 真实智谱API调用，HTTP原生实现
- **向量化优化**：✅ `modules/vectorization-optimized.js` 存在
- **第一性原理学习**：✅ `modules/first-principle-learning.js` 存在
- **云存储集成**：✅ `cloud-storage/feishu-doc.js`, `notion.js` 存在

### 闭环状态
- 与上游模块的连接（外部数据→CRAS学习）：⚠️ 部分 — 框架完整但核心学习函数依赖外部工具注入
- 与下游模块的连接（CRAS洞察→ISC/SEEF）：⚠️ 部分 — 洞察报告**以文件形式存在**，但无自动推送到ISC的代码管道
- 准入校验：❌ — 无学习内容质量校验
- 准出校验：❌ — 无洞察质量校验

### 关键断点
1. **学习引擎是空壳**：`crawlSource()` 不调用任何API，返回"待搜索"的模拟数据。实际学习依赖Agent在会话中手动调用web_search
2. **洞察→规则断裂**：CRAS产出了24+份洞察报告，但没有代码自动分析报告并生成ISC规则提案
3. **24份报告的产出方式存疑**：考虑到学习引擎是模拟的，这些报告可能是由Agent会话手动生成，而非CRAS代码自主产出
4. **优化建议系统仅为JSON模板**：SKILL.md中描述的recommendation格式是设计文档，代码中未找到实际的建议生成和匹配逻辑

---

## 5. LEP（韧性执行中心）

### 设计意图（文档描述的）
- 全局统一韧性任务执行引擎
- 四层架构：API层→编排层→执行层→恢复层→可观测层
- 复用parallel-subagent的韧性核心
- N016/N017/N018三个ISC规则专用执行器

### 实际实现（代码中真正做到的）
- **LEPExecutor核心**：✅ `src/core/LEPExecutor.js` (~150+行) — 完整的执行器类
  - 复用 `parallel-subagent` 的 CircuitBreaker, RetryPolicy, AgentPool
  - 自定义 TimeoutManager, ConnectionPool 适配器
  - ResilienceCore + ISCRuleEngine + ObservabilityManager + RecoveryBridges
  - WAL(预写日志)支持
- **N016修复循环执行器**：✅ `src/executors/n016-repair-loop.js` — 扫描可修复问题+执行修复
- **N017重复模式根治器**：✅ `src/executors/n017-recurring-pattern.js` — 分析48小时事件+CRAS集成
- **N018全局引用对齐器**：✅ `src/executors/n018-global-alignment.js` — 技能改名时全局引用替换
- **base执行器**：✅ `src/executors/base.js` — 含日志、通知（飞书）、风险校验

### 闭环状态
- 与上游模块的连接（DTO调度→LEP执行）：⚠️ 部分 — LEP代码`require('../dto-core/global-auto-decision-pipeline')`存在，但是注释掉的
- 与下游模块的连接（LEP结果→CRAS/ISC反馈）：⚠️ 部分 — N017有CRAS集成代码（`require(crasPath)`），但路径可能不存在
- 准入校验：⚠️ 部分 — base执行器有风险校验逻辑
- 准出校验：⚠️ 部分 — N018有验证步骤（无import错误检查）

### 关键断点
1. **parallel-subagent依赖链**：LEPExecutor `require('../../../parallel-subagent/index.js')` — 相对路径，对目录结构敏感
2. **DTO集成被注释**：N016中 `// const scanner = require('../../dto-core/global-auto-decision-pipeline');` 被注释
3. **CRAS集成路径硬编码**：N017中 `require(crasPath)` 的crasPath可能不正确
4. **缺少集成测试**：三个执行器有实际逻辑，但没有自动化测试验证

---

## 6. AEO（智能体效果运营系统）

### 设计意图（文档描述的）
- Phase 2 双轨运营：AI效果轨道 + 功能质量轨道
- 自动选择评测轨道
- 与DTO闭环衔接
- 自动整改闭环

### 实际实现（代码中真正做到的）
- **轨道选择器**：✅ `src/evaluation/selector.cjs` — 基于技能类型自动选择轨道，含代码分析和描述分析
- **AI效果评测器**：✅ `src/evaluation/ai-effect-evaluator.cjs` — 五维评分（相关性/连贯性/有用性/创造性/安全性）
- **功能质量评测器**：✅ `src/evaluation/function-quality-evaluator.cjs` — 五维评分（准确性/响应时间/错误率/兼容性/稳定性）
- **AEO-DTO桥接器**：✅ `src/core/aeo-dto-bridge.cjs` — 监听DTO信号触发评测
- **自动整改闭环**：✅ `src/remediation/auto-remediation-loop.cjs` — 6种修复策略（代码质量/测试覆盖/性能/安全/配置/依赖）
- **仪表盘组件**：✅ 飞书卡片渲染器、实时监控器、趋势图表、告警通知器
- **沙箱运行时**：✅ `src/sandbox/` — 进程隔离、容器池、内存守护
- **评测集**：✅ `evaluation-sets/` 和 `unified-evaluation-sets/` 目录存在
- **测试结果**：✅ 16/16通过（SKILL.md声称）

### 闭环状态
- 与上游模块的连接（DTO信号→AEO评测）：⚠️ 部分 — aeo-dto-bridge存在但依赖文件系统信号
- 与下游模块的连接（AEO结果→SEEF/ISC）：⚠️ 部分 — bridge有outputResults()但实际写入逻辑需验证
- 准入校验：✅ — 轨道选择器有置信度阈值
- 准出校验：⚠️ 部分 — 评测有通过/不通过判定，但整改结果验证待确认

### 关键断点
1. **DTO信号依赖文件系统**：aeo-dto-bridge的subscribe()读取`/root/.openclaw/workspace/.dto-signals/{topic}.json`，非实时事件
2. **评测器可能需要LLM**：AI效果评测的"相关性""连贯性"评分可能需要LLM判断，代码中是否有实际调用待验证
3. **整改闭环的"执行"步骤**：auto-remediation-loop定义了策略模板，但实际修复动作（如"运行lint并修复"）可能需要外部工具支持

---

## 7. 向量化能力

### 设计意图（文档描述的）
- 统一向量化服务，使用智谱Embedding API
- 覆盖技能、知识、记忆、AEO评测集
- 支持全量/增量/清理模式

### 实际实现（代码中真正做到的）
- **shell入口**：✅ `vectorize.sh` — 完整的向量化脚本，支持--continuous/--cleanup/--check-missing等模式
- **搜索脚本**：✅ `search.sh` 存在
- **维护脚本**：✅ `vector-maintenance.sh` + `cron-vectorize.sh` 存在
- **智谱Embedding模块**：✅ `cras/modules/zhipu-embedding.js` — 原生https调用智谱API，2048维embedding-3模型
- **ISC向量化**：✅ `isc-core/services/zhipu_embedding.py` 存在
- **实际向量数据**：✅ `vectors/` 目录含51个向量文件（memory/AEO/pipeline相关）
- **日志和备份**：✅ 日志和备份目录存在

### 闭环状态
- 与上游模块的连接（技能变更→自动向量化）：⚠️ 部分 — ISC规则rule.auto-vectorization-trigger-001定义了触发条件，cron脚本存在
- 与下游模块的连接（向量→语义检索）：⚠️ 部分 — search.sh存在，但具体检索效果未验证
- 准入校验：✅ — vectorize.sh有文件类型和目录过滤
- 准出校验：⚠️ 部分 — 有--check-missing模式检查遗漏

### 关键断点
1. **向量存储是文件系统**：向量以JSON文件存储在vectors/目录，非向量数据库（如Milvus/Qdrant），检索效率受限
2. **检索精度未验证**：虽然有search.sh，但实际的top-k检索准确率未测试
3. **cron-vectorize.sh是否配置为定时任务**：脚本存在但是否在crontab中实际注册未知

---

## 8. 跨模块集成点扫描

### 实际require/import关系图

通过grep代码中的require/import（排除node_modules），发现以下**真实代码级依赖**：

| 调用方 | 被调用方 | 方式 | 状态 |
|:-------|:---------|:-----|:-----|
| LEPExecutor | parallel-subagent | `require('../../../parallel-subagent/index.js')` | ✅ 实际调用 |
| LEP N016 | dto-core pipeline | `// require('../../dto-core/...')` | ❌ **被注释** |
| LEP N017 | CRAS | `require(crasPath)` | ⚠️ 动态路径 |
| LEP base | feishu-chat-backup | `require('../../feishu-chat-backup')` | ⚠️ 通知 |
| AEO bridge | DTO信号 | 文件系统读取 `.dto-signals/` | ⚠️ 文件级 |
| ISC alignment | DTO subscriptions | 文件写入 `subscriptions/` | ⚠️ 文件级 |
| SEEF EventBus | DTO事件 | 文件写入 `events/` | ⚠️ 文件级 |
| DTO index | 内部引擎 | `require('./engines/...')` | ✅ 实际调用 |

### 关键发现

1. **无直接的模块间代码调用**：除LEP→parallel-subagent外，所有跨模块通信都通过**文件系统**（JSON/JSONL文件），而非直接require/import
2. **ISC-DTO对齐**是通过定期扫描文件系统实现的，而非事件驱动的实时同步
3. **SEEF→DTO**的EventBus是"写文件"模式，没有消费者进程持续读取
4. **DTO无法实例化**：construdtor拼写错误导致DTOPlatform无法正确构造，所有基于DTO框架的调度能力事实上**完全瘫痪**

---

## 9. 实际调用链图（ASCII）

```
                           ┌──────────────────────────────────────────────────┐
                           │           系统实际调用链诊断图                     │
                           │      ━━━ 实线=已实现  ┄┄┄ 虚线=仅设计            │
                           └──────────────────────────────────────────────────┘

   ┌─────────┐   文件扫描    ┌─────────┐   文件写入    ┌─────────┐
   │  ISC    │━━━━━━━━━━━━━▶│  DTO    │┄┄┄┄┄┄┄┄┄┄┄┄▶│  SEEF   │
   │ 78规则  │  alignment   │ 73订阅  │  EventBus    │ 7子技能  │
   │ JSON    │  engine      │ ⚠️BUG   │  (文件级)    │ Python  │
   └────┬────┘              └────┬────┘              └────┬────┘
        │                       │                        │
        │ 规则JSON              │ 文件信号               │ 文件写入
        │ (无自动)              │ .dto-signals/          │ events/
        ▼                       ▼                        ▼
   ┌─────────┐              ┌─────────┐              ┌─────────┐
   │  CRAS   │┄┄┄┄┄┄┄┄┄┄┄┄│  AEO    │┄┄┄┄┄┄┄┄┄┄┄┄│ EvoMap  │
   │ 洞察报告 │  (无管道)    │ 双轨评测 │  (无管道)    │ A2A连接 │
   │ 24份    │              │ 选择器✅ │              │ WS客户端│
   └────┬────┘              └────┬────┘              └─────────┘
        │                       │
        │ (无)                  │ (无)
        ▼                       ▼
   ┌─────────┐              ┌─────────┐
   │  LEP    │━━━━━━━━━━━━━▶│parallel │
   │ 韧性层  │  require()   │-subagent│
   │ N016-18 │              │ 熔断/重试│
   └────┬────┘              └─────────┘
        │
        │ shell调用
        ▼
   ┌─────────┐
   │ 向量化  │
   │ 智谱API │
   │ 51文件  │
   └─────────┘


   连接类型统计：
   ━━━ 真实代码级调用 (require/import): 2条
       - LEP → parallel-subagent
       - ISC alignment-engine → DTO subscriptions (文件写入)
   
   ┄┄┄ 文件系统级通信: 4条
       - ISC → DTO (JSON文件扫描)
       - DTO → AEO (信号文件)
       - SEEF → DTO (事件文件)
       - DTO → SEEF (设计中，未实现)
   
   ╳ 完全断裂: 3条
       - CRAS → ISC (洞察→规则：无管道)
       - AEO → SEEF/ISC (评测→改进：无管道)
       - DTO → LEP (调度→执行：注释掉)
```

---

## 10. 总结与优先修复建议

### 🔴 P0 — 立即修复（系统无法运行）

1. **DTO construdtor 拼写错误**
   - 文件：`dto-core/index.js:25`, `platform-v3.js:7,145,176`
   - 影响：DTOPlatform类**无法实例化**，整个调度中枢瘫痪
   - 修复：`construdtor` → `constructor`（4处）

### 🟡 P1 — 尽快修复（闭环断裂）

2. **建立常驻进程或事件循环**
   - 当前所有模块都是"被调用"型（需要手动执行），没有常驻进程监听事件
   - 建议：至少为DTO建立一个cron任务或daemon，定期执行对齐/调度/检测

3. **CRAS→ISC反馈管道**
   - 当前：CRAS产出洞察报告MD文件，ISC不读取
   - 建议：创建一个轻量脚本，扫描CRAS报告→提取actionable insights→生成ISC规则提案

4. **SEEF ISC校验器实际化**
   - 当前：evaluator._check_standard_compliance() 返回模拟值
   - 建议：接入ISC真实规则文件进行实际校验

### 🟢 P2 — 中期优化（提升健壮性）

5. **统一跨模块通信机制**
   - 当前：文件系统JSON → 无实时性、无可靠性保证
   - 建议：至少建立一个简单的消息队列（SQLite WAL或Redis pub/sub）

6. **补全自动化测试**
   - SEEF evolution-pipeline缺少jest依赖
   - DTO核心逻辑无测试覆盖
   - LEP执行器无集成测试

7. **向量存储升级**
   - 从文件系统JSON升级到轻量向量数据库（如SQLite-VSS或LanceDB）

---

> **核心诊断结论**：系统架构设计**宏伟且完整**（ISC管规则、DTO管调度、CRAS管学习、SEEF管进化、LEP管容错、AEO管质量），但实际运行层面存在三个根本性问题：
> 1. **DTO无法实例化**（construdtor bug），调度中枢瘫痪
> 2. **模块间通信依赖文件系统**，无实时事件驱动能力
> 3. **缺少常驻进程**，所有闭环都需要手动触发或Agent会话驱动
>
> 系统目前的运行模式是："Agent在会话中读取各模块SKILL.md，理解设计意图，手动执行对应操作"——本质上是**Agent作为人肉编排器**，而非代码自动编排。
