# ISC事件-DTO调度 运行时绑定 详细设计方案

> **版本**: v1.0.0  
> **作者**: 系统架构师  
> **日期**: 2026-03-04  
> **状态**: DRAFT - 待评审

---

## TL;DR

现状：ISC有77条规则（仅35条有完整trigger+action），DTO有订阅JSON但无运行时执行能力，两套事件总线互不通信，dispatcher写文件但不执行。**全链路断裂。**

方案：以DTO为唯一调度引擎，在ISC内建立事件类型注册表（Event Registry），通过运行时绑定层（Runtime Binder）将ISC规则的trigger→事件总线→DTO任务执行串成闭环。不发明新引擎，不增加新概念。

---

## 第一部分：现状诊断

### 1.1 ISC规则现状（77条）

| 状态 | 数量 | 含义 | 问题 |
|------|------|------|------|
| COMPLETE | 35 | 有trigger+action | trigger/action格式不统一，无标准schema |
| TRIGGER_ONLY | 11 | 有trigger无action | 能感知但无法执行 |
| ACTION_ONLY | 0 | 有action无trigger | — |
| SKELETON | 31 | 无trigger无action | 纯文档，不可执行 |

**trigger格式混乱实例：**

```javascript
// 格式A: type+patterns
{ "type": "event", "patterns": ["cron:create", "cron:update"] }

// 格式B: events数组
{ "events": ["skill_created", "skill_updated"] }

// 格式C: type+sources
{ "type": "event", "sources": ["skill.changed", "skill.created"] }

// 格式D: events+condition字符串
{ "events": ["aeo_evaluation_required"], "condition": "evaluation_request_received" }

// 格式E: type+patterns（文件操作）
{ "type": "file_operation", "patterns": ["/root/.openclaw/openclaw.json"] }
```

**action格式同样混乱** — 有的是字符串`"execute_auto_remediation"`，有的是对象`{ type: "enforce", on_missing: "reject" }`，有的是`{ type: "pipeline.trigger", target: "seef.evolution-pipeline" }`。

### 1.2 事件总线现状（两套并存）

| 组件 | 位置 | 类型 | 问题 |
|------|------|------|------|
| `infrastructure/event-bus/bus.js` | 基础设施层 | JSONL文件+文件锁 | 完整的持久化实现，但只被dispatcher消费 |
| `dto-core/core/event-bus.js` | DTO内部 | 内存EventEmitter | 进程内有效，不持久化，重启丢失 |
| `dto-core/core/event-consumer.js` | DTO内部 | `.dto-signals/`目录监视 | 第三条路径，与前两者独立 |

**三条事件通道互不通信。**

### 1.3 ISC→DTO联动现状

```
ISC event-bridge.js  ──(hash对比)──> 检测规则变更
         │
         ▼
  infrastructure/event-bus  ──(JSONL)──> events.jsonl
         │
         ▼
  infrastructure/dispatcher  ──(routes.json匹配)──> dispatched/{event}.json
         │
         ▼
         ❌ 到此为止。dispatcher.js注释写着：
            "In a full implementation, this would call sessions_spawn"
```

