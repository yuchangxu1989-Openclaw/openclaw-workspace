# PDCA×ISC 对齐方案：四环节准入准出门禁设计

> 生成时间: 2026-03-09T17:03+08:00（rev2: 17:04 追加硬性约束）
> 状态: 设计稿，待coder实施

---

## 0. 硬性架构约束（最高优先级，铁律）

### 🚨 ISC-EVAL-ROLE-SEPARATION-001 在PDCA中的强制应用

**Check环节执行者 ≠ Do环节执行者。Agent级别隔离。自检=Badcase。无例外。**

这不是"建议"，不是"规则声明里写一下"——这是**代码化的硬拦截**，写死在 PDCA 引擎中。

#### 约束定义

| 条目 | 要求 |
|------|------|
| **隔离级别** | Agent ID 级别。同一Agent换label不算分离。 |
| **Do→Check映射** | Do=coder → Check必须是reviewer/analyst。Do=writer → Check必须是reviewer/analyst。Do=researcher → Check必须是analyst。 |
| **自检判定** | `task.executor_agent === task.evaluator_agent` → **Badcase**，不是warn，是block+badcase记录。 |
| **例外** | **无。** reviewer/analyst评测自己的产出也不行。唯一的"例外"是Act阶段的改进验证，但那也必须由第三方验证。 |

#### 代码化位置（不是规则JSON，是引擎代码）

**位置1：`state-machine.js` — `do→check` 转换时强制检查**

```javascript
// state-machine.js 中 transition() 函数的 do→check 转换
if (from === 'do' && to === 'check') {
  // 铁律：ISC-EVAL-ROLE-SEPARATION-001
  // 这不是gate函数的可选检查，是状态机层面的硬拦截
  if (!task.evaluator_agent) {
    return {
      allowed: false,
      reason: 'BLOCK: Check阶段未分配评测者。必须指定与executor_agent不同的Agent。',
      violation: 'ISC-EVAL-ROLE-SEPARATION-001',
      gateResults: []
    };
  }
  if (task.evaluator_agent === task.executor_agent) {
    return {
      allowed: false,
      reason: `BADCASE: 自检禁止。executor=${task.executor_agent}, evaluator=${task.evaluator_agent}。ISC-EVAL-ROLE-SEPARATION-001。`,
      violation: 'ISC-EVAL-ROLE-SEPARATION-001',
      badcase: true,  // 标记为badcase，上层记录
      gateResults: []
    };
  }
}
```

**位置2：`gates.js` — `checkExitGate()` 二次防御**

即使状态机层面被绕过（如直接调用checkExitGate），门禁函数内部再拦一次。双保险。

**位置3：`index.js` — `advancePhase()` badcase自动记录**

```javascript
// index.js advancePhase() 中
if (result.badcase) {
  // 自动写入 badcase 记录
  const badcaseEntry = {
    id: `badcase-pdca-${Date.now()}`,
    rule: 'ISC-EVAL-ROLE-SEPARATION-001',
    task_id: taskId,
    executor: task.executor_agent,
    evaluator: task.evaluator_agent,
    timestamp: new Date().toISOString(),
    severity: 'critical',
    description: '自检违反：PDCA Check阶段的评测者与Do阶段的执行者相同'
  };
  emit('pdca.badcase.role_separation_violation', badcaseEntry);
  // 写入 badcase 文件
  const badcasePath = path.join(MEMORY_DIR, 'badcases', `${badcaseEntry.id}.json`);
  ensureDir(path.dirname(badcasePath));
  writeJson(badcasePath, badcaseEntry);
}
```

#### 合法的Do→Check角色映射表（代码化为常量）

```javascript
// gates.js 顶部常量
const ROLE_SEPARATION_MAP = {
  // Do执行者 → Check允许的评测者列表
  'coder':      ['reviewer', 'analyst'],
  'writer':     ['reviewer', 'analyst'],
  'researcher': ['analyst', 'reviewer'],
  'scout':      ['analyst', 'reviewer'],
  // 默认：任何不同的agentId都可以
};

function isRoleSeparationValid(executorAgent, evaluatorAgent) {
  if (executorAgent === evaluatorAgent) return false;

  const allowedEvaluators = ROLE_SEPARATION_MAP[executorAgent];
  if (allowedEvaluators) {
    return allowedEvaluators.includes(evaluatorAgent);
  }
  // 未在映射表中的角色：只要不同就行
  return true;
}
```

#### 为什么必须代码化而不是规则声明

| 方式 | 可靠性 | 历史教训 |
|------|--------|---------|
| AGENTS.md 文本规则 | ❌ 上下文长了就被淹没 | ISC-MAIN-AGENT-DELEGATION-001 被违反5次才代码化 |
| ISC规则JSON声明 | ❌ 声明≠执行，JSON只是元数据 | 142条规则中141条只有声明无执行（SOUL.md根因记录） |
| PDCA引擎代码硬拦截 | ✅ 状态机层面拦截，绕不过去 | ISC-FAILURE-PATTERN-CODE-ESCALATION-001 的直接应用 |

**这就是 ISC-FAILURE-PATTERN-CODE-ESCALATION-001 的教义：失败≥2次的行为模式必须下沉到代码层。角色分离已经在历史上被违反多次，必须代码化。**

---

## 1. 当前断点分析

### 1.1 PDCA引擎现状（`skills/pdca-engine/index.js`）

**核心问题：名为PDCA，实为产物治理报告生成器。**

当前 index.js 的实际逻辑：
1. `readTasks()` — 扫描 `memory/tasks/*.json`，读取所有任务
2. `computeSummary()` — 统计任务数量（total/done/open/doing/blocked）
3. `ensureGovernanceArtifacts()` — 生成 lessons 和 metrics 文件
4. `renderGovernanceReport()` — 输出治理报告 markdown

**没有的东西：**
- ❌ 没有 Plan / Do / Check / Act 四个阶段的状态机
- ❌ 没有任何准入/准出门禁逻辑
- ❌ 没有引用任何 ISC 规则（`isc-core` 零引用）
- ❌ 没有事件总线集成（不发出 pdca.* 事件）
- ❌ 没有任务生命周期管理（只读不写任务状态）
- ❌ 输出是机器数据（JSON result），不是可读报告

**结论：当前 index.js 需要重写，不是改造。** 保留 `readTasks()` 和 `computeSummary()` 作为辅助函数，核心引擎重建。

### 1.2 ISC规则体系现状

ISC 已有 140+ 条规则，其中与门禁直接相关的：

