# ISC v3.1.0 升级方案

## 升级目标

从"标准管理者"演进为"标准生成与演进机制管理者"，明确 ISC-本地任务编排 边界，实现语义化标准体系。

---

## 核心变更

### 1. 语义化 ID 体系（兼容现有）

```javascript
// 标准注册格式
{
  "id": "naming.skill.display",           // 语义化 ID（新增）
  "legacyId": "N006",                      // 兼容编号（保留）
  "domain": "naming",                      // 域
  "type": "format",                        // 类型
  "scope": "skill",                        // 作用范围
  "description": "技能名称双语展示规范",
  "check_fn": "checkSkillNameBilingual",
  "severity": "high",
  "enabled": true
}
```

**映射关系**：
- N006 → naming.skill.display
- N007 → interaction.user.query.source_file
- R001 → rule.auto_skillization
- S001 → quality.md.length

### 2. ISC-本地任务编排 边界重构（关键架构修正）

**现有问题**：ISC 主动分发到 PDCA 流水线（越界）

**修正后架构**：
```
┌─────────────────────────────────────────────────────────┐
│                      职责边界                            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   ISC (规范提供者)              本地任务编排 (编排执行者)         │
│   ┌─────────────┐              ┌─────────────┐         │
│   │ 标准定义    │─────────────→│ 检查点注册  │         │
│   │ 检查点规范  │              │ 执行编排    │         │
│   │ 校验接口    │←─────────────│ 结果回写    │         │
│   └─────────────┘              └─────────────┘         │
│        ↑                              │                │
│        │                              ▼                │
│   ┌─────────────┐              ┌─────────────┐         │
│   │ 血缘追踪    │              │ PDCA 流水线 │         │
│   │ 影响分析    │              │ 定时任务    │         │
│   └─────────────┘              └─────────────┘         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**接口变更**：
```javascript
// 删除（越界）
isc.distributeTo('pdca-pipeline');

// 新增（规范提供）
isc.registerCheckpoints(['quality.md.length', 'naming.skill.display']);
isc.check('quality.md.length', target);
isc.getCheckpointsForPhase('verify');

// 本地任务编排 调用方式
const checkpoints = isc.getCheckpointsForPhase('verify');
for (const cp of checkpoints) {
  const result = await isc.check(cp.id, skill);
  if (result.status !== 'pass') {
    // 本地任务编排 自行决定如何处理
  }
}
```

### 3. 标准血缘追踪

```javascript
{
  "id": "naming.skill.display",
  "version": "1.1.0",
  "lineage": {
    "created_by": "problem_20260223_001",     // 源问题
    "evolved_from": null,                      // 父标准
    "deprecated_by": null,                     // 替代标准
    "evolution_chain": ["1.0.0", "1.1.0"],    // 版本链
    "related_problems": ["p001", "p002"],      // 关联问题
    "related_standards": ["naming.skill.dir"]  // 关联标准
  },
  "impact_analysis": {
    "affected_skills": ["isc-core", "seef"],
    "affected_systems": ["skill-creator", "evaluator"],
    "required_revalidation": ["cras-generated-*"]
  }
}
```

### 4. 双向偏移检测

```javascript
// 现有：标准 → 技能（标准更新后技能未对齐）
isc.detectStandardToSkillDrift();

// 新增：技能 → 标准（技能使用未声明的标准）
isc.detectSkillToStandardDrift();

// 输出统一事件格式
{
  "type": "mismatch",
  "direction": "skill-to-standard",  // 或 "standard-to-skill"
  "subject": "skill_x",
  "standard_id": "quality.md.length",
  "severity": "high",
  "detected_at": "2026-02-23T21:45:00Z"
}
```

### 5. 失效标准标记（保守策略）

```javascript
// 提案：30天无引用自动 deprecated（过于激进）
// 建议：90天无引用 + 非核心标准 → 标记 review

{
  "id": "naming.skill.display",
  "status": "active",  // active | review | deprecated
  "usage_stats": {
    "last_referenced": "2026-02-23T10:00:00Z",
    "reference_count_30d": 5,
    "reference_count_90d": 12
  },
  "review_trigger": {
    "condition": "90d_no_reference AND not_core",
    "action": "mark_review",
    "notification": "council_of_seven"  // 通知议会审议
  }
}
```

---

## 实施阶段

### Phase 1: 语义化 ID 迁移（1天）
- [ ] 创建 ID 映射表
- [ ] 更新标准注册接口
- [ ] 保留 legacyId 兼容

### Phase 2: ISC-本地任务编排 边界重构（2天）
- [ ] 删除 distributeTo 方法
- [ ] 新增 registerCheckpoints / check 接口
- [ ] 更新 本地任务编排 调用方式

### Phase 3: 血缘与检测增强（2天）
- [ ] 实现 lineage 字段
- [ ] 实现 impact_analysis
- [ ] 实现双向偏移检测

### Phase 4: SKILL.md 重构（1天）
- [ ] 去除"演进历史"、"归属"等无意义信息
- [ ] 保留设计思路与实现逻辑
- [ ] 更新 API 文档

---

## 兼容性保障

| 现有代码 | 兼容方案 | 废弃时间 |
|:---------|:---------|:---------|
| N006 | 映射到 naming.skill.display，保留 legacyId | v4.0.0 |
| isc.distributeTo() | 保留为 wrapper，内部调用新接口 | v4.0.0 |
| unified-standards.json | 自动迁移到新格式 | v3.2.0 |

---

## 风险与缓解

| 风险 | 缓解措施 |
|:-----|:---------|
| 语义化 ID 冲突 | 系统校验唯一性，冲突时拒绝注册 |
| 本地任务编排 边界变更影响大 | 保留旧接口 wrapper，渐进式迁移 |
| 血缘追踪性能开销 | 异步生成，缓存影响分析结果 |

---

**起草时间**: 2026-02-23  
**版本**: v3.1.0  
**状态**: 待审议