**DTO订阅层（subscriptions/*.json）** 有70+个订阅文件，但：
- 只是元数据JSON，不包含执行逻辑
- 没有runtime binder消费这些订阅
- EventPublisher加载了它们，但没有被任何进程启动

### 1.4 根本问题总结

| # | 问题 | 影响 |
|---|------|------|
| P1 | ISC规则trigger/action格式不统一 | 无法程序化解析和绑定 |
| P2 | 两套event-bus不通信 | 事件孤岛，ISC发的事件DTO收不到 |
| P3 | dispatcher不执行，只写文件 | 最后一公里断裂 |
| P4 | 订阅层是静态JSON，无运行时绑定 | 有映射关系但没有执行管线 |
| P5 | 31条SKELETON规则不可执行 | 40%的规则库是死代码 |
| P6 | 事件类型无注册表 | 事件命名随意，无法做类型安全的路由 |

---

## 第二部分：设计原则

### 2.1 四条铁律

1. **DTO就是调度引擎** — 不新建任何调度/编排组件。ISC只管规则定义+事件类型注册，DTO负责所有执行调度。
2. **事件是唯一联动手段** — ISC→DTO的联动必须通过事件总线，不允许直接代码调用或文件轮询。
3. **运行时绑定** — 静态JSON不够。需要代码级别的`bind(eventType, handler)`机制在进程启动时建立。
4. **MECE** — 每个职责有且只有一个归属。事件类型定义归ISC，事件路由归event-bus，任务调度归DTO。

### 2.2 职责MECE分配

```
┌────────────────────────────────────────────────────────┐
│                     职责唯一归属表                        │
├────────────────┬───────────────────────────────────────┤
│ 规则定义       │ ISC  (rules/*.json)                    │
│ 事件类型注册   │ ISC  (event-registry.json)             │
│ 事件感知/发布  │ ISC  (event-bridge.js → bus.emit)      │
│ 事件持久化     │ infrastructure/event-bus (JSONL)       │
│ 事件路由       │ infrastructure/event-bus (matchType)   │
│ 任务定义       │ DTO  (tasks/*.yaml)                    │
│ 订阅管理       │ DTO  (subscriptions/*.json)            │
│ 运行时绑定     │ DTO  (runtime-binder.js) ← 新建        │
│ 任务调度执行   │ DTO  (engines/*)                       │
│ 结果反馈       │ DTO  (事件回写到bus)                    │
└────────────────┴───────────────────────────────────────┘
```

---

## 第三部分：架构设计

### 3.1 整体架构

```
 ┌─────────────────────────────────────────────────────────────┐
 │                        ISC (规则层)                          │
 │                                                             │
 │  ┌──────────────┐   ┌──────────────┐   ┌────────────────┐  │
 │  │ rules/*.json │   │ event-       │   │ event-         │  │
 │  │ (77条规则)    │   │ registry.json│   │ bridge.js      │  │
 │  │ 标准化schema │   │ (事件类型表)  │   │ (变更检测+发布) │  │
 │  └──────┬───────┘   └──────┬───────┘   └───────┬────────┘  │
 │         │                  │                    │           │
 └─────────┼──────────────────┼────────────────────┼───────────┘
           │                  │                    │
           │                  │    ┌───────────────▼─────────┐
           │                  │    │  infrastructure/         │
           │                  │    │  event-bus (JSONL)       │
           │                  │    │  ┌───────────────────┐   │
           │                  │    │  │ events.jsonl      │   │
           │                  │    │  │ (持久化,有锁,可回溯)│   │
           │                  │    │  └─────────┬─────────┘   │
           │                  │    └────────────┼─────────────┘
           │                  │                 │
 ┌─────────┼──────────────────┼─────────────────┼─────────────┐
 │         │            DTO (调度层)             │             │
 │         │                  │                 │             │
 │  ┌──────▼───────┐   ┌─────▼──────┐   ┌─────▼──────────┐  │
 │  │ rule-schema  │   │ runtime-   │   │ event-         │  │
 │  │ validator.js │   │ binder.js  │   │ consumer.js    │  │
 │  │ (解析ISC规则) │   │ (运行时绑定)│   │ (消费事件)     │  │
 │  └──────────────┘   └─────┬──────┘   └───────┬────────┘  │
 │                           │                   │           │
 │                    ┌──────▼───────────────────▼────┐      │
 │                    │      task-executor.js          │      │
 │                    │      (统一任务执行器)            │      │
 │                    │  ┌─────┐ ┌─────┐ ┌──────────┐ │      │
 │                    │  │ DAG │ │Lin. │ │ Adaptive │ │      │
 │                    │  └─────┘ └─────┘ └──────────┘ │      │
 │                    └──────────────┬────────────────┘      │
 │                                   │                       │
 │                    ┌──────────────▼────────────────┐      │
 │                    │ 执行结果 → bus.emit(result)    │      │
 │                    └───────────────────────────────┘      │
 └───────────────────────────────────────────────────────────┘
```

### 3.2 事件流闭环

```
1. ISC规则变更 / 外部信号 / cron触发
        │
2. ISC event-bridge.js 检测变更
        │
3. bus.emit('isc.rule.updated', payload)  → 写入 events.jsonl
        │
4. DTO runtime-binder 消费事件（从JSONL读取未消费事件）
        │
5. 匹配 subscriptions → 找到对应 task 定义
        │
6. task-executor 通过引擎执行任务
        │
7. 执行结果 → bus.emit('dto.task.completed', result)
        │
8. 下游消费者（SEEF/CRAS/其他）接收结果事件
```

---

## 第四部分：详细设计

### 4.1 ISC侧：规则Trigger/Action标准化Schema

**新文件**: `skills/isc-core/schemas/rule-trigger-action.schema.json`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "definitions": {
    "trigger": {
      "type": "object",
      "required": ["type"],
      "properties": {
        "type": {
          "type": "string",
          "enum": ["event", "cron", "file_watch", "conditional", "manual"]
        },
        "events": {
          "type": "array",
          "items": { "type": "string" },
          "description": "事件类型列表，必须在event-registry中注册"
        },
        "cron": {
          "type": "string",
          "description": "cron表达式（仅type=cron时）"
        },
        "file_patterns": {
          "type": "array",
          "items": { "type": "string" },
          "description": "文件glob模式（仅type=file_watch时）"
        },
        "condition": {
          "type": "string",
          "description": "JS表达式字符串，在payload上下文中求值"
        }
      }
    },
    "action": {
      "type": "object",
      "required": ["type"],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "dto_task",
            "enforce",
            "block_and_notify",
            "pipeline_trigger",
            "auto_fix",
            "validate"
          ]
        },
        "task_id": {
          "type": "string",
          "description": "DTO任务ID（type=dto_task时必填）"
        },
        "pipeline": {
          "type": "string",
          "description": "触发的pipeline名（type=pipeline_trigger时）"
        },
        "params": {
          "type": "object",
          "description": "传递给执行器的参数"
        },
        "on_failure": {
          "type": "string",
          "enum": ["reject", "warn", "retry", "escalate"],
          "default": "warn"
        }
      }
    }
  }
}
```

**规则标准化迁移示例：**

```json
// BEFORE (格式混乱):
{
  "trigger": { "type": "event", "patterns": ["cron:create"] },
  "action": { "type": "enforce", "on_missing": "reject" }
}

// AFTER (标准化):
{
  "trigger": {
    "type": "event",
    "events": ["cron.task.create", "cron.task.update"],
    "condition": "payload.kind === 'agentTurn'"
  },
  "action": {
    "type": "enforce",
    "params": {
      "required_field": "model",
      "default_value": "claude/claude-sonnet-4-6"
    },
    "on_failure": "reject"
  }
}
```

### 4.2 ISC侧：事件类型注册表（Event Registry）

**新文件**: `skills/isc-core/config/event-registry.json`

```json
{
  "$schema": "isc.event-registry.v1",
  "version": "1.0.0",
  "description": "ISC事件类型注册表 - 所有可发布/订阅的事件类型",
  
  "events": {
    "isc.rule.created": {
      "source": "isc-core",
      "description": "ISC规则被创建",
      "payload_schema": {
        "rule_id": "string",
        "file": "string",
        "domain": "string"
      },
      "consumers": ["dto-core", "seef"]
    },
    "isc.rule.updated": {
      "source": "isc-core",
      "description": "ISC规则被修改",
      "payload_schema": {
        "rule_id": "string",
        "file": "string",
        "changed_fields": "string[]"
      },
      "consumers": ["dto-core", "seef"]
    },
    "isc.rule.deleted": {
      "source": "isc-core",
      "description": "ISC规则被删除",
      "payload_schema": {
        "rule_id": "string"
      },
      "consumers": ["dto-core"]
    },
    
    "skill.created": {
      "source": "dto-core",
      "description": "新技能被创建",
      "payload_schema": {
        "skill_name": "string",
        "path": "string"
      },
      "consumers": ["isc-core", "seef", "cras"]
    },
    "skill.updated": {
      "source": "dto-core",
      "description": "技能被修改",
      "payload_schema": {
        "skill_name": "string",
        "changed_files": "string[]"
      },
      "consumers": ["isc-core", "seef"]
    },
    "skill.deleted": {
      "source": "dto-core",
      "description": "技能被删除",
      "payload_schema": {
        "skill_name": "string"
      },
      "consumers": ["isc-core"]
    },
    
    "cron.task.create": {
      "source": "openclaw-gateway",
      "description": "cron任务被创建",
      "payload_schema": {
        "job_id": "string",
        "model": "string",
        "schedule": "string"
      },
      "consumers": ["isc-core"]
    },
    "cron.task.update": {
      "source": "openclaw-gateway",
      "description": "cron任务被修改",
      "payload_schema": {
        "job_id": "string",
        "changes": "object"
      },
      "consumers": ["isc-core"]
    },
    
    "file.sensitive.modified": {
      "source": "file-watcher",
      "description": "敏感配置文件被修改",
      "payload_schema": {
        "file_path": "string",
        "operation": "string",
        "detected_at": "number"
      },
      "consumers": ["isc-core"]
    },
    
    "dto.task.completed": {
      "source": "dto-core",
      "description": "DTO任务执行完成",
      "payload_schema": {
        "task_id": "string",
        "status": "string",
        "result": "object",
        "duration_ms": "number"
      },
      "consumers": ["seef", "cras"]
    },
    "dto.task.failed": {
      "source": "dto-core",
      "description": "DTO任务执行失败",
      "payload_schema": {
        "task_id": "string",
        "error": "string",
        "retry_count": "number"
      },
      "consumers": ["cras"]
    },
    
    "seef.skill.evaluated": {
      "source": "seef",
      "description": "SEEF评测完成",
      "payload_schema": {
        "skill_name": "string",
        "score": "number",
        "report": "object"
      },
      "consumers": ["dto-core", "cras"]
    },
    
    "cras.insight.generated": {
      "source": "cras",
      "description": "CRAS生成洞察",
      "payload_schema": {
        "insight_id": "string",
        "category": "string",
        "impact": "number"
      },
      "consumers": ["isc-core", "dto-core"]
    },

    "system.architecture.changed": {
      "source": "*",
      "description": "架构变更事件",
      "payload_schema": {
        "description": "string",
        "scope": "string",
        "details": "string"
      },
      "consumers": ["memory-archiver"]
    },
    "system.config.changed": {
      "source": "*",
      "description": "配置变更事件",
      "payload_schema": {
        "description": "string",
        "scope": "string"
      },
      "consumers": ["memory-archiver"]
    }
  }
}
```

### 4.3 统一事件总线：消除双bus

**决策：保留infrastructure/event-bus（JSONL实现），废弃DTO内存bus**

理由：
- infrastructure bus有持久化、文件锁、游标追踪、事件回溯
- DTO内存bus重启即丢，不满足可靠性要求
- 统一到一个bus后，所有组件（ISC/DTO/SEEF/CRAS）使用同一条通道

**改造方案：**

```javascript
// skills/dto-core/core/event-bus.js  ← 改为代理模式
// 不再自己实现EventEmitter，而是代理到infrastructure bus

const infraBus = require('../../../infrastructure/event-bus/bus.js');

class DTOEventBusProxy {
  /**
   * 发布事件 → 写入infrastructure JSONL
   */
  publish(eventType, payload) {
    return infraBus.emit(eventType, {
      source: 'dto-core',
      payload,
      timestamp: Date.now()
    });
  }

  /**
   * 消费事件 → 从infrastructure JSONL读取（带游标）
   */
  consume(eventType, handler, consumerId = 'dto-core') {
    // 注册消费者，由runtime-binder统一调度
    return { eventType, handler, consumerId };
  }

  /**
   * 查询事件历史
   */
  getHistory(eventType, limit) {
    return infraBus.query(eventType, limit);
  }
}