| ISC规则 | 作用 | 与PDCA的关系 |
|---------|------|-------------|
| `ISC-AUTO-QA-001` | 开发产出自动质量核查 | 应对接 Do→Check 准入 |
| `ISC-EVAL-ROLE-SEPARATION-001` | 评测角色分离 | 应对接 Check 阶段约束 |
| `ISC-FAILURE-PATTERN-CODE-ESCALATION-001` | 失败≥2次强制代码化 | 应对接 Act 准出 |
| `rule.project-artifact-gate-001` | 产物存在性门禁 | 应对接 Do 准出 |
| `rule.arch-gate-before-action-001` | 行动前必有门禁 | PDCA的元原则 |
| `rule.task-orchestration-quality-001` | 任务编排质量 | 应对接 Plan 准出 |
| `rule.sprint-closure-acceptance-001` | Sprint收工四重验收 | Act 阶段的上层约束 |
| `ISC-DOC-QUALITY-GATE-001` | 文档双Agent质量门禁 | Check 阶段的子门禁 |
| `rule.meta-enforcement-gate-001` | 规则必须有执行机制 | PDCA门禁自身的约束 |
| `rule.subagent-checkpoint-gate-001` | 子Agent分段验证 | Do 阶段的执行约束 |

**现状：这些规则各自独立运作，没有被PDCA编排为一条流水线。** 就像有10个门禁摄像头但没有围墙连接它们。

### 1.3 SOUL.md 中的相关约束

SOUL.md 已定义了任务编排四要素：
- **业务目标**（要达成什么结果）
- **时效约束**（为什么现在做）
- **成本边界**（资源、风险、优先级）
- **验收标准**（做到什么算完成）

这正好是 Plan 准出的验收清单，但目前只存在于 SOUL.md 文本中，PDCA引擎没有程序化检查。

---

## 2. 四环节准入准出门禁定义

### 2.1 整体架构

```
任务进入 → [Plan准入] → Plan → [Plan准出] → [Do准入] → Do → [Do准出] → [Check准入] → Check → [Check准出] → Act准入判定
                                                                                                              ↓
                                                                                          有问题 → [Act准入] → Act → [Act准出] → 闭环
                                                                                          无问题 → 归档完成
```

每个门禁是一个函数，返回 `{ pass: boolean, violations: string[], warnings: string[] }`。

### 2.2 Plan 阶段

#### Plan 准入门禁 — `ISC-PDCA-PLAN-ENTRY-001`（新建）

**检查项：任务来源合法性**

```javascript
function planEntryGate(task) {
  const validSources = ['user_instruction', 'isc_rule_trigger', 'event_driven', 'cron_scheduled', 'completion_followup'];
  const checks = [];

  // G1: 任务来源必须是已知合法来源
  if (!task.source || !validSources.includes(task.source)) {
    checks.push({
      id: 'source_legitimacy',
      pass: false,
      message: `任务来源 "${task.source || 'undefined'}" 不合法，允许值: ${validSources.join(', ')}`
    });
  }

  // G2: 如果来源是 isc_rule_trigger，必须有 rule_id
  if (task.source === 'isc_rule_trigger' && !task.trigger_rule_id) {
    checks.push({
      id: 'rule_trigger_traceable',
      pass: false,
      message: '来源为ISC规则触发但缺少 trigger_rule_id'
    });
  }

  // G3: 如果来源是 event_driven，必须有 event_id
  if (task.source === 'event_driven' && !task.trigger_event_id) {
    checks.push({
      id: 'event_trigger_traceable',
      pass: false,
      message: '来源为事件驱动但缺少 trigger_event_id'
    });
  }

  return {
    gate: 'ISC-PDCA-PLAN-ENTRY-001',
    pass: checks.every(c => c.pass !== false),
    checks
  };
}
```

**对应ISC规则**：新建 `ISC-PDCA-PLAN-ENTRY-001`
**关联**：`rule.arch-gate-before-action-001`（行动前必有门禁）

---

#### Plan 准出门禁 — `ISC-PDCA-PLAN-EXIT-001`（新建）

**检查项：任务定义四要素完整性**

```javascript
function planExitGate(task) {
  const checks = [];

  // G1: 业务目标 — 必须存在且非空
  if (!task.business_goal || task.business_goal.trim().length < 10) {
    checks.push({
      id: 'business_goal_defined',
      pass: false,
      message: '业务目标未定义或过于简略（<10字符）'
    });
  }

  // G2: 时效约束 — 必须有 deadline 或 urgency
  if (!task.deadline && !task.urgency) {
    checks.push({
      id: 'time_constraint_defined',
      pass: false,
      message: '时效约束未定义（需要 deadline 或 urgency）'
    });
  }

  // G3: 成本边界 — 至少声明 priority
  if (!task.priority) {
    checks.push({
      id: 'cost_boundary_defined',
      pass: false,
      message: '成本边界未定义（至少需要 priority）'
    });
  }

  // G4: 验收标准 — 必须存在且可验证
  if (!task.acceptance_criteria || !Array.isArray(task.acceptance_criteria) || task.acceptance_criteria.length === 0) {
    checks.push({
      id: 'acceptance_criteria_defined',
      pass: false,
      message: '验收标准未定义或为空数组'
    });
  }

  // G5: 交付物声明 — 必须预声明期望产出
  if (!task.expected_artifacts || !Array.isArray(task.expected_artifacts) || task.expected_artifacts.length === 0) {
    checks.push({
      id: 'expected_artifacts_declared',
      pass: false,
      message: '未声明期望交付物'
    });
  }

  return {
    gate: 'ISC-PDCA-PLAN-EXIT-001',
    pass: checks.every(c => c.pass !== false),
    checks
  };
}
```

**对应ISC规则**：新建 `ISC-PDCA-PLAN-EXIT-001`
**关联**：`rule.task-orchestration-quality-001`（任务编排质量），SOUL.md 四要素

---

### 2.3 Do 阶段

#### Do 准入门禁 — `ISC-PDCA-DO-ENTRY-001`（新建）

**检查项：Plan准出条件是否满足**

```javascript
function doEntryGate(task) {
  const checks = [];

  // G1: Plan阶段必须已通过准出门禁
  if (!task.gates || !task.gates['ISC-PDCA-PLAN-EXIT-001']?.pass) {
    checks.push({
      id: 'plan_exit_passed',
      pass: false,
      message: 'Plan阶段准出门禁未通过，不允许进入Do阶段'
    });
  }

  // G2: 任务状态必须从 planned 转为 doing
  if (task.status !== 'planned' && task.status !== 'doing') {
    checks.push({
      id: 'valid_status_transition',
      pass: false,
      message: `任务状态 "${task.status}" 不允许进入Do（需要 planned 或 doing）`
    });
  }

  // G3: 执行者已分配
  if (!task.assignee && !task.agent_id) {
    checks.push({
      id: 'executor_assigned',
      pass: false,
      message: '执行者未分配（需要 assignee 或 agent_id）'
    });
  }

  return {
    gate: 'ISC-PDCA-DO-ENTRY-001',
    pass: checks.every(c => c.pass !== false),
    checks
  };
}
```

