# P2E 评测语料库覆盖度矩阵
**生成时间**: 2026-03-08  
**基准文件**: `principle-e2e-spec/` (v1.0.0)，`05-test-cases.json` (15 cases)  
**目的**: 全量评测集与当前覆盖度的差距映射，标注刷新优先级

---

## 一、执行摘要

| 维度 | 总需覆盖项 | 已覆盖 | 零覆盖 | 覆盖率 |
|------|-----------|--------|--------|--------|
| 意图类型 (Intent Types) | 9 个子类 | 6 | 3 | 67% |
| 管道阶段 (Pipeline Stages) | 10 阶段 | 7 | 3 | 70% |
| HARD Gate 检查项 | 9 项 | 5 | 4 | 56% |
| SOFT Gate 检查项 | 8 项 | 3 | 5 | 38% |
| Advisory Gate 检查项 | 5 项 | 3 | 2 | 60% |
| Special Rules | 3 项 | 2 | 1 | 67% |
| Badcase 类别 | 8 类 | 6 | 2 | 75% |
| 自治维度 (Autonomy Levels) | 10 级 | 6 | 4 | 60% |
| 技能/业务域 | 15 域 | 10 | 5 | 67% |
| Cron 维度 | 5 场景 | 1 | 4 | 20% |
| Event 维度 | 6 场景 | 1 | 5 | 17% |

**关键风险**: HARD Gate HG-004、HG-006、HG-009 均为零覆盖，任一失败均直接导致 `FAIL`，但当前测试集完全无法检验。

---

## 二、当前测试用例清单（n=15）

| case_id | 意图类型 | 优先级 | 回归守护 | 核心标签 | 预期结论 |
|---------|---------|--------|----------|---------|--------|
| p2e-tc-001 | CONSTRAINT | P0 | ✅ | monitoring / threshold | SUCCESS |
| p2e-tc-002 | PRINCIPLE | P0 | ✅ | quality / automation | SUCCESS |
| p2e-tc-003 | VERDICT | P0 | ✅ | governance / auto-execution | SUCCESS |
| p2e-tc-004 | GOAL | P1 | ❌ | decomposition / multi-subtask | SUCCESS |
| p2e-tc-005 | DIRECTIVE | P0 | ✅ | skip / discrimination | SKIP |
| p2e-tc-006 | MIXED | P1 | ❌ | multi-intent / feedback+constraint | SUCCESS |
| p2e-tc-007 | PRINCIPLE | P2 | ❌ | ambiguous / low-confidence | PARTIAL |
| p2e-tc-008 | CONSTRAINT | P1 | ✅ | conflict-detection | PARTIAL |
| p2e-tc-009 | PRINCIPLE | P1 | ❌ | meta / knowledge-codification / CRAS | SUCCESS |
| p2e-tc-010 | CONSTRAINT | P1 | ❌ | performance / latency | SUCCESS |
| p2e-tc-011 | VERDICT | P0 | ✅ | security / human-approval | PARTIAL |
| p2e-tc-012 | PRINCIPLE | P0 | ✅ | regression / logging | SUCCESS |
| p2e-tc-013 | GOAL | P2 | ❌ | cras / historical-linking | SUCCESS |
| p2e-tc-014 | CONSTRAINT | P1 | ❌ | lep / resilience / retry | SUCCESS |
| p2e-tc-015 | PRINCIPLE | P1 | ✅ | multi-rule / atomic-release | SUCCESS |

**回归守护集（regression_guard=true）**: 8 条  
**P0 优先级**: 6 条 | **P1**: 7 条 | **P2**: 2 条

---

## 三、意图类型覆盖矩阵