module.exports = DTOEventBusProxy;
```

**infrastructure/event-bus/bus.js 增强接口：**

```javascript
// 新增方法（在现有实现基础上）

/**
 * 读取未被指定consumer消费的事件
 * @param {string} consumerId - 消费者标识
 * @param {string} [eventTypeFilter] - 可选的事件类型过滤（支持通配符）
 * @param {number} [limit=100] - 最大返回数
 * @returns {Array} 未消费事件列表
 */
function consumeUnread(consumerId, eventTypeFilter, limit = 100) {
  // 读取cursor.json中该consumer的offset
  // 从events.jsonl中读取offset之后的事件
  // 过滤匹配eventTypeFilter的事件
  // 更新cursor
  // 返回事件列表
}

/**
 * 查询事件历史
 */
function query(eventType, limit = 100) {
  // 从events.jsonl中倒序读取匹配的事件
}
```

### 4.4 DTO侧：Runtime Binder（核心新组件）

**新文件**: `skills/dto-core/core/runtime-binder.js`

这是整个方案的核心：运行时绑定ISC规则→事件→DTO任务。

```javascript
/**
 * DTO Runtime Binder v1.0
 * 
 * 职责：
 * 1. 启动时加载所有ISC规则，解析标准化trigger
 * 2. 从event-bus消费事件
 * 3. 匹配事件→规则→任务
 * 4. 调用task-executor执行
 * 5. 回写执行结果到event-bus
 * 
 * 运行方式：
 * - 作为常驻进程运行（由OpenClaw cron每5分钟触发一次）
 * - 幂等设计：重复触发安全
 */

