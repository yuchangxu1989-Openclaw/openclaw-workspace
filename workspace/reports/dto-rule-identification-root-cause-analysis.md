# DTO规则识别系统性缺陷 - 根因分析报告

## 执行摘要

| 项目 | 数据 |
|------|------|
| 规则总数 | 61条 |
| 已触发规则 | 27条 (44.3%) |
| 未触发规则 | 34条 (55.7%) |
| 规则类别数 | 18种 |

---

## 一、核心问题：DTO将"18种规则类别"误认为"18条规则"

### 1.1 问题现象

DTO代码中**完全没有**规则发现、计数和分类机制。它只是被动监听文件变更，没有对规则进行任何识别和统计。

### 1.2 根因分析

#### 根因1：DTO代码设计缺陷

`global-auto-decision-pipeline.js` 只实现了以下功能：
1. 监听工作区文件变更（`listen()`）
2. 更新版本号（`updateVersion()`）
3. 同步到GitHub/EvoMap（`sync()`）
4. 记录反馈（`feedback()`）

**缺失的关键功能：**
- ❌ 规则文件发现机制
- ❌ 规则数量统计机制
- ❌ 规则类别分类机制
- ❌ 规则ID解析和验证
- ❌ 规则触发状态追踪

#### 根因2：规则ID命名混乱

系统中存在**4种不同的规则ID命名风格**：

| 命名风格 | 示例 | 数量 |
|----------|------|------|
| `rule.xxx-001` | `rule.isc-dto-handshake-001` | 26条 |
| `Nxxx` | `N016`, `N017` | 14条 |
| `Rxxx` | `R006`, `R013` | 3条 |
| 短名称 | `evomap_sync`, `readme_quality` | 12条 |
| `Sxxx` | `S005` | 1条 |
| `ISC-XXX` | `ISC-SKILL-QUALITY-001` | 1条 |

#### 根因3：文件名与内部ID不一致

| 文件名 | 内部ID | 问题 |
|--------|--------|------|
| `rule.decision-council-seven-required-001.json` | `R006` | 文件名与ID不符 |
| `rule.quality-skill-no-placeholder-001.json` | `ISC-SKILL-QUALITY-001` | 文件名与ID不符 |
| `rule.detection-report-feishu-card-001.json` | `S005` | 文件名与ID不符 |

#### 根因4：触发机制依赖外部系统

触发记录（`isc-rule-created.jsonl`）来自 **ISC文件监听器**，而非DTO自身。DTO没有主动触发规则的能力。

---

## 二、34条未触发规则根因分类

### 2.1 按规则类型分类

| 规则类型 | 未触发数量 | 根因 |
|----------|------------|------|
| AEO相关规则 | 6条 | 新增规则，尚未部署触发器 |
| Detection相关规则 | 4条 | 需要特定错误场景触发 |
| Decision相关规则 | 3条 | 需要人工决策场景触发 |
| Auto-*触发器规则 | 4条 | 需要特定事件触发 |
| ISC管理规则 | 12条 | 需要系统级事件触发 |
| Skill质量规则 | 5条 | 需要技能文件变更触发 |

### 2.2 详细未触发规则清单

#### AEO规则族（6条）
| 规则ID | 规则名称 | 未触发原因 |
|--------|----------|------------|
| N023 | auto-aeo-evaluation-standard-generation-023 | 缺少AEO评估事件源 |
| N024 | aeo-dual-track-orchestration-024 | 缺少双轨协调触发条件 |
| N025 | aeo-feedback-auto-collection-025 | 反馈收集机制未部署 |
| N026 | aeo-insight-to-action-026 | Insight引擎未初始化 |
| rule.aeo-evaluation-set-registry-001 | aeo-evaluation-set-registry | 评估集注册器未配置 |

#### Detection规则族（4条）
| 规则ID | 规则名称 | 未触发原因 |
|--------|----------|------------|
| N016 | decision-auto-repair-loop-post-pipeline | 需要Pipeline失败事件 |
| N017 | detection-cras-recurring-pattern-auto-resolve | 需要CRAS重复错误模式 |
| N018 | detection-skill-rename-global-alignment | 需要技能重命名事件 |
| N022 | detection-architecture-design-isc-compliance-audit | 需要架构设计评审事件 |

#### Decision规则族（3条）
| 规则ID | 规则名称 | 未触发原因 |
|--------|----------|------------|
| R006 | decision-council-seven-required | 需要七人议会决策场景 |
| R013 | decision-capability-anchor | 需要能力锚点更新事件 |
| R014 | decision-proactive-skillization | 需要主动技能化决策 |

#### Cron任务规则（2条）
| 规则ID | 规则名称 | 未触发原因 |
|--------|----------|------------|
| rule.cron-task-model-requirement-001 | cron-task-model-requirement | Cron系统未配置 |
| rule.cron-task-model-selection-002 | cron-task-model-selection | Cron系统未配置 |

