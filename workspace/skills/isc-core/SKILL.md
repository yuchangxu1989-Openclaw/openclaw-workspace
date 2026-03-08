---
name: isc-core
description: ISC智能标准中心 - 标准生成与演进机制的唯一管理源
version: "2.0.14"
status: active
layer: infrastructure
abbreviation: ISC
full_name: Intelligent Standards Center
chinese_name: 智能标准中心
tags: [isc, infrastructure, core, standard, governance]
author: OpenClaw ISC
created_at: 2026-02-23
---

# ISC 智能标准中心 v3.1.0

distribution: both


## 设计思路

ISC 不管理"标准数量"，而管理"标准生成与演进的机制"。

### 核心原则

1. **语义化标识** - 标准 ID 为 `<域>.<类别>.<描述>`，如 `naming.skill.display`
2. **机制优先** - 关注标准如何生成、演进、失效，而非标准本身
3. **边界清晰** - ISC 提供规范与检查点，本地任务编排 拥有执行权与调度权
4. **血缘追踪** - 每条标准记录完整进化链，支持影响分析

### 架构定位

```
┌─────────┐     ┌─────────┐     ┌─────────┐
│  问题   │────→│   ISC   │────→│  标准   │
│  信号   │     │ 机制引擎 │     │  输出   │
└─────────┘     └────┬────┘     └─────────┘
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
   ┌─────────┐  ┌─────────┐  ┌─────────┐
   │  本地任务编排    │  │  SEEF   │  │  CRAS   │
   │ 编排器  │  │ 进化器  │  │ 认知层  │
   └─────────┘  └─────────┘  └─────────┘
```

---

## 实现逻辑

### 一、标准注册机制

标准通过语义化 ID 注册，系统自动校验唯一性。

```javascript
// 注册标准
isc.registerStandard({
  id: 'naming.skill.display',           // 语义化 ID
  legacyId: 'N006',                      // 兼容编号（可选）
  domain: 'naming',                      // 域：naming/interaction/quality/rule
  type: 'format',                        // 类型：format/rule/threshold
  scope: 'skill',                        // 范围：skill/system/interaction
  description: '技能名称双语展示规范',
  check_fn: 'checkSkillNameBilingual',   // 校验函数名
  severity: 'high',                      // 严重度：low/medium/high
  enabled: true
});
```

### 二、标准生成机制

从问题信号自动生成标准草案。

```javascript
// 接收问题事件
const problem = {
  source: 'cras-insight',
  pattern: '用户多次要求"源文件"但未正确交付',
  impact: 'high',
  frequency: 3
};

// 生成标准草案
const draft = isc.generateStandardFromProblem(problem);
// 输出: { id: 'interaction.user.query.source_file', ... }

// 草案评审
if (draft.confidence > 0.85) {
  // 高置信度：进入待审议队列
  isc.queueForReview(draft);
} else {
  // 低置信度：需人工确认
  isc.requestManualConfirmation(draft);
}
```

### 三、ISC-本地任务编排 边界

ISC 只提供规范，不拥有执行权。

```javascript
// ❌ 错误（越界）：ISC 主动分发
isc.distributeTo('pdca-pipeline');

// ✅ 正确：ISC 提供检查点
isc.registerCheckpoints([
  'quality.md.length',
  'naming.skill.display'
]);

// 本地任务编排 自由组合检查序列
const checkpoints = isc.getCheckpointsForPhase('verify');
for (const cp of checkpoints) {
  const result = await isc.check(cp.id, skill);
  // 本地任务编排 自行决定如何处理结果
}
```

### 四、血缘追踪机制

每条标准记录完整进化链。

```javascript
{
  "id": "naming.skill.display",
  "version: "3.1.3"",
  "lineage": {
    "created_by": "problem_20260223_001",
    "evolved_from": null,
    "deprecated_by": null,
    "evolution_chain": ["1.0.0", "1.1.0"],
    "related_problems": ["p001"],
    "related_standards": ["naming.skill.dir"]
  },
  "impact_analysis": {
    "affected_skills": ["isc-core", "seef"],
    "required_revalidation": ["skill-creator"]
  }
}
```