| 意图类型 | 定义 | 当前用例数 | 用例ID | 未覆盖子场景 | 优先级 |
|---------|------|-----------|--------|------------|--------|
| CONSTRAINT | 边界约束，限制某类行为 | 5 | tc-001,006,008,010,014 | ① 软边界（警告 vs 阻断）❌ ② 时限性约束（N天内生效）❌ ③ 约束废弃/升级 ❌ | P1 |
| PRINCIPLE | 抽象规范，长期有效 | 5 | tc-002,007,009,012,015 | ① 嵌套原则（原则的原则）❌ ② 跨域原则（影响多个系统）❌ ③ 原则冲突（两原则语义对立）❌ | P1 |
| VERDICT | 一次性裁决，触发规则变更 | 2 | tc-003,011 | ① 规则撤销裁决（废除已有规则）❌ ② 范围扩大裁决（升级已有规则）❌ ③ 议会否决（否决现有决定）❌ | P0 |
| GOAL | 方向性目标，需自主分解 | 2 | tc-004,013 | ① 无可知路径目标（开放性目标）❌ ② 跨域目标（涉及多个子系统）❌ ③ 冲突目标（两个目标互斥）❌ | P1 |
| DIRECTIVE | 明确执行指令（非P2E） | 1 | tc-005 | ① 伪装原则的指令（形式似PRINCIPLE）❌ ② 指令+原则边界灰色区 ❌ | P1 |
| MIXED（2意图） | 一句话含多类意图 | 1 | tc-006 | ① 三意图叠加 ❌ ② PRINCIPLE+VERDICT 叠加 ❌ ③ GOAL+CONSTRAINT 叠加 ❌ | P1 |
| **隐含意图** | 无明确关键词，语义推断 | 0 | — | ① 全缺失 ❌ | P1 |
| **矛盾意图** | 同一表述含互斥含义 | 0 | — | ① 全缺失 ❌ | P2 |
| **跨会话意图** | 意图需结合历史上下文 | 0 | — | ① 全缺失 ❌ | P2 |

---

## 四、管道阶段 × 测试用例覆盖矩阵

| 阶段 | 权重 | Gate类型 | 有覆盖用例数 | 直接覆盖用例 | 缺口描述 | 刷新优先级 |
|------|------|---------|------------|------------|---------|-----------|
| **INTENT** | 20% | HARD | 15/15 | 全部用例 | 隐含意图、伪装意图场景不足 | P1 |
| **EVENT** | 5% | SOFT | 2/15 | tc-003,006(间接) | 事件幂等性、优先级排序、fan-out 完全无 | 🔴 P0 |
| **ISC** | 25% | HARD | 8/15 | tc-001,002,003,007,008,009,012,015 | 血缘字段完整性、ISC lineage 无专项用例 | P1 |
| **DTO** | 20% | HARD | 5/15 | tc-001,002,004,006,014 | DAG 有效性、fallback 策略 完全无专项 | 🔴 P0 |
| **CRAS** | 5% | ADVISORY | 2/15 | tc-009,013 | 知识入库、历史关联覆盖太少 | P1 |
| **AEO** | 15% | SOFT | 0/15 | — | **全段零覆盖** | 🔴 P0 |
| **LEP** | 10% | SOFT | 1/15 | tc-014 | exec_id 唯一性、WAL 完整性、熔断无专项 | 🔴 P0 |
| **TEST** | 0%(HARD门控) | HARD | 2/15 | tc-010,012 | 边界安全（boundary safety）完全无 | 🔴 P0 |
| **GATE** | 0%(综合) | HARD | 15/15 | 全部（via verdict_expectation） | 特殊规则 SR-001 静默失败无覆盖 | P0 |
| **RELEASE** | 0%(HARD门控) | HARD | 4/15 | tc-001,002,003,015 | 版本追踪、变更通知无专项 | 🔴 P0 |

---

## 五、Gate 检查项覆盖矩阵

### 5.1 HARD Gate（任一失败 → FAIL）

| Gate ID | 检查项 | 阈值 | 覆盖用例 | 覆盖状态 | 刷新优先级 |
|---------|--------|------|---------|---------|-----------|
| HG-001 | intent.type_classification | ≥ 0.90 | tc-001,002,003,004,005 | ✅ 有覆盖 | P1（需更多DIRECTIVE反例） |
| HG-002 | isc.draft_generation（非空） | = 1.0 | tc-001,002,003,009,012 | ✅ 有覆盖 | P1（需 failure path 用例） |
| HG-003 | dto.dag_validity（无循环/无遗漏） | = 1.0 | tc-004 | ⚠️ 仅1例 | P1（需 DAG cycle 失败用例） |
| HG-004 | aeo.track_selection（AI效果轨道） | = 1.0 | **0 个** | 🔴 零覆盖 | **P0** |
| HG-005 | test.functional_pass | = 1.0 | tc-012 | ⚠️ 仅1例 | P1 |
| HG-006 | test.boundary_safety（不崩溃） | = 1.0 | **0 个** | 🔴 零覆盖 | **P0** |
| HG-007 | test.regression_clean | = 1.0 | tc-008,012 | ✅ 有覆盖 | P1（需3+场景） |
| HG-008 | release.atomicity（原子部署） | = 1.0 | tc-015 | ⚠️ 仅1例 | P1 |
| HG-009 | release.version_tracked | = 1.0 | **0 个** | 🔴 零覆盖 | **P0** |

