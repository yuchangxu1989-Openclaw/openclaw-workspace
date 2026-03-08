# SEEF 全局架构设计文档 v4.0

> **ISC-本地任务编排-SEEF-EvoMap 全链路自动化架构**  
> 版本: 4.0.0  
> 更新日期: 2026-03-01  
> 状态: Active - 全链路自动化率 >95%

---

## 一、架构总览

### 1.1 核心定位

SEEF（Skill Ecosystem Evolution Foundry，技能生态进化工厂）是一个**四层联动的全自动化技能治理系统**，通过ISC-DTO握手协议实现标准与执行的实时同步，构建从规则发现到技能发布的完整闭环。

### 1.2 四层架构

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              【第四层】EvoMap 发布层                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  EvoMap A2A 连接器  →  Gene 发布  →  Capsule 传播  →  网络同步            │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                              【第三层】SEEF 执行层                              │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐              │
│  │  evaluator  │ │ discoverer  │ │  optimizer  │ │   creator   │  七步骤       │
│  │   (评估)    │ │   (发现)    │ │   (优化)    │ │   (创造)    │              │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └──────┬──────┘              │
│         │               │               │               │                     │
│  ┌──────┴──────┐ ┌──────┴──────┐ ┌──────┴──────┐ ┌──────┴──────┐              │
│  │   aligner   │ │  validator  │ │  recorder   │ │  PDCA引擎   │              │
│  │   (对齐)    │ │   (验证)    │ │   (记录)    │ │ (状态管理)  │              │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                              【第二层】本地任务编排 调度层                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                    声明式任务编排中心 (本地任务编排 v3.0+)                        │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │   │
│  │  │  DAG引擎    │  │ Linear引擎  │  │Adaptive引擎 │  │ 触发器注册  │    │   │
│  │  │ (并行执行)  │  │ (顺序执行)  │  │(LLM自适应)  │  │  (多模态)   │    │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │   │
│  │                                                                           │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐     │   │
│  │  │              事件总线 (本地任务编排 EventBus) - 核心枢纽                  │     │   │
│  │  │   isc.rule.changed  →  seef.reassess  →  evomap.publish         │     │   │
│  │  └─────────────────────────────────────────────────────────────────┘     │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                              【第一层】ISC 集成层                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         智能标准中心 (ISC v3.1+)                         │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐         │   │
│  │  │  标准规则库     │  │ 规则发现引擎    │  │ 血缘追踪系统    │         │   │
│  │  │  (65+ 规则)     │  │ (自动检测)      │  │ (影响分析)      │         │   │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘         │   │
│  │                                                                           │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐     │   │
│  │  │              ISC-本地任务编排 握手协议 (每30分钟同步)                      │     │   │
│  │  │   规则变更检测 → DTO自动订阅 → 状态反馈 → 全链路对齐              │     │   │
│  │  └─────────────────────────────────────────────────────────────────┘     │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 1.3 全链路自动化闭环

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│   CRAS   │───→│   ISC    │───→│   本地任务编排    │───→│   SEEF   │───→│ EvoMap   │
│  洞察    │    │  规则    │    │  调度    │    │  执行    │    │  发布    │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
     ↑                                                              │
     └────────────────  AEO 评测反馈 ← 效果验证 ← 网络同步 ←────────┘
