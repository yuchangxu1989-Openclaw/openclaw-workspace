# 07 - Runner 集成指南

## 1. 概述

本文档描述如何基于本规范实现 P2E E2E 评测 Runner。Runner 负责驱动评测管道执行，消费 `05-test-cases.json` 中的测试用例，遵守 `06-gate-criteria.yaml` 中的 Gate 标准，输出符合 `03-verdict-schema.json` 的评测结论。

**新增统一 benchmark 入口要求**：所有 benchmark runner 入口在进入正式评测前，必须先串行通过双 Gate：

1. `ISC-INTENT-EVAL-001`：benchmark case / intent 入参完整性与可评测性检查
2. `ISC-CLOSED-BOOK-001`：closed-book 约束检查（allowlist-only + denylist blocking + evidence/audit）

两个 Gate 均为 **HARD**，且默认 **fail-closed**：
- 任一 Gate 缺失、无法执行、字段不完整、输出不合法 → 直接 `FAIL`
- 不允许“未配置即跳过”
- 不允许“解析失败但继续跑 benchmark”

最小统一实现见：`scripts/benchmark_runner.py`

---

## 2. 文件消费关系

```
Runner 消费关系：

  [02-pipeline-spec.yaml]     → 管道阶段定义、检查项配置
  [05-test-cases.json]        → 驱动测试用例
  [06-gate-criteria.yaml]     → GO/NO-GO 决策标准
  [03-verdict-schema.json]    → 评测结论输出格式
  [04-badcase-schema.json]    → Badcase 记录格式
```

---

## 3. Runner 最小实现契约

### 3.1 接口定义

```typescript
interface P2ERunner {
  /**
   * 执行单个测试用例
   */
  runCase(testCase: P2ETestCase): Promise<P2EVerdictResult>;

  /**
   * 执行全量测试集
   */
  runAll(cases?: P2ETestCase[]): Promise<P2ERunSummary>;

  /**
   * 仅执行回归守护用例（regression_guard: true）
   */
  runRegressionGuard(): Promise<P2ERunSummary>;
}
```

### 3.2 测试用例结构（05-test-cases.json）

```typescript
interface P2ETestCase {
  case_id: string;            // 用例ID，如 "p2e-tc-001"
  name: string;               // 用例名称
  intent_type: string;        // PRINCIPLE | VERDICT | CONSTRAINT | GOAL | DIRECTIVE
  input: {
    utterance: string;        // 原始用户输入
    context?: object;         // 上下文（可选）
  };
  expected: {                 // 预期结果（各阶段）
    intent?: object;
    isc_rule?: object;
    dto_task?: object;
    release?: object;
    [stage: string]: any;
  };
  verdict_expectation: string; // SUCCESS | PARTIAL | FAIL | SKIP
  skip_reason?: string;
  priority: string;           // P0 | P1 | P2
  tags: string[];
  regression_guard: boolean;  // true → 纳入回归守护集
}
```

### 3.3 评测结论输出（遵循 03-verdict-schema.json）

Runner 必须输出包含以下字段的结论对象：

```json
{
  "verdict_id": "verdict-<uuid>",
  "run_id": "run-<date>-<seq>",
  "case_id": "p2e-tc-001",
  "verdict": "SUCCESS|PARTIAL|FAIL|SKIP",
  "p2e_score": 0.92,
  "hard_gate_failures": 0,
  "stage_results": [...],
  "created_at": "ISO8601"
}
```

---

## 4. 管道阶段执行顺序

```
阶段执行严格遵循 02-pipeline-spec.yaml 中 order 字段：

  order 1: intent
  order 2: event
  order 3: isc
  order 4: dto
  order 5: cras   (可并行 aeo)
  order 6: aeo    (可并行 cras)
  order 7: lep
  order 8: test
  order 9: gate
  order 10: release (条件：gate.decision != FAIL)
```

**并行执行规则**：
- `cras` 和 `aeo` 可并行（均依赖 `dto`）
- `lep` 需等待 `dto` 完成
- `test` 需等待 `lep` 和 `aeo` 完成

---

## 5. Gate 决策执行逻辑

Runner 在 `gate` 阶段调用 Gate 决策：

