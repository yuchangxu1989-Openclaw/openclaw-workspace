# ISC-事件-DTO 闭环方案 v5.0 — 设计债务修复 + 运行时Enforcement + 自愈闭环

> **版本**: v5.0.0
> **作者**: 系统架构师
> **日期**: 2026-03-05
> **状态**: V5.0 — 基于Day 1/2设计债务完整复盘的系统性补齐版
> **前置**: v4.3（五层事件认知模型 + 意图识别体系 + 三层解耦元原则）
> **v5.0变更**: 
> - 🔒 ISC运行时Enforcement Layer（从文档级→运行时级，根因β修复）
> - 🚧 Validation Gate Protocol（6个强制门禁点位，根因α修复）
> - 🔄 事件驱动自愈架构（事件域+探针+策略库，根因γ修复）
> - 🚀 L3 Pipeline灰度迁移方案（旁路→主路4阶段）
> - ⚙️ Cron→事件驱动迁移详细方案（16个任务逐个）
> - 📐 5条架构原则（AP-001~005）永久性约束
> - 🔧 工程纪律自动化（根因δ修复）
> - 📊 Day 2/3执行计划重排（优先级+依赖关系）

---

## TL;DR

**v4.3的根本问题**：架构设计精妙，但Day 1/2执行暴露了**设计到落地之间的鸿沟**。15条设计缺陷归结为4个系统性根因：验收体系形同虚设（α）、ISC规则零运行时执行（β）、反馈回路开环（γ）、工程纪律依赖人（δ）。v4.3设计了5层事件认知模型和三层解耦原则，但没设计"谁来确保这些原则被执行"。

**v5.0的核心升级**：**从"设计美学"到"执行保障"。** v4是"系统应该怎么工作"，v5补齐"系统如何确保自己按设计工作"。

- **Validation Gate Protocol** — 6个强制门禁消灭"可选的验收"
- **ISC Runtime Enforcement** — 79条规则从JSON文档升级为运行时拦截器
- **Closed-Loop Self-Healing** — 事件→诊断→修复→验证完整闭环
- **L3 Pipeline灰度路线** — 4阶段从旁路观察到主路路由
- **Cron→事件驱动迁移** — 16个任务逐个评估+迁移方案
- **5条架构原则** — AP-001~AP-005写入ISC规则永久执行

**v5继承v4.3全部设计**（五层模型、三层解耦、意图体系、事件语法、容灾降级等），在此基础上补齐执行保障层。

---

## 第零·一部分：架构原则（v5永久性约束）★v5.0新增

> **来源**：Day 1/2设计债务复盘提炼的5条永久性原则。与v4.3的"三层解耦元原则"（Part 0）平级，共同构成系统架构约束的基座。

### AP-001: Gate Before Action（行动前必有门禁）

> **任何影响系统状态的操作（提交代码、发布技能、生成报告、关闭Day）必须通过至少一个自动化Gate检查。无Gate的操作路径视为安全漏洞。**

| 维度 | 约束 |
|------|------|
| **适用范围** | 代码提交、技能发布、benchmark执行、报告生成、Day closure、规则变更 |
| **执行方式** | pre-commit hook + cron audit + 手动触发三条路径 |
| **违反后果** | 操作被阻塞，不可绕过 |
| **典型违反** | D01合成数据通过benchmark（无Data Source Gate）、D10 L3_PIPELINE_ENABLED=false无人发现（无Feature Flag Audit Gate） |
| **ISC规则ID** | `arch.gate-before-action-001` |

**反熵增论证**：Gate是有序度的守卫。每增加一个Gate，系统的不合规路径就减少一条。Gate网络的密度与系统有序度正相关。

### AP-002: Rule = Code（规则即代码）

> **ISC规则定义(JSON)与规则执行(gate_check代码)必须1:1配对。只有JSON定义无代码实现的规则，在合规审计中视为"不存在"。**

| 维度 | 约束 |
|------|------|
| **适用范围** | isc-core/rules/下所有规则JSON |
| **执行方式** | 每条规则JSON必须在`isc-core/enforcement/gates/`有同名gate实现 |
| **验证机制** | 自动扫描rules/与gates/的1:1匹配度，不匹配则标记为"未执法" |
| **典型违反** | D02: 79条规则全是JSON文档，enforcement层不存在（enforced=0, partial=48, unenforced=39） |
| **ISC规则ID** | `arch.rule-equals-code-002` |

**反熵增论证**：规则是秩序的载体。规则不可执行 = 秩序不可维护。代码是唯一不可被忽视的规则载体。

### AP-003: Feedback Must Close（反馈必须闭环）

> **任何事件发布后必须有明确的消费确认。任何错误检测后必须有诊断→修复→验证的完整闭环。开环 = 失控。**

| 维度 | 约束 |
|------|------|
| **适用范围** | EventBus事件、cron任务、Day流转、自愈流程 |
| **执行方式** | 事件ACK机制 + 孤儿事件检测 + 修复验证回路 |
| **验证机制** | 每日扫描orphaned events（发出但无人ACK超过1小时） |
| **典型违反** | D03: cron连续9次报错无处理（无自愈闭环）、D05: Day 1完成后4小时空转（无流转闭环） |
| **ISC规则ID** | `arch.feedback-must-close-003` |

**反熵增论证**：开环是信息黑洞——信号进入就消失，系统无法从中学习。闭环是信息回路——每个信号最终回到起点，驱动系统改进。

### AP-004: Machine Over Human（机器约束优于人的纪律）

> **所有"应该做"的事项必须自动化为"必须做"。依赖人记忆和纪律的约束，在概率上等于没有约束。**

| 维度 | 约束 |
|------|------|
| **适用范围** | SKILL.md检查、入口冒烟测试、Feature Flag审计、技能去重、数据集质量 |
| **执行方式** | pre-commit hook、cron审计、注册时自动检查 |
| **验证机制** | 人工检查项清单必须有对应的自动化脚本 |
| **典型违反** | D11: 13个技能缺SKILL.md（规则存在但无人拦截）、D04: 版本号空转递增（auto-commit无语义判断） |
| **ISC规则ID** | `arch.machine-over-human-004` |

**反熵增论证**：人的注意力是稀缺资源，纪律会衰减。机器的注意力是无限资源，检查永不疲倦。每将一条人工检查自动化，系统的可靠性就提升一个量级。

### AP-005: Real Data Gate（真实数据门禁）

> **任何benchmark、测试、验收的数据来源必须标注且可溯源。合成数据可用于开发调试，不可用于验收。验收使用合成数据 = 验收无效。**

| 维度 | 约束 |
|------|------|
| **适用范围** | 场景benchmark、intent-benchmark、E2E测试、Day closure报告 |
| **执行方式** | 每条数据必须有`data_source`字段（real/synthetic/mock），验收阶段自动拦截non-real |
| **验证机制** | gate-check-benchmark-data.js扫描数据集，synthetic/mock → BLOCK |
| **典型违反** | D01: 10个场景全合成数据100%通过、D14: 80条intent样本expected全为空`{}` |
| **ISC规则ID** | `arch.real-data-gate-005` |

**反熵增论证**：合成数据通过验收 = 系统对自身质量的认知与真实质量脱节。认知偏差会随迭代累积放大，最终导致系统对自身状态完全失明。真实数据门禁强制校准认知。

### 架构原则与v4.3原则的关系