**对应ISC规则**：新建 `ISC-PDCA-DO-ENTRY-001`
**关联**：`rule.subagent-checkpoint-gate-001`（子Agent分段验证）

---

#### Do 准出门禁 — `ISC-PDCA-DO-EXIT-001`（新建）

**检查项：交付物存在 + 质量门禁通过**

```javascript
function doExitGate(task) {
  const checks = [];

  // G1: 交付物文件存在（复用 project-artifact-gate-001 逻辑）
  if (!task.actual_artifacts || task.actual_artifacts.length === 0) {
    checks.push({
      id: 'artifact_exists',
      pass: false,
      message: '无交付物产出'
    });
  } else {
    for (const artifact of task.actual_artifacts) {
      if (!fs.existsSync(path.resolve(WORKSPACE, artifact))) {
        checks.push({
          id: `artifact_file_exists:${artifact}`,
          pass: false,
          message: `交付物文件不存在: ${artifact}`
        });
      }
    }
  }

  // G2: 交付物非空（>200字节）
  for (const artifact of (task.actual_artifacts || [])) {
    const fullPath = path.resolve(WORKSPACE, artifact);
    if (fs.existsSync(fullPath)) {
      const stat = fs.statSync(fullPath);
      if (stat.size < 200) {
        checks.push({
          id: `artifact_not_empty:${artifact}`,
          pass: false,
          message: `交付物疑似空文件（${stat.size}字节）: ${artifact}`
        });
      }
    }
  }

  // G3: ISC-AUTO-QA-001 质量核查是否已触发
  //     检查 task.qa_result 是否存在（由 completion-handler.sh 回写）
  if (!task.qa_triggered) {
    checks.push({
      id: 'qa_triggered',
      pass: false,
      message: '质量核查（ISC-AUTO-QA-001）未触发'
    });
  }

  // G4: 质量核查结果
  if (task.qa_triggered && task.qa_result === 'fail') {
    checks.push({
      id: 'qa_passed',
      pass: false,
      message: '质量核查未通过'
    });
  }

  return {
    gate: 'ISC-PDCA-DO-EXIT-001',
    pass: checks.every(c => c.pass !== false),
    checks
  };
}
```

**对应ISC规则**：新建 `ISC-PDCA-DO-EXIT-001`
**关联**：`rule.project-artifact-gate-001`（产物存在性），`ISC-AUTO-QA-001`（自动QA）

---

### 2.4 Check 阶段

#### Check 准入门禁 — `ISC-PDCA-CHECK-ENTRY-001`（新建）

**检查项：Do阶段有交付物**

```javascript
function checkEntryGate(task) {
  const checks = [];

  // G1: Do准出门禁已通过
  if (!task.gates || !task.gates['ISC-PDCA-DO-EXIT-001']?.pass) {
    checks.push({
      id: 'do_exit_passed',
      pass: false,
      message: 'Do阶段准出门禁未通过，不允许进入Check阶段'
    });
  }

  // G2: 至少有一个交付物可供检查
  if (!task.actual_artifacts || task.actual_artifacts.length === 0) {
    checks.push({
      id: 'has_deliverable',
      pass: false,
      message: '无交付物可供Check评测'
    });
  }

  return {
    gate: 'ISC-PDCA-CHECK-ENTRY-001',
    pass: checks.every(c => c.pass !== false),
    checks
  };
}
```

**对应ISC规则**：新建 `ISC-PDCA-CHECK-ENTRY-001`
**关联**：`ISC-PDCA-DO-EXIT-001`

---

#### Check 准出门禁 — `ISC-PDCA-CHECK-EXIT-001`（新建）

**检查项：独立评测者 + 评测报告**

```javascript
function checkExitGate(task) {
  const checks = [];

  // ============================================================
  // 🚨 G1: 角色分离 — 铁律·双保险（第二道防线）
  //    第一道防线在 state-machine.js 的 do→check 转换中。
  //    这里是二次防御：即使绕过状态机直接调 checkExitGate，
  //    也必须在此拦截。
  //    ISC-EVAL-ROLE-SEPARATION-001: 自检=Badcase，无例外。
  // ============================================================
  if (!task.evaluator_agent) {
    checks.push({
      id: 'evaluator_assigned',
      pass: false,
      severity: 'badcase',
      message: '🚨 未分配独立评测者。Check阶段必须有与Do执行者不同的Agent。'
    });
  } else if (task.evaluator_agent === task.executor_agent) {
    checks.push({
      id: 'role_separation_violation',
      pass: false,
      severity: 'badcase',
      message: `🚨 BADCASE: 自检禁止！evaluator(${task.evaluator_agent}) === executor(${task.executor_agent})。违反 ISC-EVAL-ROLE-SEPARATION-001。`
    });
  } else if (!isRoleSeparationValid(task.executor_agent, task.evaluator_agent)) {
    checks.push({
      id: 'role_separation_mapping',
      pass: false,
      severity: 'badcase',
      message: `🚨 角色映射不合法: executor=${task.executor_agent} 的合法评测者为 ${(ROLE_SEPARATION_MAP[task.executor_agent] || ['任何不同AgentId']).join('/')}, 实际=${task.evaluator_agent}`
    });
  }

  // G2: 评测报告已生成
  if (!task.eval_report_path) {
    checks.push({
      id: 'eval_report_exists',
      pass: false,
      message: '评测报告未生成'
    });
  } else if (!fs.existsSync(path.resolve(WORKSPACE, task.eval_report_path))) {
    checks.push({
      id: 'eval_report_file_exists',
      pass: false,
      message: `评测报告文件不存在: ${task.eval_report_path}`
    });
  }

  // G3: 评测结论明确（pass/fail/conditional）
  const validVerdicts = ['pass', 'fail', 'conditional_pass'];
  if (!task.eval_verdict || !validVerdicts.includes(task.eval_verdict)) {
    checks.push({
      id: 'eval_verdict_clear',
      pass: false,
      message: `评测结论不明确，需要: ${validVerdicts.join('/')}`
    });
  }

  return {
    gate: 'ISC-PDCA-CHECK-EXIT-001',
    pass: checks.every(c => c.pass !== false),
    checks
  };
}
```

**对应ISC规则**：新建 `ISC-PDCA-CHECK-EXIT-001`
**关联**：`ISC-EVAL-ROLE-SEPARATION-001`（角色分离），`ISC-DOC-QUALITY-GATE-001`（文档质量门禁）

---

### 2.5 Act 阶段

#### Act 准入门禁 — `ISC-PDCA-ACT-ENTRY-001`（新建）

**检查项：Check阶段发现了问题**

