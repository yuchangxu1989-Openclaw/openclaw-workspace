# eval-runner V4 Track 设计方案

> 日期：2026-03-10
> 基于：评测标准与基线V4（doc: JxhNdoc7ko7ZLwxJUJHcWyeDnYd）
> 现有runner：`skills/public/eval-runner/`

---

## 一、设计背景

现有 eval-runner v1.0 仅实现了5维度意图理解评测（意图分类准确性、执行链完整性、跨模块协同、隐含意图捕获、上下文利用），输出 Pass/Partial/Badcase 三级判定。

V4标准定义了完整的评测流水线：

```
Pre-Gate → Gate-A（审计工具可信门）→ 五项北极星指标评测 → Gate-B（标准-脚本绑定门）→ 最终评级
```

现有runner缺失：
1. Pre-Gate / Gate-A / Gate-B 三道门禁
2. 北极星Top 5指标的独立评测轨道
3. 门禁短路机制（任一Gate不通过则终止后续流程）
4. 结构化JSON输出（含各指标分数+Gate通过状态）

本方案设计两条新Track来补齐。

---

## 二、整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    eval-runner v2                        │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │              Gate Track（串行门禁）               │    │
│  │                                                   │    │
│  │  Pre-Gate ──→ Gate-A ──→ Gate-B                  │    │
│  │     │            │          │                     │    │
│  │   Fail?→终止   Fail?→终止  Fail?→终止            │    │
│  │     │            │          │                     │    │
│  │     ↓            ↓          ↓                     │    │
│  │   通过 ────→  通过 ────→  通过 ──→ Gate全通过     │    │
│  └─────────────────────────────────────────────────┘    │
│                        │                                 │
│                   Gate全通过？                            │
│                   ├─ 否 → 输出Gate失败报告，终止          │
│                   ├─ 是 ↓                                │
│  ┌─────────────────────────────────────────────────┐    │
│  │           北极星 Track（并行独立评测）             │    │
│  │                                                   │    │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐  │    │
│  │  │指标1 │ │指标2 │ │指标3 │ │指标4 │ │指标5 │  │    │
│  │  │言出法│ │自主闭│ │认知层│ │独立QA│ │根因分│  │    │
│  │  │随达成│ │环率  │ │真实代│ │覆盖率│ │析覆盖│  │    │
│  │  │率    │ │      │ │码覆盖│ │      │ │率    │  │    │
│  │  └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘  │    │
│  │     ↓        ↓        ↓        ↓        ↓       │    │
│  │  score1   score2   score3   score4   score5      │    │
│  └─────────────────────────────────────────────────┘    │
│                        │                                 │
│                   汇总 → 最终评级                         │
└─────────────────────────────────────────────────────────┘
```

注意V4标准的执行顺序是 Pre-Gate → Gate-A → 北极星 → Gate-B → 最终评级。但从实现角度，Gate-B（标准-脚本绑定门）检查的是"评测脚本是否与最新标准版本绑定"，属于评测基础设施自检，可以在北极星评测之前执行。设计上将三道Gate统一前置，确保评测环境完整性后再跑北极星。

---

## 三、Gate Track 详细设计

### 3.1 执行模式

串行执行，短路终止。任一Gate返回 `fail` 则立即停止，不执行后续Gate和北极星Track。

### 3.2 Pre-Gate — 基础完整性门禁

检查被测对象（ISC规则/评测用例）的结构完整性。

| 检查项 | 检查逻辑 | 失败处理 |
|--------|----------|----------|
| 规则id非空且唯一 | `rule.id` 存在且在当前批次内无重复 | Fail + 报告重复id |
| trigger.events非空且结构合法 | `rule.trigger.events` 为非空数组，每项为合法事件名 | Fail + 报告非法结构 |
| handler路径可达且可加载 | `rule.handler` 指向的文件存在且可 `require()` | Fail + 报告不可达路径 |
| 意图/事件注册映射存在 | 意图库和事件库中存在对应映射条目 | Fail + 报告缺失映射 |

```typescript
interface PreGateResult {
  gate: "pre-gate";
  passed: boolean;
  checks: {
    rule_id_valid: { passed: boolean; detail: string };
    trigger_events_valid: { passed: boolean; detail: string };
    handler_reachable: { passed: boolean; detail: string };
    intent_event_mapping: { passed: boolean; detail: string };
  };
  failed_at?: string;  // 第一个失败的检查项
}
```

### 3.3 Gate-A — 审计工具可信门

验证评测所用的审计工具/脚本本身是可信的（防止用被污染的工具评测）。

| 检查项 | 检查逻辑 | 失败处理 |
|--------|----------|----------|
| 评测脚本完整性 | eval-runner 脚本文件 hash 与已知基线匹配 | Fail + 报告hash不匹配 |
| 评测Agent独立性 | evaluator_agent ≠ executor_agent（角色分离） | Fail + 报告角色未分离 |
| 评测脚本版本 | 脚本版本号与V4标准要求的最低版本匹配 | Fail + 报告版本过低 |
| 评测脚本未被篡改 | git status 检查脚本目录无未提交修改 | Fail + 报告有未提交变更 |

```typescript
interface GateAResult {
  gate: "gate-a";
  passed: boolean;
  checks: {
    script_integrity: { passed: boolean; hash: string; expected_hash: string };
    role_separation: { passed: boolean; executor: string; evaluator: string };
    script_version: { passed: boolean; current: string; required: string };
    no_uncommitted_changes: { passed: boolean; detail: string };
  };
  failed_at?: string;
}
```

### 3.4 Gate-B — 标准-脚本绑定门

确保评测脚本与V4标准文档版本一致，防止标准更新后脚本未同步。

| 检查项 | 检查逻辑 | 失败处理 |
|--------|----------|----------|
| 标准文档版本绑定 | config.json 中 `v4_standard_revision` 与飞书文档实际 revision_id 一致 | Fail + 报告版本不匹配 |
| 指标定义同步 | config.json 中 `eval_dimensions` 与V4标准定义的5项北极星指标一致 | Fail + 报告指标不同步 |
| 阈值同步 | 各指标阈值与V4标准文档中定义的阈值一致 | Fail + 报告阈值偏差 |
| 黄金Case绑定 | 评测集中包含V4标准定义的全部黄金Case | Warn（不阻断，但标记） |

```typescript
interface GateBResult {
  gate: "gate-b";
  passed: boolean;
  checks: {
    standard_revision_match: { passed: boolean; config_rev: number; doc_rev: number };
    dimensions_sync: { passed: boolean; missing: string[]; extra: string[] };
    thresholds_sync: { passed: boolean; mismatches: Array<{metric: string; config: number; standard: number}> };
    golden_cases_bound: { passed: boolean; missing_cases: string[] };
  };
  failed_at?: string;
}
```

### 3.5 Gate Track 汇总输出

```typescript
interface GateTrackResult {
  track: "gate";
  timestamp: string;
  all_passed: boolean;
  terminated_at?: "pre-gate" | "gate-a" | "gate-b";  // 如果短路终止
  gates: {
    pre_gate: PreGateResult;
    gate_a?: GateAResult;    // Pre-Gate失败时不存在
    gate_b?: GateBResult;    // Gate-A失败时不存在
  };
}
```

---

## 四、北极星 Track 详细设计

### 4.1 执行模式

5个指标各自独立评测，可并行执行。每个指标输出独立分数，最终汇总。

前置条件：Gate Track 全部通过。

### 4.2 指标1 — 言出法随达成率

| 属性 | 值 |
|------|-----|
| 指标ID | `ns1_rule_effectiveness` |
| 阈值 | ≥ 90% |
| 评测方式 | 自动化 + LLM辅助 |

评测逻辑：
1. 收集评测窗口内新创建的ISC规则列表
2. 对每条规则检查6层生效链：
   - 意图注册：意图库中存在对应条目
   - 事件绑定：事件库中存在trigger映射
   - 探针部署：监控探针已部署
   - 匹配更新：匹配引擎已加载新规则
   - 执行绑定：handler可调用
   - 端到端验真：模拟触发→实际执行→结果验证
3. 检查时效性：规则创建后≤30秒内全链路可调用
4. 计算：全链路生效规则数 / 新创建规则总数 × 100%

```typescript
interface NS1Result {
  metric_id: "ns1_rule_effectiveness";
  metric_name: "言出法随达成率";
  threshold: 0.90;
  score: number;           // 0.0 ~ 1.0
  passed: boolean;         // score >= threshold
  total_rules: number;
  effective_rules: number;
  details: Array<{
    rule_id: string;
    effective: boolean;
    layers: {
      intent_registered: boolean;
      event_bound: boolean;
      probe_deployed: boolean;
      matcher_updated: boolean;
      execution_bound: boolean;
      e2e_verified: boolean;
    };
    latency_ms?: number;   // 生效延迟
    failure_reason?: string;
  }>;
}
```

### 4.3 指标2 — 自主闭环率

| 属性 | 值 |
|------|-----|
| 指标ID | `ns2_autonomous_closure` |
| 阈值 | ≥ 95% |
| 评测方式 | LLM评测（需分析对话流） |

评测逻辑：
1. 收集评测窗口内的任务执行记录（含对话历史）
2. 对每个任务，LLM Evaluator判定：
   - 是否存在"用户催促"（非决策点的用户干预）
   - 允许的决策点：命名确认、重大架构变更（≥3模块）拍板
   - 其他任何需要用户推动才继续的环节 → 不计为自主闭环
3. 计算：自主闭环任务数 / 总任务数 × 100%

```typescript
interface NS2Result {
  metric_id: "ns2_autonomous_closure";
  metric_name: "自主闭环率";
  threshold: 0.95;
  score: number;
  passed: boolean;
  total_tasks: number;
  autonomous_tasks: number;
  details: Array<{
    task_id: string;
    autonomous: boolean;
    user_interventions: Array<{
      type: "allowed_decision" | "unnecessary_prompt";
      description: string;
    }>;
    failure_reason?: string;
  }>;
}
```

### 4.4 指标3 — 认知层真实代码覆盖率

| 属性 | 值 |
|------|-----|
| 指标ID | `ns3_real_code_coverage` |
| 阈值 | 100% |
| 评测方式 | 自动化（日志分析）+ LLM验证 |

评测逻辑：
1. 收集评测窗口内所有认知映射/差距分析/影响面评估操作
2. 对每次分析操作检查：
   - 是否使用了 grep/find 遍历真实代码文件（.js/.py/.json/.md）
   - 输出是否精确到 文件路径+函数名+行号
   - 是否仅依赖文档摘要（SKILL.md/CAPABILITY-ANCHOR.md/MEMORY.md）
3. 仅依赖文档摘要的 → 不计为有效认知映射
4. 计算：有效认知映射次数 / 总分析次数 × 100%

```typescript
interface NS3Result {
  metric_id: "ns3_real_code_coverage";
  metric_name: "认知层真实代码覆盖率";
  threshold: 1.00;
  score: number;
  passed: boolean;
  total_analyses: number;
  valid_analyses: number;
  details: Array<{
    analysis_id: string;
    valid: boolean;
    used_real_code: boolean;
    has_precise_location: boolean;  // 文件路径+函数名+行号
    only_doc_summary: boolean;
    evidence: string[];  // grep/find命令记录
    failure_reason?: string;
  }>;
}
```

### 4.5 指标4 — 独立QA覆盖率

| 属性 | 值 |
|------|-----|
| 指标ID | `ns4_independent_qa` |
| 阈值 | 100% |
| 评测方式 | 自动化（git log分析）+ LLM验证 |

评测逻辑：
1. 收集评测窗口内所有产出/变更记录
2. 对每次产出检查：
   - 产出者（author）与审查者（reviewer）是否为不同Agent
   - 审查是否覆盖：代码可行性 + 正确性 + 副作用验证
   - 自审不计为有效QA
3. 范围包括：架构师/开发Agent产出、审计脚本、评测脚本、汇总器、门禁脚本的任何变更
4. 计算：经独立QA审查的次数 / 产出/变更总次数 × 100%

```typescript
interface NS4Result {
  metric_id: "ns4_independent_qa";
  metric_name: "独立QA覆盖率";
  threshold: 1.00;
  score: number;
  passed: boolean;
  total_changes: number;
  qa_reviewed_changes: number;
  details: Array<{
    change_id: string;
    file_path: string;
    author_agent: string;
    reviewer_agent?: string;
    independent_review: boolean;
    review_scope: {
      feasibility: boolean;
      correctness: boolean;
      side_effects: boolean;
    };
    failure_reason?: string;
  }>;
}
```

### 4.6 指标5 — 根因分析覆盖率

| 属性 | 值 |
|------|-----|
| 指标ID | `ns5_root_cause_analysis` |
| 阈值 | 100% |
| 评测方式 | LLM评测（需分析修复过程） |

评测逻辑：
1. 收集评测窗口内所有问题修复记录
2. 对每次修复检查四层根因分析是否完整：
   - 代码缺陷：是否定位到具体文件+行号+缺陷描述
   - 规则缺失：是否检查相关规则是否存在
   - 认知偏差：是否分析认知层是否有偏差
   - 架构瓶颈：是否评估架构层面的限制
3. 每层分析必须精确到 具体文件+行号+原因描述
4. 直接修补症状而不定位根因的 → 不计为有效修复
5. 计算：完整四层根因分析的修复次数 / 修复总次数 × 100%

```typescript
interface NS5Result {
  metric_id: "ns5_root_cause_analysis";
  metric_name: "根因分析覆盖率";
  threshold: 1.00;
  score: number;
  passed: boolean;
  total_fixes: number;
  rca_complete_fixes: number;
  details: Array<{
    fix_id: string;
    rca_complete: boolean;
    four_layers: {
      code_defect: { analyzed: boolean; location?: string; description?: string };
      rule_missing: { analyzed: boolean; location?: string; description?: string };
      cognitive_bias: { analyzed: boolean; location?: string; description?: string };
      architecture_bottleneck: { analyzed: boolean; location?: string; description?: string };
    };
    failure_reason?: string;
  }>;
}
```

---

## 五、输出格式 — 完整评测结果JSON

```typescript
interface EvalRunnerV4Result {
  version: "4.0";
  timestamp: string;
  eval_target: string;           // 被测对象标识
  standard_revision: number;     // V4标准文档revision_id