### 五、双向偏移检测

检测标准与技能之间的双向偏移。

```javascript
// 标准 → 技能：标准更新后技能未对齐
const drift1 = isc.detectStandardToSkillDrift();

// 技能 → 标准：技能使用未声明的标准
const drift2 = isc.detectSkillToStandardDrift();

// 统一事件格式
{
  "type": "mismatch",
  "direction": "skill-to-standard",
  "subject": "skill_x",
  "standard_id": "quality.md.length",
  "severity": "high"
}
```

### 六、失效标准处理

保守策略：90天无引用 + 非核心标准 → 标记 review。

```javascript
{
  "id": "naming.skill.display",
  "status": "active",  // active | review | deprecated
  "usage_stats": {
    "reference_count_90d": 12
  },
  "review_trigger": {
    "condition": "90d_no_reference AND not_core",
    "action": "mark_review",
    "notification": "council_of_seven"
  }
}
```

---

## 标准体系

### 命名规范 (naming)

| ID | 描述 | 校验 |
|:---|:-----|:-----|
| naming.skill.dir | 技能目录 kebab-case | `^[a-z0-9]+(-[a-z0-9]+)*$` |
| naming.skill.display | 技能名称双语展示 | `英文名(中文名)` |
| naming.file.code | 代码文件命名 | camelCase/snake_case |
| naming.constant | 常量定义 | UPPER_SNAKE_CASE |

### 交互规范 (interaction)

| ID | 描述 | 触发条件 | 正确行为 |
|:---|:-----|:---------|:---------|
| interaction.user.query.source_file | 源文件交付 | 用户说"源文件" | message+filePath 发送 |

### 质量标准 (quality)

| ID | 描述 | 阈值 |
|:---|:-----|:-----|
| quality.md.length | SKILL.md 长度 | ≥200字符 |
| quality.readme.length | README 长度 | ≥500字符 |
| quality.vector.dimension | 向量维度 | 1024 |

### 决策规则 (rule)

| ID | 描述 | 触发条件 | 动作 |
|:---|:-----|:---------|:-----|
| rule.auto_skillization | 自动技能化 | 质量分 ≥50 | 触发技能化流水线 |
| rule.auto_vectorization | 自动向量化 | SKILL.md 存在 | 触发向量化 |

---

## API 接口

### 标准管理

```javascript
// 注册标准
isc.registerStandard(definition);

// 获取标准
isc.getStandard('naming.skill.display');
isc.getStandardByLegacyId('N006');

// 更新标准（触发变更检测）
isc.updateStandard('naming.skill.display', changes);

// 查询标准
isc.queryStandards({ domain: 'naming', type: 'format' });
```

### 检查点接口

```javascript
// 注册检查点
isc.registerCheckpoints(['quality.md.length', ...]);

// 获取阶段检查点
isc.getCheckpointsForPhase('verify');

// 执行检查
isc.check('quality.md.length', target);

// 批量检查
isc.checkAll(checkpoints, target);
```

### 偏移检测

```javascript
// 双向偏移检测
isc.detectDrift({ direction: 'both' });

// 获取偏移报告
isc.getDriftReport();

// 订阅偏移事件
isc.subscribeToDrift((event) => { ... });
```

### 血缘查询

```javascript
// 获取标准血缘
isc.getLineage('naming.skill.display');

// 获取影响分析
isc.getImpactAnalysis('naming.skill.display');

// 获取进化链
isc.getEvolutionChain('naming.skill.display');
```

---

## 文件结构

```
isc-core/
├── index.js                    # 主入口
├── SKILL.md                    # 技能定义（本文件）
├── UPGRADE-v3.1.0.md           # 升级方案
├── standards/                  # 标准定义
│   ├── naming/                 # 命名规范
│   ├── interaction/            # 交互规范
│   ├── quality/                # 质量标准
│   └── rule/                   # 决策规则
├── registry.json               # 标准注册表
├── lineage/                    # 血缘数据
│   └── {standard-id}.json
└── adapters/                   # 目标系统适配器
    ├── lto-adapter.js
    ├── seef-adapter.js
    └── cras-adapter.js
```