```
v4.3 三层解耦元原则（Part 0）
  ├── 感知-认知-执行解耦 ← 系统"怎么分工"
  └── 新设计准入门禁     ← 新设计"怎么审查"

v5.0 五条架构原则（Part 0.1）★NEW
  ├── AP-001 Gate Before Action  ← 操作"怎么被门禁"
  ├── AP-002 Rule = Code         ← 规则"怎么被执行"
  ├── AP-003 Feedback Must Close ← 反馈"怎么被闭环"
  ├── AP-004 Machine Over Human  ← 纪律"怎么被保证"
  └── AP-005 Real Data Gate      ← 质量"怎么被验证"

关系：v4.3原则回答"系统结构"，v5.0原则回答"系统执行保障"。
正交且互补——每个v4.3结构约束都需要v5.0的执行保障来确保落地。
```

---

## 第十四部分：ISC运行时Enforcement Layer ★v5.0新增

> **消灭根因β**：ISC从"知识库"升级为"执法系统"。79条规则从JSON文档升级为运行时拦截器。
> **对应缺陷**：D02（零enforcement）、D06（不查ISC）、D11（缺SKILL.md无人拦截）

### 14.1 问题回顾

```
当前状态（v4.3设计 + Day 1/2现实）：
  ISC规则(79条JSON) → [文档] → 无人读 → 无人执行
  enforcement审计结果: enforced=0, partial=48, unenforced=39
  
v5.0目标态：
  ISC规则(JSON定义) → [编译为gate_check] → pre-commit拦截 → cron审计拦截 → 运行时拦截
  每条P0规则有可执行gate + 违规日志 + 自动修复（如可能）
```

### 14.2 架构设计

```
isc-core/
├── rules/                        # 规则定义（已有79条JSON）
├── enforcement/                   # 【v5.0新增】规则执行层
│   ├── engine.js                  # 统一enforcement引擎
│   ├── gates/                     # 门禁实现（每条P0规则一个）
│   │   ├── data-source-gate.js    # AP-005: 真实数据门禁
│   │   ├── skill-md-gate.js       # R14: SKILL.md强制检查
│   │   ├── report-validation-gate.js  # 报告完整性门禁
│   │   ├── entry-smoke-gate.js    # D08: 入口冒烟测试
│   │   ├── flag-audit-gate.js     # D10: Feature Flag审计
│   │   ├── naming-gate.js         # R22-R24: 命名规范
│   │   ├── isc-format-gate.js     # R01: ISC格式统一
│   │   ├── placeholder-gate.js    # R15: 禁止占位符
│   │   └── ...                    # 每条P0规则对应一个gate
│   ├── hooks/                     # Git hooks集成
│   │   ├── pre-commit.sh          # pre-commit总入口
│   │   └── install-hooks.sh       # 一键安装hook
│   └── audit-log.jsonl            # 执法审计日志
├── runtime/                       # 【v5.0新增】运行时检查
│   ├── middleware.js               # 可插入任何执行流的中间件
│   └── interceptors/              # 拦截器注册中心
│       ├── benchmark-interceptor.js   # benchmark执行前拦截
│       ├── publish-interceptor.js     # 技能发布前拦截
│       └── closure-interceptor.js     # Day closure前拦截
└── metrics/                       # 【v5.0新增】enforcement指标
    └── compliance-dashboard.js    # 合规仪表盘
```

### 14.3 Enforcement Engine核心实现

```javascript
// isc-core/enforcement/engine.js — 统一enforcement引擎

const fs = require('fs');
const path = require('path');

const GATES_DIR = path.join(__dirname, 'gates');
const AUDIT_LOG = path.join(__dirname, 'audit-log.jsonl');

class EnforcementEngine {
  constructor() {
    this._gates = new Map();
    this._loadGates();
  }

  /**
   * 约定式加载: gates/目录下每个.js文件对应一个gate
   * gate必须export: { id, ruleIds, check(target) → {pass, reason?, details?} }
   */
  _loadGates() {
    const files = fs.readdirSync(GATES_DIR).filter(f => f.endsWith('.js'));
    for (const file of files) {
      try {
        const gate = require(path.join(GATES_DIR, file));
        if (gate.id && typeof gate.check === 'function') {
          this._gates.set(gate.id, gate);
        }
      } catch (e) {
        console.error(`Failed to load gate ${file}: ${e.message}`);
      }
    }
  }

  /**
   * 执行指定gate检查
   * @returns {{ pass: boolean, gateId: string, ruleIds: string[], reason?: string, details?: object }}
   */
  async enforce(gateId, target) {
    const gate = this._gates.get(gateId);
    if (!gate) return { pass: true, gateId, ruleIds: [], reason: 'Gate not found (skip)' };

    const startTime = Date.now();
    try {
      const result = await gate.check(target);
      const entry = {
        timestamp: Date.now(),
        gateId,
        ruleIds: gate.ruleIds || [],
        target: typeof target === 'string' ? target : target?.path || 'unknown',
        pass: result.pass,
        reason: result.reason || null,
        duration_ms: Date.now() - startTime
      };
      this._audit(entry);
      return { ...result, gateId, ruleIds: gate.ruleIds || [] };
    } catch (e) {
      const entry = {
        timestamp: Date.now(),
        gateId,
        ruleIds: gate.ruleIds || [],
        target: typeof target === 'string' ? target : target?.path || 'unknown',
        pass: false,
        reason: `Gate execution error: ${e.message}`,
        duration_ms: Date.now() - startTime,
        error: true
      };
      this._audit(entry);
      return { pass: false, gateId, ruleIds: gate.ruleIds || [], reason: entry.reason };
    }
  }

  /**
   * 批量执行所有注册gate
   * @param target - 检查目标
   * @param options.stopOnFail - 遇到失败是否停止
   * @returns {{ passed: number, failed: number, results: Array }}
   */
  async enforceAll(target, options = {}) {
    const results = [];
    for (const [id, gate] of this._gates) {
      const result = await this.enforce(id, target);
      results.push(result);
      if (!result.pass && options.stopOnFail) break;
    }
    return {
      passed: results.filter(r => r.pass).length,
      failed: results.filter(r => !r.pass).length,
      total: results.length,
      results
    };
  }

  /**
   * 查询enforcement指标
   */
  metrics() {
    const rulesDir = path.join(__dirname, '..', 'rules');
    const ruleFiles = fs.readdirSync(rulesDir).filter(f => f.endsWith('.json') && !f.startsWith('_'));
    const totalRules = ruleFiles.length;
    const gateCount = this._gates.size;
    
    // 统计每条规则是否有对应gate
    const coveredRules = new Set();
    for (const gate of this._gates.values()) {
      (gate.ruleIds || []).forEach(id => coveredRules.add(id));
    }

    return {
      total_rules: totalRules,
      gates_loaded: gateCount,
      rules_with_gates: coveredRules.size,
      enforcement_rate: totalRules > 0 ? (coveredRules.size / totalRules * 100).toFixed(1) + '%' : '0%',
      uncovered_rules: ruleFiles
        .map(f => f.replace('.json', ''))
        .filter(id => !coveredRules.has(id))
    };
  }

  _audit(entry) {
    try {
      fs.appendFileSync(AUDIT_LOG, JSON.stringify(entry) + '\n');
    } catch (_) {}
  }
}

module.exports = new EnforcementEngine();
```

### 14.4 Gate实现示例