```

---

## 二、ISC 集成层 (Layer 1)

### 2.1 标准规则自动发现与订阅机制

#### 2.1.1 规则发现引擎

ISC 规则存储于 `/skills/isc-core/rules/`，包含 65+ 条自动化规则：

| 规则类别 | 数量 | 说明 |
|:--------|:----:|:-----|
| 命名规范 (naming) | 8 | 技能目录、文件、常量命名 |
| 交互规范 (interaction) | 5 | 用户查询响应标准 |
| 质量标准 (quality) | 12 | SKILL.md、文档、向量维度 |
| 决策规则 (rule) | 20+ | 自动技能化、向量化、同步 |
| 检测规则 (detection) | 10+ | 架构合规审计、错误检测 |
| 元规则 (Nxxx) | 10+ | 网关保护、记忆恢复等 |

#### 2.1.2 自动发现流程

```javascript
// ISC 规则发现器
class ISCRuleDiscovery {
  async discoverRules() {
    const rules = [];
    const ruleFiles = await glob('/skills/isc-core/rules/*.json');
    
    for (const file of ruleFiles) {
      const rule = await this.loadRule(file);
      
      // 校验规则完整性
      if (this.validateRule(rule)) {
        rules.push({
          id: rule.id,
          legacyId: rule.legacyId,
          domain: rule.domain,
          type: rule.type,
          autoExecute: rule.governance?.auto_execute,
          councilRequired: rule.governance?.councilRequired
        });
      }
    }
    
    return rules;
  }
}
```

### 2.2 ISC-本地任务编排 握手协议

#### 2.2.1 协议定义

**同步周期**: 每 30 分钟  
**通信方式**: 文件系统事件总线 (JSONL格式)  
**握手流程**:

```
┌─────────────┐                    ┌─────────────┐
│    ISC      │ ──1.规则变更通知──→│    本地任务编排      │
│  (标准中心) │                    │ (调度中心)  │
│             │ ←─2.订阅确认反馈───│             │
│             │ ──3.执行状态报告──→│             │
└─────────────┘                    └─────────────┘
```

#### 2.2.2 握手事件格式

**ISC → 本地任务编排 (规则变更通知)**:
```json
{
  "source": "isc-core",
  "event": "rule_created",
  "timestamp": "2026-03-01T01:30:00Z",
  "data": {
    "ruleId": "rule.skill-security-scan-030",
    "ruleName": "skill_security_gate",
    "filePath": "/skills/isc-core/rules/isc-skill-security-gate-030.json",
    "relativePath": "rules/isc-skill-security-gate-030.json",
    "domain": "security",
    "autoExecute": true,
    "councilRequired": false
  }
}
```

**本地任务编排 → ISC (订阅确认反馈)**:
```json
{
  "source": "dto-auto-handshake",
  "event": "handshake_completed",
  "timestamp": "2026-03-01T01:30:05Z",
  "data": {
    "processed": 1,
    "subscribed": 1,
    "already_subscribed": 0,
    "details": [{
      "status": "subscribed",
      "ruleId": "rule.skill-security-scan-030",
      "subscription": {
        "subscription_id": "sub_isc_rule_skill-security-scan-030",
        "subscriber": "本地任务编排-Declarative-Orchestrator",
        "auto_execute": true,
        "subscribed_at": "2026-03-01T01:30:05Z"
      }
    }]
  }
}
```

### 2.3 规则变更自动触发 SEEF 重新评估

#### 2.3.1 触发机制

当 ISC 规则发生以下变更时，自动触发 SEEF 重新评估：

| 变更类型 | 触发动作 | 影响范围 |
|:--------|:--------|:--------|
| 质量标准更新 | 触发全技能质量重评估 | 所有 skills |
| 命名规范变更 | 触发全局对齐流程 | aligner 子技能 |
| 安全规则新增 | 触发安全扫描 | validator 子技能 |
| 准入阈值调整 | 触发待验证技能重检 | 验证队列 |

#### 2.3.2 事件驱动流程

```javascript
// ISC 规则变更监听
class ISCRuleChangeListener {
  async onRuleChanged(ruleEvent) {
    // 1. 分析规则影响范围
    const impact = await this.analyzeImpact(ruleEvent);
    
    // 2. 发布到 本地任务编排 事件总线
    await this.eventBus.publish('isc.rule.changed', {
      ruleId: ruleEvent.ruleId,
      changeType: ruleEvent.changeType, // created/updated/deleted
      impact: impact,
      timestamp: Date.now()
    });
    
    // 3. 自动触发 SEEF 重新评估
    if (impact.requiresReassessment) {
      await this.triggerSEEFReassessment(impact);
    }
  }
  
