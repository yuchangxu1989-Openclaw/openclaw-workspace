# P1-2 修复报告：SEEF Evaluator 接入真实 ISC 校验

**日期**: 2026-03-03  
**优先级**: P1  
**状态**: ✅ 已完成  
**提交**: `00aa502` `[P1-FIX] SEEF Evaluator: replace mock ISC checks with real isc_bridge`

---

## 问题描述

SEEF Evaluator（`subskills/evaluator.py`）中的 `_check_standard_compliance()` 和 `_analyze_user_behavior()` 方法返回硬编码模拟值：

```python
# 旧代码 - 模拟 ISC 标准检查
def _check_standard_compliance(self, skill_path):
    return {
        'status': 'passed',
        'compliance_score': 0.85,  # ← 硬编码！
        'findings': []
    }

# 旧代码 - 模拟 CRAS 报告分析
def _analyze_user_behavior(self, cras_report):
    return {
        'status': 'analyzed',
        'success_rate': cras_report.get('success_rate', 0.95)  # ← 直接透传，无分析
    }
```

这导致评估结果不可信，任何技能都会得到 0.85 的合规分数。

## 修复方案

### 1. 新增 `isc_bridge.py`（Python→JSON 桥接层）

**文件**: `/root/.openclaw/workspace/skills/seef/isc_bridge.py`

从 `isc-core/rules/*.json` 加载真实 ISC 规则（当前 78 条），针对技能目录执行校验。

**支持的规则类型**:

| 规则结构 | 映射校验 | 示例规则 |
|---------|---------|---------|
| `rules[].action.type == 'file_existence_check'` | 必需文件存在性 | `skill-mandatory-skill-md-001` |
| `rules[].action.type == 'content_validation'` | SKILL.md 字段校验 | `skill-mandatory-skill-md-001 R-M2` |
| `check_criteria.must_have` | 质量标准检查 | `skill-quality-001` |
| `threshold.minLength / requiredFields` | 检测标准 | `skill_md_quality` |
| `naming_convention` | 目录命名规范 | `isc-naming-convention-001` |
| `scope == 'system'` | 跳过（不适用于单技能） | `N033`, `N034` |

**内置基础检查**（不依赖规则文件）:
- `BUILTIN-001`: SKILL.md 存在性
- `BUILTIN-002`: 可执行代码文件存在性
- `BUILTIN-003`: SKILL.md 内容质量（>100字、含 name/description）

**API**:
- `load_rules(category=None)` → 加载所有/过滤后的 ISC 规则
- `check_skill(skill_path, rules=None)` → 完整校验结果
- `get_compliance_summary(skill_path)` → 精简摘要
- `batch_check(skill_dirs)` → 批量校验

### 2. 修改 `evaluator.py` (v1.0.0 → v1.1.0)

**`_check_standard_compliance()`**:
- 调用 `isc_bridge.check_skill()` 获取真实校验结果
- ISC 校验的 failed/warning 项自动注入到 evaluator findings
- 返回真实合规分数、加载规则数、通过/失败/跳过计数
- 异常时优雅降级（返回 `degraded` 状态而非崩溃）

**`_analyze_user_behavior()`**:
- 不再直接透传 CRAS 报告字段
- 根据 `workaround_count > 3` 生成功能缺口 warning
- 根据 `success_rate < 0.8` 生成低成功率 error
- 输出 pain_point_count 统计

## 测试结果

```
✅ Loaded 78 ISC rules
   Domains: aeo=1, automation=8, governance=3, naming=1, quality=3, security=2, ...

📊 AEO check:
   passed=19, failed=1, warnings=0, skipped=61
   score=0.95

📋 ISC-Core: score=0.95, verdict=COMPLIANT
📋 SEEF:     score=0.95, verdict=COMPLIANT
```

评估器对 AEO 技能的 ISC 合规评分从硬编码的 `0.85` 变为真实计算的 `0.95`（19/20 规则通过，1 条失败在 S005 必需字段检查）。

## 文件变更

| 文件 | 操作 | 说明 |
|------|------|------|
| `skills/seef/isc_bridge.py` | **新增** | ISC 规则桥接层 (340+ 行) |
| `skills/seef/subskills/evaluator.py` | **修改** | v1.0.0→1.1.0，去除 mock |

## 影响范围

- `evaluator.py` 的 `_check_standard_compliance()` 现在返回真实数据
- `evaluator_v2.py` 未修改（它使用 `openclaw doctor` 而非 ISC 直接校验，是不同路径）
- 其他 6 个子技能（aligner, validator, optimizer, creator, discoverer, recorder）中有 `creator_v2.py` 包含模拟代码，本次未修改（非 P1 范围）