#### 其他重要规则（19条）
| 规则ID | 规则名称 | 未触发原因 |
|--------|----------|------------|
| isc-evomap-mandatory-security-scan-032 | evomap-mandatory-security-scan | 安全扫描调度器未启动 |
| isc-skill-permission-classification-031 | skill-permission-classification | 权限分类引擎未初始化 |
| isc-skill-security-gate-030 | skill-security-gate | 安全门控制器未配置 |
| N006 | naming-skill-bilingual-display | 命名规范检查器未部署 |
| N007-v2 | interaction-source-file-delivery | 文件交付事件未触发 |
| N019 | auto-skill-md-generation | SKIL.md生成器未配置 |
| N020 | auto-universal-root-cause-analysis | URCA引擎未初始化 |
| N028 | auto-skill-change-vectorization | 变更向量化服务未启动 |
| N029 | model-api-key-pool-management | API密钥池管理器未配置 |
| rule.auto-github-sync-trigger-001 | auto-github-sync-trigger | GitHub同步触发器未启用 |
| rule.dual-channel-message-guarantee-001 | dual-channel-message-guarantee | 双通道消息系统未部署 |
| rule.github-api-skill-001 | github-api-skill | GitHub API技能未激活 |
| rule.glm-vision-priority-001 | glm-vision-priority | GLM视觉优先级调度器未配置 |
| rule.http-skills-suite-001 | http-skills-suite | HTTP技能套件未激活 |
| rule.isc-change-auto-trigger-alignment-001 | isc-change-auto-trigger-alignment | 变更触发对齐器未启用 |
| rule.isc-skill-index-auto-update-001 | isc-skill-index-auto-update | 技能索引自动更新器未配置 |
| rule.isc-skill-usage-protocol-001 | isc-skill-usage-protocol | 技能使用协议监控器未部署 |
| rule.multi-agent-communication-priority-001 | multi-agent-communication-priority | 多Agent通信优先级调度器未启用 |
| rule.parallel-analysis-workflow-001 | parallel-analysis-workflow | 并行分析工作流引擎未初始化 |
| rule.parallel-subagent-orchestration-001 | parallel-subagent-orchestration | 并行子Agent编排器未配置 |
| rule.pipeline-report-filter-001 | pipeline-report-filter | Pipeline报告过滤器未启用 |
| rule.seef-subskill-orchestration-001 | seef-subskill-orchestration | SEEF子技能编排器未初始化 |
| rule.skill-mandatory-skill-md-001 | skill-mandatory-skill-md | 强制SKIL.md检查器未部署 |
| rule.zhipu-capability-router-001 | zhipu-capability-router | 智谱能力路由器未配置 |
| S005 | detection-report-feishu-card | 飞书卡片报告生成器未启用 |

---

## 三、系统性问题总结

### 3.1 架构层面问题

```
┌─────────────────────────────────────────────────────────────┐
│                      架构缺陷图                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ISC-Core (规则定义)        DTO-Core (规则执行)             │
│   ┌──────────────┐          ┌──────────────────┐           │
│   │ 61条规则文件 │─────────▶│ ❌ 无规则识别    │           │
│   │ 18种类别     │          │ ❌ 无规则计数    │           │
│   └──────────────┘          │ ❌ 无触发追踪    │           │
│                              └──────────────────┘           │
│                                       │                     │
│                                       ▼                     │
│                              ┌──────────────────┐           │
│                              │ 只监听文件变更   │           │
│                              │ 只同步版本       │           │
│                              └──────────────────┘           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 数据流断裂点

| 断裂点 | 描述 | 影响 |
|--------|------|------|
| 规则发现 | DTO不扫描规则目录 | 不知道有多少规则 |
| 规则解析 | DTO不解析规则内容 | 不知道规则定义 |
| 触发匹配 | DTO不监听规则事件 | 不知道规则是否触发 |
| 状态追踪 | DTO不记录执行状态 | 不知道规则执行结果 |

### 3.3 根本原因总结

**DTO犯错的根本原因是：它被设计成一个"文件变更监听和同步工具"，而不是一个"规则引擎"。**

它缺乏规则引擎的核心能力：
1. 规则元数据管理
2. 规则生命周期管理
3. 规则执行状态追踪
4. 规则触发条件评估

---

## 四、整改建议优先级

| 优先级 | 整改项 | 预期效果 |
|--------|--------|----------|
| P0 | 实现规则发现和计数机制 | 解决"18条"误识别问题 |
| P0 | 实现规则触发追踪 | 解决34条未触发问题 |
| P1 | 统一规则ID命名规范 | 解决命名混乱问题 |
| P1 | 实现记忆丢失自恢复 | 解决灾难恢复问题 |
| P2 | 部署缺失的触发器 | 提高规则覆盖率 |
| P2 | 完善ISC规则体系 | 增加治理规则 |

---

## 五、附录

### A. 规则类别分析

通过聚类分析，61条规则可以归纳为18个类别：

1. **sync** - 同步相关（EvoMap, GitHub）
2. **naming** - 命名规范
3. **quality** - 质量检查
4. **detection** - 问题检测
5. **decision** - 决策支持
6. **auto_trigger** - 自动化触发
7. **aeo** - AEO评估
8. **cron** - 定时任务
9. **security** - 安全检查
10. **multi_agent** - 多Agent协调
11. **skill_mgmt** - 技能管理
12. **report** - 报告生成
13. **interaction** - 交互规范
14. **pipeline** - 流水线管理
15. **vectorization** - 向量化
16. **model** - 模型管理
17. **communication** - 通信规范
18. **standards** - 标准规范

### B. 已触发规则特征分析

已触发的27条规则具有以下共同特征：
- 都是基础规则（naming, quality, standards）
- 都在规则目录中（非standards子目录）
- 都有对应的订阅文件
- 都是通过isc-file-watcher检测到的

### C. 未触发规则特征分析

未触发的34条规则具有以下共同特征：
- 大多是高级规则（aeo, detection, decision）
- 部分在standards子目录
- 需要特定条件触发
- 缺少对应的触发器部署

---

*报告生成时间: 2026-02-28*
*分析师: GLM-5子Agent*