```javascript
// isc-core/enforcement/gates/data-source-gate.js
// AP-005: 真实数据门禁

const fs = require('fs');
const path = require('path');

module.exports = {
  id: 'data-source-gate',
  ruleIds: ['arch.real-data-gate-005'],
  description: 'Benchmark数据必须标注data_source，验收阶段拦截合成数据',

  /**
   * @param target {{ scenariosDir: string, mode: 'dev'|'acceptance' }}
   */
  check(target) {
    const { scenariosDir, mode } = target;
    if (!scenariosDir || !fs.existsSync(scenariosDir)) {
      return { pass: false, reason: `Scenarios directory not found: ${scenariosDir}` };
    }

    const files = fs.readdirSync(scenariosDir).filter(f => f.endsWith('.json'));
    const issues = [];

    for (const file of files) {
      const data = JSON.parse(fs.readFileSync(path.join(scenariosDir, file), 'utf8'));
      
      // 检查1: data_source字段必须存在
      if (!data.data_source) {
        issues.push({ file, issue: 'missing data_source field' });
        continue;
      }
      
      // 检查2: 验收模式下拦截合成数据
      if (mode === 'acceptance' && ['synthetic', 'mock', 'fake'].includes(data.data_source)) {
        issues.push({ file, issue: `synthetic data not allowed in acceptance mode (source: ${data.data_source})` });
      }
    }

    if (issues.length > 0) {
      return { pass: false, reason: `${issues.length} data source violations`, details: { issues } };
    }
    return { pass: true };
  }
};
```

```javascript
// isc-core/enforcement/gates/skill-md-gate.js
// R14: SKILL.md强制检查 + AP-004自动化

const fs = require('fs');
const path = require('path');

const SKILLS_DIR = path.join(__dirname, '../../../');

module.exports = {
  id: 'skill-md-gate',
  ruleIds: ['R14', 'arch.machine-over-human-004'],
  description: '每个技能目录必须包含SKILL.md',

  check(target) {
    const skillsRoot = target?.skillsDir || SKILLS_DIR;
    const dirs = fs.readdirSync(skillsRoot, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('.') && !d.name.startsWith('_'));

    const missing = [];
    for (const dir of dirs) {
      const skillMd = path.join(skillsRoot, dir.name, 'SKILL.md');
      if (!fs.existsSync(skillMd)) {
        missing.push(dir.name);
      }
    }

    if (missing.length > 0) {
      return {
        pass: false,
        reason: `${missing.length} skills missing SKILL.md`,
        details: { missing }
      };
    }
    return { pass: true };
  }
};
```

```javascript
// isc-core/enforcement/gates/flag-audit-gate.js
// D10: Feature Flag审计 + AP-001行动前门禁

const fs = require('fs');
const path = require('path');

const FLAGS_FILE = path.join(__dirname, '../../../../infrastructure/config/flags.json');

module.exports = {
  id: 'flag-audit-gate',
  ruleIds: ['arch.gate-before-action-001'],
  description: '核心功能的Feature Flag必须与期望值一致',

  check() {
    if (!fs.existsSync(FLAGS_FILE)) {
      return { pass: false, reason: 'flags.json not found' };
    }

    const flags = JSON.parse(fs.readFileSync(FLAGS_FILE, 'utf8'));
    const mismatches = [];

    // 核心功能flag及其期望值
    const expectations = {
      'L3_PIPELINE_ENABLED': true,
      'ISC_ENFORCEMENT_ENABLED': true,
      'EVENT_SELF_HEALING': true
    };

    for (const [key, expected] of Object.entries(expectations)) {
      if (key in flags && flags[key] !== expected) {
        mismatches.push({ flag: key, actual: flags[key], expected });
      }
    }

    if (mismatches.length > 0) {
      return {
        pass: false,
        reason: `${mismatches.length} feature flags mismatched`,
        details: { mismatches }
      };
    }
    return { pass: true };
  }
};
```

### 14.5 Pre-Commit Hook集成

```bash
#!/usr/bin/env bash
# isc-core/enforcement/hooks/pre-commit.sh
# AP-001 + AP-002 + AP-004: 提交前强制ISC检查

set -e

ISC_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
ENGINE="$ISC_DIR/enforcement/engine.js"

if [ ! -f "$ENGINE" ]; then
  echo "⚠️  ISC Enforcement Engine not found, skipping checks"
  exit 0
fi

echo "🔒 ISC Pre-Commit Gate Check..."

# 获取暂存区变更的文件
STAGED=$(git diff --cached --name-only --diff-filter=ACM)

# 检查1: 新增/修改的skills/下文件 → 检查SKILL.md
SKILL_CHANGES=$(echo "$STAGED" | grep "^skills/" | head -1)
if [ -n "$SKILL_CHANGES" ]; then
  node -e "
    const engine = require('$ENGINE');
    engine.enforce('skill-md-gate', { skillsDir: '$ISC_DIR/../' })
      .then(r => { if (!r.pass) { console.error('❌ ' + r.reason); process.exit(1); } })
      .catch(e => { console.error(e.message); process.exit(1); });
  "
fi

# 检查2: benchmark数据 → 检查data_source
BENCH_CHANGES=$(echo "$STAGED" | grep "scenario-benchmark" | head -1)
if [ -n "$BENCH_CHANGES" ]; then
  node -e "
    const engine = require('$ENGINE');
    engine.enforce('data-source-gate', {
      scenariosDir: '$ISC_DIR/../../../scripts/scenario-benchmark/scenarios',
      mode: 'dev'
    }).then(r => { if (!r.pass) { console.error('❌ ' + r.reason); process.exit(1); } })
      .catch(e => { console.error(e.message); process.exit(1); });
  "
fi

# 检查3: Feature Flag审计
node -e "
  const engine = require('$ENGINE');
  engine.enforce('flag-audit-gate', {})
    .then(r => { if (!r.pass) { console.warn('⚠️  ' + r.reason + ' (warning, not blocking)'); } })
    .catch(() => {});
"

echo "✅ ISC Pre-Commit checks passed"
```

### 14.6 三层归属（遵循v4.3元原则）

| 层 | 组件 | 输入 | 输出 |
|----|------|------|------|
| 感知 | pre-commit hook / cron audit scanner | Git暂存区文件变更 / 定期扫描触发 | 需要检查的目标列表 |
| 认知 | EnforcementEngine.enforce() | 目标 + gate规则 | pass/fail判定 + 原因 |
| 执行 | hook exit code / audit-log.jsonl / 飞书通知 | 判定结果 | 阻塞提交 / 记录审计日志 / 发送告警 |

### 14.7 与v4.3的集成点

| v4.3组件 | 集成方式 | 说明 |
|---------|---------|------|
| ISC规则JSON | gate.ruleIds引用规则ID | 每个gate声明它enforcement的规则 |
| EventBus | gate执行结果emit到事件总线 | `isc.enforcement.passed/failed` 事件 |
| Dispatcher | enforcement事件可路由到handler | 连续失败→自动修复handler |
| 三层解耦检查清单 | 新增enforcement层归属检查 | 确保enforcement本身符合三层原则 |

### 14.8 Enforcement Roadmap

| Phase | 范围 | 预期Gate数 | 目标enforcement率 | 时间 |
|-------|------|-----------|------------------|------|
| Day 2 | P0规则（5条核心）| 5个gate | ~7% | 已完成 |
| Day 3 | P0规则扩展 | 15个gate | ~20% | 计划 |
| Day 5 | P1规则覆盖 | 30个gate | ~40% | 计划 |
| Day 10 | 全量P0+P1 | 50个gate | ~65% | 计划 |
| Day 20 | 全量覆盖 | 79个gate | 100% | 计划 |

---

## 第十五部分：Validation Gate Protocol ★v5.0新增

> **消灭根因α**：在每个关键节点建立强制门禁，不通过不放行。
> **对应缺陷**：D01（合成数据）、D06（不查ISC）、D08（入口坏了）、D10（功能禁用）、D14（数据集低质量）