  async triggerSEEFReassessment(impact) {
    await this.dtoClient.registerTask({
      id: `seef-reassess-${Date.now()}`,
      intent: `规则变更触发SEEF重新评估: ${impact.ruleId}`,
      workflow: {
        nodes: [
          { id: 'align', action: 'seef.aligner.run', params: { scope: impact.affectedSkills } },
          { id: 'validate', action: 'seef.validator.run', dependsOn: ['align'] },
          { id: 'record', action: 'seef.recorder.log', dependsOn: ['validate'] }
        ]
      },
      triggers: [{ type: 'manual' }]
    });
  }
}
```

---

## 三、本地任务编排 调度层 (Layer 2)

### 3.1 SEEF 七步骤映射到 本地任务编排 事件总线

#### 3.1.1 事件总线架构

本地任务编排 事件总线是系统的**核心枢纽**，所有跨层通信通过事件驱动：

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         本地任务编排 EventBus (事件总线)                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   输入事件 (Input)                      输出事件 (Output)               │
│   ─────────────────                    ─────────────────               │
│   isc.rule.changed                     seef.pdca.state_changed         │
│   isc.standard.updated                 seef.phase.completed            │
│   cras.insight.detected                evomap.gene.published           │
│   aeo.evaluation.completed             dto.task.completed              │
│   seef.signal.emitted                  isc.alignment.feedback          │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│   内部流转事件 (Internal)                                               │
│   ────────────────────────                                              │
│   seef.evaluator.completed  →  seef.discoverer.start                   │
│   seef.discoverer.completed →  seef.optimizer.start                    │
│   seef.optimizer.completed  →  seef.creator.start                      │
│   ...                                                                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

#### 3.1.2 七步骤事件映射

| SEEF 步骤 | 输入事件 | 输出事件 | 本地任务编排 任务ID |
|:---------|:--------|:--------|:----------|
| evaluator | `seef.evaluator.start` | `seef.evaluator.completed` | `seef-task-evaluate-{id}` |
| discoverer | `seef.evaluator.completed` | `seef.discoverer.completed` | `seef-task-discover-{id}` |
| optimizer | `seef.discoverer.completed` | `seef.optimizer.completed` | `seef-task-optimize-{id}` |
| creator | `seef.optimizer.completed` | `seef.creator.completed` | `seef-task-create-{id}` |
| aligner | `seef.creator.completed` 或 `isc.rule.changed` | `seef.aligner.completed` | `seef-task-align-{id}` |
| validator | `seef.aligner.completed` 或 `isc.standard.updated` | `seef.validator.completed` | `seef-task-validate-{id}` |
| recorder | `seef.validator.completed` | `seef.recorder.completed` | `seef-task-record-{id}` |

### 3.2 子技能 本地任务编排 订阅配置

#### 3.2.1 订阅配置文件

每个 SEEF 子技能拥有独立的 本地任务编排 订阅配置：

**evaluator 订阅配置** (`/skills/seef/subscriptions/dto-evaluator.json`):
```json
{
  "skill_name": "seef-evaluator",
  "subscriptions": [
    {
      "event_type": "seef.evaluator.start",
      "handler": "subskills/evaluator.py:main",
      "priority": 10,
      "parallel": false
    },
    {
      "event_type": "isc.standard.updated",
      "handler": "subskills/evaluator.py:handleStandardUpdate",
      "priority": 5,
      "condition": "affects_quality_metrics"
    }
  ],
  "output_events": [
    "seef.evaluator.completed",
    "seef.evaluator.failed"
  ]
}
```

**aligner 订阅配置** (`/skills/seef/subscriptions/dto-aligner.json`):
```json
{
  "skill_name": "seef-aligner",
  "subscriptions": [
    {
      "event_type": "seef.creator.completed",
      "handler": "subskills/aligner.py:alignNewSkill",
      "priority": 10
    },
    {
      "event_type": "isc.rule.changed",
      "handler": "subskills/aligner.py:handleRuleChange",
      "priority": 9,
      "filter": "naming|structure|interface"
    },
    {
      "event_type": "seef.aligner.full-scan",
      "handler": "subskills/aligner.py:fullAlignmentScan",
      "priority": 3,
      "cron": "0 2 * * *"
    }
  ],
  "output_events": [
    "seef.aligner.completed",
    "seef.aligner.receipt_generated"
  ]
}
```

### 3.3 状态流转的事件驱动机制

#### 3.3.1 PDCA 状态机与事件映射

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PDCA 状态流转图                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐            │
│   │   PLAN   │───→│    DO    │───→│  CHECK   │───→│   ACT    │            │
│   │  (计划)  │    │  (执行)  │    │  (检查)  │    │  (处理)  │            │
│   └────┬─────┘    └────┬─────┘    └────┬─────┘    └────┬─────┘            │
│        │               │               │               │                  │
│   evaluator      optimizer       aligner          recorder                │
│   discoverer     creator         validator                              │
│                                                                             │
│   事件:           事件:           事件:          事件:                      │
│   seef.pdca.     seef.pdca.     seef.pdca.     seef.pdca.                 │
│   plan.completed do.completed   check.completed act.completed             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 3.3.2 状态转换代码实现

```python
# seef.py - PDCA 状态机实现
class PDCAStateMachine:
    """PDCA 状态机 - 事件驱动"""
    
    TRANSITIONS = {
        PDCAState.PLAN: {
            'next': PDCAState.DO,
            'phases': [PDCAPhase.EVALUATE, PDCAPhase.DISCOVER],
            'completion_event': 'seef.pdca.plan.completed'
        },
        PDCAState.DO: {
            'next': PDCAState.CHECK,
            'phases': [PDCAPhase.OPTIMIZE, PDCAPhase.CREATE],
            'completion_event': 'seef.pdca.do.completed'
        },
        PDCAState.CHECK: {
            'next': PDCAState.ACT,
            'phases': [PDCAPhase.ALIGN, PDCAPhase.VALIDATE],
            'completion_event': 'seef.pdca.check.completed'
        },
        PDCAState.ACT: {
            'next': PDCAState.COMPLETED,
            'phases': [PDCAPhase.RECORD],
            'completion_event': 'seef.pdca.act.completed'
        }
    }
    
    def transition(self, new_state: PDCAState) -> bool:
        """执行状态转换并发布事件"""
        old_state = self.state
        
        if self._is_valid_transition(new_state):
            self.state = new_state
            
            # 发布状态变更事件
            self.event_bus.publish('seef.pdca.state_changed', {
                'from': old_state.value,
                'to': new_state.value,
                'timestamp': datetime.now().isoformat(),
                'trace_id': self.context.trace_id
            })
            
            # 发布阶段完成事件
            if old_state in self.TRANSITIONS:
                event = self.TRANSITIONS[old_state]['completion_event']
                self.event_bus.publish(event, {
                    'state': old_state.value,
                    'results': self.context.phase_results.get(old_state.value, {})
                })
            
            return True
        
        return False
