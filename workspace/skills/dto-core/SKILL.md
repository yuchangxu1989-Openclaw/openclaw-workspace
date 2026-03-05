---
name: dto-core
description: DTO (Declarative Task Orchestration) v3.0.11 - 可扩展任务调度平台，支持声明式任务编排、多模态触发、自适应执行，ISC规则全自动订阅执行，Git全仓库跟踪
version: "2.1.1"
status: active
layer: core
abbreviation: DTO
full_name: Declarative Task Orchestration
chinese_name: 声明式任务编排中心
tags: [dto, orchestration, scheduling, dag, adaptive, event-driven, declarative, isc-subscription, auto-execution, git-tracking]
author: OpenClaw DTO
created_at: 2026-02-23
updated_at: 2026-02-28
---

# DTO 声明式任务编排中心 v3.0.3

distribution: both


## 定位

**声明式任务编排中心** — 用户描述"意图"，DTO 负责"如何执行"。

**ISC规则全自动订阅执行** — DTO自动扫描并订阅所有ISC规则（R001-R007及独立规则），100%全自动执行，无需人工干预。

## 核心抽象

### 1. 任务定义（Task Definition）

```yaml
id: skill-evolution-pipeline
intent: "技能全生命周期管理"

triggers:
  - type: cron
    spec: "0 2 * * *"
  - type: event
    source: isc.standard.verified
    condition: "skill.status == 'candidate'"

workflow:
  nodes:
    - id: create
      action: seef.creator.generate
      
    - id: test-functional
      action: seef.validator.functional
      dependsOn: [create]
      
    - id: test-performance
      action: seef.validator.performance
      dependsOn: [create]
      
    - id: test-security
      action: seef.validator.security
      dependsOn: [create]
      
    - id: fix-issues
      action: seef.optimizer.autoFix
      dependsOn: [test-functional, test-performance, test-security]
      condition: "any(tests.status == 'failed')"
      
    - id: final-verify
      action: seef.validator.full
      dependsOn: [fix-issues]
      
    - id: deploy
      action: isc.registry.publish
      dependsOn: [final-verify]
      requiresConfirmation: true

constraints:
  - standard: quality.md.coverage
    threshold: 80
  - standard: security.vulnerability
    severity: critical
```

### 2. ISC规则订阅（v3.0.1新增）

DTO订阅ISC标准规则，确保代码变更时自动执行标准检查：

| 规则ID | 规则名称 | 触发时机 | 执行动作 |
|:---|:---|:---|:---|
| **R001** | auto_skillization | skill_quality_score >= 50 | 触发自动技能化管道 |
| **R002** | auto_vectorization | skill_md_exists AND not_vectorized | 触发bge-m3向量化 |
| **R003** | auto_evomap_sync | skill_updated AND published | 仅已发布技能同步到EvoMap |
| **R004** | auto_fix_high_severity | severity == HIGH | 执行自动修复 |
| **R005** | skill_md_sync | code_change AND critical_logic | 检查SKILL.md同步 |
| **R006** | global_sync_on_standard_update | standard_update | 存量数据全局同步 |
| **S005** | report_feishu_card_format | report_generation | 飞书卡片格式标准 |
| **auto_response** | security_quality_auto_response | security_issue_detected | 安全质量自动响应 |
| **N008** | cron_failure_notification | cron_job_failed | Cron失败通知 |

### 3. 核心功能模块（v3.0.1新增）

#### 3.1 ISC规则订阅系统
- **initializeISCSubscriptions()**: 初始化6条ISC规则订阅
- **handleSkillMdSync()**: R005处理，代码变更时检查SKILL.md同步
- **handleGlobalSync()**: R006处理，标准更新时触发存量数据全局同步

#### 3.2 命名对齐检查
- **performNamingAlignment()**: 检查信号/模块名称是否符合ISC-NAMING-CORE
- **自动修正**: 发现不一致时自动修正为标准缩写+中文名格式

#### 3.3 工作流调度引擎
- **DAG模式**: 并行执行、动态分支、失败重试
- **Linear模式**: 顺序执行、无分支
- **Adaptive模式**: LLM动态决策、人机协同

### 4. 执行模式（Execution Modes）

| 模式 | 适用场景 | 特征 |
|:---|:---|:---|
| **DAG** | 默认 | 并行执行、动态分支、失败重试 |
| **Linear** | 简单场景 | 顺序执行、无分支 |
| **Adaptive** | 探索性任务 | LLM 动态决策、人机协同 |

### 4. 触发机制（Trigger Mechanisms）

| 类型 | 说明 |
|:---|:---|
| **Temporal** | 时间触发（cron、interval、delay） |
| **Eventual** | 事件触发（ISC 标准变更、CRAS 洞察、外部 webhook） |
| **Manual** | 人工触发（CLI、API、UI） |
| **Conditional** | 条件触发（状态满足、阈值突破） |
| **ISC Rule** | 规则触发（ISC R001-R005规则订阅） |

## 架构原则

### 1. 声明式优于命令式