---

## 使用示例

### 注册新标准

```javascript
const isc = new ISCCore();

// 从问题生成标准
const problem = {
  pattern: '用户多次要求"源文件"但未正确交付',
  impact: 'high'
};

const draft = isc.generateStandardFromProblem(problem);
// draft.id = 'interaction.user.query.source_file'

// 注册（需 Council of Seven 审议）
isc.registerStandard(draft);
```

---

## ⚠️ 规则全链路展开（强制，最高优先级）

**写 JSON ≠ 规则已建。规则是一等公民，代码是规则的展开形态。**

任何规则/标准创建后，必须完成以下 4 项全链路展开，4 项不全 = 规则未完成 = 禁止报"规则已建"。

### 全链路检查清单（每条规则必须逐项完成）

| # | 检查项 | 路径 | 动作 |
|---|--------|------|------|
| 1 | **意图注册** | `infrastructure/intent-engine/intent-registry.json` | 注册对应意图类型（IC1-IC5），含 examples/anti_examples |
| 2 | **事件注册** | `infrastructure/event-bus/events.jsonl` | 注册触发事件类型，含 trigger_condition 和 bound_action |
| 3 | **感知层探针** | 对应技能/hook/cron/scanner | 部署探测代码：谁在观察这个信号？用什么方式捕获？ |
| 4 | **执行层绑定** | DTO任务/技能路由/自动动作 | 绑定具体执行动作：捕获到信号后谁来执行什么？ |

### 执行流程（不可跳过）

```
规则创建请求
    │
    ▼
① 写入规则 JSON → rules/rule.xxx.json
    │
    ▼
② 意图库注册 → intent-registry.json 新增意图条目
    │
    ▼
③ 事件库注册 → events.jsonl 新增事件类型
    │
    ▼
④ 感知层部署 → 探针/hook/cron/scanner 代码就位
    │
    ▼
⑤ 执行层绑定 → DTO任务/技能/自动动作 绑定
    │
    ▼
⑥ 全链路自检 → 4项全pass才允许报"规则已建"
    │
    ▼
⑦ 端到端验真 → 模拟触发一次，确认信号→感知→认知→执行全链路走通
```

### 反例（Badcase）

以下行为一律判 Badcase：
- 只写了 JSON 就报"规则已建"
- 意图库未注册
- 事件库未注册
- 有声明无代码（感知层/执行层空）
- 跳过端到端验真

### 根因记录

此节源于 2026-03-08 系统性缺陷发现：ISC-core SKILL.md 原流程只到"声明→注册→存在"就结束，
导致 MEMORY.md 中"规则→三层展开"的正确认知无法在执行层生效。
认知层(MEMORY.md)与执行层(SKILL.md)不一致 = 系统性Bug。
本修复将认知层的原则固化到执行层的流程中，消除分裂。

---

### 本地任务编排 集成

```javascript
// 本地任务编排 在 Verify 阶段调用
async function verifyPhase(skill) {
  const checkpoints = isc.getCheckpointsForPhase('verify');
  
  for (const cp of checkpoints) {
    const result = await isc.check(cp.id, skill);
    if (result.status !== 'pass') {
      return { status: 'fail', reason: result.message };
    }
  }
  
  return { status: 'pass' };
}
```

### 偏移检测

```javascript
// 定时任务：每日检测偏移
const drifts = isc.detectDrift({ direction: 'both' });

for (const drift of drifts) {
  if (drift.severity === 'high') {
    // 触发告警
    notifyAdmin(drift);
  }
}
```

---

**版本**: 3.1.0  
**状态**: active  
**升级方案**: UPGRADE-v3.1.0.md


---

**自动更新**: 2026-02-25T02:29:36.189Z
**版本**: 3.1.1