**零覆盖 HARD Gate 合计: 3 项（HG-004, HG-006, HG-009）**  
> 这三项任一在真实 Runner 中失败均直接输出 FAIL，但当前测试集完全无法检验，属于**最高风险盲区**。

### 5.2 SOFT Gate（失败降级为 PARTIAL）

| Gate ID | 检查项 | 阈值 | 覆盖用例 | 覆盖状态 | 刷新优先级 |
|---------|--------|------|---------|---------|-----------|
| SG-001 | intent.multi_intent_coverage | ≥ 0.80 | tc-006 | ⚠️ 仅1例 | P1 |
| SG-002 | isc.confidence_calibration | ≥ 0.85 | tc-007 | ⚠️ 仅1例 | P1 |
| SG-003 | dto.fallback_exists（降级策略） | = 1.0 | **0 个** | 🔴 零覆盖 | **P1** |
| SG-004 | aeo.coverage_completeness | ≥ 0.90 | **0 个** | 🔴 零覆盖 | **P0** |
| SG-005 | lep.exec_id_uniqueness | = 1.0 | **0 个** | 🔴 零覆盖 | **P1** |
| SG-006 | lep.wal_completeness（WAL完整） | = 1.0 | tc-014 | ⚠️ 仅1例 | P1 |
| SG-007 | test.latency_p95（≤30s） | ≤ 30000ms | tc-010 | ⚠️ 仅1例 | P1 |
| SG-008 | release.notification_sent | = 1.0 | **0 个** | 🔴 零覆盖 | **P1** |

**零覆盖 SOFT Gate 合计: 5 项（SG-003, SG-004, SG-005, SG-008 为P1；SG-004 升P0因AEO整段零覆盖）**

### 5.3 Advisory Gate（仅记录，不影响结论）

| Gate ID | 检查项 | 覆盖用例 | 覆盖状态 | 刷新优先级 |
|---------|--------|---------|---------|-----------|
| AG-001 | cras.knowledge_ingestion | tc-009,013 | ✅ 有覆盖 | P2 |
| AG-002 | cras.suggestion_relevance | tc-009 | ⚠️ 仅1例 | P2 |
| AG-003 | cras.historical_linking | tc-013 | ⚠️ 仅1例 | P2 |
| AG-004 | lep.dto_failure_linkage（失败触发修复） | **0 个** | 🔴 零覆盖 | **P1** |
| AG-005 | event.priority_ordering（VERDICT>CONSTRAINT>…） | **0 个** | 🔴 零覆盖 | **P1** |

### 5.4 Special Rules（特殊规则，可强制覆盖最终结论）

| Rule ID | 规则名称 | 触发条件 | 覆盖用例 | 覆盖状态 | 刷新优先级 |
|---------|---------|---------|---------|---------|-----------|
| SR-001 | 静默失败零容忍 | 无错误日志但意图未执行 | **0 个** | 🔴 零覆盖 | **P0** |
| SR-002 | 安全风险人工确认 | 高风险裁决未标注human_approval | tc-011 | ✅ 有覆盖 | P1（加更多安全场景） |
| SR-003 | 回归破坏零容忍 | regression_failures > 0 | tc-012 | ✅ 有覆盖 | P1 |

---

## 六、Badcase 类别覆盖矩阵

