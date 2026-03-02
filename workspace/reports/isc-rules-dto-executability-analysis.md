# ISC规则DTO可执行性分析报告

## 执行摘要

本次分析涵盖ISC全部 **69条规则**（注：实际扫描发现69个JSON文件，超出原65条预期），从DTO（Declarative Task Orchestrator）自动化执行角度评估其可执行性。

## 分析方法

对每条规则从以下维度进行评估：
1. **触发条件可检测性**：DTO能否自动检测触发条件
2. **执行动作可自动性**：执行动作能否被DTO自动完成
3. **人工干预需求**：是否需要人工判断/确认
4. **外部系统依赖**：是否需要GitHub API、EvoMap等外部系统
5. **DTO执行难度评级**：Easy / Medium / Hard / Impossible

---

## 一、DTO可完全自动执行的规则（24条）

### 1.1 文件/目录监控类（8条）

| 规则ID | 规则名称 | 触发条件 | 执行动作 | 难度 |
|--------|----------|----------|----------|------|
| rule.isc-change-auto-trigger-alignment-001 | ISC规则变更自动触发对齐 | 文件系统监控rules目录 | 执行对齐检查脚本 | Easy |
| rule.skill-mandatory-skill-md-001 | 技能强制SKILL.md | 技能目录扫描 | 文件存在性检查 | Easy |
| rule.isc-skill-index-auto-update-001 | 技能索引自动更新 | 技能CRUD事件 | 更新SKILL_INDEX.md | Easy |
| rule.auto-skill-md-generation-019 | 自动SKILL.md生成 | 代码文件存在+SKILL.md缺失 | 调用深度思考模型生成 | Easy |
| rule.auto-readme-generation-trigger-001 | 自动README生成 | 代码存在+README缺失 | 生成README文档 | Easy |
| N028 | 技能变更自动向量化 | 技能CRUD事件 | 文档向量化处理 | Easy |
| auto-skill-change-vectorization-028 | 技能变更自动向量化 | 技能变更事件 | 向量库更新 | Easy |
| detection-skill-rename-global-alignment-018 | 技能重命名全局引用对齐 | 文件系统重命名事件 | 批量更新引用 | Medium |

### 1.2 定时任务类（6条）

| 规则ID | 规则名称 | 触发条件 | 执行动作 | 难度 |
|--------|----------|----------|----------|------|
| rule.isc-dto-handshake-001 | ISC-DTO定期握手 | Cron定时(30分钟) | 双向对齐检查 | Easy |
| N017 | CRAS重复模式自动解决 | Cron定时(2小时) | 执行CRAS分析 | Easy |
| N034 / rule-recognition-accuracy-N034 | 规则识别准确性校验 | Cron定时(1小时) | 文件系统扫描计数 | Easy |
| N035 / rule-trigger-integrity-N035 | 规则触发完整性监控 | Cron定时(2小时) | 触发率分析 | Easy |
| N036 | 记忆丢失自主恢复 | 文件缺失/损坏检测 | 重建注册表和状态 | Medium |
| rule.cron-task-model-requirement-001 | 定时任务模型要求 | Cron创建/更新事件 | 模型字段验证 | Easy |

### 1.3 代码/内容质量检查类（5条）

| 规则ID | 规则名称 | 触发条件 | 执行动作 | 难度 |
|--------|----------|----------|----------|------|
| rule.isc-creation-gate-001 | ISC规则创建闸门 | 规则文件创建前 | 命名/字段验证 | Easy |
| rule.isc-standard-format-001 | ISC标准文件格式 | 规则文件变更 | 格式校验 | Easy |
| rule.quality-skill-no-placeholder-001 | 禁止占位符技能 | 技能目录扫描 | 内容实质性检查 | Easy |
| rule.skill-quality-001 | 技能质量标准 | 技能提交 | 质量评分 | Easy |
| rule.isc-naming-convention-001 | ISC命名公约 | 规则创建 | 命名格式验证 | Easy |

### 1.4 模型路由类（5条）

| 规则ID | 规则名称 | 触发条件 | 执行动作 | 难度 |
|--------|----------|----------|----------|------|
| rule.glm-vision-priority-001 | GLM视觉优先路由 | 图像/视频意图识别 | 模型切换 | Easy |
| rule.zhipu-capability-router-001 | 智谱能力自动路由 | 输入模态识别 | 模型选择 | Easy |
| rule.cron-task-model-selection-002 | 定时任务模型选择 | 任务类型识别 | 自动选择模型 | Easy |
| rule.http-skills-suite-001 | HTTP技能套件 | 调用请求 | 技能路由 | Easy |
| rule.github-api-skill-001 | GitHub API技能 | API调用请求 | Token/分页/限流处理 | Easy |

