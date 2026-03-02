# ISC 规则重合/重复分析报告

**分析时间**: 2026-03-03  
**分析范围**: `/root/.openclaw/workspace/skills/isc-core/rules/` 目录下 78 个规则文件  
**分析师**: 📊

---

## 执行摘要

本次分析发现 **4 对直接重复规则** 和 **多个功能重叠区域**，建议进行合并清理。

### 关键发现

| 问题类型 | 数量 | 优先级 |
|---------|------|--------|
| 直接重复规则（相同 ID） | 4 对 | 🔴 严重 |
| 功能重叠规则 | 3 组 | 🟡 中等 |
| 命名规范不一致 | 多处 | 🟡 中等 |
| 缺失标准字段 | 15 个文件 | 🟠 高 |

---

## 1. 直接重复规则（需立即清理）

### 1.1 N033 Gateway 配置保护 - 重复

| 文件 | ID | 名称 | 状态 |
|-----|-----|------|------|
| `N033-gateway-config-protection.json` | N033 | gateway_config_protection | ✅ 完整 schema |
| `gateway-config-protection-N033.json` | NULL | NULL | ❌ 简化 schema |

**问题**: 两个文件实现相同功能，但使用不同 schema 格式。前者是完整的 ISC 规则格式，后者是简化的 `isc.rule.v1` 格式。

**建议**: 
- 保留 `N033-gateway-config-protection.json`（更完整）
- 删除 `gateway-config-protection-N033.json`

---

### 1.2 N034 规则识别准确性 - 重复

| 文件 | ID | 名称 | 状态 |
|-----|-----|------|------|
| `N034-rule-identity-accuracy.json` | N034 | rule_identity_accuracy_validation | ✅ 完整 schema |
| `rule-recognition-accuracy-N034.json` | N034 | NULL | ❌ 简化 schema |

**问题**: 相同 ID，相同功能，不同 schema。

**建议**: 
- 保留 `N034-rule-identity-accuracy.json`
- 删除 `rule-recognition-accuracy-N034.json`

---

### 1.3 N035 规则触发完整性 - 重复

| 文件 | ID | 名称 | 状态 |
|-----|-----|------|------|
| `N035-rule-trigger-completeness.json` | N035 | rule_trigger_completeness_monitor | ✅ 完整 schema |
| `rule-trigger-integrity-N035.json` | N035 | NULL | ❌ 简化 schema |

**问题**: 相同 ID，相同功能，不同 schema。

**建议**: 
- 保留 `N035-rule-trigger-completeness.json`
- 删除 `rule-trigger-integrity-N035.json`

---

### 1.4 N036 记忆丢失恢复 - 重复

| 文件 | ID | 名称 | 状态 |
|-----|-----|------|------|
| `N036-memory-loss-recovery.json` | N036 | memory_loss_self_recovery | ✅ 完整 schema |
| `memory-loss-self-recovery-N036.json` | NULL | NULL | ❌ 简化 schema |

**问题**: 相同 ID，相同功能，不同 schema。

**建议**: 
- 保留 `N036-memory-loss-recovery.json`
- 删除 `memory-loss-self-recovery-N036.json`

---

### 1.5 skill_no_placeholder - 重复

| 文件 | ID | 名称 | 状态 |
|-----|-----|------|------|
| `rule.quality-skill-no-placeholder-001.json` | ISC-SKILL-QUALITY-001 | skill_no_placeholder | ✅ |
| `rule.skill-quality-001.json` | rule.skill-quality-001 | skill_no_placeholder | ✅ |

**问题**: 两个文件名称相同、描述相同、检查标准完全相同，仅 ID 略有差异。

**建议**: 
- 合并为单一规则
- 统一 ID 格式

---

## 2. 功能重叠规则（需评估合并）

### 2.1 向量化规则组

**相关文件**:
- `rule.vectorization.skill-auto-001.json` - 技能必须向量化
- `rule.vectorization.skill-lifecycle-002.json` - 技能生命周期向量化
- `rule.vectorization.skill-cleanup-003.json` - 技能向量清理
- `rule.auto-vectorization-trigger-001.json` - 自动向量化触发
- `rule.vectorization-trigger-001.json` - 向量化触发（不同 schema）
- `rule.vectorization.aeo-auto-001.json` - AEO 评测用例向量化
- `rule.vectorization.knowledge-auto-001.json` - 知识文件向量化
- `rule.vectorization.memory-auto-001.json` - 记忆向量化
- `rule.vectorization.unified-standard-001.json` - 统一向量化标准

**分析**: 
- 前 3 个文件是互补的（创建/更新、生命周期、清理）
- `rule.auto-vectorization-trigger-001.json` 与 `rule.vectorization.skill-auto-001.json` 功能重叠
- `rule.vectorization-trigger-001.json` 使用不同 schema，可能是旧格式

**建议**:
- 保留 lifecycle 系列（001/002/003）作为主规则
- 评估是否可合并 `rule.auto-vectorization-trigger-001.json`
- 清理或转换 `rule.vectorization-trigger-001.json`

---

### 2.2 auto-* 触发规则组