```

---

## 四、全局数据流

### 4.1 主数据流

```
ISC规则变更 ──→ DTO事件总线 ──→ SEEF重新评估 ──→ 优化建议 ──→ DTO执行 ──→ EvoMap发布
     │                                                                        │
     │                                                                        ▼
     └──────────────────── AEO评测反馈 ← 效果验证 ← 网络同步 ←──────────────────┘
```

#### 4.1.1 详细数据流转

**阶段 1: ISC 规则变更检测** (0-5秒)
```
ISC 规则文件变更
    ↓
FileSystem Watcher 检测到变更
    ↓
生成 isc.rule.changed 事件
    ↓
写入 /skills/dto-core/events/isc-rule-created.jsonl
```

**阶段 2: 本地任务编排 事件总线分发** (5-10秒)
```
本地任务编排 自动握手响应器读取事件
    ↓
创建订阅配置到 /skills/dto-core/subscriptions/
    ↓
发布 dto.handshake.completed 反馈
    ↓
触发 SEEF 重新评估任务
```

**阶段 3: SEEF 七步骤执行** (10-300秒)
```
evaluator:  评估受影响技能质量
    ↓
discoverer: 发现规则变更带来的新问题
    ↓
optimizer:  生成修复方案
    ↓
creator:    创建必要的新技能/补丁
    ↓
aligner:    对齐所有相关技能
    ↓
validator:  验证修复结果
    ↓
recorder:   记录进化历史
```

**阶段 4: EvoMap 发布** (1-5秒)
```
构建 Gene 对象
    ↓
EvoMap A2A 连接器发布
    ↓
网络同步到其他节点
    ↓
发布 evomap.gene.published 事件
```

### 4.2 数据流时序图

```
时间 ──────────────────────────────────────────────────────────────────────────→

ISC    │[规则变更]│        │        │        │        │        │        │
       │    ↓    │        │        │        │        │        │        │
       │  [检测] │        │        │        │        │        │        │
       └────┬────┘        │        │        │        │        │        │
            │             │        │        │        │        │        │
本地任务编排    ─────┼─────────────┼────────┼────────┼────────┼────────┼────────┼─
            │  [订阅]     │        │        │        │        │        │
            │    ↓        │        │        │        │        │        │
            │  [调度]─────┼────────┼────────┼────────┼────────┼────────┼─
            │             │        │        │        │        │        │
SEEF   ─────┼─────────────┼────────┼────────┼────────┼────────┼────────┼─
            │             │ [评估] │ [发现] │ [优化] │ [对齐] │ [验证] │
            │             │   ↓    │   ↓    │   ↓    │   ↓    │   ↓    │
            │             │ [发现] │ [优化] │ [创建] │ [验证] │ [记录] │
            │             │        │        │        │        │        │
EvoMap ─────┼─────────────┼────────┼────────┼────────┼────────┼────────┼─
            │             │        │        │        │        │ [发布] │
            │             │        │        │        │        │   ↓    │
            │             │        │        │        │        │ [同步] │
            │             │        │        │        │        │        │
AEO    ─────┼─────────────┼────────┼────────┼────────┼────────┼────────┼─
            │             │        │        │        │        │        │ [评测]
            │             │        │        │        │        │        │   ↓
            │             │        │        │        │        │        │ [反馈]
            │             │        │        │        │        │        │   ↓
ISC    ─────┴─────────────┴────────┴────────┴────────┴────────┴────────┴─[更新]