```javascript
function actEntryGate(task) {
  const checks = [];

  // G1: Check准出门禁已通过
  if (!task.gates || !task.gates['ISC-PDCA-CHECK-EXIT-001']?.pass) {
    checks.push({
      id: 'check_exit_passed',
      pass: false,
      message: 'Check阶段准出门禁未通过'
    });
  }

  // G2: 评测结论为 fail 或 conditional_pass（有问题才进Act）
  if (task.eval_verdict === 'pass') {
    checks.push({
      id: 'has_issues_to_act_on',
      pass: false,
      message: 'Check阶段评测通过，无需进入Act阶段（直接归档完成）'
    });
  }

  // G3: 问题清单存在
  if (!task.issues || !Array.isArray(task.issues) || task.issues.length === 0) {
    checks.push({
      id: 'issue_list_exists',
      pass: false,
      message: '评测发现问题但未输出问题清单'
    });
  }

  return {
    gate: 'ISC-PDCA-ACT-ENTRY-001',
    pass: checks.every(c => c.pass !== false),
    checks
  };
}
```

**对应ISC规则**：新建 `ISC-PDCA-ACT-ENTRY-001`
**关联**：`ISC-PDCA-CHECK-EXIT-001`

---

#### Act 准出门禁 — `ISC-PDCA-ACT-EXIT-001`（新建）

**检查项：改进措施落地到ISC规则+代码**

```javascript
function actExitGate(task) {
  const checks = [];

  // G1: 改进措施已定义
  if (!task.improvements || !Array.isArray(task.improvements) || task.improvements.length === 0) {
    checks.push({
      id: 'improvements_defined',
      pass: false,
      message: '未定义改进措施'
    });
  }

  // G2: 每个改进措施必须有落地形态（ISC-FAILURE-PATTERN-CODE-ESCALATION-001）
  for (const imp of (task.improvements || [])) {
    const hasRuleChange = imp.isc_rule_id || imp.new_rule_id;
    const hasCodeChange = imp.code_change_path || imp.script_path;
    const hasProcessChange = imp.process_change_doc;

    if (!hasRuleChange && !hasCodeChange && !hasProcessChange) {
      checks.push({
        id: `improvement_landed:${imp.id || 'unknown'}`,
        pass: false,
        message: `改进措施 "${imp.description || imp.id}" 无落地形态（需要 isc_rule/code_change/process_change 至少一项）`
      });
    }
  }

  // G3: 如果是重复失败（failure_count >= 2），改进必须代码化
  if ((task.failure_count || 0) >= 2) {
    const allCodeified = (task.improvements || []).every(imp => imp.code_change_path || imp.script_path);
    if (!allCodeified) {
      checks.push({
        id: 'repeated_failure_codeified',
        pass: false,
        message: '重复失败（≥2次）的改进措施必须全部代码化（ISC-FAILURE-PATTERN-CODE-ESCALATION-001）'
      });
    }
  }

  // G4: 改进措施是否已验证生效
  if (task.improvements && task.improvements.some(imp => imp.verified !== true)) {
    checks.push({
      id: 'improvements_verified',
      pass: false,
      message: '部分改进措施未经验证'
    });
  }

  return {
    gate: 'ISC-PDCA-ACT-EXIT-001',
    pass: checks.every(c => c.pass !== false),
    checks
  };
}
```

**对应ISC规则**：新建 `ISC-PDCA-ACT-EXIT-001`
**关联**：`ISC-FAILURE-PATTERN-CODE-ESCALATION-001`（失败模式代码化），`rule.arch-rule-equals-code-002`（规则=代码）

---

## 3. 需要新建的ISC规则清单

| 序号 | 规则ID | 名称 | 类型 | 优先级 | 说明 |
|------|--------|------|------|--------|------|
| 1 | `ISC-PDCA-PLAN-ENTRY-001` | Plan阶段准入门禁 | gate | P0 | 验证任务来源合法性 |
| 2 | `ISC-PDCA-PLAN-EXIT-001` | Plan阶段准出门禁 | gate | P0 | 验证任务四要素完整性 |
| 3 | `ISC-PDCA-DO-ENTRY-001` | Do阶段准入门禁 | gate | P0 | 验证Plan准出已通过 |
| 4 | `ISC-PDCA-DO-EXIT-001` | Do阶段准出门禁 | gate | P0 | 验证交付物+QA通过 |
| 5 | `ISC-PDCA-CHECK-ENTRY-001` | Check阶段准入门禁 | gate | P0 | 验证Do有交付物 |
| 6 | `ISC-PDCA-CHECK-EXIT-001` | Check阶段准出门禁 | gate | P0 | 验证独立评测+报告 |
| 7 | `ISC-PDCA-ACT-ENTRY-001` | Act阶段准入门禁 | gate | P0 | 验证Check发现问题 |
| 8 | `ISC-PDCA-ACT-EXIT-001` | Act阶段准出门禁 | gate | P0 | 验证改进落地+代码化 |

每条规则的JSON声明文件写入 `skills/isc-core/rules/rule.pdca-{phase}-{entry|exit}-001.json`。

每条规则按全链路展开要求（SOUL.md铁律），必须完成：
1. ✅ 意图注册 → `infrastructure/intent-engine/intent-registry.json`
2. ✅ 事件注册 → `infrastructure/event-bus/events.jsonl`
3. ✅ 感知层探针 → PDCA引擎状态转换时自动触发
4. ✅ 执行层绑定 → `pdca-engine/index.js` 中的 gate 函数

---

## 4. PDCA引擎改造方案（index.js 重写规格）

### 4.1 新架构概览

```
skills/pdca-engine/
├── index.js              # 主入口：PDCA状态机 + 门禁编排
├── gates.js              # 8个门禁函数（纯函数，可独立测试）
├── state-machine.js      # PDCA状态转换逻辑
├── event-emitter.js      # 事件总线集成（发出pdca.*事件）
├── report-renderer.js    # 人可读报告生成（从index.js拆出）
├── SKILL.md              # 技能文档（需重写）
└── test/
    └── gates.test.js     # 门禁函数单元测试
```

### 4.2 `gates.js` — 门禁函数模块

将上面第2节定义的8个门禁函数封装为独立模块：