### 15.1 6个Gate点位全景

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                      Validation Gate Protocol — 6个强制门禁                   │
│                                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                      │
│  │  Gate 1      │    │  Gate 2      │    │  Gate 3      │                      │
│  │  Data Source │───►│  ISC         │───►│  Entry Point │                      │
│  │  Gate        │    │  Compliance  │    │  Smoke Gate  │                      │
│  │              │    │  Gate        │    │              │                      │
│  │  数据来源标注 │    │  ISC规则合规  │    │  入口冒烟测试 │                      │
│  │  拦截合成数据 │    │  提交前拦截   │    │  脚本可运行性 │                      │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘                      │
│         │                  │                  │                              │
│  ┌──────▼──────┐    ┌──────▼──────┐    ┌──────▼──────┐                      │
│  │  Gate 4      │    │  Gate 5      │    │  Gate 6      │                      │
│  │  Feature     │    │  Report      │    │  Independent │                      │
│  │  Flag Audit  │    │  Integrity   │    │  QA Gate     │                      │
│  │              │    │  Gate        │    │              │                      │
│  │  Feature开关 │    │  报告溯源性   │    │  独立QA验收   │                      │
│  │  审计告警     │    │  数字可核实   │    │  从零复现     │                      │
│  └─────────────┘    └─────────────┘    └─────────────┘                      │
│                                                                              │
│  集成方式: 所有Gate注册到EnforcementEngine统一入口（Part 14.3）               │
│  触发方式: pre-commit(G1-G3) + cron定时审计(G4) + closure必选(G5-G6)        │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 15.2 Gate详细设计

#### Gate 1: Data Source Gate（数据来源门禁）

| 维度 | 设计 |
|------|------|
| **触发时机** | benchmark数据文件创建/修改时 |
| **检查逻辑** | 每条数据必须有`data_source`字段且值为(`real`\|`session`\|`log`) |
| **拦截条件** | `data_source` ∈ {`synthetic`, `mock`, `fake`, 未设置} 且 mode=acceptance |
| **通过条件** | 所有数据data_source已标注，验收模式下100%为真实数据 |
| **实现** | `isc-core/enforcement/gates/data-source-gate.js`（见14.4） |
| **覆盖缺陷** | D01, D14 |

**数据来源分类标准**：

```json
{
  "data_source": "real",
  "source_detail": {
    "type": "session_history",
    "session_id": "ses_xxx",
    "timestamp": "2026-03-04T10:23:00Z",
    "extraction_method": "manual_review"
  }
}
```

| data_source值 | 含义 | 可用于验收？ |
|---------------|------|------------|
| `real` | 真实用户消息，可溯源 | ✅ |
| `session` | 从session历史提取 | ✅ |
| `log` | 从decision-log提取 | ✅ |
| `synthetic` | 人工编写的模拟数据 | ❌ 仅dev/debug |
| `mock` | 自动生成的桩数据 | ❌ 仅dev/debug |

#### Gate 2: ISC Compliance Gate（ISC合规门禁）

| 维度 | 设计 |
|------|------|
| **触发时机** | 代码提交时（pre-commit hook） |
| **检查逻辑** | 变更文件涉及的ISC规则是否全部通过 |
| **拦截条件** | 任何P0规则的gate check返回false |
| **通过条件** | 所有关联P0规则gate通过 |
| **实现** | `pre-commit.sh`调用`engine.enforceAll()` |
| **覆盖缺陷** | D02, D06 |

#### Gate 3: Entry Point Smoke Gate（入口冒烟门禁）

| 维度 | 设计 |
|------|------|
| **触发时机** | cron脚本注册/修改时 + 每日审计 |
| **检查逻辑** | `node <script> --smoke` 必须exit 0 |
| **拦截条件** | smoke测试失败 → 禁止注册cron |
| **通过条件** | 所有注册入口smoke通过 |
| **实现** | `isc-core/enforcement/gates/entry-smoke-gate.js` |
| **覆盖缺陷** | D08 |

```javascript
// isc-core/enforcement/gates/entry-smoke-gate.js

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

module.exports = {
  id: 'entry-smoke-gate',
  ruleIds: ['arch.gate-before-action-001'],
  description: '所有cron入口脚本必须可独立运行smoke测试',

  check(target) {
    const { scripts } = target; // Array of script paths
    if (!scripts || scripts.length === 0) return { pass: true };

    const failures = [];
    for (const script of scripts) {
      if (!fs.existsSync(script)) {
        failures.push({ script, issue: 'file not found' });
        continue;
      }
      try {
        execSync(`node "${script}" --smoke`, {
          timeout: 10000,
          stdio: 'pipe',
          cwd: path.dirname(script)
        });
      } catch (e) {
        failures.push({
          script,
          issue: `smoke test failed: exit ${e.status || 'unknown'}`,
          stderr: (e.stderr || '').toString().substring(0, 200)
        });
      }
    }

    if (failures.length > 0) {
      return {
        pass: false,
        reason: `${failures.length}/${scripts.length} entry points failed smoke test`,
        details: { failures }
      };
    }
    return { pass: true };
  }
};
```

#### Gate 4: Feature Flag Audit Gate（特性开关审计门禁）

| 维度 | 设计 |
|------|------|
| **触发时机** | 每日cron审计（0 8 * * *） |
| **检查逻辑** | 核心功能的flag是否与期望值一致 |
| **拦截条件** | 不拦截，但发送飞书告警 |
| **通过条件** | 所有核心flag与期望一致 |
| **实现** | `isc-core/enforcement/gates/flag-audit-gate.js`（见14.4） |
| **覆盖缺陷** | D10 |

**Flag审计扩展设计**：

```json
// infrastructure/config/flags.json — 增加_meta字段
{
  "L3_PIPELINE_ENABLED": false,
  "_L3_PIPELINE_ENABLED_meta": {
    "expected": true,
    "reason": "L3 Pipeline核心功能，生产环境应开启",
    "owner": "l3-pipeline",
    "last_changed": "2026-03-05T02:30:00Z"
  },
  "ISC_ENFORCEMENT_ENABLED": true,
  "_ISC_ENFORCEMENT_ENABLED_meta": {
    "expected": true,
    "reason": "ISC运行时执法，必须开启",
    "owner": "isc-core"
  }
}
```

#### Gate 5: Report Integrity Gate（报告完整性门禁）

| 维度 | 设计 |
|------|------|
| **触发时机** | Day closure报告生成时 |
| **检查逻辑** | 报告中声称的数字必须可溯源 |
| **拦截条件** | 报告中存在无run_id的通过率数字 |
| **通过条件** | 每个通过率数字都附带run_id + 执行时间戳 |
| **实现** | `isc-core/enforcement/gates/report-validation-gate.js` |
| **覆盖缺陷** | D01（"10/10通过"无法溯源） |

```javascript
// isc-core/enforcement/gates/report-validation-gate.js

module.exports = {
  id: 'report-validation-gate',
  ruleIds: ['arch.real-data-gate-005', 'arch.gate-before-action-001'],
  description: '报告中的量化声明必须附带可溯源的执行记录',

  check(target) {
    const { reportContent } = target;
    if (!reportContent) return { pass: false, reason: 'No report content provided' };

    // 匹配量化声明模式: "X/Y通过" 或 "XX%通过率"
    const claimPattern = /(\d+)\/(\d+)\s*(?:通过|passed|pass)|(\d+(?:\.\d+)?)\s*%\s*(?:通过率|pass\s*rate)/g;
    const claims = [];
    let match;
    while ((match = claimPattern.exec(reportContent)) !== null) {
      claims.push({ text: match[0], index: match.index });
    }

    if (claims.length === 0) return { pass: true }; // 无量化声明

    // 检查每个声明附近是否有run_id
    const unverified = claims.filter(claim => {
      const context = reportContent.substring(
        Math.max(0, claim.index - 200),
        Math.min(reportContent.length, claim.index + 200)
      );
      return !context.includes('run_id') && !context.includes('run-id') && !context.includes('execution_id');
    });

    if (unverified.length > 0) {
      return {
        pass: false,
        reason: `${unverified.length} quantitative claims without run_id traceability`,
        details: { unverified_claims: unverified.map(c => c.text) }
      };
    }
    return { pass: true };
  }
};
```