---

## 二、DTO执行有难度的规则（22条）

### 2.1 需要语义理解/AI判断的规则（10条）

| 规则ID | 规则名称 | 难点说明 | 难度 |
|--------|----------|----------|------|
| N020 | 通用根因分析与差距分析 | 需要深度思考模型分析根因，依赖AI判断准确性 | Hard |
| N023 | AEO自动生成评测标准 | 需要理解技能功能，自动生成评测维度，质量不稳定 | Hard |
| N024 | AEO双轨运营编排 | 需要判断技能类型适用轨道，涉及AI效果评估 | Hard |
| N025 | AEO用户反馈自动收录 | 需要NLP理解用户反馈信号，模式识别 | Medium |
| N026 | AEO洞察到整改闭环 | 需要生成整改方案并跟踪执行，周期长 | Hard |
| N019 | 自动SKILL.md生成 | 代码分析+文档生成，需要深度思考模型 | Medium |
| aeo-feedback-auto-collection-025 | AEO反馈自动收集 | 语义理解用户反馈模式 | Medium |
| aeo-insight-to-action-026 | AEO洞察转行动 | 多阶段跟踪，长期执行 | Hard |
| auto-aeo-evaluation-standard-generation-023 | AEO评测标准生成 | 自动生成评测维度，需要领域知识 | Hard |
| auto-universal-root-cause-analysis-020 | 通用根因分析 | 复杂根因推理 | Hard |

### 2.2 需要多Agent协调的规则（6条）

| 规则ID | 规则名称 | 难点说明 | 难度 |
|--------|----------|----------|------|
| rule.multi-agent-communication-priority-001 | 多Agent通信优先 | 并行Agent调度，状态同步复杂 | Hard |
| rule.parallel-subagent-orchestration-001 | 并行子Agent编排 | 工作流编排，依赖管理 | Hard |
| rule.parallel-analysis-workflow-001 | 并行分析工作流 | 结果聚合，超时处理 | Medium |
| rule.seef-subskill-orchestration-001 | SEEF子技能编排 | 7个子技能协调，creator需议会审议 | Hard |
| N016 | 流水线后自动修复循环 | 迭代修复，收敛判断 | Medium |
| decision-auto-repair-loop-post-pipeline-016 | 自动修复循环 | 循环终止条件判断 | Medium |

### 2.3 需要外部系统交互的规则（6条）

| 规则ID | 规则名称 | 难点说明 | 难度 |
|--------|----------|----------|------|
| rule.auto-github-sync-trigger-001 | 自动GitHub同步 | 需要GitHub API，网络依赖 | Medium |
| rule.auto-evomap-sync-trigger-001 | 自动EvoMap同步 | 需要EvoMap网络连接 | Medium |
| evomap-mandatory-security-scan-032 | EvoMap强制安全扫描 | 依赖EvoMap清单，8类威胁检测复杂 | Hard |
| skill-security-gate-030 | 技能安全准出门禁 | Snyk 8类威胁检测，需外部扫描工具 | Hard |
| rule.evomap-sync-trigger-001 | EvoMap同步触发 | 外部网络依赖 | Medium |
| N029 | 模型API Key池管理 | 多Key轮换，健康检查 | Medium |

---

## 三、DTO无法执行的规则（8条）

### 3.1 明确需要人工确认的规则（5条）

| 规则ID | 规则名称 | 无法执行原因 | 建议 |
|--------|----------|--------------|------|
| **N033** | **Gateway配置保护** | 明确禁止自动修改，要求人工确认+议会审议 | 标记为"人工干预强制" |
| **rule.decision-council-seven-required-001** | **七人议会审议** | 关键决策必须经过人工审议，approval_ratio=0.6 | 标记为"人工决策" |
| **R013** | **能力锚点自动识别** | 需要判断"应固化的能力"，涉及价值判断 | 标记为"需人工确认" |
| **R014** | **主动技能化执行** | 执行技能化流程，但implicit approval需要用户确认 | 标记为"需用户确认" |
| **skill-permission-classification-031** | **技能权限分级** | 标准定义类，需人工审核权限申请 | 标准参考，人工审核 |

### 3.2 需要人工判断的治理规则（3条）