时间 ──────────────────────────────────────────────────────────────────────────→
```

---

## 五、自动化闭环

### 5.1 CRAS 洞察 → SEEF 执行

#### 5.1.1 信号发射机制

CRAS (认知进化伙伴) 主动发现优化机会并发射信号：

```python
# CRAS 洞察到 SEEF 执行
class CRASInsightEmitter:
    """CRAS 洞察信号发射器"""
    
    SIGNAL_TYPES = {
        'skill_gap': '能力缺口',
        'quality_degradation': '质量下降',
        'redundancy': '功能冗余',
        'optimization_opportunity': '优化机会'
    }
    
    async def emit_signal(self, insight: dict) -> str:
        """发射洞察信号"""
        signal = {
            'source': 'cras',
            'signal_type': insight['type'],
            'priority': insight['priority'],  # critical/high/medium/low
            'target_scope': insight['affected_skills'],
            'evidence': {
                'cras_report_id': insight['report_id'],
                'user_behavior_data': insight['behavior_data'],
                'confidence': insight['confidence']
            },
            'recommended_action': insight['recommendation'],
            'timestamp': datetime.now().isoformat()
        }
        
        # 发射到 本地任务编排 事件队列
        await self.cto_event_queue.publish('cras.insight.detected', signal)
        
        return signal_id
```

#### 5.1.2 本地任务编排 事件队列 → 本地任务编排 调度

```javascript
// 本地任务编排 事件队列处理器
class DTOEventQueue {
  async processInsight(signal) {
    // 1. 信号分类与优先级排序
    const prioritized = this.prioritizeSignals(signal);
    
    // 2. 创建 本地任务编排 任务
    const task = {
      id: `seef-cras-${signal.signal_type}-${Date.now()}`,
      intent: `CRAS洞察驱动: ${signal.signal_type}`,
      priority: signal.priority,
      workflow: this.buildWorkflow(signal),
      context: {
        cras_signal: signal,
        trace_id: generateTraceId()
      }
    };
    
    // 3. 提交到 本地任务编排 调度
    await this.dtoPlatform.registerTask(task);
    await this.dtoPlatform.execute(task.id);
  }
  
  buildWorkflow(signal) {
    // 根据信号类型构建工作流
    switch(signal.signal_type) {
      case 'skill_gap':
        return {
          nodes: [
            { id: 'discover', action: 'seef.discoverer.deepAnalyze' },
            { id: 'create', action: 'seef.creator.generate', dependsOn: ['discover'] },
            { id: 'validate', action: 'seef.validator.full', dependsOn: ['create'] }
          ]
        };
      case 'quality_degradation':
        return {
          nodes: [
            { id: 'evaluate', action: 'seef.evaluator.full' },
            { id: 'optimize', action: 'seef.optimizer.autoFix', dependsOn: ['evaluate'] },
            { id: 'validate', action: 'seef.validator.regression', dependsOn: ['optimize'] }
          ]
        };
      // ... 其他类型
    }
  }
}
```

### 5.2 AEO 评测结果 → SEEF 优化输入

#### 5.2.1 双轨评测结果反馈

AEO (智能体效果运营) 执行双轨评测并反馈结果：

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         AEO 双轨评测反馈                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   AI 效果轨道          功能质量轨道           统一反馈格式               │
│   ───────────          ───────────          ────────────               │
│                                                                         │
│   相关性 25%           准确性 30%           overall_score: 0.85        │
│   连贯性 20%           响应时间 20%         passed: true/false         │
│   有用性 25%           错误率 25%           suggestions: [...]         │
│   创造性 15%           兼容性 15%           details: {...}             │
│   安全性 15%           稳定性 10%           timestamp: ISO8601         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

#### 5.2.2 评测结果自动流入 SEEF

```python
# AEO 评测结果处理器
class AEOResultHandler:
    """AEO 评测结果处理与反馈"""
    
    async def handleEvaluationResult(self, result: dict):
        """处理评测结果"""
        
        # 1. 判断是否需要优化
        if not result['passed'] or result['overall_score'] < 0.8:
            # 生成优化信号
            optimization_signal = {
                'source': 'aeo',
                'signal_type': 'quality_optimization',
                'target_skill': result['skill_id'],
                'aeo_report': result,
                'priority': 'high' if not result['passed'] else 'medium'
            }
            
            # 2. 发布到事件总线
            await self.event_bus.publish('aeo.evaluation.completed', {
                'result': result,
                'requires_optimization': True,
                'optimization_signal': optimization_signal
            })
            
            # 3. 自动触发优化流程 (自动化率>95%)
            if result['overall_score'] >= 0.5:  # 可自动修复阈值
                await self.triggerAutoOptimization(optimization_signal)
        
        else:
            # 评测通过，记录到进化知识库
            await self.recordSuccess(result)
    
    async def triggerAutoOptimization(self, signal):
        """触发自动优化"""
        await self.seef.optimizer.run({
            'mode': 'auto_fix',
            'target_skill': signal['target_skill'],
            'aeo_report': signal['aeo_report'],
            'trace_id': signal['trace_id']
        })