| 类别 | 代码 | 有触发覆盖的用例 | 覆盖状态 | 未覆盖子类 | 刷新优先级 |
|------|------|----------------|---------|-----------|-----------|
| 意图误识别 | BC-INTENT | tc-005,007 | ✅ partial | INTENT.WRONG_TYPE专项 ❌ | P1 |
| 规则生成错误 | BC-ISC | tc-007,008 | ✅ partial | ISC.EMPTY_DRAFT（应有而无）❌ ISC.MISSING_LINEAGE ❌ | P1 |
| 编排错误 | BC-DTO | tc-004 | ⚠️ 仅1例 | DTO.DAG_CYCLE专项 ❌ DTO.NO_AUTO_SUBSCRIPTION ❌ | P1 |
| 执行失败 | BC-LEP | tc-014 | ⚠️ 仅1例 | LEP.CIRCUIT_BREAKER专项 ❌ | P1 |
| 效果偏差 | BC-AEO | **0 个** | 🔴 零覆盖 | 全部子类无覆盖 | **P0** |
| 静默失败 | BC-SILENT | **0 个** | 🔴 零覆盖 | 全部子类无覆盖 | **P0** |
| 超时/性能 | BC-PERF | tc-010 | ✅ 有覆盖 | 并发场景 ❌ | P2 |
| 回归破坏 | BC-REGRESSION | tc-012 | ✅ 有覆盖 | 多规则并发回归 ❌ | P1 |

---

## 七、自治能力维度覆盖矩阵

| 自治级别 | 能力描述 | 覆盖用例 | 覆盖状态 | 刷新优先级 |
|---------|---------|---------|---------|-----------|
| L1 意图→规则 | NL原则自动生成ISC规则草案 | tc-001,002,003 | ✅ 有覆盖（3例） | P1（需失败路径） |
| L2 规则冲突检测 | 新规则与已有规则自动对比 | tc-008 | ⚠️ 仅1例 | P1（需多规则场景） |
| L3 多规则协同发布 | 一意图展开多规则原子发布 | tc-015 | ⚠️ 仅1例 | P1 |
| L4 目标分解 | 高层目标拆分为可执行子任务 | tc-004,013 | ✅ 有覆盖（2例） | P1 |
| L5 自愈/重试 | 执行失败自动恢复 | tc-014 | ⚠️ 仅1例 | P1（需熔断、WAL恢复） |
| L6 知识进化 | 意图纳入CRAS并关联历史 | tc-009,013 | ✅ 有覆盖（2例） | P2 |
| **L7 静默失败检测** | 无日志但意图未执行 | **0 个** | 🔴 零覆盖 | **P0** |
| **L8 跨域规则传播** | 原则自动扩散至关联系统 | **0 个** | 🔴 零覆盖 | **P1** |
| **L9 规则版本回滚** | 发布失败后自动回滚到前一版本 | **0 个** | 🔴 零覆盖 | **P0** |
| **L10 多Agent P2E协同** | 多子Agent并行展开DAG分支 | **0 个** | 🔴 零覆盖 | **P2** |

---

## 八、Cron/Event 维度覆盖矩阵

### 8.1 Cron 维度

| 场景 | 描述 | 覆盖用例 | 覆盖状态 | 刷新优先级 |
|------|------|---------|---------|-----------|
| Cron 约束生成 | ISC规则自动生成cron触发器 | tc-006（间接，约束执行时间） | ⚠️ 极浅 | P1 |
| Cron 调度验证 | DTO生成的cron任务DAG验证 | **0 个** | 🔴 零覆盖 | **P1** |
| Cron 失败重试 | 定时任务失败后LEP重试 | **0 个** | 🔴 零覆盖 | **P1** |
| Cron 幂等性 | 同一cron多次触发不重复执行 | **0 个** | 🔴 零覆盖 | **P1** |
| Cron 漂移检测 | 定时任务未在预期时间执行 | **0 个** | 🔴 零覆盖 | **P2** |

### 8.2 Event 维度

| 场景 | 描述 | 覆盖用例 | 覆盖状态 | 刷新优先级 |
|------|------|---------|---------|-----------|
| Event 路由 | 意图→事件→正确订阅者 | tc-003（VERDICT事件路由） | ⚠️ 仅1例 | P1 |
| Event 幂等性 | 相同意图不产生重复事件 | **0 个** | 🔴 零覆盖 | **P0** |
| Event 优先级排序 | VERDICT>CONSTRAINT>PRINCIPLE>GOAL | **0 个** | 🔴 零覆盖 | **P1** |
| Event Fan-out | 一事件触发多个下游订阅者 | **0 个** | 🔴 零覆盖 | **P1** |
| Event 死信/重投 | 事件消费失败后的处理 | **0 个** | 🔴 零覆盖 | **P1** |
| Event Schema验证 | 事件消息格式合规 | **0 个** | 🔴 零覆盖 | **P2** |

