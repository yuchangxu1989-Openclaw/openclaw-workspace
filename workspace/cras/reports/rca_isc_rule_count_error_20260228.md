# ISC规则数量错误根因分析报告

**分析时间**: 2026-02-28  
**问题**: 错误地回答ISC有18条规则(N001-N018)，实际为61条  
**分析者**: AI Assistant

---

## 一、核心发现摘要

| 项目 | 错误信息 | 实际情况 |
|------|----------|----------|
| **规则数量** | 18条 | **61条** |
| **编号范围** | N001-N018 | N001-N032 + R系列 + 其他 |
| **错误偏差** | -43条 (-70%) | - |

---

## 二、18条数字的可能来源分析

### 2.1 最直接的来源：编号序列误解

**关键证据**:
```javascript
// 来自 skills/isc-core/index.js 第153行
// 5项命名规范 (N001-N005)
namingStandards: {
  N001: { id: 'N001', name: 'skill-dir-naming', ... },
  N002: { id: 'N002', name: 'file-naming', ... },
  N003: { id: 'N003', name: 'constants-naming', ... },
  N004: { id: 'N004', name: 'gene-files-naming', ... },
  N005: { id: 'N005', name: 'rule-id-naming', ... }
}
```

**误解链条**:
1. 看到了N001-N005的命名规范定义
2. 后来又看到N016/N017/N018的新增记录
3. 错误推断："N001到N018，共18条规则"
4. 忽略了编号不连续的事实（N006-N015之间有很多缺失）

### 2.2 辅助来源：MEMORY.md中的记录

**MEMORY.md第74行**:
```
- **规则演进**: ISC规则新增N016/N017/N018，持续完善标准体系
```

这条记录强化了"N016/N017/N018是新增规则"的印象，可能导致误认为N001-N018是一个完整的18条规则系列。

### 2.3 编号体系的混淆

**实际的N系列规则分布**:
```
N001-N005:  命名规范（5条，在index.js中定义，非独立文件）
N006:       naming-skill-bilingual-display-006.json
N007-v2:    interaction-source-file-delivery-007.json
N016:       decision-auto-repair-loop-post-pipeline-016.json
N017:       detection-cras-recurring-pattern-auto-resolve-017.json
N018:       detection-skill-rename-global-alignment-018.json
N019:       auto-skill-md-generation-019.json
N020:       auto-universal-root-cause-analysis-020.json
N022:       detection-architecture-design-isc-compliance-audit-022.json
N023:       auto-aeo-evaluation-standard-generation-023.json
N024:       aeo-dual-track-orchestration-024.json
N025:       aeo-feedback-auto-collection-025.json
N026:       aeo-insight-to-action-026.json
N028:       auto-skill-change-vectorization-028.json
N029:       model-api-key-pool-management-029.json
N032:       evomap-mandatory-security-scan-032.json
```

**关键发现**: N系列规则编号不连续！N008-N015、N021、N027、N030-N031等编号缺失。

---

## 三、混淆根因深度分析

### 3.1 规则编号 ≠ 规则数量

**错误模式**: 将编号范围(N001-N018)误解为数量(18条)

**实际情况**:
- N001-N018范围内的实际规则：N001-N007, N016-N018 = **11条**
- 编号跳跃：N008-N015不存在（可能预留或已废弃）
- 超过N018的N系列规则：N019, N020, N022, N023, N024, N025, N026, N028, N029, N032

### 3.2 规则类型体系的复杂性

ISC规则体系包含多个类别：

| 类别 | 前缀 | 数量 | 示例 |
|------|------|------|------|
| **命名标准** | N | 15条 | N001-N007, N016-N020, N022-N026, N028-N029, N032 |
| **决策规则** | R | 3条 | R006, R013, R014 |
| **安全规则** | S | 1条 | S005 |
| **通用规则** | rule. | 40条+ | rule.auto-skillization-trigger-001.json |
| **其他** | - | 2条+ | rule_2f7dd6e4, isc-detect-repeated-error |

**总计**: 61条规则文件

### 3.3 信息来源的片段性

**导致错误的认知路径**:
```
1. 看到 index.js 中的 N001-N005 (5条命名规范)
      ↓
2. 看到 MEMORY.md 提到 "新增N016/N017/N018"
      ↓
3. 错误推断: N001-N018 是一个完整的18条规则系列
      ↓
4. 未验证实际文件数量，直接回答"18条"
```

---

## 四、N001-N018的真实含义

### 4.1 命名规范预留区间

根据 `rule.isc-naming-convention-001.json`:
```json
"naming_convention": {
  "categories": {
    "R001-R005": "核心自动化规则",
    "R006-R099": "决策规则预留",
    "N001-N099": "命名标准预留",
    "S001-S099": "安全规则预留",
    "Q001-Q099": "质量规则预留"
  }
}
```