```javascript
// gates.js — 8个门禁函数，纯函数无副作用
'use strict';
const fs = require('fs');
const path = require('path');
const { WORKSPACE } = require('../shared/paths');

// ============================================================
// 🚨 角色分离映射表（ISC-EVAL-ROLE-SEPARATION-001 代码化）
//    Do执行者 → Check允许的评测者列表
//    这是硬编码常量，不是配置文件。改映射 = 改代码 = 需要Code Review。
// ============================================================
const ROLE_SEPARATION_MAP = {
  'coder':      ['reviewer', 'analyst'],
  'writer':     ['reviewer', 'analyst'],
  'researcher': ['analyst', 'reviewer'],
  'scout':      ['analyst', 'reviewer'],
};

function isRoleSeparationValid(executorAgent, evaluatorAgent) {
  // 铁律：自检永远不合法
  if (executorAgent === evaluatorAgent) return false;

  const allowedEvaluators = ROLE_SEPARATION_MAP[executorAgent];
  if (allowedEvaluators) {
    return allowedEvaluators.includes(evaluatorAgent);
  }
  // 未在映射表中的角色：只要不同就行
  return true;
}

exports.ROLE_SEPARATION_MAP = ROLE_SEPARATION_MAP;
exports.isRoleSeparationValid = isRoleSeparationValid;

// --- Plan ---
exports.planEntryGate = function(task) { /* 见2.2节 */ };
exports.planExitGate = function(task) { /* 见2.2节 */ };

// --- Do ---
exports.doEntryGate = function(task) { /* 见2.3节 */ };
exports.doExitGate = function(task) { /* 见2.3节 */ };

// --- Check ---
exports.checkEntryGate = function(task) { /* 见2.4节 */ };
exports.checkExitGate = function(task) { /* 见2.4节（含角色分离二次防御） */ };

// --- Act ---
exports.actEntryGate = function(task) { /* 见2.5节 */ };
exports.actExitGate = function(task) { /* 见2.5节 */ };

// --- 通用 ---
exports.runGate = function(gateName, task) {
  const gateMap = {
    'ISC-PDCA-PLAN-ENTRY-001': exports.planEntryGate,
    'ISC-PDCA-PLAN-EXIT-001': exports.planExitGate,
    'ISC-PDCA-DO-ENTRY-001': exports.doEntryGate,
    'ISC-PDCA-DO-EXIT-001': exports.doExitGate,
    'ISC-PDCA-CHECK-ENTRY-001': exports.checkEntryGate,
    'ISC-PDCA-CHECK-EXIT-001': exports.checkExitGate,
    'ISC-PDCA-ACT-ENTRY-001': exports.actEntryGate,
    'ISC-PDCA-ACT-EXIT-001': exports.actExitGate,
  };
  const fn = gateMap[gateName];
  if (!fn) throw new Error(`Unknown gate: ${gateName}`);
  return fn(task);
};
```

### 4.3 `state-machine.js` — PDCA状态转换

```javascript
// state-machine.js — PDCA四阶段状态机
'use strict';
const gates = require('./gates');

const PHASES = ['plan', 'do', 'check', 'act', 'done'];
const TRANSITIONS = {
  'init→plan':  { entry: 'ISC-PDCA-PLAN-ENTRY-001' },
  'plan→do':    { exit: 'ISC-PDCA-PLAN-EXIT-001', entry: 'ISC-PDCA-DO-ENTRY-001' },
  'do→check':   { exit: 'ISC-PDCA-DO-EXIT-001',   entry: 'ISC-PDCA-CHECK-ENTRY-001' },
  'check→act':  { exit: 'ISC-PDCA-CHECK-EXIT-001', entry: 'ISC-PDCA-ACT-ENTRY-001' },
  'check→done': { exit: 'ISC-PDCA-CHECK-EXIT-001' },  // Check pass → 直接完成
  'act→plan':   { exit: 'ISC-PDCA-ACT-EXIT-001',  entry: 'ISC-PDCA-PLAN-ENTRY-001' },  // 闭环回Plan
  'act→done':   { exit: 'ISC-PDCA-ACT-EXIT-001' }     // Act完成 → 归档
};

/**
 * 尝试状态转换，自动运行准出+准入门禁
 * @param {object} task - 任务对象
 * @param {string} from - 当前阶段
 * @param {string} to - 目标阶段
 * @returns {{ allowed: boolean, gateResults: object[], task: object }}
 */
exports.transition = function(task, from, to) {
  const key = `${from}→${to}`;
  const transition = TRANSITIONS[key];
  if (!transition) {
    return { allowed: false, reason: `Invalid transition: ${key}`, gateResults: [] };
  }

  // ============================================================
  // 🚨 铁律：ISC-EVAL-ROLE-SEPARATION-001 硬拦截
  //    在所有gate函数之前执行。状态机层面的第一道防线。
  //    自检=Badcase，不是warn，不是可配置选项。
  // ============================================================
  if (from === 'do' && (to === 'check')) {
    if (!task.evaluator_agent) {
      return {
        allowed: false,
        reason: 'BLOCK: Check阶段未分配评测者(evaluator_agent)。必须指定与executor_agent不同的Agent。',
        violation: 'ISC-EVAL-ROLE-SEPARATION-001',
        gateResults: []
      };
    }
    if (task.evaluator_agent === task.executor_agent) {
      return {
        allowed: false,
        reason: `BADCASE: 自检禁止。executor=${task.executor_agent}, evaluator=${task.evaluator_agent}。ISC-EVAL-ROLE-SEPARATION-001。`,
        violation: 'ISC-EVAL-ROLE-SEPARATION-001',
        badcase: true,
        gateResults: []
      };
    }
    if (!gates.isRoleSeparationValid(task.executor_agent, task.evaluator_agent)) {
      return {
        allowed: false,
        reason: `BADCASE: 角色映射不合法。executor=${task.executor_agent}的合法评测者为${(gates.ROLE_SEPARATION_MAP[task.executor_agent]||['任何不同Agent']).join('/')}，实际=${task.evaluator_agent}。`,
        violation: 'ISC-EVAL-ROLE-SEPARATION-001',
        badcase: true,
        gateResults: []
      };
    }
  }
  // ============================================================

  const gateResults = [];

  // 运行准出门禁
  if (transition.exit) {
    const exitResult = gates.runGate(transition.exit, task);
    gateResults.push(exitResult);
    if (!exitResult.pass) {
      return { allowed: false, reason: `准出门禁拒绝: ${transition.exit}`, gateResults, task };
    }
    // 记录门禁结果
    task.gates = task.gates || {};
    task.gates[transition.exit] = { pass: true, timestamp: new Date().toISOString() };
  }

  // 运行准入门禁
  if (transition.entry) {
    const entryResult = gates.runGate(transition.entry, task);
    gateResults.push(entryResult);
    if (!entryResult.pass) {
      return { allowed: false, reason: `准入门禁拒绝: ${transition.entry}`, gateResults, task };
    }
    task.gates = task.gates || {};
    task.gates[transition.entry] = { pass: true, timestamp: new Date().toISOString() };
  }

  // 转换成功，更新任务阶段
  task.pdca_phase = to;
  task.phase_history = task.phase_history || [];
  task.phase_history.push({
    from, to,
    timestamp: new Date().toISOString(),
    gates: gateResults.map(g => ({ gate: g.gate, pass: g.pass }))
  });

  return { allowed: true, gateResults, task };
};

exports.PHASES = PHASES;
exports.TRANSITIONS = TRANSITIONS;
```