const fs = require('fs');
const path = require('path');
const bus = require('../../../infrastructure/event-bus/bus.js');

const CONSUMER_ID = 'dto-runtime-binder';
const ISC_RULES_DIR = path.join(__dirname, '../../isc-core/rules');
const EVENT_REGISTRY = path.join(__dirname, '../../isc-core/config/event-registry.json');
const BINDINGS_CACHE = path.join(__dirname, '../.bindings-cache.json');

class RuntimeBinder {
  constructor(taskExecutor) {
    this.taskExecutor = taskExecutor;
    this.bindings = new Map();   // eventType → [{ ruleId, action, condition }]
    this.registry = null;         // event-registry.json
    this.stats = {
      loaded: 0,
      bound: 0,
      skipped: 0,
      executed: 0,
      failed: 0
    };
  }

  /**
   * 第1步：加载事件注册表
   */
  loadEventRegistry() {
    if (!fs.existsSync(EVENT_REGISTRY)) {
      console.warn('[RuntimeBinder] event-registry.json不存在，跳过验证');
      this.registry = null;
      return;
    }
    this.registry = JSON.parse(fs.readFileSync(EVENT_REGISTRY, 'utf8'));
    console.log(`[RuntimeBinder] 加载事件注册表: ${Object.keys(this.registry.events).length} 个事件类型`);
  }

  /**
   * 第2步：扫描ISC规则，解析trigger，建立绑定表
   */
  loadBindings() {
    const files = fs.readdirSync(ISC_RULES_DIR).filter(f => f.endsWith('.json'));
    
    for (const file of files) {
      try {
        const rule = JSON.parse(fs.readFileSync(path.join(ISC_RULES_DIR, file), 'utf8'));
        this.stats.loaded++;
        
        const trigger = this.normalizeTrigger(rule);
        const action = this.normalizeAction(rule);
        
        if (!trigger || !action) {
          this.stats.skipped++;
          continue;
        }
        
        // 对trigger中的每个事件类型建立绑定
        const eventTypes = this.extractEventTypes(trigger);
        
        for (const eventType of eventTypes) {
          // 验证事件类型是否在注册表中
          if (this.registry && !this.isRegisteredEvent(eventType)) {
            console.warn(`[RuntimeBinder] 规则 ${rule.id} 引用了未注册事件: ${eventType}`);
          }
          
          if (!this.bindings.has(eventType)) {
            this.bindings.set(eventType, []);
          }
          
          this.bindings.get(eventType).push({
            ruleId: rule.id || file.replace('.json', ''),
            ruleName: rule.name || rule.rule_name,
            trigger,
            action,
            governance: rule.governance || {},
            priority: rule.priority || rule.governance?.priority || 50
          });
          
          this.stats.bound++;
        }
      } catch (e) {
        console.error(`[RuntimeBinder] 解析规则失败: ${file}`, e.message);
      }
    }
    
    // 按priority排序每个eventType的bindings
    for (const [eventType, handlers] of this.bindings) {
      handlers.sort((a, b) => (a.priority || 50) - (b.priority || 50));
    }
    
    console.log(`[RuntimeBinder] 绑定完成: ${this.stats.loaded}规则, ${this.stats.bound}绑定, ${this.stats.skipped}跳过`);
  }

  /**
   * 规范化trigger（处理4种历史格式）
   */
  normalizeTrigger(rule) {
    const raw = rule.trigger || rule.triggers;
    if (!raw) return null;
    
    // 已是标准格式
    if (raw.type && raw.events) return raw;
    
    // 格式A: { type: "event", patterns: [...] }
    if (raw.type === 'event' && raw.patterns) {
      return { type: 'event', events: raw.patterns.map(p => this.normalizeEventName(p)) };
    }
    
    // 格式B: { events: [...] } (无type)
    if (raw.events && !raw.type) {
      return { type: 'event', events: raw.events.map(e => this.normalizeEventName(e)) };
    }
    
    // 格式C: { type: "event", sources: [...] }
    if (raw.type === 'event' && raw.sources) {
      return { type: 'event', events: raw.sources.map(s => this.normalizeEventName(s)) };
    }
    
    // 格式D: { type: "file_operation", patterns: [...] }
    if (raw.type === 'file_operation') {
      return { type: 'file_watch', file_patterns: raw.patterns || [] };
    }
    
    // 格式E: 字符串condition
    if (raw.condition && typeof raw.condition === 'string') {
      return { type: 'conditional', condition: raw.condition, events: raw.events || [] };
    }
    
    // 无法解析
    console.warn(`[RuntimeBinder] 无法规范化trigger:`, JSON.stringify(raw).slice(0, 100));
    return null;
  }