---

## 九、技能/业务域覆盖矩阵

| 业务域 | 代表ISC规则 | 覆盖用例 | 覆盖状态 | 刷新优先级 |
|--------|-----------|---------|---------|-----------|
| 监控告警 (monitoring) | LLM失败率告警 | tc-001 | ✅ P0 覆盖 | — |
| 质量/lint/测试 (quality) | lint自动化、测试覆盖率 | tc-002,004 | ✅ 有覆盖 | — |
| 治理/命名规范 (governance) | ISC命名规范、议会裁决 | tc-003 | ✅ P0 覆盖 | — |
| 安全 (security) | API鉴权、高风险拒绝 | tc-011 | ✅ P0 覆盖 | P1（更多安全子场景） |
| 日志/溯源 (logging) | request_id追踪 | tc-012 | ✅ P0 覆盖 | — |
| 性能/延迟 (performance) | API P99约束 | tc-010 | ✅ P1 覆盖 | — |
| 知识可执行化 (knowledge) | 学到即写成规则 | tc-009 | ✅ P1 覆盖 | — |
| 记忆/CRAS (memory) | 历史关联意图 | tc-013 | ✅ P2 覆盖 | P2 |
| API防护 (api-protection) | 速率限制/超时/日志 | tc-015 | ✅ P1 覆盖 | — |
| LLM韧性 (llm-resilience) | 重试3次 | tc-014 | ✅ P1 覆盖 | — |
| **向量化 (vectorization)** | 技能自动向量化(9条规则) | **0 个** | 🔴 零覆盖 | **P1** |
| **AEO评测 (aeo)** | AEO双轨道编排 | **0 个** | 🔴 零覆盖 | **P0** |
| **多渠道路由 (routing)** | Gateway路由规则 | **0 个** | 🔴 零覆盖 | **P2** |
| **飞书/文档 (feishu)** | 飞书集成规则 | **0 个** | 🔴 零覆盖 | **P2** |
| **移动节点 (mobile)** | iOS/Android节点规则 | **0 个** | 🔴 零覆盖 | **P2** |

---

## 十、综合 Gap 优先级汇总

### P0 — 必须立即补充（HARD Gate或系统核心盲区）

| Gap ID | 描述 | 影响 Gate | 建议新增用例数 |
|--------|------|---------|--------------|
| GAP-01 | AEO 全段零覆盖（SG-004, HG-004, BC-AEO） | HG-004(HARD), SG-004 | 3–4 例 |
| GAP-02 | 边界安全测试零覆盖（HG-006） | HG-006(HARD) | 2–3 例 |
| GAP-03 | 发布版本追踪零覆盖（HG-009） | HG-009(HARD) | 2 例 |
| GAP-04 | 静默失败检测零覆盖（SR-001, BC-SILENT） | SR-001(FORCE_FAIL) | 2 例 |
| GAP-05 | EVENT 阶段幂等性零覆盖 | SG-001→EVENT | 2 例 |
| GAP-06 | VERDICT 规则撤销场景缺失 | HG-001,002 | 2 例 |
| GAP-07 | L9 规则版本回滚零覆盖 | HG-009,release.version | 2 例 |

### P1 — 高优补充（SOFT Gate或关键自治能力）

| Gap ID | 描述 | 影响 Gate | 建议新增用例数 |
|--------|------|---------|--------------|
| GAP-08 | DTO fallback 策略零覆盖（SG-003） | SG-003 | 2 例 |
| GAP-09 | LEP exec_id 唯一性零覆盖（SG-005） | SG-005 | 1–2 例 |
| GAP-10 | 发布变更通知零覆盖（SG-008） | SG-008 | 1 例 |
| GAP-11 | LEP→DTO 失败修复链路（AG-004） | AG-004 | 2 例 |
| GAP-12 | Event 优先级排序（AG-005） | AG-005 | 1 例 |
| GAP-13 | Cron 调度验证+失败重试 | DTO.trigger | 2 例 |
| GAP-14 | 向量化域全零覆盖 | ISC domain | 1 例 |
| GAP-15 | L8 跨域规则传播 | ISC.scope | 1–2 例 |
| GAP-16 | 隐含意图识别（无关键词） | HG-001 | 2 例 |
| GAP-17 | DIRECTIVE 伪装为 PRINCIPLE 反例 | HG-001 | 2 例 |
| GAP-18 | 三意图叠加 MIXED 场景 | SG-001 | 1 例 |