### 4.4 `event-emitter.js` — 事件总线集成

```javascript
// event-emitter.js — 将PDCA状态转换发射到事件总线
'use strict';
const fs = require('fs');
const path = require('path');
const { WORKSPACE } = require('../shared/paths');

const EVENTS_FILE = path.join(WORKSPACE, 'infrastructure/event-bus/events.jsonl');

exports.emit = function(type, payload) {
  const event = {
    id: `evt_pdca_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    source: 'pdca-engine',
    payload: {
      ...payload,
      _metadata: {
        trace_id: `trace_pdca_${Date.now()}`,
        chain_depth: 0,
        emitted_at: Date.now(),
        event_type: type
      }
    },
    timestamp: Date.now(),
    consumed_by: []
  };

  fs.appendFileSync(EVENTS_FILE, JSON.stringify(event) + '\n');
  return event;
};

// 预定义的PDCA事件类型
exports.PDCA_EVENTS = {
  PLAN_ENTERED:   'pdca.plan.entered',
  PLAN_EXITED:    'pdca.plan.exited',
  DO_ENTERED:     'pdca.do.entered',
  DO_EXITED:      'pdca.do.exited',
  CHECK_ENTERED:  'pdca.check.entered',
  CHECK_EXITED:   'pdca.check.exited',
  ACT_ENTERED:    'pdca.act.entered',
  ACT_EXITED:     'pdca.act.exited',
  GATE_REJECTED:  'pdca.gate.rejected',
  CYCLE_COMPLETED:'pdca.cycle.completed'
};
```

### 4.5 `index.js` — 主入口重写

```javascript
// index.js — PDCA引擎主入口
'use strict';

const fs = require('fs');
const path = require('path');
const { WORKSPACE, MEMORY_DIR, REPORTS_DIR, ensureDir, readJson, writeJson } = require('../shared/paths');
const gates = require('./gates');
const { transition, PHASES } = require('./state-machine');
const { emit, PDCA_EVENTS } = require('./event-emitter');

const TASKS_DIR = path.join(MEMORY_DIR, 'tasks');
const PDCA_STATE_DIR = path.join(MEMORY_DIR, 'pdca-state');

// --- 任务读写 ---
function readTask(taskId) {
  const file = path.join(TASKS_DIR, `${taskId}.json`);
  return readJson(file, null);
}

function writeTask(taskId, task) {
  ensureDir(TASKS_DIR);
  writeJson(path.join(TASKS_DIR, `${taskId}.json`), task);
}

function readAllTasks() {
  if (!fs.existsSync(TASKS_DIR)) return [];
  return fs.readdirSync(TASKS_DIR)
    .filter(name => name.endsWith('.json'))
    .map(name => readJson(path.join(TASKS_DIR, name), null))
    .filter(Boolean);
}

// --- 核心：阶段转换 ---
async function advancePhase(taskId, targetPhase) {
  const task = readTask(taskId);
  if (!task) return { ok: false, error: `Task ${taskId} not found` };

  const currentPhase = task.pdca_phase || 'init';
  const result = transition(task, currentPhase, targetPhase);

  if (result.allowed) {
    // 保存更新后的任务
    writeTask(taskId, result.task);
    // 发射事件
    const eventType = PDCA_EVENTS[`${targetPhase.toUpperCase()}_ENTERED`] || `pdca.${targetPhase}.entered`;
    emit(eventType, {
      task_id: taskId,
      from: currentPhase,
      to: targetPhase,
      gates: result.gateResults
    });
  } else {
    // 发射拒绝事件
    emit(PDCA_EVENTS.GATE_REJECTED, {
      task_id: taskId,
      from: currentPhase,
      to: targetPhase,
      reason: result.reason,
      violations: result.gateResults.flatMap(g => (g.checks || []).filter(c => !c.pass))
    });

    // 🚨 Badcase自动记录（ISC-EVAL-ROLE-SEPARATION-001 等铁律违反）
    if (result.badcase) {
      const badcaseEntry = {
        id: `badcase-pdca-${Date.now()}`,
        rule: result.violation || 'unknown',
        task_id: taskId,
        executor: task.executor_agent,
        evaluator: task.evaluator_agent,
        timestamp: new Date().toISOString(),
        severity: 'critical',
        description: result.reason
      };
      emit('pdca.badcase.role_separation_violation', badcaseEntry);
      const badcasePath = path.join(MEMORY_DIR, 'badcases', `${badcaseEntry.id}.json`);
      ensureDir(path.dirname(badcasePath));
      writeJson(badcasePath, badcaseEntry);
      logger.error?.(`[pdca-engine] 🚨 BADCASE: ${result.reason}`);
    }
  }

  return {
    ok: result.allowed,
    task_id: taskId,
    from: currentPhase,
    to: targetPhase,
    reason: result.reason || null,
    gate_results: result.gateResults
  };
}

// --- 单个门禁检查（不执行转换） ---
async function checkGate(taskId, gateName) {
  const task = readTask(taskId);
  if (!task) return { ok: false, error: `Task ${taskId} not found` };
  return gates.runGate(gateName, task);
}

// --- PDCA 周期报告（人可读） ---
function generateReport(taskId) {
  const task = readTask(taskId);
  if (!task) return null;

  const lines = [];
  lines.push(`# PDCA 周期报告: ${task.title || taskId}`);
  lines.push('');
  lines.push(`- 当前阶段: **${task.pdca_phase || 'init'}**`);
  lines.push(`- 任务来源: ${task.source || '未知'}`);
  lines.push(`- 业务目标: ${task.business_goal || '未定义'}`);
  lines.push(`- 优先级: ${task.priority || '未定义'}`);
  lines.push('');

  // 门禁状态
  lines.push('## 门禁状态');
  lines.push('');
  const gateNames = [
    'ISC-PDCA-PLAN-ENTRY-001', 'ISC-PDCA-PLAN-EXIT-001',
    'ISC-PDCA-DO-ENTRY-001', 'ISC-PDCA-DO-EXIT-001',
    'ISC-PDCA-CHECK-ENTRY-001', 'ISC-PDCA-CHECK-EXIT-001',
    'ISC-PDCA-ACT-ENTRY-001', 'ISC-PDCA-ACT-EXIT-001'
  ];
  for (const g of gateNames) {
    const result = task.gates?.[g];
    const icon = result?.pass ? '✅' : (result ? '❌' : '⬜');
    lines.push(`- ${icon} ${g}`);
  }
  lines.push('');

  // 阶段历史
  if (task.phase_history?.length) {
    lines.push('## 阶段流转历史');
    lines.push('');
    for (const h of task.phase_history) {
      lines.push(`- ${h.timestamp}: ${h.from} → ${h.to}`);
    }
  }

  return lines.join('\n');
}