```javascript
// ❌ 命令式：指定如何执行
await createSkill();
await runTests();
await fixIssues();

// ✅ 声明式：描述期望状态
ctc.registerTask({
  intent: "技能从候选到发布",
  workflow: { nodes: [...], edges: [...] }
});
```

### 2. 执行与定义解耦

- **任务定义**：描述意图、依赖、约束
- **执行引擎**：决定如何调度、并行、容错
- **资源调度**：分配计算、存储、网络资源

### 3. 可观测性内建

```yaml
telemetry:
  metrics: [duration, throughput, error_rate]
  traces: [node_execution, dependency_resolution]
  logs: [decision_points, resource_allocation]
```

## API 接口

### 任务管理

```javascript
// 注册任务
dto.registerTask(definition);

// 触发执行
dto.execute(taskId, { trigger: 'manual', context: {} });

// 查询状态
dto.getStatus(taskId);

// 动态更新
dto.patchTask(taskId, { workflow: { ... } });
```

### 工作流编排

```javascript
// 构建 DAG
const dag = dto.dag()
  .node('A', actionA)
  .node('B', actionB, { dependsOn: ['A'] })
  .node('C', actionC, { dependsOn: ['A'] })
  .node('D', actionD, { dependsOn: ['B', 'C'] });

// 执行
await dag.execute();
```

### 事件订阅

```javascript
// 订阅任务事件
dto.subscribe('task.completed', (event) => {
  // 触发下游任务
});

// 订阅资源事件
dto.subscribe('resource.threshold_exceeded', (event) => {
  // 动态扩缩容
});
```

## 集成

| 系统 | 集成方式 | 能力 |
|:---|:---|:---|
| **ISC** | 标准订阅 + 检查点 | 任务准入控制、合规验证 |
| **CRAS** | 洞察事件流 | 动态任务触发、效果反馈 |
| **SEEF** | 子技能调用 | 技能进化执行 |
| **EvoMap** | 基因发布 | 任务模板共享 |

## 演进路径

### v3.0.11 (2026-02-28)
- **新增**: Git跟踪范围全面扩展 - 全局自主决策流水线v1.4
  - 新增30+种文件扩展名支持 (.ts, .tsx, .sh, .py, .html, .css等)
  - 新增15+个关键目录跟踪 (scripts/, config/, prompts/, filters/等)
  - 新增根目录配置文件自动跟踪
  - 新增.gitignore支持，智能排除日志、临时文件、媒体文件
  - 改进Git add逻辑，根据变更类型精确添加文件
  - 新增变更去重机制，避免重复处理
- **新增**: `/root/.openclaw/workspace/.gitignore` 全局忽略规则
- **优化**: 流水线检测到49个可跟踪变更（测试验证）

### v3.0.3 (2026-02-24)
- **修复**: 规则订阅统计输出显示实际扫描数量，而非固定数字
- **优化**: 输出已订阅规则的完整ID列表

### v3.0.2 (2026-02-24)
- **新增**: ISC规则自动对齐机制 - DTO自动扫描并订阅所有ISC规则
- **新增**: 扩展ISC规则订阅至9条 (R001-R006, S005, auto_response, N008)
- **修复**: SKILL.md版本号同步机制

### v3.0.1 (2026-02-24)
- **新增**: ISC规则订阅系统 (R001-R006)
- **新增**: 命名对齐检查功能
- **新增**: R005处理器 - 代码变更时检查SKILL.md同步
- **新增**: R006处理器 - 标准更新时触发存量数据全局同步
- **修复**: 信心指数计算逻辑
- **变更**: DTO更名为DTO，中文名"声明式任务编排中心"

### 基建期（v3.0）
- 核心抽象稳定
- DAG 执行引擎
- 基础可观测性

### 平台期（v3.5）
- 多租户隔离
- 资源弹性调度
- 可视化编排

### 生态期（v4.0）
- 任务市场
- 模板交易
- 跨云编排

---

**版本**: 3.0.3  
**状态**: active - 可扩展任务调度平台，ISC规则全自动执行  
**关键词**: 声明式编排、DAG执行、事件驱动、自适应调度、ISC全自动订阅

## 更新日志
- v3.0.11 (2026-02-28): Git跟踪范围全面扩展 - 覆盖所有代码和配置文件，新增.gitignore支持
- v3.0.10 (2026-02-28): 代码变更自动同步
- v3.0.3 (2026-02-24): 代码变更自动同步
- v3.0.3 (2026-02-24): 代码变更自动同步

### v3.0.3 (2026-02-24)
- **新增**: ISC规则全自动执行 - 支持9条规则（R001-R007 + 独立规则）
- **新增**: 独立规则文件扫描（rule.*.json）
- **新增**: R007处理器 - 高频exec调用自动替换
- **修复**: 动态规则加载机制
- **优化**: 所有规则100%全自动执行，无需人工干预

### v3.0.2 (2026-02-24)
- **新增**: ISC规则自动对齐机制
- **新增**: 命名对齐检查功能
- **修复**: SKILL.md版本号同步机制