### P2 — 按需补充（Advisory或非核心场景）

| Gap ID | 描述 | 建议新增用例数 |
|--------|------|--------------|
| GAP-19 | 跨会话意图（依赖历史上下文） | 2 例 |
| GAP-20 | L10 多Agent P2E协同 | 2 例 |
| GAP-21 | 移动节点/飞书域覆盖 | 各1例 |
| GAP-22 | Cron 漂移检测 | 1 例 |
| GAP-23 | 矛盾意图处理 | 1 例 |
| GAP-24 | Event Schema 验证 | 1 例 |

---

## 十一、目标用例规模估算

| 优先级 | 当前用例数 | 建议补充 | 目标总数 |
|--------|-----------|---------|---------|
| P0 | 6 | +14 | 20 |
| P1 | 7 | +21 | 28 |
| P2 | 2 | +9 | 11 |
| **合计** | **15** | **+44** | **≥59** |

> 07-runner-integration.md §10 建议"从10个扩充到≥50个"，本矩阵建议目标≥59个，覆盖所有 Gate 检查项至少1个正向+1个反向（失败路径）用例。

---

## 十二、回归守护集扩充建议

当前回归守护集（8条）应扩充至 ≥16 条，建议加入：

| 新增用例（建议） | 覆盖的 Gap |
|----------------|-----------|
| AEO轨道选择正确（SUCCESS） | GAP-01, HG-004 |
| AEO评测覆盖缺失（FAIL） | GAP-01, SG-004 |
| 边界空输入不崩溃（SUCCESS） | GAP-02, HG-006 |
| 边界超长输入安全降级（PARTIAL） | GAP-02, HG-006 |
| 发布含版本记录（SUCCESS） | GAP-03, HG-009 |
| 静默失败被检测（FAIL） | GAP-04, SR-001 |
| VERDICT撤销规则（SUCCESS） | GAP-06 |
| DTO有fallback策略（SUCCESS） | GAP-08, SG-003 |

---

---

## 十三、自动化扫描结果（gate_coverage_report.py 实测）

通过 `principle-e2e-spec/scripts/gate_coverage_report.py` 对当前 `05-test-cases.json`（15个用例）扫描得到：

| 覆盖状态 | Gate数量 | 占比 |
|---------|---------|------|
| 🔴 零覆盖 | 8 / 25 | **32%** |
| ⚠️ 薄弱（仅1个用例） | 7 / 25 | 28% |
| ✅ 充分（≥2个用例） | 10 / 25 | 40% |

**工具确认的零覆盖 HARD Gate**: `HG-004`（AEO轨道选择）、`HG-006`（边界安全）  
**工具确认的零覆盖 Special Rule**: `SR-001`（静默失败）、`SR-003`（回归破坏零容忍）

> **⚠️ 重要注意事项 — 启发式探测的局限性**：
> 本工具基于标签/字段启发式推断 Gate 覆盖。`HG-008`、`HG-009`、`SG-008` 显示为"OK"，
> 是因为任何含 `expected.release` 字段的用例均被计入，但**现有用例实际未校验 `version_tracked`
> 或 `notification_sent` 具体字段**。人工精确审查（第五章）比工具扫描更保守、更准确。

---

## 关联文件

| 文件 | 说明 |
|------|------|
| `eval-corpus-coverage-matrix.md` | 本文件 — 全量覆盖度矩阵 |
| `eval-gap-dispatch-tasks.json` | 可调度的补充任务清单（18个任务，含交付物定义） |
| `eval-gap-p0-case-stubs.json` | P0级别新增用例存根（14个，tc-016 ~ tc-029） |
| `principle-e2e-spec/scripts/gate_coverage_report.py` | Gate覆盖扫描脚本（可重复运行） |
| `principle-e2e-spec/scripts/gate-coverage-report.md` | 最新扫描输出 |

---

*生成依据: principle-e2e-spec/01–07 全文、isc-rules-overlap-analysis.md、closed-book-gate-validation.md、reports/aeo-day2-gap-audit-2026-03-08.md*