```python
def compute_gate_decision(stage_results: list[StageResult]) -> GateDecision:
    hard_failures = count_hard_gate_failures(stage_results)
    regression_failures = count_regression_failures(stage_results)
    p2e_score = compute_weighted_score(stage_results)
    
    # 特殊规则优先（sr-001, sr-002, sr-003）
    if is_silent_failure(stage_results):
        return GateDecision(verdict="FAIL", reason="sr-001: 静默失败")
    
    if regression_failures > 0:
        return GateDecision(verdict="FAIL", reason="sr-003: 回归破坏")
    
    if has_high_risk_without_approval(stage_results):
        return GateDecision(verdict="PARTIAL", reason="sr-002: 高风险未确认")
    
    # 标准判定
    if hard_failures > 0 or p2e_score < 0.60:
        return GateDecision(verdict="FAIL", reason=f"hard_failures={hard_failures}, score={p2e_score}")
    elif p2e_score < 0.85:
        return GateDecision(verdict="PARTIAL", reason=f"score={p2e_score}")
    else:
        return GateDecision(verdict="SUCCESS", reason=f"score={p2e_score}")
```

---

## 6. 阶段评分计算

```python
# 权重来自 02-pipeline-spec.yaml scoring.stage_weights
STAGE_WEIGHTS = {
    "intent": 0.20,
    "isc":    0.25,
    "dto":    0.20,
    "aeo":    0.15,
    "lep":    0.10,
    "cras":   0.05,
    "event":  0.05,
}

def compute_weighted_score(stage_results: list) -> float:
    total = 0.0
    for stage in stage_results:
        weight = STAGE_WEIGHTS.get(stage.stage_id, 0)
        total += weight * stage.score
    return min(1.0, total)
```

---

## 7. Badcase 记录规范

当某阶段失败时，Runner 必须：

1. 自动生成 Badcase 记录（遵循 `04-badcase-schema.json`）
2. 从 `04-badcase-schema.json` 中 `subcategory` 枚举推断二级分类
3. 设置 `severity`：
   - HARD Gate 失败 → `CRITICAL` 或 `HIGH`
   - SOFT Gate 失败 → `MEDIUM`
   - ADVISORY Gate 失败 → `LOW`
4. 将 Badcase 记录写入 `output/badcases/` 目录

---

## 8. 静默失败检测

静默失败是最危险的 Badcase 类型，Runner 必须实现：

```python
def is_silent_failure(stage_results: list, timeout_ms: int = 90000) -> bool:
    """
    静默失败判定：
    - 总执行时间 > 90s 且无明确结果
    - 某阶段既无 PASS 也无 FAIL 且无错误日志
    - 全链路完成但意图未被执行（无ISC规则、无DTO任务）
    """
    isc_stage = find_stage(stage_results, "isc")
    dto_stage = find_stage(stage_results, "dto")
    
    if isc_stage and isc_stage.artifacts.get("rule_draft") is None:
        if isc_stage.error is None:  # 无错误但无产出
            return True
    
    return False
```

---

## 9. 输出目录结构

Runner 执行后应产出以下文件结构：

```
output/
├── runs/
│   └── run-20260307-001/
│       ├── summary.json          # 本次run汇总（总分、通过率、用时）
│       ├── verdicts/
│       │   ├── verdict-p2e-tc-001.json
│       │   ├── verdict-p2e-tc-002.json
│       │   └── ...
│       └── badcases/
│           ├── bc-p2e-tc-007.json
│           └── ...
└── reports/
    └── p2e-report-20260307.md   # 人类可读评测报告
```

---

## 10. 回归守护集

优先执行 `regression_guard: true` 的用例（共 8 条）：

| 用例ID | 意图类型 | 说明 |
|--------|----------|------|
| p2e-tc-001 | CONSTRAINT | LLM失败率告警 |
| p2e-tc-002 | PRINCIPLE | 技能lint自动化 |
| p2e-tc-003 | VERDICT | ISC命名规范全自动 |
| p2e-tc-005 | DIRECTIVE | 应被跳过P2E轨道 |
| p2e-tc-008 | CONSTRAINT | 规则冲突检测 |
| p2e-tc-011 | VERDICT | 安全敏感拒绝 |
| p2e-tc-012 | PRINCIPLE | 发布后回归检查 |
| p2e-tc-015 | PRINCIPLE | 多规则原子发布 |

回归守护集全部 `SUCCESS`（或 `SKIP`）为发布必要条件。

---

## 11. 版本兼容性说明

| 字段 | 当前版本 | 向后兼容 |
|------|----------|---------|
| spec_version | 1.0.0 | N/A（首版） |
| 新增 stage | 需要同步更新 pipeline-spec.yaml 和 gate-criteria.yaml | - |
| 新增 intent_type | 需要同步更新 01-evaluation-model.md 和 05-test-cases.json | - |

---

## 12. 快速验证命令（示意）

```bash
# 运行全量P2E评测
p2e-runner run --spec ./principle-e2e-spec --cases ./05-test-cases.json

# 仅运行回归守护集
p2e-runner run --regression-only --spec ./principle-e2e-spec

# 验证特定用例
p2e-runner run --case p2e-tc-003 --spec ./principle-e2e-spec

# 查看最新报告
p2e-runner report --latest
```