  // Gate Track 结果
  gate_track: GateTrackResult;

  // 北极星 Track 结果（Gate全通过时才有）
  northstar_track?: {
    track: "northstar";
    metrics: {
      ns1_rule_effectiveness: NS1Result;
      ns2_autonomous_closure: NS2Result;
      ns3_real_code_coverage: NS3Result;
      ns4_independent_qa: NS4Result;
      ns5_root_cause_analysis: NS5Result;
    };
    summary: {
      total_metrics: 5;
      passed_metrics: number;
      failed_metrics: number;
      scores: Record<string, number>;
    };
  };

  // 最终评级
  final_rating: {
    grade: "S" | "A" | "B" | "C" | "F";
    gate_passed: boolean;
    northstar_passed: number;    // 通过的北极星指标数
    northstar_total: 5;
    reason: string;
  };

  // 执行元数据
  metadata: {
    executor_agent: string;
    evaluator_agent: string;
    duration_ms: number;
    runner_version: string;
  };
}
```

### 最终评级规则

| 评级 | 条件 |
|------|------|
| F | Gate Track 任一门禁未通过 |
| C | Gate通过，北极星 ≤2项达标 |
| B | Gate通过，北极星 3项达标 |
| A | Gate通过，北极星 4项达标 |
| S | Gate通过，北极星 5项全部达标 |

---

## 六、与现有Runner的集成方式

### 6.1 文件结构变更

```
skills/public/eval-runner/
├── SKILL.md                          # 更新：增加Gate/北极星Track说明
├── config.json                       # 更新：增加gate配置和北极星阈值
├── index.sh                          # 更新：增加 --track 参数
├── scripts/
│   ├── eval-single-case.js           # 保留：现有5维度评测（降级为过程指标评测）
│   ├── gate-runner.js                # 新增：Gate Track执行器
│   ├── gate-checks/
│   │   ├── pre-gate.js               # 新增：Pre-Gate检查
│   │   ├── gate-a.js                 # 新增：Gate-A审计工具可信检查
│   │   └── gate-b.js                 # 新增：Gate-B标准-脚本绑定检查
│   ├── northstar-runner.js           # 新增：北极星Track执行器
│   └── northstar-metrics/
│       ├── ns1-rule-effectiveness.js  # 新增：言出法随达成率
│       ├── ns2-autonomous-closure.js  # 新增：自主闭环率
│       ├── ns3-real-code-coverage.js  # 新增：认知层真实代码覆盖率
│       ├── ns4-independent-qa.js      # 新增：独立QA覆盖率
│       └── ns5-root-cause-analysis.js # 新增：根因分析覆盖率
└── tests/
    └── benchmarks/
        └── golden-cases/              # 新增：V4黄金Case