  /**
   * 事件名标准化：统一为 dot.notation.lowercase
   * "cron:create" → "cron.task.create"
   * "skill_created" → "skill.created"
   * "aeo_evaluation_required" → "aeo.evaluation.required"
   */
  normalizeEventName(name) {
    return name
      .replace(/:/g, '.')
      .replace(/_/g, '.')
      .toLowerCase();
  }

  /**
   * 规范化action
   */
  normalizeAction(rule) {
    const raw = rule.action || rule.actions || rule.execution;
    if (!raw) return null;
    
    // 字符串 → 包装为对象
    if (typeof raw === 'string') {
      return { type: 'dto_task', task_id: raw };
    }
    
    // 已有type
    if (raw.type) return raw;
    
    // 有steps数组 → pipeline
    if (raw.steps) {
      return { type: 'dto_task', task_id: `auto_${rule.id}`, params: raw };
    }
    
    return raw;
  }

  /**
   * 从trigger中提取所有事件类型
   */
  extractEventTypes(trigger) {
    if (trigger.events && trigger.events.length > 0) {
      return trigger.events;
    }
    if (trigger.type === 'file_watch') {
      return ['file.sensitive.modified'];
    }
    if (trigger.type === 'cron') {
      return [`cron.trigger.${trigger.cron || 'default'}`];
    }
    return [];
  }

  /**
   * 检查事件是否在注册表中
   */
  isRegisteredEvent(eventType) {
    if (!this.registry) return true; // 无注册表时不验证
    // 支持通配符匹配
    for (const registered of Object.keys(this.registry.events)) {
      if (eventType === registered) return true;
      if (registered.endsWith('.*')) {
        const prefix = registered.slice(0, -2);
        if (eventType.startsWith(prefix)) return true;
      }
    }
    return false;
  }

  /**
   * 第3步：消费事件并执行
   */
  async processEvents() {
    // 从infrastructure bus获取未消费事件
    const events = bus.consumeUnread(CONSUMER_ID, null, 50);
    
    if (events.length === 0) {
      return { processed: 0 };
    }
    
    console.log(`[RuntimeBinder] 待处理事件: ${events.length}`);
    
    let processed = 0;
    let failed = 0;
    
    for (const event of events) {
      const handlers = this.bindings.get(event.type) || [];
      
      if (handlers.length === 0) {
        // 没有绑定的handler，跳过
        continue;
      }
      
      for (const handler of handlers) {
        try {
          // 检查condition
          if (handler.trigger.condition) {
            const conditionMet = this.evaluateCondition(handler.trigger.condition, event.payload);
            if (!conditionMet) continue;
          }
          
          // 检查governance
          if (handler.governance.councilRequired) {
            // 需要council审批，发起审批流程
            bus.emit('dto.task.pending_approval', {
              rule_id: handler.ruleId,
              event_id: event.id,
              reason: 'council_required'
            });
            continue;
          }
          
          // 执行action
          const result = await this.taskExecutor.execute(handler.action, {
            event,
            rule: handler,
            timestamp: Date.now()
          });
          
          // 发布执行结果
          bus.emit('dto.task.completed', {
            task_id: handler.action.task_id || handler.ruleId,
            rule_id: handler.ruleId,
            event_id: event.id,
            status: 'success',
            result,
            duration_ms: Date.now() - event.timestamp
          });
          
          processed++;
          this.stats.executed++;
        } catch (err) {
          failed++;
          this.stats.failed++;
          
          bus.emit('dto.task.failed', {
            task_id: handler.action.task_id || handler.ruleId,
            rule_id: handler.ruleId,
            event_id: event.id,
            error: err.message,
            stack: err.stack?.split('\n').slice(0, 3).join('\n')
          });
          
          // 根据on_failure策略处理
          if (handler.action.on_failure === 'retry') {
            // 重新入队
            bus.emit(event.type, { ...event.payload, _retry: (event.payload._retry || 0) + 1 });
          }
        }
      }
    }
    
    return { processed, failed, total: events.length };
  }

  /**
   * 安全的条件表达式求值
   */
  evaluateCondition(condition, payload) {
    try {
      // 使用Function构造器，限制只能访问payload
      const fn = new Function('payload', `return Boolean(${condition})`);
      return fn(payload || {});
    } catch {
      return true; // 条件解析失败时默认通过
    }
  }

  /**
   * 完整执行流程（入口方法）
   */
  async run() {
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`[RuntimeBinder] 开始处理 @ ${new Date().toISOString()}`);
    
    // Step 1: 加载事件注册表
    this.loadEventRegistry();
    
    // Step 2: 建立运行时绑定
    this.loadBindings();
    
    // Step 3: 消费并执行
    const result = await this.processEvents();
    