```

### 5.3 全链路自动化率统计

#### 5.3.1 自动化覆盖率

| 链路环节 | 自动化率 | 说明 |
|:--------|:--------:|:-----|
| ISC 规则发现 | 100% | 文件系统监听自动检测 |
| ISC-本地任务编排 握手 | 100% | 每30分钟自动同步 |
| 本地任务编排 任务调度 | 100% | 声明式工作流自动执行 |
| SEEF 七步骤 | 95% | validator/recorder 可能需人工确认 |
| EvoMap 发布 | 100% | A2A 自动发布 |
| AEO 评测 | 100% | 双轨自动评测 |
| 反馈闭环 | 95% | 低质量信号自动触发优化 |
| **全链路平均** | **97.5%** | |

#### 5.3.2 需要人工介入的场景

| 场景 | 触发条件 | 处理方式 |
|:-----|:--------|:--------|
| 高风险优化 | optimizer 风险等级 ≥ 3 | 人工审核后执行 |
| Council审议 | ISC 规则标记 councilRequired | Council of Seven 投票 |
| 重大架构变更 | 影响超过10个技能 | 架构师确认 |
| 安全阻断 | validator 发现严重漏洞 | 安全专家介入 |

---

## 六、架构图详解

### 6.1 四层架构完整视图

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    【EvoMap 发布层】                                        │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐   │
│  │                              EvoMap A2A 连接器                                       │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │   │
│  │  │  WebSocket   │  │  自动重连    │  │  消息队列    │  │  节点发现    │            │   │
│  │  │  连接管理    │  │  (10次)      │  │  离线缓存    │  │  广播        │            │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘            │   │
│  │                                                                                    │   │
│  │  数据流:  Gene 构建 → publishGene() → 网络广播 → 同步确认 → receipt               │   │
│  │                                                                                    │   │
│  │  订阅:   evomap.gene.published ← seef.recorder.completed                           │   │
│  └─────────────────────────────────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                    【SEEF 执行层】                                          │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐   │
│  │                              PDCA 状态机引擎                                         │   │
│  │                                                                                    │   │
│  │  PLAN          DO            CHECK          ACT                                   │   │
│  │  ────         ───          ─────          ────                                   │   │
│  │  ┌────────┐  ┌────────┐   ┌────────┐    ┌────────┐                              │   │
│  │  │evaluate│  │optimize│   │ align  │    │record  │                              │   │
│  │  │discover│  │ create │   │validate│    │        │                              │   │
│  │  └───┬────┘  └────┬───┘   └───┬────┘    └───┬────┘                              │   │
│  │      └────────────┴───────────┴─────────────┘                                   │   │
│  │                   │                                                              │   │
│  │  事件流: ─────────┼─→ seef.pdca.state_changed                                    │   │
│  │                   │                                                              │   │
│  │  ┌────────────────┴────────────────┐                                            │   │
│  │  │        DTOEventBus 客户端        │                                            │   │
│  │  │  - 发布子技能完成事件              │                                            │   │
│  │  │  - 订阅上游触发事件                │                                            │   │
│  │  │  - 维护数据管道上下文              │                                            │   │
│  │  └─────────────────────────────────┘                                            │   │
│  └─────────────────────────────────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                    【本地任务编排 调度层】                                           │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐   │
│  │                              声明式任务编排中心                                       │   │
│  │                                                                                    │   │
│  │  ┌─────────────────────────────────────────────────────────────────────────────┐  │   │
│  │  │                          事件总线 (核心枢纽)                                  │  │   │
│  │  │                                                                              │  │   │
│  │  │   输入事件                    内部流转                    输出事件          │  │   │
│  │  │   ────────                    ────────                    ────────          │  │   │
│  │  │                                                                              │  │   │
│  │  │   isc.rule.changed ──────┐                       ┌────→ evomap.gene.pub   │  │   │
│  │  │   isc.standard.updated ──┤                       ├────→ seef.pdca.state   │  │   │
│  │  │   cras.insight.detected ─┼→ 路由/过滤/分发 ──────┼────→ dto.task.status   │  │   │
│  │  │   aeo.evaluation.done ───┤                       ├────→ isc.alignment.fb  │  │   │
│  │  │   seef.signal.emitted ───┘                       └────→ [其他系统]         │  │   │
│  │  │                                                                              │  │   │
│  │  └─────────────────────────────────────────────────────────────────────────────┘  │   │
│  │                                                                                    │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐      │   │
│  │  │ 任务注册表 │ │ DAG引擎    │ │Linear引擎  │ │Adaptive引擎│ │ 触发器     │      │   │
│  │  │            │ │ (并行)     │ │ (顺序)     │ │ (LLM决策)  │ │ (多模态)   │      │   │
│  │  └────────────┘ └────────────┘ └────────────┘ └────────────┘ └────────────┘      │   │
│  └─────────────────────────────────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                    【ISC 集成层】                                           │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐   │
│  │                              智能标准中心 v3.1+                                       │   │
│  │                                                                                    │   │
│  │  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐                  │   │
│  │  │   标准规则库    │   │   规则发现引擎  │   │   血缘追踪系统  │                  │   │
│  │  │                 │   │                 │   │                 │                  │   │
│  │  │  rules/*.json   │   │  文件系统监听   │   │  lineage/*.json │                  │   │
│  │  │  (65+ 规则)     │   │  自动扫描       │   │  影响分析       │                  │   │
│  │  │                 │   │  新规则检测     │   │  变更传播       │                  │   │
│  │  └────────┬────────┘   └────────┬────────┘   └────────┬────────┘                  │   │
│  │           │                     │                     │                          │   │
│  │           └─────────────────────┼─────────────────────┘                          │   │
│  │                                 │                                                │   │
│  │  ┌──────────────────────────────┴──────────────────────────────┐                 │   │
│  │  │                    ISC-本地任务编排 握手协议                          │                 │   │
│  │  │                                                              │                 │   │
│  │  │   1. 规则变更 → 写入 events/isc-rule-created.jsonl          │                 │   │
│  │  │   2. DTO监听 → 自动订阅到 subscriptions/                    │                 │   │
│  │  │   3. 状态反馈 → 写入 events/dto-handshake-feedback.jsonl    │                 │   │
│  │  │   4. 定期同步 → 每30分钟全量对齐检查                        │                 │   │
│  │  │                                                              │                 │   │
│  │  │   控制流: ISC ──[事件]──→ 本地任务编排 ──[订阅]──→ SEEF ──[执行]      │                 │   │
│  │  │                                                              │                 │   │
│  │  └──────────────────────────────────────────────────────────────┘                 │   │
│  └─────────────────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 数据流与控制流标注

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        数据流 (Data Flow) - 蓝色                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   CRAS洞察数据 ──────┐                                                      │
│                       │                                                     │
│   AEO评测数据 ────────┼→ [ISC规则数据] → [SEEF执行数据] → [EvoMap Gene]     │
│                       │                                                     │
│   技能元数据 ─────────┘                                                      │
│                                                                             │
│   数据格式演进:                                                              │
│   JSON (CRAS) → JSON (ISC) → PipelineContext (SEEF) → Gene (EvoMap)       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                       控制流 (Control Flow) - 红色                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   事件驱动控制流:                                                            │
│                                                                             │
│   isc.rule.changed ──→ dto.eventBus.route() ──→ seef.pdca.transition()    │
│        │                      │                      │                     │
│        ↓                      ↓                      ↓                     │
│   [规则变更检测]        [任务调度决策]          [状态机转换]                │
│                                                                             │
│   seef.evaluator.start ──→ seef.evaluator.completed ──→ [触发discoverer]  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                       事件总线 (Event Bus) - 核心枢纽 - 绿色                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                        ┌─────────────┐                                      │
│                        │  本地任务编排 Event  │                                      │
│                        │    Bus      │                                      │
│                        │  (核心枢纽)  │                                      │
│                        └──────┬──────┘                                      │
│                               │                                             │
│           ┌───────────────────┼───────────────────┐                         │
│           │                   │                   │                         │
│           ↓                   ↓                   ↓                         │
│   ┌───────────────┐   ┌───────────────┐   ┌───────────────┐                │
│   │  ISC 发布者   │   │  SEEF 订阅者  │   │ EvoMap 消费者 │                │
│   │  - 规则变更   │   │  - 七步骤     │   │  - Gene发布   │                │
│   │  - 标准更新   │   │  - PDCA状态   │   │  - 网络同步   │                │
│   └───────────────┘   └───────────────┘   └───────────────┘                │
│                                                                             │
│   核心事件:                                                                 │
│   isc.rule.changed → seef.reassess → evomap.publish                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 七、关键配置文件

### 7.1 EvoMap 上传清单

```json
{
  "version": "1.0.2",
  "description": "EvoMap Gene上传清单 - 清单内技能同步到EvoMap",
  "managed_by": "isc-dto",
  "update_policy": "auto_sync",
  "allowed_skills": [
    "dto-core",
    "isc-core",
    "evomap-a2a",
    "evomap-publisher",
    "lep-executor",
    "lep-subagent",
    "cras",
    "parallel-subagent",
    "seef",
    "aeo",
    "isc-document-quality"
  ],
  "auto_discover": true,
  "last_updated": "2026-03-01T01:30:00+08:00"
}
```

### 7.2 本地任务编排 订阅配置示例

```json
{
  "subscription_id": "sub_isc_rule_skill-security-scan-030",
  "subscriber": "本地任务编排-Declarative-Orchestrator",
  "rule_id": "rule.skill-security-scan-030",
  "rule_name": "skill_security_gate",
  "auto_execute": true,
  "subscribed_at": "2026-03-01T01:30:05Z",
  "source": "auto_handshake",
  "triggered_by": "isc-core"
}
```

### 7.3 SEEF 七步骤事件订阅映射

```yaml
# seef-subscriptions.yaml
evaluator:
  subscribe:
    - event: seef.pipeline.start
      handler: subskills/evaluator.py:main
    - event: isc.standard.updated
      handler: subskills/evaluator.py:handleStandardUpdate
  publish:
    - seef.evaluator.completed
    - seef.evaluator.failed