#### Gate 6: Independent QA Gate（独立QA验收门禁）

| 维度 | 设计 |
|------|------|
| **触发时机** | Day closure之前（必选） |
| **检查逻辑** | QA脚本从零运行，结果与报告一致 |
| **拦截条件** | QA复现结果与报告声称不一致 |
| **通过条件** | QA独立复现结果与报告一致（±5%容差） |
| **实现** | `scripts/qa-closure-runner.sh` |
| **覆盖缺陷** | D01, D06, D08 |

```bash
#!/usr/bin/env bash
# scripts/qa-closure-runner.sh — 独立QA验收一键运行

set -e

echo "🔍 Independent QA Gate — Day Closure Verification"
echo "================================================"

PASS=0
FAIL=0

# 1. Benchmark真实数据验证
echo ""
echo "📊 [1/4] Benchmark Data Source Check..."
node -e "
  const engine = require('./skills/isc-core/enforcement/engine');
  engine.enforce('data-source-gate', {
    scenariosDir: './scripts/scenario-benchmark/scenarios',
    mode: 'acceptance'
  }).then(r => {
    console.log(r.pass ? '  ✅ Data source gate passed' : '  ❌ ' + r.reason);
    process.exit(r.pass ? 0 : 1);
  });
" && ((PASS++)) || ((FAIL++))

# 2. ISC Enforcement检查
echo ""
echo "🔒 [2/4] ISC Enforcement Metrics..."
node -e "
  const engine = require('./skills/isc-core/enforcement/engine');
  const m = engine.metrics();
  console.log('  Rules: ' + m.total_rules + ', Gates: ' + m.gates_loaded + ', Rate: ' + m.enforcement_rate);
  process.exit(m.gates_loaded >= 5 ? 0 : 1);
" && ((PASS++)) || ((FAIL++))

# 3. Entry Point Smoke Test
echo ""
echo "🚀 [3/4] Entry Point Smoke Tests..."
node -e "
  const engine = require('./skills/isc-core/enforcement/engine');
  engine.enforce('entry-smoke-gate', {
    scripts: ['./scripts/l3-pipeline-cron.js']
  }).then(r => {
    console.log(r.pass ? '  ✅ All entry points pass smoke' : '  ❌ ' + r.reason);
    process.exit(r.pass ? 0 : 1);
  });
" && ((PASS++)) || ((FAIL++))

# 4. Feature Flag Audit
echo ""
echo "🏁 [4/4] Feature Flag Audit..."
node -e "
  const engine = require('./skills/isc-core/enforcement/engine');
  engine.enforce('flag-audit-gate', {}).then(r => {
    console.log(r.pass ? '  ✅ All flags aligned' : '  ⚠️  ' + r.reason);
    process.exit(r.pass ? 0 : 1);
  });
" && ((PASS++)) || ((FAIL++))

echo ""
echo "================================================"
echo "QA Result: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ] && echo "✅ QA Gate PASSED" || echo "❌ QA Gate FAILED"
exit $FAIL
```

### 15.3 Gate触发矩阵

| Gate | Pre-Commit | Cron审计 | Day Closure | 手动 |
|------|-----------|---------|-------------|------|
| G1 Data Source | ✅（涉及benchmark文件时） | — | ✅ | ✅ |
| G2 ISC Compliance | ✅（所有提交） | — | — | ✅ |
| G3 Entry Smoke | ✅（涉及cron脚本时） | ✅（每日） | ✅ | ✅ |
| G4 Flag Audit | — | ✅（每日） | ✅ | ✅ |
| G5 Report Integrity | — | — | ✅ | ✅ |
| G6 Independent QA | — | — | ✅（必选） | ✅ |

---

## 第十六部分：事件驱动自愈架构 ★v5.0新增

> **消灭根因γ**：建立事件→诊断→修复→验证的完整自愈闭环。
> **对应缺陷**：D03（自愈缺失）、D04（版本空转）、D05（流转断裂）、D09（双总线）、D13（event-bridge碎片）、D15（模式库匮乏）

### 16.1 自愈架构全景

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                      事件驱动自愈架构（Closed-Loop Self-Healing）              │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────┐                 │
│  │ Layer 1: 事件健康域（Event Health Domain）               │                 │
│  │                                                         │                 │
│  │  emit() → ACK验证 → 超时？                              │                 │
│  │    ├── 有ACK → 正常                                     │                 │
│  │    └── 无ACK → emit('system.event.orphaned')            │                 │
│  │         └── 连续N条同类型无ACK → emit('system.event.dead')│                │
│  └─────────────────────────────────────────────────────────┘                 │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────┐                 │
│  │ Layer 2: Cron自愈闭环（Cron Self-Healing Loop）          │                 │
│  │                                                         │                 │
│  │  cron报错 → 模式匹配(KNOWN_PATTERNS) →                  │                 │
│  │    ├── 匹配已知模式 → 自动修复 → 重跑验证 → 结果事件    │                 │
│  │    └── 未匹配 → 记录unknown-patterns → 日聚合分析        │                 │
│  │         └── 聚类后生成新pattern建议 → 人工确认 → 入库    │                 │
│  └─────────────────────────────────────────────────────────┘                 │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────┐                 │
│  │ Layer 3: Day流转引擎（Day Flow Engine）                  │                 │
│  │                                                         │                 │
│  │  定时检测(30min) → 当前Day closure条件满足？             │                 │
│  │    ├── 是 → 自动生成Day N+1 scope → emit流转事件        │                 │
│  │    └── 否 → 检查阻塞项 → 报告阻塞原因                   │                 │
│  └─────────────────────────────────────────────────────────┘                 │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────┐                 │
│  │ Layer 4: 版本语义守卫（Version Semantic Guard）          │                 │
│  │                                                         │                 │
│  │  auto-commit前 → diff分类 →                              │                 │
│  │    ├── code_change → minor++                             │                 │
│  │    ├── doc_change → patch++ (或不递增)                    │                 │
│  │    ├── log_change → 不递增                               │                 │
│  │    └── config_change → patch++                           │                 │
│  │  冷静期: 同目录5min内多次变更 → 合并为一次commit         │                 │
│  └─────────────────────────────────────────────────────────┘                 │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────┐                 │
│  │ Layer 5: 事件总线统一（Event Bus Unification）           │                 │
│  │                                                         │                 │
│  │  Phase 1 ✅: bus-adapter.js统一入口（Day 2已完成）        │                 │
│  │  Phase 2:    所有event-bridge迁入dispatcher统一路由      │                 │
│  │  Phase 3:    废弃event-bus.js和独立event-bridge          │                 │
│  │  Timeline:   Phase 2→Day 3, Phase 3→Day 5                │                │
│  └─────────────────────────────────────────────────────────┘                 │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 16.2 Layer 1: 事件健康域详细设计