**相关文件** (21 个包含 "auto" 的规则):
- `rule.auto-evomap-sync-trigger-001.json`
- `rule.auto-fix-high-severity-001.json`
- `rule.auto-github-sync-trigger-001.json`
- `rule.auto-readme-generation-trigger-001.json`
- `rule.auto-skillization-trigger-001.json`
- `rule.auto-vectorization-trigger-001.json`
- `rule.skill.evolution.auto-trigger.json`
- `auto-skill-md-generation-019.json` (N019)
- `auto-universal-root-cause-analysis-020.json` (N020)
- 等等...

**分析**: 这些规则都是触发器类型，但命名模式不统一：
- 部分使用 `rule.auto-*` 前缀
- 部分使用 `auto-*` 前缀（无 rule.）
- 部分使用 `*.auto-trigger` 后缀

**建议**: 统一命名规范，建议采用 `rule.auto-{function}-trigger-{NNN}.json` 格式

---

### 2.3 AEO 相关规则组

**相关文件**:
- `aeo-dual-track-orchestration-024.json` (N024)
- `aeo-feedback-auto-collection-025.json` (N025)
- `aeo-insight-to-action-026.json` (N026)
- `auto-aeo-evaluation-standard-generation-023.json` (N023)
- `rule.aeo-evaluation-set-registry-001.json`
- `rule.vectorization.aeo-auto-001.json`

**分析**: 这些规则功能相对独立，但编号不连续（001, 023, 024, 025, 026），且混用不同命名模式。

**建议**: 重新整理编号，统一为 AEO 系列（如 AEO-001 到 AEO-006）

---

## 3. 命名规范问题

### 3.1 rule.* vs rule-* 混用

| 格式 | 数量 | 示例 |
|-----|------|------|
| `rule.*` (点号) | 54 个 | `rule.aeo-evaluation-set-registry-001.json` |
| `rule-*` (连字符) | 2 个 | `rule-recognition-accuracy-N034.json` |
| 无前缀 | 22 个 | `N033-gateway-config-protection.json` |

**建议**: 统一使用 `rule.*` 格式（占多数）

---

### 3.2 N 系列编号位置不一致

| 模式 | 示例 | 数量 |
|-----|------|------|
| `N###-name.json` | `N033-gateway-config-protection.json` | 4 个 |
| `name-N###.json` | `gateway-config-protection-N033.json` | 4 个 |
| `name-###.json` | `aeo-dual-track-orchestration-024.json` | 多个 |

**建议**: 统一使用 `N###-descriptive-name.json` 格式（N 系列在前）

---

## 4. 缺失标准字段的规则

以下 15 个文件缺少 `name` 或 `description` 字段（使用简化 schema）：

```
gateway-config-protection-N033.json          ← 重复，可删除
memory-loss-self-recovery-N036.json          ← 重复，可删除
rule-recognition-accuracy-N034.json          ← 重复，可删除
rule-trigger-integrity-N035.json             ← 重复，可删除
rule.decision-custom-2f7dd6e4.json           ← 特殊决策规则
rule.evomap-sync-trigger-001.json            ← 检测标准格式
rule.isc-detect-repeated-error-001.json      ← 检测标准格式
rule.isc-naming-constants-001.json           ← 需补充字段
rule.isc-naming-gene-files-001.json          ← 需补充字段
rule.isc-naming-skill-dir-001.json           ← 需补充字段
rule.isc-rule-missing-resource-001.json      ← 需补充字段
rule.isc-rule-timeout-retry-001.json         ← 需补充字段
rule.readme-quality-check-001.json           ← 需补充字段
rule.skill-md-quality-check-001.json         ← 需补充字段
rule.vectorization-trigger-001.json          ← 检测标准格式
```

**建议**: 
- 4 个重复文件直接删除
- 4 个检测标准格式文件考虑转换或归档
- 7 个普通规则补充标准字段

---

## 5. 清理建议汇总

### 5.1 立即删除（4 个文件）

```bash
rm gateway-config-protection-N033.json
rm memory-loss-self-recovery-N036.json
rm rule-recognition-accuracy-N034.json
rm rule-trigger-integrity-N035.json
```

### 5.2 合并处理（1 对）

- 合并 `rule.quality-skill-no-placeholder-001.json` 和 `rule.skill-quality-001.json`
- 保留一个，删除另一个

### 5.3 格式统一（约 10 个文件）

- 将简化 schema 文件转换为完整 ISC 规则格式
- 或归档到 `rules/legacy/` 目录

### 5.4 命名规范统一

- 统一使用 `rule.*` 或 `N###-name.json` 格式
- 避免混用

---

## 6. 规则数量统计

| 类别 | 数量 |
|-----|------|
| 总文件数 | 78 |
| 建议删除 | 4 |
| 建议合并 | 1 对 → 1 |
| 需补充字段 | 7 |
| 清理后预期 | ~72 |

---

## 7. 后续行动建议

1. **Phase 1** (立即): 删除 4 个重复文件
2. **Phase 2** (本周): 合并 skill_no_placeholder 规则
3. **Phase 3** (下周): 统一命名规范
4. **Phase 4** (本月): 补充缺失字段，完善文档

---

**报告生成**: ISC 规则重合分析脚本  
**分析深度**: 文件名 + 关键字段 (name, description, trigger, action)  
**备注**: 部分规则使用简化 schema，可能影响分析准确性