// --- 批量扫描所有任务的PDCA状态 ---
function generateOverviewReport() {
  const tasks = readAllTasks();
  const byPhase = { init: 0, plan: 0, do: 0, check: 0, act: 0, done: 0 };

  for (const task of tasks) {
    const phase = task.pdca_phase || 'init';
    byPhase[phase] = (byPhase[phase] || 0) + 1;
  }

  const lines = [];
  lines.push('# PDCA 全局概览');
  lines.push('');
  lines.push(`- 生成时间: ${new Date().toISOString()}`);
  lines.push(`- 任务总数: ${tasks.length}`);
  lines.push('');
  lines.push('## 各阶段分布');
  lines.push('');
  for (const [phase, count] of Object.entries(byPhase)) {
    if (count > 0) lines.push(`- ${phase}: ${count}`);
  }

  // 门禁违反统计
  const violations = tasks.flatMap(t =>
    Object.entries(t.gates || {})
      .filter(([, v]) => v && !v.pass)
      .map(([gate]) => gate)
  );
  if (violations.length) {
    lines.push('');
    lines.push('## 门禁违反');
    const counts = {};
    violations.forEach(v => counts[v] = (counts[v] || 0) + 1);
    for (const [gate, count] of Object.entries(counts)) {
      lines.push(`- ${gate}: ${count}次`);
    }
  }

  return lines.join('\n');
}

// --- 对外接口 ---
async function run(input = {}, context = {}) {
  const logger = context?.logger || console;
  const { action, taskId, targetPhase, gateName } = input;

  switch (action) {
    case 'advance':
      return advancePhase(taskId, targetPhase);
    case 'check-gate':
      return checkGate(taskId, gateName);
    case 'report':
      return { ok: true, report: generateReport(taskId) };
    case 'overview':
      return { ok: true, report: generateOverviewReport() };
    default:
      // 兼容旧调用：跑全局概览
      const report = generateOverviewReport();
      ensureDir(REPORTS_DIR);
      fs.writeFileSync(path.join(REPORTS_DIR, 'pdca-overview.md'), report, 'utf8');
      return { ok: true, skill: 'pdca-engine', report_path: 'reports/pdca-overview.md' };
  }
}

module.exports = run;
module.exports.run = run;
module.exports.advancePhase = advancePhase;
module.exports.checkGate = checkGate;
module.exports.generateReport = generateReport;