```javascript
// infrastructure/event-bus/health-monitor.js — 事件健康监控

const bus = require('./bus-adapter');

class EventHealthMonitor {
  constructor() {
    this.ORPHAN_TIMEOUT_MS = 60 * 60 * 1000; // 1小时未ACK = 孤儿
    this.DEAD_THRESHOLD = 5; // 连续5条孤儿 = 死信通道
  }

  /**
   * 扫描孤儿事件（发出但未被任何消费者ACK）
   * 运行频率: 每30分钟
   */
  async scanOrphans() {
    const cutoff = Date.now() - this.ORPHAN_TIMEOUT_MS;
    const allEvents = bus.consume({
      since: cutoff,
      limit: 500
    });

    // 获取所有消费者的ACK记录
    const ackLog = this._loadAcks(cutoff);
    const ackedIds = new Set(ackLog.map(a => a.event_id));

    const orphans = allEvents.filter(e => !ackedIds.has(e.id));
    
    if (orphans.length > 0) {
      // 按事件类型分组统计
      const byType = {};
      for (const o of orphans) {
        byType[o.type] = (byType[o.type] || 0) + 1;
      }

      bus.emit('system.event.orphan_report', {
        total_orphans: orphans.length,
        by_type: byType,
        window_ms: this.ORPHAN_TIMEOUT_MS
      }, 'health-monitor', { layer: 'META' });

      // 检查死信通道
      for (const [type, count] of Object.entries(byType)) {
        if (count >= this.DEAD_THRESHOLD) {
          bus.emit('system.event.dead_channel', {
            event_type: type,
            orphan_count: count,
            action: 'investigate_consumer'
          }, 'health-monitor', { layer: 'META' });
        }
      }
    }

    return { orphans: orphans.length, scanned: allEvents.length };
  }

  _loadAcks(since) {
    const fs = require('fs');
    const path = require('path');
    const acksFile = path.join(__dirname, 'acks.jsonl');
    if (!fs.existsSync(acksFile)) return [];
    return fs.readFileSync(acksFile, 'utf8')
      .split('\n').filter(Boolean)
      .map(l => { try { return JSON.parse(l); } catch(_) { return null; } })
      .filter(a => a && a.ts >= since);
  }
}

module.exports = new EventHealthMonitor();
```

### 16.3 Layer 2: Cron自愈闭环详细设计

```javascript
// infrastructure/self-healing/cron-healer.js — 增强版

const fs = require('fs');
const path = require('path');

const PATTERNS_FILE = path.join(__dirname, 'known-patterns.json');
const UNKNOWN_LOG = path.join(__dirname, 'unknown-patterns.jsonl');

class CronHealer {
  constructor() {
    this.patterns = this._loadPatterns();
  }

  _loadPatterns() {
    if (!fs.existsSync(PATTERNS_FILE)) return [];
    return JSON.parse(fs.readFileSync(PATTERNS_FILE, 'utf8'));
  }

  /**
   * 诊断cron任务失败
   * @returns {{ diagnosed: boolean, pattern?: object, fix?: Function }}
   */
  diagnose(cronJob, error) {
    for (const pattern of this.patterns) {
      if (this._matchPattern(pattern, error)) {
        return {
          diagnosed: true,
          pattern,
          fix: () => this._executeFix(pattern, cronJob, error)
        };
      }
    }

    // 未知模式 → 记录到unknown-patterns
    this._logUnknown(cronJob, error);
    return { diagnosed: false };
  }

  /**
   * 完整自愈闭环: 诊断 → 修复 → 验证
   */
  async healAndVerify(cronJob, error) {
    const diagnosis = this.diagnose(cronJob, error);
    
    if (!diagnosis.diagnosed) {
      // 未知模式 → 升级到飞书通知
      return {
        healed: false,
        action: 'escalated',
        reason: 'Unknown error pattern'
      };
    }

    // 执行修复
    const fixResult = await diagnosis.fix();
    
    if (!fixResult.success) {
      return { healed: false, action: 'fix_failed', reason: fixResult.error };
    }

    // 验证修复: 重新运行cron任务
    const verifyResult = await this._verifyFix(cronJob);
    
    // emit闭环事件
    const bus = require('../event-bus/bus-adapter');
    bus.emit('system.self_healing.completed', {
      cron_job: cronJob.name,
      pattern_id: diagnosis.pattern.id,
      healed: verifyResult.success,
      total_duration_ms: Date.now() - fixResult.startTime
    }, 'cron-healer', { layer: 'META' });

    return {
      healed: verifyResult.success,
      action: verifyResult.success ? 'auto_healed' : 'verify_failed',
      pattern: diagnosis.pattern.id
    };
  }

  _matchPattern(pattern, error) {
    const errorStr = typeof error === 'string' ? error : error.message || '';
    if (pattern.regex) return new RegExp(pattern.regex).test(errorStr);
    if (pattern.includes) return pattern.includes.every(s => errorStr.includes(s));
    return false;
  }

  async _executeFix(pattern, cronJob, error) {
    const startTime = Date.now();
    try {
      if (pattern.fix_type === 'restart') {
        // 简单重启
        return { success: true, startTime };
      }
      if (pattern.fix_type === 'config_reset') {
        // 重置配置
        const { execSync } = require('child_process');
        execSync(pattern.fix_command, { timeout: 10000, stdio: 'pipe' });
        return { success: true, startTime };
      }
      if (pattern.fix_type === 'dependency_check') {
        // 依赖检查修复
        const { execSync } = require('child_process');
        execSync('npm install 2>/dev/null || true', { 
          timeout: 30000, stdio: 'pipe',
          cwd: path.resolve(__dirname, '../..')
        });
        return { success: true, startTime };
      }
      return { success: false, error: `Unknown fix_type: ${pattern.fix_type}`, startTime };
    } catch (e) {
      return { success: false, error: e.message, startTime };
    }
  }

  async _verifyFix(cronJob) {
    try {
      const { execSync } = require('child_process');
      execSync(`node "${cronJob.script}" --smoke`, { timeout: 10000, stdio: 'pipe' });
      return { success: true };
    } catch (_) {
      return { success: false };
    }
  }

  _logUnknown(cronJob, error) {
    const entry = {
      timestamp: Date.now(),
      cron_job: cronJob.name,
      error: typeof error === 'string' ? error : error.message,
      stack: error.stack?.substring(0, 500)
    };
    fs.appendFileSync(UNKNOWN_LOG, JSON.stringify(entry) + '\n');
  }

  /**
   * 模式库增长: 从unknown-patterns中聚类生成新pattern候选
   * 运行频率: 每日
   */
  generatePatternCandidates() {
    if (!fs.existsSync(UNKNOWN_LOG)) return [];
    
    const unknowns = fs.readFileSync(UNKNOWN_LOG, 'utf8')
      .split('\n').filter(Boolean)
      .map(l => { try { return JSON.parse(l); } catch(_) { return null; } })
      .filter(Boolean);

    // 按error message做简单聚类
    const clusters = {};
    for (const u of unknowns) {
      // 提取error的前50字符作为聚类key
      const key = u.error.substring(0, 50).replace(/[^a-zA-Z]/g, '_');
      if (!clusters[key]) clusters[key] = [];
      clusters[key].push(u);
    }

    // 出现≥3次的错误 → 生成pattern候选
    return Object.entries(clusters)
      .filter(([_, items]) => items.length >= 3)
      .map(([key, items]) => ({
        candidate_id: `auto_${key}`,
        sample_error: items[0].error,
        occurrence_count: items.length,
        affected_jobs: [...new Set(items.map(i => i.cron_job))],
        suggested_regex: this._suggestRegex(items.map(i => i.error))
      }));
  }

  _suggestRegex(errors) {
    // 找到所有error的公共子串
    if (errors.length === 0) return null;
    let common = errors[0];
    for (const e of errors.slice(1)) {
      common = this._longestCommonSubstring(common, e);
    }
    return common.length > 10 ? common.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : null;
  }

  _longestCommonSubstring(a, b) {
    let longest = '';
    for (let i = 0; i < a.length; i++) {
      for (let j = i + 1; j <= a.length; j++) {
        const sub = a.substring(i, j);
        if (b.includes(sub) && sub.length > longest.length) {
          longest = sub;
        }
      }
    }
    return longest;
  }
}

module.exports = new CronHealer();
```