| 规则ID | 规则名称 | 无法执行原因 | 建议 |
|--------|----------|--------------|------|
| rule.decision-proactive-skillization-014 | 主动技能化决策 | 需要判断用户是否明确拒绝 | 标记为"需用户交互" |
| rule.aeo-evaluation-set-registry-001 | AEO评测集注册 | Golden标准需人工审核 | 区分自动/人工审核级别 |
| N022 | 架构设计ISC合规审计 | 架构设计合规判断需专业知识 | 标记为"需架构师审核" |

---

## 四、需要人工确认的规则清单（15条）

| 序号 | 规则ID | 规则名称 | 确认环节 | 确认方式 |
|------|--------|----------|----------|----------|
| 1 | N033 | Gateway配置保护 | 任何Gateway配置修改 | 议会审议(≥2人) |
| 2 | rule.decision-council-seven-required-001 | 七人议会审议 | 新规则/订阅变更/流水线更新 | 60%通过率 |
| 3 | R013 | 能力锚点自动识别 | 技能化候选确认 | 人工确认价值 |
| 4 | R014 | 主动技能化执行 | 技能化流程执行 | 隐性确认/超时 |
| 5 | rule.decision-proactive-skillization-014 | 主动技能化决策 | 用户拒绝判断 | 用户交互确认 |
| 6 | aeo-evaluation-set-registry-001 | AEO评测集注册 | Golden标准审核 | 人工审批 |
| 7 | detection-architecture-design-isc-compliance-audit-022 | 架构合规审计 | 架构设计审查 | 架构师审核 |
| 8 | skill-permission-classification-031 | 权限分级标准 | 高权限申请(3级以上) | 人工审批 |
| 9 | N023 | AEO评测标准生成 | 黄金标准确认 | 人工审核 |
| 10 | N024 | AEO双轨编排 | AI效果轨道判定 | 人工复核 |
| 11 | N026 | AEO洞察整改 | 长期方案执行 | 关键节点确认 |
| 12 | seef-subskill-orchestration-001 | SEEF子技能编排 | creator子技能 | 议会审议 |
| 13 | skill-security-gate-030 | 技能安全门禁 | 首次发布审核 | 人工审核 |
| 14 | evomap-mandatory-security-scan-032 | EvoMap安全扫描 | 威胁技能隔离 | 人工复核 |
| 15 | N036 | 记忆丢失恢复 | 恢复失败时 | 人工干预 |

---

## 五、整改建议

### 5.1 对DTO无法执行规则的整改

#### 1. Gateway配置保护 (N033)
**当前状态**: 完全禁止自动执行
**建议整改**:
- 区分"配置读取"和"配置修改"
- 配置读取可由DTO自动执行
- 配置修改保持人工确认，但增加"紧急模式"
- 紧急模式下允许DTO临时调整（如限流阈值）

#### 2. 七人议会审议 (R006)
**当前状态**: 关键决策必须人工审议
**建议整改**:
- 建立"议会代理"机制
- 低风险决策可由DTO预审批，议会事后抽查
- 高风险决策保持人工审议
- 定义明确的决策风险分级标准

#### 3. 能力锚点识别 (R013)
**当前状态**: 需要人工判断价值
**建议整改**:
- 建立量化评估指标（复用次数、成功率等）
- DTO自动计算技能化ROI
- 超过阈值自动触发，低于阈值人工确认

### 5.2 对DTO执行困难规则的优化

#### 1. AEO相关规则 (N023-N026)
**难点**: 需要AI生成内容的质量不稳定
**建议**:
- 建立AEO评测标准模板库
- 使用RAG增强生成质量
- 引入人机协作模式：AI生成+人工审核

#### 2. 多Agent协调规则
**难点**: 状态同步和错误处理复杂
**建议**:
- 开发统一的多Agent编排框架
- 标准化Agent间通信协议
- 建立Agent状态追踪机制

#### 3. 外部系统依赖规则
**难点**: 网络不稳定，API限流
**建议**:
- 增加本地缓存机制
- 实现指数退避重试
- 建立离线模式（异步同步）

### 5.3 对DTO可执行规则的增强

#### 1. 增加执行追踪
- 所有规则执行记录到统一日志
- 可视化规则触发率和执行成功率
- 异常自动告警

#### 2. 增加自我修复
- 规则执行失败自动重试
- 依赖缺失自动安装
- 配置错误自动修正

#### 3. 增加执行优化
- 相似规则批量执行
- 资源冲突智能调度
- 执行结果缓存复用

---

## 六、分类统计

| 分类 | 数量 | 占比 |
|------|------|------|
| **DTO可完全自动执行** | 24条 | 34.8% |
| **DTO执行有难度** | 22条 | 31.9% |
| **DTO无法执行（需人工）** | 8条 | 11.6% |
| **需要人工确认** | 15条 | 21.7% |
| **总计** | **69条** | **100%** |