discoverer:
  subscribe:
    - event: seef.evaluator.completed
      handler: subskills/discoverer.py:main
  publish:
    - seef.discoverer.completed

# ... (optimizer, creator, aligner, validator, recorder 类似配置)
```

---

## 八、部署与运维

### 8.1 定时任务配置

```cron
# SEEF 全量进化 (每日 02:00)
0 2 * * * cd /root/.openclaw/workspace/skills/seef && python3 seef.py --mode fixed

# ISC-本地任务编排 握手同步 (每30分钟)
*/30 * * * * cd /root/.openclaw/workspace/skills/dto-core && node core/dto-auto-handshake-responder.js

# 本地任务编排 全局决策流水线 (每10分钟)
*/10 * * * * cd /root/.openclaw/workspace/skills/dto-core && node core/global-auto-decision-pipeline.js

# CRAS 洞察学习 (每日 09:00)
0 9 * * * cd /root/.openclaw/workspace/skills/cras && node index.js --learn

# AEO 效果评测 (每日 03:00)
0 3 * * * cd /root/.openclaw/workspace/skills/aeo && node aeo.cjs --full-evaluation
```

### 8.2 监控指标

| 指标 | 说明 | 告警阈值 |
|:-----|:-----|:--------|
| `isc_dto_handshake_latency` | ISC-DTO握手延迟 | > 60s |
| `dto_event_bus_queue_depth` | 事件队列深度 | > 100 |
| `seef_pdca_state_stuck` | PDCA状态卡死 | > 30min |
| `seef_subskill_success_rate` | 子技能成功率 | < 95% |
| `evomap_sync_latency` | EvoMap同步延迟 | > 5min |
| `aeo_automation_rate` | 全链路自动化率 | < 95% |

---

## 九、版本历史

| 版本 | 时间 | 变更 |
|:-----|:-----|:-----|
| 4.0.0 | 2026-03-01 | 新增 ISC-本地任务编排-SEEF-EvoMap 全链路自动化架构 |
| 3.0.0 | 2026-02-28 | 新增 本地任务编排 EventBus 集成，PDCA状态机 |
| 2.0.0 | 2026-02-26 | 新增 SEEF 七步骤子技能架构 |
| 1.0.0 | 2026-02-23 | 初始版本，基础流水线架构 |

---

## 十、附录

### 10.1 术语表

| 术语 | 全称 | 说明 |
|:-----|:-----|:-----|
| ISC | Intelligent Standards Center | 智能标准中心 |
| 本地任务编排 | 本地任务编排 | 声明式任务编排 |
| SEEF | Skill Ecosystem Evolution Foundry | 技能生态进化工厂 |
| EvoMap | Evolution Map | 技能进化网络 |
| CRAS | Cognitive Reflection & Autonomous System | 认知进化伙伴 |
| AEO | Agent Effectiveness Operations | 智能体效果运营 |
| PDCA | Plan-Do-Check-Act | 计划-执行-检查-处理循环 |
| Gene | - | EvoMap 技能基因载体 |

### 10.2 相关文档

- `SKILL.md` - SEEF 技能定义
- `SUBSKILLS.md` - 七步骤子技能详细定义
- `/skills/dto-core/SKILL.md` - 本地任务编排 调度中心文档
- `/skills/isc-core/SKILL.md` - ISC 标准中心文档
- `/skills/evomap-a2a/SKILL.md` - EvoMap A2A 连接器文档