**N001-N099是命名标准的编号预留区间**，而非实际存在的规则数量。

### 4.2 实际使用的N系列规则

| 编号 | 规则名称 | 类型 | 创建时间 |
|------|----------|------|----------|
| N001-N005 | 命名规范(5条) | naming-standards | 早期定义 |
| N006 | 双语显示规范 | naming | 2026-02-25 |
| N007-v2 | 源文件交付 | interaction | 未知 |
| N016 | 自动修复循环 | decision | 2026-02-25 |
| N017 | CRAS重复模式自动解决 | detection | 2026-02-25 |
| N018 | 技能重命名全局对齐 | detection | 2026-02-25 |
| N019+ | AEO相关规则(8条) | aeo | 2026-02-26 |
| N028-N032 | 其他规则 | various | 后期添加 |

**关键**: N008-N015是预留空号，实际未使用！

---

## 五、如何避免此类错误

### 5.1 验证机制

**原则**: 对于数量类问题，必须基于实际文件计数

```bash
# 正确的验证方式
ls /root/.openclaw/workspace/skills/isc-core/rules/*.json | wc -l
# 输出: 61
```

### 5.2 信息溯源

**检查清单**:
- [ ] 不要基于编号范围推断数量
- [ ] 不要基于MEMORY.md片段推断
- [ ] 必须查看实际文件系统状态
- [ ] 必须理解编号体系的结构

### 5.3 建立规则索引

**建议**: 创建自动更新的规则清单文件

```json
// isc-rule-manifest.json (自动生成)
{
  "total_count": 61,
  "last_updated": "2026-02-28T16:00:00Z",
  "by_category": {
    "naming_standards": 15,
    "decision_rules": 3,
    "security_rules": 1,
    "general_rules": 42
  },
  "n_series": {
    "total": 15,
    "range": "N001-N032(不连续)",
    "gaps": ["N008-N015", "N021", "N027", "N030-N031"]
  }
}
```

### 5.4 回答前自检

**自检问题**:
1. 我的数据来源是什么？
2. 是否有验证过的实际数据？
3. 编号范围和实际数量是否一致？
4. 是否需要用`ls | wc -l`确认？

---

## 六、结论

### 根本原因

1. **编号范围误解**: 将N001-N018的编号范围误解为18条规则的实际数量
2. **信息片段化**: 基于MEMORY.md中的"新增N016/N017/N018"片段推断
3. **缺乏验证**: 未执行实际的文件计数验证
4. **体系复杂**: ISC规则体系包含多种类型（N/R/S/rule.等），容易混淆

### 纠正措施

1. **立即纠正**: 向用户说明实际规则数量为61条
2. **建立索引**: 创建自动更新的规则清单
3. **流程改进**: 对数量类问题强制要求文件系统验证
4. **文档更新**: 在MEMORY.md中添加规则数量校验记录

---

## 附录：规则文件完整列表

```
# 61条规则文件 (按文件名排序)

aeo-dual-track-orchestration-024.json          (N024)
aeo-feedback-auto-collection-025.json          (N025)
aeo-insight-to-action-026.json                 (N026)
auto-aeo-evaluation-standard-generation-023.json (N023)
auto-skill-change-vectorization-028.json       (N028)
auto-skill-md-generation-019.json              (N019)
auto-universal-root-cause-analysis-020.json    (N020)
decision-auto-repair-loop-post-pipeline-016.json (N016)
detection-architecture-design-isc-compliance-audit-022.json (N022)
detection-cras-recurring-pattern-auto-resolve-017.json (N017)
detection-skill-rename-global-alignment-018.json (N018)
evomap-mandatory-security-scan-032.json        (N032)
model-api-key-pool-management-029.json         (N029)
skill-permission-classification-031.json
skill-security-gate-030.json
rule.aeo-evaluation-set-registry-001.json
rule.auto-evomap-sync-trigger-001.json
rule.auto-fix-high-severity-001.json
rule.auto-github-sync-trigger-001.json
rule.auto-readme-generation-trigger-001.json
rule.auto-skillization-trigger-001.json
rule.auto-vectorization-trigger-001.json
rule.cron-task-model-requirement-001.json
rule.cron-task-model-selection-002.json
rule.decision-capability-anchor-013.json       (R013)
rule.decision-council-seven-required-001.json  (R006)
rule.decision-custom-2f7dd6e4.json
rule.decision-proactive-skillization-014.json  (R014)
rule.detection-report-feishu-card-001.json     (S005)
... (共61条)
```

---

**报告完成**  
*建议将此报告保存至 `cras/reports/rca_isc_rule_count_error_20260228.md`*