**已知模式库初始化（≥5个模式，覆盖D15）**：

```json
[
  {
    "id": "delivery-target-to-to",
    "description": "飞书消息发送目标重复to",
    "regex": "delivery.*target.*to.*to",
    "fix_type": "config_reset",
    "fix_command": "node -e \"const fs=require('fs'); /* fix config */\""
  },
  {
    "id": "delivery-missing-to",
    "description": "飞书消息缺少发送目标",
    "regex": "missing.*delivery.*target|target.*undefined",
    "fix_type": "config_reset"
  },
  {
    "id": "module-not-found",
    "description": "模块导入失败（路径变更或未安装）",
    "regex": "Cannot find module|MODULE_NOT_FOUND",
    "fix_type": "dependency_check"
  },
  {
    "id": "enoent-config",
    "description": "配置文件不存在",
    "regex": "ENOENT.*config|ENOENT.*flags\\.json",
    "fix_type": "config_reset"
  },
  {
    "id": "timeout-api",
    "description": "API调用超时",
    "regex": "timeout|ETIMEDOUT|ECONNABORTED",
    "fix_type": "restart"
  }
]
```

### 16.4 Layer 3: Day流转引擎详细设计

```javascript
// infrastructure/task-flow/day-transition.js — 增强版

const fs = require('fs');
const path = require('path');

class DayTransitionEngine {
  constructor() {
    this.REPORTS_DIR = path.join(__dirname, '../../reports');
    this.DESIGNS_DIR = path.join(__dirname, '../../designs');
  }

  checkDayCompletion(dayNumber) {
    const closureFile = path.join(this.REPORTS_DIR, `day${dayNumber}-closure-conditions.md`);
    if (!fs.existsSync(closureFile)) return { complete: false, reason: 'Closure report not found' };
    const content = fs.readFileSync(closureFile, 'utf8');
    const conditions = this._parseConditions(content);
    const unmet = conditions.filter(c => !c.met);
    return {
      complete: unmet.length === 0,
      total_conditions: conditions.length,
      met: conditions.length - unmet.length,
      unmet: unmet.map(c => c.description)
    };
  }

  generateNextDayScope(currentDay) {
    const carryOver = this._getCarryOverItems(currentDay);
    const nextDay = currentDay + 1;
    const scopeFile = path.join(this.DESIGNS_DIR, `day${nextDay}-scope-and-plan.md`);
    fs.writeFileSync(scopeFile, `# Day ${nextDay} Scope\n\n## Carry-Over\n${carryOver.map(i => `- ${i}`).join('\n')}\n`);
    const bus = require('../event-bus/bus-adapter');
    bus.emit('system.day.transitioned', { from_day: currentDay, to_day: nextDay }, 'day-transition', { layer: 'META' });
    return { day: nextDay, carry_over: carryOver };
  }

  _parseConditions(content) {
    return content.split('\n')
      .filter(l => /^[\s]*[-*]\s*\[[ x]\]/.test(l))
      .map(l => ({ description: l.replace(/^[\s]*[-*]\s*\[[ x]\]\s*/, '').trim(), met: /\[x\]/i.test(l) }));
  }

  _getCarryOverItems(dayNumber) {
    const scopeFile = path.join(this.DESIGNS_DIR, `day${dayNumber}-scope-and-plan.md`);
    if (!fs.existsSync(scopeFile)) return [];
    return fs.readFileSync(scopeFile, 'utf8').split('\n')
      .filter(l => /\*\*D\d+-\d+/.test(l) && !l.includes('✅'))
      .map(l => l.replace(/^[\s*#-]+/, '').trim());
  }
}

module.exports = new DayTransitionEngine();
```

### 16.5 三层归属

| Layer | 感知 | 认知 | 执行 |
|-------|------|------|------|
| 事件健康域 | ACK超时检测 | 孤儿/死信判定 | 告警事件 + 飞书通知 |
| Cron自愈 | 错误捕获 | 模式匹配+聚类 | 自动修复 + 验证 |
| Day流转 | closure条件检测 | 完成度判定 | 生成scope + 流转事件 |
| 版本语义 | diff分类 | 类型→版本决策 | 条件性递增 |
| 总线统一 | 双总线监控 | 可行性评估 | 渐进迁入 |

---

## 第十七部分：L3 Pipeline灰度迁移方案 ★v5.0新增

### 17.1 迁移阶段

```
Phase 1: Shadow Mode（旁路监听） ← Day 2已完成
Phase 2: Parallel Mode（双轨对比） ← Day 3-4
  进入: Phase 1运行≥24h，退出: 一致率≥90%
Phase 3: Primary Mode（L3主路由） ← Day 5-7
  进入: 一致率≥95%持续48h，退出: 7天无异常
Phase 4: Cleanup（清理旧路径） ← Day 10+
  进入: Phase 3稳定7天
```

### 17.2 Phase 2: 双轨对比引擎

```javascript
// infrastructure/pipeline/l3-parallel-runner.js
const busAdapter = require('../event-bus/bus-adapter');
const l3Pipeline = require('./l3-pipeline');

class ParallelRunner {
  async runParallel() {
    const events = busAdapter.consume({ type_filter: '*', since: Date.now() - 5*60*1000, limit: 100 });
    if (!events.length) return { compared: 0 };
    
    const results = [];
    for (const event of events) {
      const oldRoute = this._matchOldRoute(event);
      const newRoute = await l3Pipeline.dryRun(event);
      results.push({ event_type: event.type, match: oldRoute.handler === newRoute?.handler });
    }
    
    const rate = results.filter(r => r.match).length / results.length;
    busAdapter.emit('l3.parallel.comparison_completed', {
      total: results.length, match_rate: rate,
      mismatches: results.filter(r => !r.match).slice(0, 10)
    }, 'l3-parallel-runner', { layer: 'L3' });
    
    return { compared: results.length, match_rate: rate };
  }
  
  _matchOldRoute(event) {
    try {
      const routes = require('../dispatcher/routes.json');
      const match = routes.find(r => {
        const p = r.event_type || r.pattern;
        return p === event.type || (p?.includes('*') && new RegExp('^' + p.replace(/\*/g, '.*') + '$').test(event.type));
      });
      return { handler: match?.handler || null };
    } catch(_) { return { handler: null }; }
  }
}
module.exports = new ParallelRunner();
```

### 17.3 回滚方案

| Phase | 回滚操作 | 时间 |
|-------|---------|------|
| Phase 2 | `openclaw cron disable l3-parallel-runner` | 1min |
| Phase 3 | `L3_PIPELINE_PRIMARY=false` in flags.json | 1min |
| Phase 4 | `git checkout HEAD~N -- infrastructure/dispatcher/` | 10min |

---

## 第十八部分：Cron→事件驱动迁移 ★v5.0新增

### 18.1 16个任务迁移矩阵

| # | 任务 | 频率 | 策略 | 优先级 | Day |
|---|------|------|------|--------|-----|
| 1 | event-dispatcher | */5 | L3接管 | P0 | 3 |
| 2 | ISC变更检测 | */15 | git-hook+降频 | P0 | 3 |
| 3 | 全局决策流水线 | */30 | 事件化包装 | P2 | 3 |
| 4 | 系统监控 | 0 * | 事件化包装 | P2 | 5 |
| 5 | DTO-AEO流水线 | 0 * | 事件触发+兜底 | P1 | 4 |
| 6 | 能力同步PDCA | 5 */4 | 事件化包装 | P2 | 5 |
| 7 | 系统状态监控 | 10 */4 | 合并到#4 | P2 | 5 |
| 8 | 记忆摘要 | 0 */6 | **不迁移** | — | — |
| 9 | 清理与向量化 | 35 */6 | 事件化包装 | P3 | 7 |
| 10 | 自动备份 | 0 7,19 | **不迁移** | — | — |
| 11 | CRAS-A学习 | 0 9 | L4事件化 | P2 | 5 |
| 12 | LEP韧性日报 | 0 9 | 事件化包装 | P3 | 7 |
| 13 | CRAS-D调研 | 0 10 | L4事件化 | P2 | 5 |
| 14 | ISC质量管理 | 0 20 | 事件触发+兜底 | P1 | 4 |
| 15 | CRAS-E进化 | 0 2 | META事件化 | P2 | 5 |
| 16 | 每日清理 | 0 2 | **不迁移** | — | — |

### 18.2 生命周期事件包装器

```javascript
// infrastructure/pipeline/cron-lifecycle-emitter.js
const bus = require('../event-bus/bus-adapter');
function wrapCronJob(jobName, jobFn) {
  return async function(...args) {
    const t = Date.now();
    bus.emit('cron.job.started', { job_name: jobName }, 'cron-lifecycle', { layer: 'META' });
    try {
      const result = await jobFn(...args);
      bus.emit('cron.job.completed', { job_name: jobName, duration_ms: Date.now()-t }, 'cron-lifecycle', { layer: 'META' });
      return result;
    } catch(e) {
      bus.emit('cron.job.failed', { job_name: jobName, error: e.message }, 'cron-lifecycle', { layer: 'META' });
      const healer = require('../self-healing/cron-healer');
      await healer.healAndVerify({ name: jobName }, e);
      throw e;
    }
  };
}
module.exports = { wrapCronJob };
```

---

## 第十九部分：工程纪律自动化 ★v5.0新增

### 19.1 版本语义守卫（D04）

根据diff分类决定版本策略：code→minor, config→patch, log/data→skip。

### 19.2 Intent Registry增长（D07）

17条→30条(Day 3)→50条(Day 5)→100条(Day 10)→500条(Day 30)。
机制：LLM候选提取 + AEO聚类 + 正则扩展 + 人工review。

---

## 第二十部分：Day 2/3执行计划 ★v5.0新增

### 20.1 Day 3任务

| ID | 任务 | 验收 | 优先级 | 工时 |
|----|------|------|--------|------|
| D3-01 | Gate Protocol(6 gate) | 拦截过违规 | P0 | 4h |
| D3-02 | ISC 15 gates | rate≥20% | P0 | 3h |
| D3-03 | 自愈≥5模式 | 覆盖errors | P0 | 2h |
| D3-04 | L3 Phase 2 | 双轨≥8h | P0 | 3h |
| D3-05 | flag=true | exit 0 | P0 | 0.5h |
| D3-06 | dispatcher统一 | 日志生成 | P1 | 2h |
| D3-07 | git-hook ISC | 即时emit | P1 | 1h |
| D3-08 | Registry≥30 | IC3-5≥2 | P1 | 2h |
| D3-09 | AP ISC规则 | 5/5注册 | P1 | 1h |
| D3-10 | Bus Phase 2 | ≥2迁入 | P2 | 3h |
| D3-11 | 独立QA | 全P0通过 | P0 | 1.5h |

### 20.2 Day 3关闭条件

1. 6个Gate可运行且拦截过违规
2. enforcement_rate ≥ 20%
3. 自愈模式 ≥ 5
4. L3双轨≥8h无crash
5. L3_PIPELINE_ENABLED=true
6. Intent Registry ≥ 30
7. 5条AP写入ISC
8. QA全通过

---

## 第二十一部分：缺陷→修复映射 ★v5.0新增

| 缺陷 | 严重度 | 方案 | Day | 验收 |
|------|--------|------|-----|------|
| D01 合成数据 | 🔴P0 | Gate 1+AP-005 | 2✅+3 | 拦截synthetic |
| D02 零enforcement | 🔴P0 | Engine+AP-002 | 2✅+3 | rate≥20% |
| D03 自愈缺失 | 🔴P0 | Self-Healing | 2✅+3 | 模式≥5 |
| D04 版本空转 | 🟡P1 | Semantic Guard | 2✅ | log不递增 |
| D05 流转断裂 | 🟡P1 | Day Flow | 3+4 | 自动scope |
| D06 不查ISC | 🟡P1 | Gate 2 | 3 | pre-commit |
| D07 意图23.8% | 🟡P1 | Registry增长 | 3+5 | ≥40% |
| D08 入口坏了 | 🟡P1 | Gate 3 | 2✅+3 | smoke pass |
| D09 双总线 | 🟡P1 | Bus统一 | 3+5 | adapter唯一 |
| D10 flag=false | 🟡P1 | Gate 4 | 3 | flag一致 |
| D11 缺SKILL.md | 🟢P2 | skill-md-gate | 3 | 0缺失 |
| D12 技能重叠 | 🟢P2 | Dedup | 5 | 可运行 |
| D13 bridge碎片 | 🟢P2 | Bus统一 | 3-5 | 7→1 |
| D14 数据集低质 | 🟢P2 | Gate 1 | 3 | 非空≥80% |
| D15 模式库少 | 🟢P2 | Pattern增长 | 3+5 | ≥5 |

---

## 第二十二部分：AP规则JSON ★v5.0新增

5条规则写入`isc-core/rules/`:
- `arch.gate-before-action-001.json`
- `arch.rule-equals-code-002.json`
- `arch.feedback-must-close-003.json`
- `arch.machine-over-human-004.json`
- `arch.real-data-gate-005.json`

---

## 附录G：v4.3→v5.0变更总结

v5.0新增Part 0.1, 14-22, 附录G-I。继承v4.3全部内容(Part 0-12, 附录A-F)不做删改。

## 附录I：新增决策D29-D33

| # | 决策 | 理由 |
|---|------|------|
| D29 | Enforcement Engine统一执法 | 避免分散遗漏 |
| D30 | Gate三通道触发 | 不同时机不同gate |
| D31 | 自愈必含验证 | 盲修=新问题 |
| D32 | 灰度量化标准 | 无量化=拍脑袋 |
| D33 | 事件+cron双模式 | 低延迟+防遗漏 |

---

*v5.0.0 — 设计债务修复 + 运行时Enforcement + 自愈闭环 + L3灰度迁移 + Cron事件化 + 5条架构原则。*
*核心：从"设计美学"到"执行保障"。v4.3说"该怎么做"，v5.0说"怎么确保做到"。*
## 目标

> TODO: 请补充目标内容

## 方案

> TODO: 请补充方案内容

## 风险

> TODO: 请补充风险内容

## 验收

> TODO: 请补充验收内容

---

## 📋 架构评审清单 (自动生成)

**文档**: isc-event-dto-binding-design-v5
**生成时间**: 2026-03-06T13:01:12.506Z
**状态**: 待评审

### ⚠️ 缺失章节
- [ ] 补充「目标」章节
- [ ] 补充「方案」章节
- [ ] 补充「风险」章节
- [ ] 补充「验收」章节

### 评审检查项
- [ ] 方案可行性评估
- [ ] 技术风险已识别
- [ ] 依赖关系已明确
- [ ] 回滚方案已准备
- [ ] 性能影响已评估

### 审核门
审核门: 待通过

> 评审完成后，将上方「待通过」改为「通过」即可放行。