```

### 6.2 调用方式

```bash
# 完整V4评测（Gate + 北极星）
bash index.sh <case_file> --track=full

# 仅Gate Track
bash index.sh <case_file> --track=gate

# 仅北极星Track（跳过Gate，用于调试）
bash index.sh <case_file> --track=northstar

# 兼容模式（现有5维度评测，向后兼容）
bash index.sh <case_file> --track=legacy
bash index.sh <case_file>  # 默认仍为legacy，待迁移完成后切换为full
```

### 6.3 config.json 扩展

```json
{
  "name": "eval-runner",
  "version": "2.0.0",
  "description": "V4标准AEO评测技能",
  "default_track": "full",
  "default_batch_size": 10,
  "executor_agent": "coder",
  "evaluator_agent": "reviewer",
  "v4_standard_doc": "JxhNdoc7ko7ZLwxJUJHcWyeDnYd",
  "v4_standard_revision": 16,

  "gate": {
    "pre_gate": {
      "enabled": true,
      "checks": ["rule_id", "trigger_events", "handler_reachable", "intent_event_mapping"]
    },
    "gate_a": {
      "enabled": true,
      "script_hash_baseline": "",
      "min_script_version": "2.0.0",
      "require_role_separation": true
    },
    "gate_b": {
      "enabled": true,
      "auto_sync_check": true
    }
  },

  "northstar": {
    "ns1_rule_effectiveness":  { "threshold": 0.90, "enabled": true },
    "ns2_autonomous_closure":  { "threshold": 0.95, "enabled": true },
    "ns3_real_code_coverage":  { "threshold": 1.00, "enabled": true },
    "ns4_independent_qa":      { "threshold": 1.00, "enabled": true },
    "ns5_root_cause_analysis": { "threshold": 1.00, "enabled": true }
  },

  "rating": {
    "S": { "gate": true, "northstar_min": 5 },
    "A": { "gate": true, "northstar_min": 4 },
    "B": { "gate": true, "northstar_min": 3 },
    "C": { "gate": true, "northstar_min": 1 },
    "F": { "gate": false }
  }
}
```

### 6.4 迁移策略

1. **Phase 1（当前）**：实现Gate Track + 北极星Track，默认track仍为legacy
2. **Phase 2**：在golden-cases上验证新Track输出正确性，与legacy结果交叉对比
3. **Phase 3**：默认track切换为full，legacy标记为deprecated
4. **Phase 4**：移除legacy代码路径

---

## 七、关键设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| Gate执行顺序 | Pre-Gate → Gate-A → Gate-B 统一前置 | V4原文是Gate-A在北极星前、Gate-B在北极星后，但Gate-B检查的是基础设施一致性，前置更安全 |
| 北极星并行 vs 串行 | 并行 | 5个指标互相独立，并行可提速 |
| 现有5维度评测 | 降级为过程指标，保留兼容 | 现有5维度（意图分类/执行链/跨模块/隐含意图/上下文）属于V4过程指标中的感知层+规划层，不是北极星指标 |
| 评级体系 | S/A/B/C/F 五级 | 比现有Pass/Partial/Badcase更细粒度，且与Gate短路机制对齐 |
| LLM vs 规则评测 | 混合模式 | NS1/NS3/NS4可自动化检查，NS2/NS5需LLM分析对话流和修复过程 |

---

## 八、待确认事项

1. Gate-A的脚本hash基线如何生成和维护？建议每次release时自动计算并写入config
2. Gate-B的标准文档revision自动同步机制——是否需要在每次评测前自动拉取飞书文档revision？
3. 北极星指标的数据采集范围——评测窗口如何定义（按时间段？按commit范围？按任务批次？）
4. NS2（自主闭环率）和NS5（根因分析覆盖率）的LLM评测prompt需要与V4黄金Case对齐验证
5. 是否需要支持单指标重跑（某个北极星指标评测失败后仅重跑该指标）