if (require.main === module) {
  const [,, action, taskId, target] = process.argv;
  run({ action: action || 'overview', taskId, targetPhase: target, gateName: target })
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(err => { console.error(err); process.exit(1); });
}
```

### 4.6 任务数据结构扩展

现有 `memory/tasks/*.json` 需要新增以下字段：

```jsonc
{
  "id": "task-xxx",
  "title": "...",
  "status": "open|doing|done|blocked",

  // --- 新增：PDCA阶段管理 ---
  "pdca_phase": "init|plan|do|check|act|done",
  "source": "user_instruction|isc_rule_trigger|event_driven|cron_scheduled|completion_followup",
  "trigger_rule_id": "ISC-xxx",        // 可选，ISC规则触发时填
  "trigger_event_id": "evt_xxx",        // 可选，事件驱动时填

  // Plan四要素
  "business_goal": "...",
  "deadline": "2026-03-10T00:00:00Z",
  "urgency": "high|medium|low",
  "priority": "P0|P1|P2",
  "acceptance_criteria": ["条件1", "条件2"],
  "expected_artifacts": ["reports/xxx.md", "skills/xxx/index.js"],

  // Do交付
  "assignee": "coder",
  "agent_id": "coder",
  "actual_artifacts": ["reports/xxx.md"],
  "qa_triggered": true,
  "qa_result": "pass|fail",

  // Check评测
  "executor_agent": "coder",
  "evaluator_agent": "analyst",
  "eval_report_path": "reports/eval-xxx.md",
  "eval_verdict": "pass|fail|conditional_pass",
  "issues": [{ "id": "issue-1", "description": "..." }],

  // Act改进
  "improvements": [{
    "id": "imp-1",
    "description": "...",
    "isc_rule_id": "ISC-xxx",       // 改了哪条规则
    "new_rule_id": "ISC-xxx",       // 新建了哪条规则
    "code_change_path": "scripts/xxx.js",  // 改了哪个代码
    "verified": true
  }],
  "failure_count": 0,

  // 门禁记录
  "gates": {
    "ISC-PDCA-PLAN-ENTRY-001": { "pass": true, "timestamp": "..." },
    "ISC-PDCA-PLAN-EXIT-001": { "pass": true, "timestamp": "..." }
  },
  "phase_history": [
    { "from": "init", "to": "plan", "timestamp": "...", "gates": [] }
  ]
}
```

**兼容性**：现有任务缺少新字段时，门禁检查会报 violations，不会 crash。这是设计上的——强制老任务补齐信息才能推进。

---

## 5. 实施优先级和步骤

### Phase 1: 基础设施（Day 1，约2小时）

| 步骤 | 内容 | 产出文件 | 依赖 |
|------|------|---------|------|
| 1.1 | 创建 `gates.js`，实现8个门禁函数 | `skills/pdca-engine/gates.js` | 无 |
| 1.2 | 创建 `state-machine.js` | `skills/pdca-engine/state-machine.js` | 1.1 |
| 1.3 | 创建 `event-emitter.js` | `skills/pdca-engine/event-emitter.js` | 无 |
| 1.4 | 重写 `index.js` | `skills/pdca-engine/index.js` | 1.1+1.2+1.3 |
| 1.5 | 写门禁单元测试 | `skills/pdca-engine/test/gates.test.js` | 1.1 |

**可并行**：1.1、1.3 无依赖，可并行开发。

### Phase 2: ISC规则声明（Day 1，约1小时）

| 步骤 | 内容 | 产出文件 |
|------|------|---------|
| 2.1 | 创建8条PDCA门禁ISC规则JSON | `skills/isc-core/rules/rule.pdca-plan-entry-001.json` 等8个文件 |
| 2.2 | 意图注册 | 更新 `infrastructure/intent-engine/intent-registry.json` |
| 2.3 | 事件注册 | 追加 `infrastructure/event-bus/events.jsonl` |
| 2.4 | 创建ISC hook脚本 | `scripts/isc-hooks/ISC-PDCA-*.sh` 8个文件 |

**可与Phase 1并行**。

### Phase 3: 集成（Day 2，约1.5小时）

| 步骤 | 内容 | 说明 |
|------|------|------|
| 3.1 | `completion-handler.sh` 接入PDCA状态推进 | 子Agent完成时自动触发 `do→check` 转换 |
| 3.2 | `register-task.sh` 接入PDCA Plan门禁 | 新任务注册时自动触发 `init→plan` 转换 |
| 3.3 | 更新 SKILL.md | 重写技能文档 |
| 3.4 | E2E测试 | 模拟完整PDCA周期：init→plan→do→check→act→done |

### Phase 4: 验证（Day 2，约1小时）

| 步骤 | 内容 |
|------|------|
| 4.1 | 用真实任务跑一轮完整PDCA |
| 4.2 | 验证门禁拒绝场景（四要素缺失、自评、无产物等） |
| 4.3 | 验证事件总线集成（`pdca.*` 事件可见） |
| 4.4 | 验证报告可读性 |

---

## 6. 风险与降级策略

| 风险 | 降级策略 |
|------|---------|
| 现有任务数据缺少新字段 | 门禁函数用 `\|\|` fallback，不 crash；但 violations 会列出缺失字段 |
| 门禁过严导致所有任务被拒 | Phase 1 先实现 warn 模式（记录但不阻止），Phase 3 切换为 block 模式 |
| 事件总线高频写入性能问题 | PDCA事件只在阶段转换时发射（不在轮询中），频率极低 |
| completion-handler.sh 改造复杂 | 新增PDCA hook为独立文件，不改原handler核心逻辑，只追加调用 |

---

## 7. 门禁与现有ISC规则映射总表

```
ISC-PDCA-PLAN-ENTRY-001
  ├── 自有逻辑：任务来源合法性
  └── 引用：rule.arch-gate-before-action-001

ISC-PDCA-PLAN-EXIT-001
  ├── 自有逻辑：四要素完整性
  └── 引用：rule.task-orchestration-quality-001, SOUL.md 任务编排四要素

ISC-PDCA-DO-ENTRY-001
  ├── 自有逻辑：Plan准出已通过
  └── 引用：rule.subagent-checkpoint-gate-001

ISC-PDCA-DO-EXIT-001
  ├── 自有逻辑：交付物存在+非空
  ├── 引用：rule.project-artifact-gate-001（产物门禁）
  └── 引用：ISC-AUTO-QA-001（自动QA）

ISC-PDCA-CHECK-ENTRY-001
  ├── 自有逻辑：Do准出已通过+有交付物
  └── 引用：ISC-PDCA-DO-EXIT-001

ISC-PDCA-CHECK-EXIT-001
  ├── 自有逻辑：评测报告+结论明确
  ├── 引用：ISC-EVAL-ROLE-SEPARATION-001（角色分离）
  └── 引用：ISC-DOC-QUALITY-GATE-001（文档质量）

ISC-PDCA-ACT-ENTRY-001
  ├── 自有逻辑：有问题才进Act
  └── 引用：ISC-PDCA-CHECK-EXIT-001

ISC-PDCA-ACT-EXIT-001
  ├── 自有逻辑：改进措施落地+验证
  ├── 引用：ISC-FAILURE-PATTERN-CODE-ESCALATION-001（失败代码化）
  └── 引用：rule.arch-rule-equals-code-002（规则=代码）
```

---

## 8. Coder执行指令

将本设计交给coder时，按以下顺序下发任务：

### 任务1（可并行）
```
创建 skills/pdca-engine/gates.js
- 实现8个门禁函数，代码见本文档第2节
- 纯函数无副作用，只读task对象+文件系统检查
- 所有函数返回 { gate, pass, checks } 格式
- 🚨 必须导出 ROLE_SEPARATION_MAP 常量和 isRoleSeparationValid() 函数
- 🚨 checkExitGate() 中角色分离检查的severity必须是'badcase'而非普通fail
- 🚨 ROLE_SEPARATION_MAP 映射表硬编码：coder→[reviewer,analyst], writer→[reviewer,analyst], researcher→[analyst,reviewer], scout→[analyst,reviewer]
```

### 任务2（可并行）
```
创建 skills/pdca-engine/event-emitter.js
- 实现事件发射到 infrastructure/event-bus/events.jsonl
- 预定义 PDCA_EVENTS 常量
- 🚨 必须包含 'pdca.badcase.role_separation_violation' 事件类型
- 代码见本文档4.4节
```

### 任务3（依赖任务1+2）
```
创建 skills/pdca-engine/state-machine.js
- 实现PDCA状态转换逻辑
- 调用 gates.js 做门禁检查
- 🚨 do→check 转换必须在所有gate函数之前执行角色分离硬拦截
- 🚨 硬拦截返回 badcase:true 标记，不是普通的 allowed:false
- 🚨 检查三项：evaluator_agent存在、不等于executor_agent、通过isRoleSeparationValid映射
- 代码见本文档4.3节
```

### 任务4（依赖任务1+2+3）
```
重写 skills/pdca-engine/index.js
- 整合 gates + state-machine + event-emitter
- 🚨 advancePhase() 中检测 result.badcase===true 时，自动写入 memory/badcases/ 并发射 pdca.badcase.* 事件
- 支持 CLI 调用：node index.js advance <taskId> <phase>
- 支持 CLI 调用：node index.js check-gate <taskId> <gateName>
- 支持 CLI 调用：node index.js report <taskId>
- 支持 CLI 调用：node index.js overview
- 代码见本文档4.5节
```

### 任务5（可并行）
```
创建8条ISC规则JSON文件
- 写入 skills/isc-core/rules/
- 文件名：rule.pdca-{plan|do|check|act}-{entry|exit}-001.json
- 每条规则包含 id, name, description, trigger, action, enforcement
- 按照 rule.isc-standard-format-001 格式
```

### 任务6（依赖任务4+5）
```
集成测试
- 创建 skills/pdca-engine/test/gates.test.js
- 测试每个门禁的通过和拒绝场景
- 模拟完整PDCA周期：init→plan→do→check→done（通过路径）
- 模拟完整PDCA周期：init→plan→do→check→act→plan（闭环路径）
- 🚨 必须包含角色分离测试（ISC-EVAL-ROLE-SEPARATION-001）:
  - case: executor=coder, evaluator=analyst → PASS
  - case: executor=coder, evaluator=coder → BADCASE（不是普通fail）
  - case: executor=coder, evaluator=writer → FAIL（不在映射表中）
  - case: executor=coder, evaluator=undefined → BLOCK
  - case: executor=writer, evaluator=reviewer → PASS
  - case: executor=researcher, evaluator=analyst → PASS
  - case: do→check 转换缺 evaluator_agent → 状态机硬拦截（不进gate函数）
  - case: badcase触发时 memory/badcases/ 目录有文件写入
  - case: badcase触发时 events.jsonl 有 pdca.badcase.role_separation_violation 事件
```