    console.log(`[RuntimeBinder] 完成: ${JSON.stringify(result)}`);
    console.log(`[RuntimeBinder] 累计: ${JSON.stringify(this.stats)}`);
    console.log(`${'─'.repeat(50)}\n`);
    
    return result;
  }
}

module.exports = RuntimeBinder;
```

### 4.5 DTO侧：Task Executor（任务执行器改造）

**改造文件**: `skills/dto-core/core/task-executor.js`

```javascript
/**
 * DTO Task Executor v2.0
 * 
 * 统一任务执行入口。接收RuntimeBinder分派的action，
 * 根据action.type选择执行策略。
 */

class TaskExecutor {
  constructor(engines, resourceScheduler) {
    this.engines = engines;           // Map<string, Engine>
    this.resourceScheduler = resourceScheduler;
    this.taskRegistry = new Map();    // 预加载的task定义
  }

  /**
   * 加载tasks/*.yaml 定义
   */
  loadTaskDefinitions(tasksDir) {
    // 扫描yaml/json任务定义文件
    // 解析为内部task对象
    // 注册到taskRegistry
  }

  /**
   * 执行action
   */
  async execute(action, context) {
    switch (action.type) {
      case 'dto_task':
        return this.executeTask(action.task_id, context);
      
      case 'enforce':
        return this.executeEnforce(action, context);
      
      case 'block_and_notify':
        return this.executeBlockAndNotify(action, context);
      
      case 'pipeline_trigger':
        return this.executePipeline(action.pipeline, context);
      
      case 'auto_fix':
        return this.executeAutoFix(action, context);
      
      case 'validate':
        return this.executeValidation(action, context);
      
      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  async executeTask(taskId, context) {
    const taskDef = this.taskRegistry.get(taskId);
    if (!taskDef) {
      throw new Error(`Task not found: ${taskId}`);
    }
    
    // 选择引擎
    const engineName = taskDef.executionMode || 'linear';
    const engine = this.engines.get(engineName);
    
    return engine.execute(taskDef, context);
  }

  async executeEnforce(action, context) {
    // 校验payload中的必填字段
    const payload = context.event?.payload || {};
    const field = action.params?.required_field;
    
    if (field && !payload[field]) {
      return {
        status: 'rejected',
        reason: `Missing required field: ${field}`,
        default_applied: action.params?.default_value || null
      };
    }
    
    return { status: 'passed' };
  }

  async executeBlockAndNotify(action, context) {
    // 发送通知并阻断
    return {
      status: 'blocked',
      message: action.params?.message || '操作已被阻断',
      require_approval: true
    };
  }

  async executePipeline(pipelineId, context) {
    const taskDef = this.taskRegistry.get(pipelineId);
    if (!taskDef) {
      throw new Error(`Pipeline not found: ${pipelineId}`);
    }
    
    const dagEngine = this.engines.get('dag');
    return dagEngine.execute(taskDef, context);
  }

  async executeAutoFix(action, context) {
    // 自动修复逻辑
    return { status: 'fix_attempted', details: action.params };
  }

  async executeValidation(action, context) {
    // 校验逻辑
    return { status: 'validated' };
  }
}

module.exports = TaskExecutor;
```

### 4.6 消除.dto-signals目录（合并到统一bus）

**改造**: `skills/dto-core/core/event-consumer.js`

当前event-consumer监视`.dto-signals/`目录中的JSON文件。这是第三条事件通道，必须消除。

**方案**：event-consumer不再监视文件系统，改为从infrastructure bus消费事件。它变成RuntimeBinder的一个子组件，不再独立运行。

```javascript
// event-consumer.js 改造后
// 不再是独立进程，而是被RuntimeBinder内部使用
// 职责缩窄为：解析事件payload + 调用SEEF evaluator

class EventConsumer {
  constructor(runtimeBinder) {
    this.binder = runtimeBinder;
  }
  
  // 不再有start()方法
  // 不再有文件监视
  // 由RuntimeBinder在processEvents中按需调用
}
```

### 4.7 ISC event-bridge.js 增强

现有的event-bridge.js已经能检测规则变更并发布事件。需要增强两点：

```javascript
// 增强1：发布事件到infrastructure bus（不是DTO内存bus）
const bus = require('../../infrastructure/event-bus/bus.js');

// 增强2：支持更多事件源（不仅是规则文件变更）
function publishChanges() {
  const changes = detectChanges();
  
  for (const change of changes) {
    // 使用统一bus发布
    bus.emit(`isc.rule.${change.type}`, {
      source: 'isc-core',
      payload: {
        rule_id: change.rule_id,
        action: change.type,
        file: change.file,
        detected_at: Date.now()
      }
    });
  }
}

// 增强3：验证事件类型是否在注册表中
function validateEventType(eventType) {
  const registry = loadEventRegistry();
  if (registry && !registry.events[eventType]) {
    console.warn(`[ISC-Bridge] 未注册的事件类型: ${eventType}`);
  }
}
```

---

## 第五部分：运行模型

### 5.1 进程模型

**不新增常驻进程**。所有运行通过OpenClaw cron触发。

```
┌─────────────────────────────────────────┐
│  OpenClaw Cron (每5分钟)                 │
│                                         │
│  Job 1: ISC event-bridge               │
│    → 检测规则变更 → 发布事件到bus         │
│                                         │
│  Job 2: DTO runtime-binder             │
│    → 消费bus事件 → 匹配规则 → 执行任务    │
│                                         │
│  Job 3: DTO global-auto-decision       │
│    → Git变更检测 → 版本管理              │
│                                         │
│  (Job 1和Job 2可以合并为一次调用)         │
└─────────────────────────────────────────┘
```

**入口脚本**: `skills/dto-core/bin/run-cycle.js`

```javascript
#!/usr/bin/env node
/**
 * DTO运行周期 - 由cron每5分钟触发
 * 串行执行：event-bridge → runtime-binder → cleanup
 */

async function runCycle() {
  const startTime = Date.now();
  
  // Step 1: ISC事件桥接（检测规则变更）
  const bridge = require('../../isc-core/event-bridge.js');
  const bridgeResult = bridge.publishChanges();
  
  // Step 2: DTO运行时绑定（消费事件，执行任务）
  const RuntimeBinder = require('../core/runtime-binder.js');
  const TaskExecutor = require('../core/task-executor.js');
  
  const executor = new TaskExecutor(/* engines */);
  const binder = new RuntimeBinder(executor);
  const binderResult = await binder.run();
  
  // Step 3: 写入心跳
  const heartbeat = {
    last_run: new Date().toISOString(),
    duration_ms: Date.now() - startTime,
    bridge: bridgeResult,
    binder: binderResult
  };
  
  fs.writeFileSync(
    path.join(__dirname, '../.last-cycle.json'),
    JSON.stringify(heartbeat, null, 2)
  );
  
  return heartbeat;
}

runCycle().then(r => {
  console.log(`[DTO Cycle] 完成:`, JSON.stringify(r));
  process.exit(0);
}).catch(err => {
  console.error(`[DTO Cycle] 失败:`, err);
  process.exit(1);
});
```

### 5.2 事件消费的幂等性保证

```
events.jsonl 中每条事件有唯一 id (evt_xxx)
cursor.json 记录每个consumer的消费位置

{
  "dispatcher": { "offset": 142, "last_consumed": "2026-03-04T10:00:00Z" },
  "dto-runtime-binder": { "offset": 142, "last_consumed": "2026-03-04T10:00:00Z" },
  "memory-archiver": { "offset": 140, "last_consumed": "2026-03-04T09:55:00Z" }
}

→ 每个consumer独立追踪消费进度
→ 重复运行不会重复消费
→ consumer挂掉后从断点恢复
```

### 5.3 事件流完整示例

**场景：新增一条ISC规则**

```
T+0s   用户创建新规则文件 rules/rule.new-feature-001.json
         ↓
T+5min  Cron触发 → ISC event-bridge.js 检测到新文件
         ↓
         bus.emit('isc.rule.created', { rule_id: 'rule.new-feature-001' })
         → 写入 events.jsonl
         ↓
T+5min  同一Cron周期 → DTO runtime-binder 消费事件
         ↓
         匹配到绑定: isc.rule.created → dto-sync handler
         ↓
         TaskExecutor 执行:
           1. 读取新规则的trigger/action
           2. 创建对应的subscription文件
           3. 在当前bindings中注册
         ↓
         bus.emit('dto.task.completed', { task_id: 'dto-sync', ... })
         ↓
T+10min 下一周期 → SEEF消费dto.task.completed事件
         → 评测新规则的质量
```

**场景：敏感配置文件被修改**

```
T+0s   某进程尝试修改 /root/.openclaw/openclaw.json
         ↓
T+5min  ISC event-bridge检测文件变更
         → bus.emit('file.sensitive.modified', { file_path: '...', operation: 'modify' })
         ↓
T+5min  DTO runtime-binder消费事件
         → 匹配规则 gateway-config-protection-N033
         → action.type = 'block_and_notify'
         → TaskExecutor.executeBlockAndNotify()
           → 发送飞书通知给用户
           → 创建backup
           → 等待用户确认
```

---

## 第六部分：迁移计划

### 6.1 阶段一：基础设施统一（1-2天）

| 任务 | 描述 | 风险 |
|------|------|------|
| T1.1 | infrastructure/event-bus/bus.js 添加 `consumeUnread()` 方法 | 低 |
| T1.2 | 创建 `isc-core/config/event-registry.json` | 低 |
| T1.3 | 创建 `isc-core/schemas/rule-trigger-action.schema.json` | 低 |
| T1.4 | DTO event-bus.js 改为proxy模式 | 中 - 需要测试现有consumer |

### 6.2 阶段二：Runtime Binder（2-3天）

| 任务 | 描述 | 风险 |
|------|------|------|
| T2.1 | 实现 `dto-core/core/runtime-binder.js` | 中 |
| T2.2 | 实现 trigger normalization（处理4种历史格式） | 中 |
| T2.3 | 实现 action normalization | 低 |
| T2.4 | 实现 `dto-core/core/task-executor.js` v2 | 中 |
| T2.5 | 集成测试：ISC规则变更→事件→DTO任务执行 | 高 |

### 6.3 阶段三：规则标准化迁移（3-5天）

| 任务 | 描述 | 风险 |
|------|------|------|
| T3.1 | 编写规则迁移脚本 normalize-rules.js | 低 |
| T3.2 | 迁移35条COMPLETE规则的trigger/action格式 | 中 |
| T3.3 | 补全11条TRIGGER_ONLY规则的action | 中 |
| T3.4 | 评估31条SKELETON规则：保留/删除/补全 | 低 |
| T3.5 | 验证迁移后所有规则通过schema校验 | 中 |

### 6.4 阶段四：旧通道清理（1天）

| 任务 | 描述 | 风险 |
|------|------|------|
| T4.1 | 废弃 `.dto-signals/` 目录机制 | 低 |
| T4.2 | 废弃 DTO 内存EventBus的直接使用 | 低 |
| T4.3 | 更新 dispatcher.js 使用新的消费机制 | 中 |
| T4.4 | 更新 cron job 配置 | 低 |

### 6.5 验收标准

```
[ ] ISC规则变更后5分钟内被DTO感知并处理
[ ] 35条COMPLETE规则全部通过schema校验
[ ] runtime-binder能正确解析4种历史trigger格式
[ ] 统一event-bus，不存在第二条事件通道
[ ] 事件消费幂等，重复运行不重复执行
[ ] 执行结果回写到event-bus，可被下游消费
[ ] 敏感配置修改规则能正确阻断并通知
[ ] .last-cycle.json 记录每次运行状态
```

---

## 第七部分：文件清单

### 新建文件

| 文件 | 归属 | 职责 |
|------|------|------|
| `isc-core/config/event-registry.json` | ISC | 事件类型注册表 |
| `isc-core/schemas/rule-trigger-action.schema.json` | ISC | 规则trigger/action标准schema |
| `dto-core/core/runtime-binder.js` | DTO | 运行时绑定引擎 |
| `dto-core/core/task-executor.js` | DTO | 统一任务执行器 |
| `dto-core/bin/run-cycle.js` | DTO | cron入口脚本 |

### 改造文件

| 文件 | 改造内容 |
|------|---------|
| `infrastructure/event-bus/bus.js` | 添加 `consumeUnread()`, `query()` |
| `dto-core/core/event-bus.js` | 改为infrastructure bus的proxy |
| `isc-core/event-bridge.js` | 使用infrastructure bus, 事件类型验证 |
| `dto-core/core/event-consumer.js` | 废弃独立运行，合并到RuntimeBinder |

### 不动文件

| 文件 | 原因 |
|------|------|
| `dto-core/engines/*.js` | 三个执行引擎不变，被TaskExecutor调用 |
| `dto-core/tasks/*.yaml` | 任务定义格式不变 |
| `dto-core/subscriptions/*.json` | 保留作为元数据，RuntimeBinder读取 |
| `infrastructure/dispatcher/routes.json` | 保留，dispatcher作为备用消费者 |
| `isc-core/rules/*.json` | 渐进迁移，不一次全改 |

---

## 第八部分：风险与应对

| 风险 | 概率 | 影响 | 应对 |
|------|------|------|------|
| trigger normalization遗漏某种格式 | 中 | 中 | 兜底：normalization失败的规则记入skipped，不阻断 |
| 统一bus后性能不足 | 低 | 高 | JSONL已有rotation机制（10MB），加游标后读取量可控 |
| 规则迁移引入bug | 中 | 中 | 迁移脚本生成diff，人工review后批量apply |
| cron 5分钟间隔不够实时 | 低 | 低 | 当前场景不需要实时。未来可改为fswatch触发 |
| event-bridge和runtime-binder同时操作events.jsonl | 中 | 高 | 已有文件锁（bus.js的acquireLock），串行安全 |

---

## 附录A：77条ISC规则完整分类

### A.1 按domain分布

```
quality:      15条 (技能质量、文档质量、代码质量)
automation:   18条 (自动向量化、自动同步、自动修复)
security:      8条 (配置保护、安全扫描、权限分级)
naming:        7条 (命名规范、格式标准)
process:       6条 (创建闸门、标准格式、使用协议)
decision:      8条 (自主决策、council审批)
interaction:   4条 (消息保障、文件传输)
vectorization: 8条 (向量化生命周期管理)
other:         3条 (cron模型、时间粒度、记忆恢复)
```

### A.2 按可执行性分布

```
可立即绑定到DTO:  35条 (COMPLETE，有trigger+action)
需补全action:      11条 (TRIGGER_ONLY)
需全面补全:         31条 (SKELETON)
```

### A.3 高优先级绑定清单（Phase 1重点）

以下规则应在Phase 2首批绑定：

1. `gateway-config-protection-N033` — 安全红线，必须运行时阻断
2. `rule.cron-task-model-requirement-001` — cron任务模型校验
3. `rule.auto-vectorization-trigger-001` — 自动向量化
4. `rule.skill.evolution.auto-trigger` — 技能进化触发
5. `rule.auto-fix-high-severity-001` — 高严重度自动修复
6. `skill-security-gate-030` — 技能安全准出
7. `evomap-mandatory-security-scan-032` — EvoMap安全扫描
8. `rule.isc-skill-index-auto-update-001` — 技能索引自动更新

---

## 附录B：与现有DTO v3.0的兼容性

DTO v3.0设计了三层抽象：TaskRegistry, TriggerRegistry, ExecutionEngines。

本方案**不替换这三层**，而是在它们之上增加RuntimeBinder作为ISC→DTO的桥接层：

```
ISC Rules  →  RuntimeBinder  →  TaskExecutor  →  DAG/Linear/Adaptive Engine
                    ↑                ↑
              event-bus          taskRegistry
              (统一)             (保持现有)
```

RuntimeBinder是DTO的一个**core组件**，不是外部系统。它住在`dto-core/core/`目录下，使用DTO的已有基础设施。

---

*文档结束。等待评审。*