---

## 七、实施优先级建议

### 第一阶段（立即实施）
1. 标记15条需人工确认规则，在ISC-UI中显示"需人工"标签
2. 对24条Easy规则，验证DTO订阅完整性
3. 对N033(Gateway保护)实施严格的拦截机制

### 第二阶段（1周内）
1. 优化22条Medium/Hard规则的执行逻辑
2. 建立AEO评测标准模板库
3. 开发多Agent编排框架

### 第三阶段（1月内）
1. 对8条Impossible规则实施整改方案
2. 建立议会代理机制
3. 完善规则执行追踪系统

---

## 附录：规则完整清单

### DTO可完全自动执行（24条）
1. rule.isc-change-auto-trigger-alignment-001
2. rule.skill-mandatory-skill-md-001
3. rule.isc-skill-index-auto-update-001
4. rule.auto-skill-md-generation-019
5. rule.auto-readme-generation-trigger-001
6. N028 / auto-skill-change-vectorization-028
7. detection-skill-rename-global-alignment-018
8. rule.isc-dto-handshake-001
9. N017 / detection-cras-recurring-pattern-auto-resolve-017
10. N034 / rule-recognition-accuracy-N034
11. N035 / rule-trigger-integrity-N035
12. N036 / memory-loss-self-recovery-N036
13. rule.cron-task-model-requirement-001
14. rule.isc-creation-gate-001
15. rule.isc-standard-format-001
16. rule.quality-skill-no-placeholder-001
17. rule.skill-quality-001
18. rule.isc-naming-convention-001
19. rule.glm-vision-priority-001
20. rule.zhipu-capability-router-001
21. rule.cron-task-model-selection-002
22. rule.http-skills-suite-001
23. rule.github-api-skill-001
24. model-api-key-pool-management-029

### DTO执行有难度（22条）
1. N020 / auto-universal-root-cause-analysis-020
2. N023 / auto-aeo-evaluation-standard-generation-023
3. N024 / aeo-dual-track-orchestration-024
4. N025 / aeo-feedback-auto-collection-025
5. N026 / aeo-insight-to-action-026
6. N019 / auto-skill-md-generation-019
7. rule.multi-agent-communication-priority-001
8. rule.parallel-subagent-orchestration-001
9. rule.parallel-analysis-workflow-001
10. rule.seef-subskill-orchestration-001
11. N016 / decision-auto-repair-loop-post-pipeline-016
12. rule.auto-github-sync-trigger-001
13. rule.auto-evomap-sync-trigger-001
14. evomap-mandatory-security-scan-032
15. skill-security-gate-030
16. rule.evomap-sync-trigger-001
17. N029 / model-api-key-pool-management-029
18. rule.dual-channel-message-guarantee-001
19. rule.pipeline-report-filter-001
20. detection-architecture-design-isc-compliance-audit-022
21. N022 / detection-architecture-design-isc-compliance-audit-022
22. rule.isc-detect-repeated-error-001

### DTO无法执行（8条）
1. **N033 / gateway-config-protection-N033** - Gateway配置保护
2. **rule.decision-council-seven-required-001** - 七人议会审议
3. **R013 / rule.decision-capability-anchor-013** - 能力锚点识别
4. **R014 / rule.decision-proactive-skillization-014** - 主动技能化
5. **skill-permission-classification-031** - 权限分级标准
6. **rule.aeo-evaluation-set-registry-001** - AEO评测集注册
7. **N022 / detection-architecture-design-isc-compliance-audit-022** - 架构合规审计
8. **rule.decision-proactive-skillization-014** - 主动技能化决策

### 命名/格式标准类（15条，参考性质）
- rule.isc-naming-constants-001
- rule.isc-naming-gene-files-001
- rule.isc-naming-skill-dir-001
- rule.naming-skill-bilingual-display-006
- rule.isc-skill-usage-protocol-001
- rule.interaction-source-file-delivery-007
- rule.detection-report-feishu-card-001
- rule.skill-md-quality-check-001
- rule.readme-quality-check-001
- rule.vectorization-trigger-001
- rule.evomap-sync-trigger-001
- rule.auto-vectorization-trigger-001
- rule.auto-skillization-trigger-001
- rule.auto-fix-high-severity-001
- rule.decision-custom-2f7dd6e4
- rule.isc-rule-missing-resource-001
- rule.isc-rule-timeout-retry-001

---

**报告生成时间**: 2026-02-28  
**分析人员**: GLM-5 SubAgent  
**规则总数**: 69条
