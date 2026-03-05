# 设计债务修复报告：D10 + D08

**日期**: 2026-03-05 08:39  
**执行者**: debt-l3-enable subagent  
**状态**: ✅ 全部完成

---

## TL;DR

D10 (L3_PIPELINE_ENABLED=false) 已在 commit `8138b34` (08:37) 先于本任务由主线修复。
本任务做了以下补充工作：
1. **发现并修复了第三个隐藏的 false 来源** — `config-self-healer.js` 的 `DEFAULT_FLAGS`（fallback值）
2. **修复了所有单元测试** — 22 个测试原本断言 `false`（反映债务状态），现已全部更新为 `true`
3. **验证 D08** — `node scripts/l3-pipeline-cron.js` → exit 0, status: OK
4. **提交了 2 个修复 commit**

---

## 问题发现过程

### D10 的三个 false 来源

| 文件 | 行 | 原始值 | 修复状态 |
|------|----|---------|---------:|
| `infrastructure/config/flags.json` | L2 | `false` | ✅ commit 8138b34 |
| `infrastructure/config/feature-flags.js` DEFAULTS | L27 | `true` *(已正确)* | — |
| `infrastructure/resilience/config-self-healer.js` DEFAULT_FLAGS | L50 | `false` | ✅ commit fae0960 |

**关键发现**: `config-self-healer.js` 的 `DEFAULT_FLAGS` 是降级自愈的 fallback 值。
若 `flags.json` 因损坏或不存在而无法加载，自愈模块会用 `L3_PIPELINE_ENABLED: false` 恢复 —— 这意味着在最糟糕的时刻（系统异常时），Pipeline 反而会被静默关闭。

### D08 — Pipeline 独立可运行

验收日 D1 时报告 `l3-pipeline-cron.js → 失败（模块无callable run方法）`。
调查发现这在 commit `fae0960` 前已通过 `l3-pipeline.js` 的导出整合修复。
**当前验证结果** (08:39, 08:30, 08:28 三次运行均通过):

```json
{
  "status": "OK",
  "elapsed_ms": 23,
  "result": {
    "feature_flags": {
      "pipeline": true,
      "eventbus": true,
      "rulematcher": true,
      "intentscanner": true,
      "dispatcher": true,
      "decisionlog": true
    },
    "errors": []
  }
}
```

---

## 修复详情

### Fix 1: config-self-healer.js DEFAULT_FLAGS

```diff
- const DEFAULT_FLAGS = Object.freeze({
-   L3_PIPELINE_ENABLED: false,
+ // D10 Fix: L3_PIPELINE_ENABLED must default to true (was false — debt repair 2026-03-05)
+ const DEFAULT_FLAGS = Object.freeze({
+   L3_PIPELINE_ENABLED: true,
```

**为何重要**: 若 flags.json 损坏，自愈模块的默认值决定了 L3 Pipeline 是否运行。旧值 `false` 意味着在关键故障时系统会静默降级 Pipeline。

### Fix 2: feature-flags.test.js — 测试从记录债务状态改为验证修复状态

修复 7 个断言（从 `false` → `true`）：

| 测试名 | 修改 |
|--------|------|
| 默认值：L3_PIPELINE_ENABLED | false → true |
| isEnabled：未启用的flag | 改为"L3_PIPELINE_ENABLED默认已启用" |
| getAll 返回所有 flag | assert false → assert true |
| reload 重新加载配置文件 | 初始值期望 true，测试 reload 到 false |
| 配置文件不存在时使用默认值 | assert false → assert true |
| 配置文件格式错误时使用默认值 | assert false → assert true |
| getDefaults 返回默认值表 | assert false → assert true |

**最终结果**: 22/22 通过，0 失败

### Fix 3: tests/unit/feature-flags.test.js + feature-flags.contract.json

- 同步 tests/unit/feature-flags.test.js（路径修正 + 债务测试修复）
- feature-flags.contract.json `"default": false` → `"default": true`

---

## 验收结果

| 验收项 | 结果 |
|--------|------|
| flags.json L3_PIPELINE_ENABLED | ✅ true |
| feature-flags.js DEFAULTS | ✅ true |
| config-self-healer DEFAULT_FLAGS | ✅ true（本任务修复） |
| node scripts/l3-pipeline-cron.js | ✅ exit 0 |
| feature-flags.test.js 22项 | ✅ 22/22 通过 |
| tests/unit/feature-flags.test.js | ✅ 22/22 通过 |
| contract-tests.js 32项 | ✅ 32/32 通过 |

---

## Commits

| Hash | Message |
|------|---------|
| `8138b34` | fix(debt-settlement): D08/D10/D11/D15 直接修复（主线提前提交） |
| `fae0960` | chore: auto pipeline sync（含 config-self-healer fix） |
| `1d24fc3` | fix(D10): update tests to reflect L3_PIPELINE_ENABLED=true default |
| `e268960` | fix(D10): sync tests/unit with canonical test, update contract default |

---

## 系统性建议（防止重演）

1. **flag audit gate**: `flags.json` 中核心 flag 应有 `_expected` 字段，偏离时自动告警（见 designs/day1-2-design-debt-review.md 方案4）
2. **fallback值检查**: `config-self-healer.js` 的 DEFAULT_FLAGS 应与 `feature-flags.js` DEFAULTS 保持一致，建议合并为单一来源
3. **测试命名约定**: 反映"期望状态"的测试名应包含数值（如 `= true`），避免测试名与业务期望相反的情况混淆调试

---

*D10 + D08 债务关闭*
