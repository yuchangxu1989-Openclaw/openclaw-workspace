# ISC事件-DTO调度 运行时绑定 详细设计方案

> **版本**: v2.0.0  
> **作者**: 系统架构师  
> **日期**: 2026-03-04  
> **状态**: DRAFT v2 - 全局自主决策架构扩展

---

## TL;DR

现状：ISC有77条规则（仅25条有完整trigger+action，47条SKELETON），DTO有82个订阅JSON但无运行时执行能力，两套事件总线互不通信，dispatcher写文件但不执行。**全链路断裂。**

**v1方案（第1-8部分）**：以DTO为唯一调度引擎，在ISC内建立事件类型注册表（Event Registry），通过运行时绑定层（Runtime Binder）将ISC规则的trigger→事件总线→DTO任务执行串成闭环。不发明新引擎，不增加新概念。

**v2扩展（第9部分）**：基于第一性原理——**系统必须从感知层、认知层到执行层都具备全局自主决策能力**——补充三层六模块的自主决策架构：感知层（事件自动发现+数据源自适应接入）、认知层（规则语义分析+三角对齐对账）、执行层（自适应执行+闭环反馈）。47条SKELETON规则有自动补全机制，ISC-Event-DTO三角有定期对账，执行结果有全链路trace_id追溯。

---

## 第一部分：现状诊断

### 1.1 ISC规则现状（77条）

| 状态 | 数量 | 含义 | 问题 |
|------|------|------|------|
| COMPLETE | 25 | 有trigger+action | trigger/action格式不统一，无标准schema |
| TRIGGER_ONLY | 5 | 有trigger无action | 能感知但无法执行 |
| ACTION_ONLY | 0 | 有action无trigger | — |
| SKELETON | 47 | 无trigger无action | 纯文档，不可执行 |

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
| `lto-core/core/event-bus.js` | DTO内部 | 内存EventEmitter | 进程内有效，不持久化，重启丢失 |
| `lto-core/core/event-consumer.js` | DTO内部 | `.dto-signals/`目录监视 | 第三条路径，与前两者独立 |

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
│ 任务定义       │ 本地任务编排  (tasks/*.yaml)                    │
│ 订阅管理       │ 本地任务编排  (subscriptions/*.json)            │
│ 运行时绑定     │ 本地任务编排  (runtime-binder.js) ← 新建        │
│ 任务调度执行   │ 本地任务编排  (engines/*)                       │
│ 结果反馈       │ 本地任务编排  (事件回写到bus)                    │
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
 │         │            本地任务编排 (调度层)             │             │
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
4. 本地任务编排 runtime-binder 消费事件（从JSONL读取未消费事件）
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
      "consumers": ["lto-core", "seef"]
    },
    "isc.rule.updated": {
      "source": "isc-core",
      "description": "ISC规则被修改",
      "payload_schema": {
        "rule_id": "string",
        "file": "string",
        "changed_fields": "string[]"
      },
      "consumers": ["lto-core", "seef"]
    },
    "isc.rule.deleted": {
      "source": "isc-core",
      "description": "ISC规则被删除",
      "payload_schema": {
        "rule_id": "string"
      },
      "consumers": ["lto-core"]
    },
    
    "skill.created": {
      "source": "lto-core",
      "description": "新技能被创建",
      "payload_schema": {
        "skill_name": "string",
        "path": "string"
      },
      "consumers": ["isc-core", "seef", "cras"]
    },
    "skill.updated": {
      "source": "lto-core",
      "description": "技能被修改",
      "payload_schema": {
        "skill_name": "string",
        "changed_files": "string[]"
      },
      "consumers": ["isc-core", "seef"]
    },
    "skill.deleted": {
      "source": "lto-core",
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
      "source": "lto-core",
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
      "source": "lto-core",
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
      "consumers": ["lto-core", "cras"]
    },
    
    "cras.insight.generated": {
      "source": "cras",
      "description": "CRAS生成洞察",
      "payload_schema": {
        "insight_id": "string",
        "category": "string",
        "impact": "number"
      },
      "consumers": ["isc-core", "lto-core"]
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
- 统一到一个bus后，所有组件（ISC/本地任务编排/SEEF/CRAS）使用同一条通道

**改造方案：**

```javascript
// skills/lto-core/core/event-bus.js  ← 改为代理模式
// 不再自己实现EventEmitter，而是代理到infrastructure bus

const infraBus = require('../../../infrastructure/event-bus/bus.js');

class DTOEventBusProxy {
  /**
   * 发布事件 → 写入infrastructure JSONL
   */
  publish(eventType, payload) {
    return infraBus.emit(eventType, {
      source: 'lto-core',
      payload,
      timestamp: Date.now()
    });
  }

  /**
   * 消费事件 → 从infrastructure JSONL读取（带游标）
   */
  consume(eventType, handler, consumerId = 'lto-core') {
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

**新文件**: `skills/lto-core/core/runtime-binder.js`

这是整个方案的核心：运行时绑定ISC规则→事件→DTO任务。

```javascript
/**
 * 本地任务编排 Runtime Binder v1.0
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

**改造文件**: `skills/lto-core/core/task-executor.js`

```javascript
/**
 * 本地任务编排 Task Executor v2.0
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

**改造**: `skills/lto-core/core/event-consumer.js`

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
│  Job 2: 本地任务编排 runtime-binder             │
│    → 消费bus事件 → 匹配规则 → 执行任务    │
│                                         │
│  Job 3: 本地任务编排 global-auto-decision       │
│    → Git变更检测 → 版本管理              │
│                                         │
│  (Job 1和Job 2可以合并为一次调用)         │
└─────────────────────────────────────────┘
```

**入口脚本**: `skills/lto-core/bin/run-cycle.js`

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
  console.log(`[本地任务编排 Cycle] 完成:`, JSON.stringify(r));
  process.exit(0);
}).catch(err => {
  console.error(`[本地任务编排 Cycle] 失败:`, err);
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
T+5min  同一Cron周期 → 本地任务编排 runtime-binder 消费事件
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
T+5min  本地任务编排 runtime-binder消费事件
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
| T1.4 | 本地任务编排 event-bus.js 改为proxy模式 | 中 - 需要测试现有consumer |

### 6.2 阶段二：Runtime Binder（2-3天）

| 任务 | 描述 | 风险 |
|------|------|------|
| T2.1 | 实现 `lto-core/core/runtime-binder.js` | 中 |
| T2.2 | 实现 trigger normalization（处理4种历史格式） | 中 |
| T2.3 | 实现 action normalization | 低 |
| T2.4 | 实现 `lto-core/core/task-executor.js` v2 | 中 |
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
| T4.2 | 废弃 本地任务编排 内存EventBus的直接使用 | 低 |
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
| `lto-core/core/runtime-binder.js` | 本地任务编排 | 运行时绑定引擎 |
| `lto-core/core/task-executor.js` | 本地任务编排 | 统一任务执行器 |
| `lto-core/bin/run-cycle.js` | 本地任务编排 | cron入口脚本 |

### 改造文件

| 文件 | 改造内容 |
|------|---------|
| `infrastructure/event-bus/bus.js` | 添加 `consumeUnread()`, `query()` |
| `lto-core/core/event-bus.js` | 改为infrastructure bus的proxy |
| `isc-core/event-bridge.js` | 使用infrastructure bus, 事件类型验证 |
| `lto-core/core/event-consumer.js` | 废弃独立运行，合并到RuntimeBinder |

### 不动文件

| 文件 | 原因 |
|------|------|
| `lto-core/engines/*.js` | 三个执行引擎不变，被TaskExecutor调用 |
| `lto-core/tasks/*.yaml` | 任务定义格式不变 |
| `lto-core/subscriptions/*.json` | 保留作为元数据，RuntimeBinder读取 |
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

本地任务编排 v3.0设计了三层抽象：TaskRegistry, TriggerRegistry, ExecutionEngines。

本方案**不替换这三层**，而是在它们之上增加RuntimeBinder作为ISC→DTO的桥接层：

```
ISC Rules  →  RuntimeBinder  →  TaskExecutor  →  DAG/Linear/Adaptive Engine
                    ↑                ↑
              event-bus          taskRegistry
              (统一)             (保持现有)
```

RuntimeBinder是DTO的一个**core组件**，不是外部系统。它住在`lto-core/core/`目录下，使用DTO的已有基础设施。

---

---

# 第九部分：全局自主决策架构

> **第一性原理：系统必须从感知层、认知层到执行层都具备全局自主决策能力。**
> 
> 不依赖人工识别缺口、不依赖人工触发修复、不依赖人工对账。
> 系统自己发现问题、自己理解问题、自己解决问题、自己验证结果。

## 9.1 架构全景

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      全局自主决策架构 (3层6模块)                           │
│                                                                         │
│  ┌─── 感知层 (Perception) ───────────────────────────────────────────┐  │
│  │                                                                    │  │
│  │  [P1] 事件自动发现器        [P2] 数据源自适应接入                     │  │
│  │   - 规则语义→事件需求          - 新cron/skill/config自动感知           │  │
│  │   - 缺失事件自动创建           - 外部信号(飞书/Git/API)自动桥接         │  │
│  │   - 事件注册表自维护           - 死信号自动清理                        │  │
│  │                                                                    │  │
│  └────────────────────────────────┬───────────────────────────────────┘  │
│                                   ▼                                      │
│  ┌─── 认知层 (Cognition) ────────────────────────────────────────────┐  │
│  │                                                                    │  │
│  │  [C1] 规则语义分析引擎       [C2] 对齐对账引擎                       │  │
│  │   - SKELETON→trigger/action    - ISC↔Event↔DTO三角对齐              │  │
│  │   - 意图推断+草案生成           - 覆盖率/活跃度/成功率                 │  │
│  │   - 冲突检测+优先级仲裁         - 异常模式识别                        │  │
│  │                                                                    │  │
│  └────────────────────────────────┬───────────────────────────────────┘  │
│                                   ▼                                      │
│  ┌─── 执行层 (Execution) ────────────────────────────────────────────┐  │
│  │                                                                    │  │
│  │  [E1] 自适应执行引擎         [E2] 闭环反馈引擎                       │  │
│  │   - DTO调度+失败重试            - 结果→ISC规则状态回写                │  │
│  │   - 自动修复(代码级)            - 规则自进化(成功率→调参)              │  │
│  │   - 级联触发(A完成→B启动)       - 全链路可观测(trace_id)             │  │
│  │                                                                    │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 9.2 感知层 (Perception) — 系统如何自动发现需要关注的事件？

### P1: 事件自动发现器 (Event Auto-Discovery)

**现状缺口**：
- 47条SKELETON规则无trigger，系统对它们完全无感知
- 新创建的规则如果引用了不存在的事件类型，无人知道
- 事件注册表是静态JSON，没有自维护能力

**设计方案**：

#### P1.1 规则创建时自动分析trigger需求

**落地文件**: `skills/isc-core/services/rule-event-analyzer.js` (新建)

```javascript
/**
 * 规则→事件需求自动分析器
 * 
 * 工作流程：
 * 1. 接收新创建/修改的ISC规则
 * 2. 分析规则的name/description/domain语义
 * 3. 推断该规则应该由什么事件触发
 * 4. 检查event-registry是否存在对应事件
 * 5. 不存在 → 自动创建事件定义（草案状态）
 * 6. 生成trigger草案写入规则文件
 */

class RuleEventAnalyzer {
  constructor(eventRegistry) {
    this.registry = eventRegistry;
    // 语义→事件类型映射表（可通过学习扩展）
    this.semanticMap = {
      // domain映射
      'quality': ['skill.created', 'skill.updated', 'skill.md.quality.low'],
      'security': ['file.sensitive.modified', 'skill.publish', 'evomap.skill.upload'],
      'automation': ['skill.created', 'cron.task.create', 'pipeline.error'],
      'naming': ['skill.created', 'skill.renamed', 'skill.moved'],
      'process': ['skill.created', 'isc.rule.created'],
      'decision': ['complex.task.detected', 'system.architecture.changed'],
      'vectorization': ['skill.created', 'skill.updated', 'skill.code.major.update'],
      'interaction': ['user.message.received', 'user.feedback.collected'],
      
      // 关键词映射
      'auto-fix': ['execution.failed', 'health.check.failed'],
      'monitor': ['system.health.*', 'cron.task.*'],
      'gate': ['skill.publish', 'skill.created'],
      'validation': ['skill.created', 'skill.updated'],
      'evolution': ['seef.skill.evaluated', 'skill.iterated'],
    };
  }

  /**
   * 分析一条规则，推断其事件需求
   */
  analyzeRule(rule) {
    const hints = [];
    
    // 从domain推断
    const domain = rule.domain || rule.category || '';
    if (this.semanticMap[domain]) {
      hints.push(...this.semanticMap[domain].map(e => ({ event: e, source: 'domain', confidence: 0.7 })));
    }
    
    // 从name/description关键词推断
    const text = `${rule.name || ''} ${rule.description || ''} ${rule.rule_name || ''}`.toLowerCase();
    for (const [keyword, events] of Object.entries(this.semanticMap)) {
      if (text.includes(keyword.replace('-', ' ')) || text.includes(keyword)) {
        hints.push(...events.map(e => ({ event: e, source: 'keyword', confidence: 0.5 })));
      }
    }
    
    // 从action推断反向事件
    const action = rule.action || rule.actions || {};
    if (typeof action === 'object' && action.type) {
      const actionEventMap = {
        'enforce': ['*.created', '*.updated'],
        'validate': ['*.created', '*.publish'],
        'auto_fix': ['*.failed', 'execution.failed'],
        'pipeline_trigger': ['skill.updated', 'skill.created'],
        'block_and_notify': ['file.sensitive.modified', 'security.*'],
      };
      if (actionEventMap[action.type]) {
        hints.push(...actionEventMap[action.type].map(e => ({ event: e, source: 'action_type', confidence: 0.4 })));
      }
    }
    
    // 去重+按confidence排序
    const deduped = this.deduplicateHints(hints);
    return deduped.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * 批量分析所有SKELETON规则，生成trigger草案
   * 输出: { rule_id, suggested_trigger, confidence, needs_review }
   */
  async analyzeAllSkeletons(rulesDir) {
    const results = [];
    const files = fs.readdirSync(rulesDir).filter(f => f.endsWith('.json'));
    
    for (const file of files) {
      const rule = JSON.parse(fs.readFileSync(path.join(rulesDir, file), 'utf8'));
      if (rule.trigger || rule.triggers) continue; // 已有trigger，跳过
      
      const hints = this.analyzeRule(rule);
      if (hints.length === 0) continue;
      
      const topHint = hints[0];
      results.push({
        rule_id: rule.id || file.replace('.json', ''),
        file,
        suggested_trigger: {
          type: 'event',
          events: hints.slice(0, 3).map(h => h.event),
        },
        confidence: topHint.confidence,
        needs_review: topHint.confidence < 0.6,
        reasoning: hints.slice(0, 3).map(h => `${h.event} (${h.source}, ${(h.confidence*100).toFixed(0)}%)`)
      });
    }
    
    return results;
  }

  /**
   * 检查并自动创建缺失的事件类型
   */
  ensureEventsExist(eventNames) {
    const created = [];
    for (const name of eventNames) {
      if (name.includes('*')) continue; // 通配符不注册
      if (!this.registry.events[name]) {
        // 自动创建事件定义（草案状态）
        this.registry.events[name] = {
          source: 'auto-discovered',
          description: `自动发现的事件类型（待人工确认）`,
          payload_schema: {},
          consumers: [],
          status: 'draft',  // draft状态，需人工确认
          created_at: new Date().toISOString(),
          created_by: 'rule-event-analyzer'
        };
        created.push(name);
      }
    }
    
    if (created.length > 0) {
      // 写回注册表
      this.saveRegistry();
      console.log(`[EventAnalyzer] 自动创建 ${created.length} 个事件类型: ${created.join(', ')}`);
    }
    
    return created;
  }
}
```

#### P1.2 事件注册表自维护

**落地文件**: `skills/isc-core/services/event-registry-maintainer.js` (新建)

功能：
- 定期扫描所有规则的trigger字段，提取引用的事件类型
- 与event-registry.json对比，发现注册表中没有的事件→自动添加(draft状态)
- 发现注册表中有但没有任何规则引用的事件→标记为orphan
- 发现注册表中有但event-bus从没收到过的事件→标记为dormant
- 输出维护报告

```javascript
class EventRegistryMaintainer {
  /**
   * 全量扫描对账
   */
  async reconcile() {
    const report = {
      timestamp: new Date().toISOString(),
      registered_events: 0,
      referenced_events: 0,
      missing_in_registry: [],    // 规则引用了但注册表没有
      orphan_in_registry: [],     // 注册表有但没规则引用
      dormant_events: [],         // 注册表有但从没触发过
      auto_created: [],           // 本次自动创建的
    };
    
    // 1. 收集所有规则引用的事件
    const referencedEvents = this.collectReferencedEvents();
    
    // 2. 收集注册表中的所有事件
    const registeredEvents = Object.keys(this.registry.events);
    
    // 3. 收集event-bus中实际出现过的事件类型
    const actualEvents = this.collectActualEventTypes();
    
    // 4. 对比
    report.missing_in_registry = referencedEvents.filter(e => !registeredEvents.includes(e));
    report.orphan_in_registry = registeredEvents.filter(e => !referencedEvents.includes(e));
    report.dormant_events = registeredEvents.filter(e => !actualEvents.includes(e));
    
    // 5. 自动修复：创建缺失事件
    for (const missing of report.missing_in_registry) {
      this.registry.events[missing] = {
        source: 'auto-reconciled',
        description: `对账自动发现（来自规则引用）`,
        status: 'draft',
        created_at: new Date().toISOString()
      };
      report.auto_created.push(missing);
    }
    
    if (report.auto_created.length > 0) this.saveRegistry();
    
    return report;
  }
}
```

#### P1.3 举一反三：其他缺失的感知能力

| # | 缺失感知 | 当前状态 | 自主方案 | 落地位置 |
|---|---------|---------|---------|---------|
| P1.a | **Cron任务生命周期感知** | cron增删改无事件发出 | 在event-bridge中增加cron.json监视 | `isc-core/event-bridge.js` 增强 |
| P1.b | **技能目录结构变更感知** | global-auto-decision只管Git | 新增skill-dir-watcher：新skill目录→自动发布`skill.created` | `isc-core/services/skill-dir-watcher.js` 新建 |
| P1.c | **外部API健康感知** | 只在失败时才知道key过期 | 定期probe OpenAI/智谱/飞书 API，不可用时发布`api.health.degraded` | `infrastructure/health-probes/api-health.js` 新建 |
| P1.d | **用户行为模式感知** | 无 | 分析session历史：高频使用的功能、从未使用的技能→生成`user.pattern.detected` | `cras/services/user-behavior-probe.js` 新建 |
| P1.e | **Git仓库级感知** | global-auto-decision做了但仅限版本bump | 增强：识别breaking change vs patch，自动判断影响范围 | `lto-core/core/global-auto-decision-pipeline.js` 增强 |
| P1.f | **依赖关系变更感知** | 无 | 监视package.json/node_modules变更→发布`dependency.changed` | `isc-core/event-bridge.js` 增强 |

### P2: 数据源自适应接入 (Adaptive Data Source Integration)

**现状缺口**：
- event-bridge.js只监视ISC rules目录
- cron任务变更无感知通道
- 飞书消息、Git webhook等外部信号无统一接入口
- 新增数据源需要手动写代码

**设计方案**：

**落地文件**: `skills/isc-core/services/adaptive-source-manager.js` (新建)

```javascript
/**
 * 自适应数据源管理器
 * 
 * 可插拔的数据源注册机制。每个source是一个 {name, detect(), emit()} 对。
 * 新数据源只需实现这个接口并注册，无需改动核心代码。
 */

class AdaptiveSourceManager {
  constructor(bus) {
    this.bus = bus;
    this.sources = new Map();
    this.sourceStats = new Map(); // 每个source的运行统计
  }

  /**
   * 注册数据源
   */
  register(source) {
    this.sources.set(source.name, source);
    this.sourceStats.set(source.name, { runs: 0, events_emitted: 0, last_run: null, errors: 0 });
  }

  /**
   * 运行所有数据源的检测
   */
  async runAll() {
    const results = [];
    for (const [name, source] of this.sources) {
      try {
        const events = await source.detect();
        for (const event of events) {
          this.bus.emit(event.type, event.payload);
        }
        const stats = this.sourceStats.get(name);
        stats.runs++;
        stats.events_emitted += events.length;
        stats.last_run = new Date().toISOString();
        results.push({ source: name, events: events.length });
      } catch (err) {
        const stats = this.sourceStats.get(name);
        stats.errors++;
        results.push({ source: name, error: err.message });
      }
    }
    return results;
  }
}

// 内置数据源
const builtinSources = [
  {
    name: 'isc-rules',
    detect: () => { /* 现有event-bridge逻辑 */ },
  },
  {
    name: 'cron-jobs',
    detect: () => {
      // 监视 /root/.openclaw/cron/jobs.json 变更
      // 与快照对比 → 发布 cron.task.create/update/delete
    },
  },
  {
    name: 'skill-directories',
    detect: () => {
      // 扫描 skills/ 目录下的新增/删除
      // 与快照对比 → 发布 skill.created/deleted
    },
  },
  {
    name: 'config-files',
    detect: () => {
      // 监视 openclaw.json, gateway配置等
      // 变更 → 发布 file.sensitive.modified
    },
  },
  {
    name: 'api-health',
    detect: () => {
      // Probe API endpoints
      // 不健康 → 发布 api.health.degraded
    },
  },
];
```

**关键设计决策**：数据源注册是声明式的。新增数据源=新增一个对象并register，不改核心代码。这就是"自适应接入"的含义。

---

## 9.3 认知层 (Cognition) — 系统如何自动理解和决策？

### C1: 规则语义分析引擎 (Rule Semantic Analyzer)

**现状缺口**：
- 47条SKELETON规则是死代码，没有任何自动补全机制
- 规则之间的冲突（两条规则对同一事件做相反操作）没有检测
- 规则优先级仅靠governance.priority字段，没有智能仲裁

**设计方案**：

#### C1.1 SKELETON规则自动补全

**落地文件**: `skills/isc-core/services/skeleton-completer.js` (新建)

```javascript
/**
 * SKELETON规则自动补全器
 * 
 * 分析规则的语义内容（name, description, domain, governance），
 * 自动生成trigger和action草案。
 * 
 * 策略分级：
 * - confidence >= 0.8: 自动应用（写入规则文件）
 * - 0.5 <= confidence < 0.8: 生成草案，标记needs_review
 * - confidence < 0.5: 仅记录，不生成
 */

class SkeletonCompleter {
  constructor(ruleEventAnalyzer, actionTemplates) {
    this.analyzer = ruleEventAnalyzer;
    this.actionTemplates = actionTemplates;
  }

  /**
   * action模板库 — 按domain预设常见action模式
   */
  static ACTION_TEMPLATES = {
    'quality': {
      type: 'validate',
      params: { check_type: 'quality_score', threshold: 60 },
      on_failure: 'warn'
    },
    'security': {
      type: 'block_and_notify',
      params: { notify_channel: 'feishu', severity: 'critical' },
      on_failure: 'reject'
    },
    'automation': {
      type: 'dto_task',
      params: { mode: 'auto' },
      on_failure: 'retry'
    },
    'naming': {
      type: 'enforce',
      params: { check_type: 'naming_convention' },
      on_failure: 'warn'
    },
    'process': {
      type: 'enforce',
      params: { check_type: 'process_gate' },
      on_failure: 'reject'
    },
  };

  /**
   * 补全一条SKELETON规则
   */
  completeRule(rule) {
    // 1. 生成trigger草案
    const triggerHints = this.analyzer.analyzeRule(rule);
    const suggestedTrigger = triggerHints.length > 0
      ? { type: 'event', events: triggerHints.slice(0, 3).map(h => h.event) }
      : null;
    
    // 2. 生成action草案
    const domain = rule.domain || rule.category || 'automation';
    const suggestedAction = SkeletonCompleter.ACTION_TEMPLATES[domain] 
      || SkeletonCompleter.ACTION_TEMPLATES['automation'];
    
    // 3. 计算置信度
    const triggerConfidence = triggerHints.length > 0 ? triggerHints[0].confidence : 0;
    const actionConfidence = SkeletonCompleter.ACTION_TEMPLATES[domain] ? 0.7 : 0.3;
    const overallConfidence = (triggerConfidence + actionConfidence) / 2;
    
    return {
      rule_id: rule.id,
      suggested_trigger: suggestedTrigger,
      suggested_action: suggestedAction,
      confidence: overallConfidence,
      auto_apply: overallConfidence >= 0.8,
      needs_review: overallConfidence < 0.8,
    };
  }

  /**
   * 批量补全所有SKELETON规则
   */
  async completeAll(rulesDir) {
    const results = { auto_applied: 0, needs_review: 0, skipped: 0 };
    // ... 遍历所有SKELETON规则，调用completeRule
    // auto_apply的直接写入文件
    // needs_review的写入 isc-core/logs/skeleton-review-queue.jsonl
    return results;
  }
}
```

#### C1.2 规则冲突检测与优先级仲裁

**落地文件**: `skills/isc-core/services/rule-conflict-detector.js` (新建)

```javascript
/**
 * 规则冲突检测器
 * 
 * 检测类型：
 * 1. 事件重叠冲突：两条规则订阅相同事件，但action矛盾（一个enforce，一个auto_fix）
 * 2. 覆盖遗漏：某个domain的事件没有任何规则覆盖
 * 3. 优先级冲突：多条规则同优先级且action类型不同
 * 4. 循环依赖：规则A的action触发事件X，事件X又触发规则B，规则B又触发事件Y→规则A
 */

class RuleConflictDetector {
  detect(bindings) {
    const conflicts = [];
    
    // 1. 事件重叠冲突
    for (const [eventType, handlers] of bindings) {
      if (handlers.length <= 1) continue;
      
      // 检查是否有矛盾action（block vs auto_fix）
      const actionTypes = new Set(handlers.map(h => h.action.type));
      if (actionTypes.has('block_and_notify') && actionTypes.has('auto_fix')) {
        conflicts.push({
          type: 'contradictory_actions',
          event: eventType,
          rules: handlers.map(h => h.ruleId),
          severity: 'high',
          recommendation: '需要明确优先级，block_and_notify应高于auto_fix'
        });
      }
    }
    
    // 2. 循环依赖检测 (BFS on action→event graph)
    // ...
    
    return conflicts;
  }
}
```

#### C1.3 举一反三：其他缺失的认知能力

| # | 缺失认知 | 当前状态 | 自主方案 | 落地位置 |
|---|---------|---------|---------|---------|
| C1.a | **规则有效性衰减检测** | 无 | 规则创建后超过30天未触发→标记dormant，超过90天→建议归档 | `isc-core/services/rule-lifecycle-manager.js` 新建 |
| C1.b | **trigger覆盖率分析** | 无 | 分析所有事件类型，哪些有规则覆盖、哪些裸奔→输出覆盖矩阵 | `isc-core/services/trigger-coverage-analyzer.js` 新建 |
| C1.c | **action效果评估** | 无 | 统计每个action type的执行成功率/失败率/平均耗时→动态调整on_failure策略 | `lto-core/core/action-effectiveness-tracker.js` 新建 |
| C1.d | **跨规则依赖图谱** | 无 | 构建规则→事件→规则的有向图，识别关键路径和单点故障 | `isc-core/services/rule-dependency-graph.js` 新建 |
| C1.e | **订阅过期检测** | DTO有82个subscription文件 | 与ISC规则对比，无对应规则的subscription→标记orphan | `lto-core/core/subscription-reconciler.js` 新建 |

### C2: 对齐对账引擎 (Alignment & Reconciliation Engine)

**现状缺口**：
- ISC 77条规则 vs 本地任务编排 82个订阅 vs Event Registry（尚未部署），三者互不对账
- 不知道哪些规则绑定了但从没触发过
- 不知道哪些事件频繁触发但处理全失败

**设计方案**：

**落地文件**: `skills/lto-core/core/alignment-engine.js` (新建，整合现有`isc-dto-aligner.js`)

```javascript
/**
 * ISC-Event-本地任务编排 三角对齐引擎 v1.0
 * 
 * 三角对账模型：
 *   ISC Rules ←──→ Event Registry ←──→ 本地任务编排 Subscriptions
 *        ↑_________________________________↑
 * 
 * 每对边都需要双向对齐检查。
 */

class AlignmentEngine {
  constructor(iscRulesDir, eventRegistryPath, dtoSubscriptionsDir, eventBus) {
    this.iscRulesDir = iscRulesDir;
    this.eventRegistryPath = eventRegistryPath;
    this.dtoSubscriptionsDir = dtoSubscriptionsDir;
    this.eventBus = eventBus;
  }

  /**
   * 执行全量三角对齐
   */
  async runFullAlignment() {
    const report = {
      timestamp: new Date().toISOString(),
      
      // 边1: ISC ↔ Event Registry
      isc_event: {
        rules_without_events: [],      // 规则引用了不存在的事件
        events_without_rules: [],      // 事件没有规则引用
        skeleton_rules: [],            // 无trigger的规则
      },
      
      // 边2: Event Registry ↔ 本地任务编排 Subscriptions
      event_dto: {
        events_without_subscriptions: [], // 事件在注册表但DTO无订阅
        subscriptions_without_events: [], // DTO有订阅但注册表没事件
        stale_subscriptions: [],          // 订阅存在但对应规则已删除
      },
      
      // 边3: ISC ↔ 本地任务编排
      isc_dto: {
        rules_without_subscriptions: [], // 有规则但DTO没订阅
        subscriptions_without_rules: [], // DTO有订阅但ISC没规则
      },
      
      // 运行时健康
      runtime: {
        never_triggered: [],    // 注册了但从没触发的事件
        always_failed: [],      // 触发了但100%失败的规则
        high_frequency: [],     // 触发频率异常高（可能配置错误）
        dead_letter: [],        // 触发了但无handler的事件
      },
      
      // 自动修复建议
      auto_fix_suggestions: [],
      
      // 汇总
      health_score: 0, // 0-100
    };
    
    // ... 实现每个维度的对齐检查 ...
    
    // 计算健康分
    const totalIssues = [
      report.isc_event.rules_without_events,
      report.isc_event.skeleton_rules,
      report.event_dto.events_without_subscriptions,
      report.isc_dto.rules_without_subscriptions,
      report.runtime.never_triggered,
      report.runtime.always_failed,
    ].reduce((sum, arr) => sum + arr.length, 0);
    
    const totalChecks = 77 + Object.keys(this.loadRegistry().events).length + 82;
    report.health_score = Math.max(0, Math.round((1 - totalIssues / totalChecks) * 100));
    
    return report;
  }

  /**
   * 生成健康报告（人类可读）
   */
  formatReport(report) {
    const lines = [
      `# ISC-Event-本地任务编排 对齐健康报告`,
      ``,
      `⏰ ${report.timestamp}`,
      `📊 健康分: ${report.health_score}/100`,
      ``,
      `## 🔺 ISC ↔ Event Registry`,
      `- 无trigger规则: ${report.isc_event.skeleton_rules.length}条`,
      `- 引用不存在事件: ${report.isc_event.rules_without_events.length}条`,
      `- 无规则引用的事件: ${report.isc_event.events_without_rules.length}个`,
      ``,
      `## 🔺 Event ↔ 本地任务编排 Subscriptions`,
      `- 无订阅的事件: ${report.event_dto.events_without_subscriptions.length}个`,
      `- 无事件的订阅: ${report.event_dto.subscriptions_without_events.length}个`,
      `- 过期订阅: ${report.event_dto.stale_subscriptions.length}个`,
      ``,
      `## 🔺 ISC ↔ 本地任务编排 直接对齐`,
      `- 无订阅的规则: ${report.isc_dto.rules_without_subscriptions.length}条`,
      `- 无规则的订阅: ${report.isc_dto.subscriptions_without_rules.length}个`,
      ``,
      `## ⚡ 运行时异常`,
      `- 从未触发: ${report.runtime.never_triggered.length}个事件`,
      `- 100%失败: ${report.runtime.always_failed.length}条规则`,
      `- 频率异常: ${report.runtime.high_frequency.length}个事件`,
      `- 死信事件: ${report.runtime.dead_letter.length}个`,
    ];
    
    if (report.auto_fix_suggestions.length > 0) {
      lines.push(``, `## 🔧 自动修复建议`);
      for (const fix of report.auto_fix_suggestions) {
        lines.push(`- [${fix.confidence > 0.7 ? '可自动' : '需审核'}] ${fix.description}`);
      }
    }
    
    return lines.join('\n');
  }
}
```

---

## 9.4 执行层 (Execution) — 系统如何自主执行和反馈？

### E1: 自适应执行引擎 (Adaptive Execution Engine)

**现状缺口**：
- TaskExecutor只有execute方法，没有重试、降级、超时控制
- 失败后没有自动修复策略
- 级联任务（A完成后触发B）只能通过事件间接完成，没有声明式依赖

**设计方案**：

#### E1.1 执行增强：重试+降级+超时

**落地文件**: `skills/lto-core/core/task-executor.js` (增强现有文件)

```javascript
/**
 * TaskExecutor v2.0 增强
 * 新增能力：
 * 1. 分级重试策略（exponential backoff）
 * 2. 降级执行（主策略失败→降级策略）
 * 3. 超时控制（每个task有独立timeout）
 * 4. 执行指标收集
 */

// 在现有TaskExecutor基础上增加
class ExecutionPolicy {
  constructor(action) {
    this.maxRetries = action.retry_count || this.getDefaultRetries(action.on_failure);
    this.timeoutMs = action.timeout_ms || 30000;
    this.backoffBase = 1000;
    this.fallback = action.fallback || null;
  }

  getDefaultRetries(onFailure) {
    switch (onFailure) {
      case 'retry': return 3;
      case 'escalate': return 1;
      default: return 0;
    }
  }

  getRetryDelay(attempt) {
    return this.backoffBase * Math.pow(2, attempt); // 1s, 2s, 4s...
  }
}
```

#### E1.2 自动修复引擎 (Auto-Remediation)

**落地文件**: `skills/lto-core/core/auto-remediation.js` (新建)

```javascript
/**
 * 自动修复引擎
 * 
 * 已知的可自动修复场景：
 * 1. subscription文件格式错误 → 重新生成
 * 2. 事件注册表缺失条目 → 自动补全
 * 3. rules文件JSON解析失败 → 格式化修复
 * 4. event-bus cursor过期 → 重置cursor
 * 5. cron任务配置错误 → 应用默认配置
 */

class AutoRemediation {
  constructor() {
    this.recipes = new Map();
    this.registerBuiltinRecipes();
  }

  registerBuiltinRecipes() {
    this.recipes.set('subscription_format_error', {
      detect: (error) => error.message.includes('JSON') && error.file?.includes('subscriptions'),
      fix: async (context) => {
        // 从ISC规则重新生成subscription
        const ruleId = context.subscription_id.replace('isc-', '');
        // ... 重新生成
        return { fixed: true, action: 'regenerated_subscription' };
      }
    });

    this.recipes.set('cursor_stale', {
      detect: (error) => error.message.includes('cursor') || error.message.includes('offset'),
      fix: async (context) => {
        // 重置cursor到events.jsonl末尾
        return { fixed: true, action: 'cursor_reset' };
      }
    });

    this.recipes.set('rule_json_parse_error', {
      detect: (error) => error.message.includes('Unexpected token') && error.file?.includes('rules'),
      fix: async (context) => {
        // 尝试JSON修复（去尾逗号、补引号等）
        return { fixed: true, action: 'json_repaired' };
      }
    });
  }

  /**
   * 尝试自动修复
   * @returns {object|null} 修复结果，null表示无可用修复方案
   */
  async tryFix(error, context) {
    for (const [name, recipe] of this.recipes) {
      if (recipe.detect(error)) {
        try {
          const result = await recipe.fix(context);
          // 记录修复日志
          this.logRemediation(name, error, result);
          return result;
        } catch (fixError) {
          // 修复也失败了 → 升级
          return { fixed: false, escalated: true, reason: fixError.message };
        }
      }
    }
    return null; // 无可用修复
  }
}
```

#### E1.3 级联触发引擎

**落地文件**: `skills/lto-core/core/cascade-trigger.js` (新建)

```javascript
/**
 * 级联触发引擎
 * 
 * 声明式依赖：规则A的完成可以自动触发规则B
 * 避免硬编码级联逻辑，通过event-bus的完成事件自动路由
 * 
 * 示例：
 *   skill.created → [quality-check] → dto.task.completed 
 *     → [auto-vectorization] → dto.task.completed 
 *     → [evomap-sync]
 */

class CascadeTrigger {
  constructor(bus, binder) {
    this.bus = bus;
    this.binder = binder;
    // 监听所有dto.task.completed事件，检查是否有下游依赖
  }

  /**
   * 分析完成事件，查找并触发下游任务
   */
  handleCompletion(completionEvent) {
    const { task_id, rule_id, status, result } = completionEvent.payload;
    
    if (status !== 'success') return; // 失败不级联
    
    // 查找是否有规则声明了 depends_on 此 rule_id
    const downstreamRules = this.findDependents(rule_id);
    
    for (const downstream of downstreamRules) {
      // 发布触发事件，由RuntimeBinder在下个cycle处理
      this.bus.emit(`cascade.trigger.${downstream.id}`, {
        upstream_rule: rule_id,
        upstream_result: result,
        triggered_at: Date.now()
      });
    }
  }
}
```

#### E1.4 举一反三：其他断裂的执行闭环

| # | 断裂闭环 | 当前状态 | 自主方案 | 落地位置 |
|---|---------|---------|---------|---------|
| E1.a | **执行结果→ISC规则状态回写** | 规则执行后不更新规则自身状态 | 执行完成后在规则JSON中写入`last_execution`、`execution_count`、`success_rate` | `lto-core/core/runtime-binder.js` 增强 |
| E1.b | **失败→自动降级→人工审核队列** | 失败只写日志 | 失败3次以上→进入human-review队列→飞书通知 | `lto-core/core/human-review-queue.js` 新建 |
| E1.c | **Cron任务执行结果→ISC合规检查** | cron执行完毕后无合规回检 | cron任务完成→发布事件→ISC规则校验其输出是否符合标准 | `isc-core/services/cron-compliance-checker.js` 新建 |
| E1.d | **版本管理→变更通知** | global-auto-decision做了Git commit但无通知 | 重大版本变更(semver major)→飞书通知用户 | `lto-core/core/global-auto-decision-pipeline.js` 增强 |
| E1.e | **规则自进化** | 规则创建后永不变 | 基于execution_count和success_rate，自动调整on_failure策略和priority | `isc-core/services/rule-self-evolution.js` 新建 |

### E2: 闭环反馈引擎 (Closed-Loop Feedback Engine)

**设计方案**：

**落地文件**: `skills/lto-core/core/feedback-engine.js` (新建)

```javascript
/**
 * 闭环反馈引擎
 * 
 * 职责：确保每次执行都有可追溯的结果记录，
 * 并将结果反馈给源规则（ISC）实现自进化闭环。
 * 
 * trace_id: 全链路追踪 — 从事件产生到最终执行结果，
 * 每个步骤共享同一个trace_id，可用于debug和审计。
 */

class FeedbackEngine {
  constructor(bus, iscRulesDir) {
    this.bus = bus;
    this.iscRulesDir = iscRulesDir;
    this.metricsStore = {}; // rule_id → { executions, successes, failures, avg_duration }
  }

  /**
   * 生成全链路trace_id
   */
  static generateTraceId() {
    return `trace_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * 记录执行结果并更新规则元数据
   */
  async recordExecution(ruleId, result, traceId) {
    // 1. 更新内存指标
    if (!this.metricsStore[ruleId]) {
      this.metricsStore[ruleId] = { executions: 0, successes: 0, failures: 0, total_duration: 0 };
    }
    const metrics = this.metricsStore[ruleId];
    metrics.executions++;
    if (result.status === 'success') metrics.successes++;
    else metrics.failures++;
    metrics.total_duration += result.duration_ms || 0;
    
    // 2. 回写ISC规则文件的execution_stats字段
    this.updateRuleStats(ruleId, metrics);
    
    // 3. 写入审计日志
    this.appendAuditLog(ruleId, result, traceId);
    
    // 4. 检查是否需要自进化
    if (metrics.executions >= 10) {
      const successRate = metrics.successes / metrics.executions;
      if (successRate < 0.3) {
        // 成功率过低 → 建议禁用或修改规则
        this.bus.emit('isc.rule.needs_attention', {
          rule_id: ruleId,
          reason: 'low_success_rate',
          success_rate: successRate,
          executions: metrics.executions,
          trace_id: traceId
        });
      }
    }
  }

  /**
   * 更新规则文件中的执行统计
   */
  updateRuleStats(ruleId, metrics) {
    const ruleFile = path.join(this.iscRulesDir, `${ruleId}.json`);
    if (!fs.existsSync(ruleFile)) return;
    
    try {
      const rule = JSON.parse(fs.readFileSync(ruleFile, 'utf8'));
      rule.execution_stats = {
        total_executions: metrics.executions,
        success_rate: (metrics.successes / metrics.executions * 100).toFixed(1) + '%',
        avg_duration_ms: Math.round(metrics.total_duration / metrics.executions),
        last_execution: new Date().toISOString(),
      };
      fs.writeFileSync(ruleFile, JSON.stringify(rule, null, 2));
    } catch (e) {
      // 更新失败不阻断主流程
    }
  }
}
```

---

## 9.5 监控与对账机制

### 9.5.1 合并到现有Cron任务

**决策**：对账检查合并到 `merged-isc-quality-daily`（每天20:00，opus模型）

**理由**：
- 该任务已存在且定位是ISC质量管理
- 每日频率适合对账（不需要实时）
- opus模型适合复杂分析任务
- 不新增cron任务，减少管理负担

**改造方式**: 在 `merged-isc-quality-daily` 的prompt中增加以下步骤：

```
## 新增：ISC-Event-DTO对齐对账

### 执行步骤
1. 运行三角对齐引擎：
   node /root/.openclaw/workspace/skills/lto-core/core/alignment-engine.js

2. 读取输出报告：
   cat /root/.openclaw/workspace/skills/lto-core/logs/alignment-report.json

3. 分析结果，重点关注：
   - 健康分低于70分 → 发飞书告警
   - skeleton规则数 > 40% → 启动skeleton-completer
   - never_triggered事件 > 50% → 事件注册表需清理
   - always_failed规则 > 0 → 立即禁用并通知

4. 将报告写入 memory/YYYY-MM-DD.md
```

### 9.5.2 健康报告维度与格式

**报告文件**: `skills/lto-core/logs/alignment-report.json` (每次对账自动生成)

```json
{
  "report_version": "1.0",
  "generated_at": "2026-03-04T20:00:00+08:00",
  "health_score": 72,
  
  "dimensions": {
    "coverage": {
      "score": 65,
      "detail": "77规则中30条有完整trigger+action绑定 (39%)",
      "issues": ["47条SKELETON规则无trigger"]
    },
    "alignment": {
      "score": 80,
      "detail": "注册事件中75%有对应订阅",
      "issues": ["5个事件无订阅", "8个订阅无对应规则"]
    },
    "activity": {
      "score": 60,
      "detail": "过去7天内40%的绑定被触发过",
      "issues": ["12个事件过去30天未触发"]
    },
    "effectiveness": {
      "score": 85,
      "detail": "触发的规则中成功率85%",
      "issues": ["3条规则成功率低于50%"]
    },
    "freshness": {
      "score": 70,
      "detail": "60%的规则在过去30天内有执行记录",
      "issues": ["20条规则超过60天未执行"]
    }
  },
  
  "critical_issues": [],
  "auto_fix_applied": [],
  "pending_review": []
}
```

### 9.5.3 自动补全策略

**分级策略**（不全自动、不全人工）：

| 置信度 | 策略 | 具体行为 |
|--------|------|---------|
| >= 0.8 | 自动应用 | 直接写入规则文件，下次cycle生效，记录到auto_fix_applied |
| 0.5-0.8 | 生成草案+人工审核 | 写入review-queue.jsonl，飞书通知用户review |
| < 0.5 | 仅记录 | 写入日志，不生成草案，标记为needs_manual_design |

**防护措施**：
- 自动应用的修改会在Git中独立commit，message标记`[auto-complete]`
- 每次自动应用不超过5条规则（避免大面积误修改）
- 自动应用后24小时内如果触发失败→自动回退

---

## 9.6 完整数据流（三层贯通示例）

### 场景：新增一条ISC规则（无trigger无action）

```
                    感知层
 ┌──────────────────────────────────────────────────────┐
 │ T+0    用户创建 rules/rule.new-security-gate-001.json  │
 │        内容: { name: "API密钥轮换强制", domain: "security" }    │
 │                                                      │
 │ T+5min  event-bridge 检测到新文件                       │
 │         → bus.emit('isc.rule.created', {...})          │
 │                                                      │
 │ T+5min  rule-event-analyzer 分析语义:                    │
 │         domain=security → 推断events=['api.key.expired',│
 │           'api.key.rate.limit', 'file.sensitive.modified']│
 │         检查event-registry → api.key.expired 不存在      │
 │         → 自动创建 api.key.expired (draft状态)            │
 └──────────────────────────────────────────────────────┘
                        ↓
                    认知层
 ┌──────────────────────────────────────────────────────┐
 │ T+5min  skeleton-completer 分析:                       │
 │         trigger推断: { type: "event",                    │
 │           events: ["api.key.expired"] }  confidence: 0.7 │
 │         action推断: { type: "block_and_notify",           │
 │           on_failure: "reject" }  confidence: 0.7         │
 │         overall: 0.7 → needs_review                     │
 │         → 写入 review-queue.jsonl                        │
 │                                                      │
 │ T+5min  conflict-detector 检查:                         │
 │         无冲突（新事件，无其他规则订阅）                     │
 │                                                      │
 │ T+20:00 alignment-engine 对账:                          │
 │         新规则已在review-queue → 健康报告标注pending        │
 └──────────────────────────────────────────────────────┘
                        ↓
                    执行层
 ┌──────────────────────────────────────────────────────┐
 │ T+20:00 飞书通知用户: "新规则 rule.new-security-gate-001   │
 │         需要审核trigger/action草案"                      │
 │                                                      │
 │ T+用户确认  trigger/action写入规则文件                     │
 │            → event-bridge检测变更                       │
 │            → RuntimeBinder更新绑定表                     │
 │            → 下次api.key.expired事件触发时自动执行         │
 │                                                      │
 │ T+首次执行  feedback-engine记录结果                       │
 │            → 更新规则execution_stats                    │
 │            → trace_id贯穿全流程                          │
 └──────────────────────────────────────────────────────┘
```

---

## 9.7 实施路线图（更新）

### Phase 0: 基础设施统一（原Phase 1，1-2天）
*不变，见第六部分*

### Phase 1: Runtime Binder + Task Executor（原Phase 2，2-3天）
*不变，见第六部分*

### Phase 2: 感知层建设（新增，2-3天）

| 任务 | 描述 | 落地文件 | 优先级 |
|------|------|---------|--------|
| T-P1 | 实现RuleEventAnalyzer | `isc-core/services/rule-event-analyzer.js` | P0 |
| T-P2 | 实现EventRegistryMaintainer | `isc-core/services/event-registry-maintainer.js` | P0 |
| T-P3 | 实现AdaptiveSourceManager | `isc-core/services/adaptive-source-manager.js` | P1 |
| T-P4 | event-bridge增加cron/skill-dir监视 | `isc-core/event-bridge.js` 增强 | P1 |
| T-P5 | API健康探针 | `infrastructure/health-probes/api-health.js` | P2 |

### Phase 3: 认知层建设（新增，2-3天）

| 任务 | 描述 | 落地文件 | 优先级 |
|------|------|---------|--------|
| T-C1 | 实现SkeletonCompleter | `isc-core/services/skeleton-completer.js` | P0 |
| T-C2 | 实现AlignmentEngine | `lto-core/core/alignment-engine.js` | P0 |
| T-C3 | 实现RuleConflictDetector | `isc-core/services/rule-conflict-detector.js` | P1 |
| T-C4 | 实现RuleLifecycleManager | `isc-core/services/rule-lifecycle-manager.js` | P1 |
| T-C5 | 实现TriggerCoverageAnalyzer | `isc-core/services/trigger-coverage-analyzer.js` | P2 |

### Phase 4: 执行层增强（新增，2-3天）

| 任务 | 描述 | 落地文件 | 优先级 |
|------|------|---------|--------|
| T-E1 | TaskExecutor v2（重试+降级+超时） | `lto-core/core/task-executor.js` 增强 | P0 |
| T-E2 | 实现AutoRemediation | `lto-core/core/auto-remediation.js` | P1 |
| T-E3 | 实现FeedbackEngine | `lto-core/core/feedback-engine.js` | P0 |
| T-E4 | 实现CascadeTrigger | `lto-core/core/cascade-trigger.js` | P2 |
| T-E5 | 实现HumanReviewQueue | `lto-core/core/human-review-queue.js` | P1 |

### Phase 5: 监控与对账（新增，1天）

| 任务 | 描述 | 落地文件 | 优先级 |
|------|------|---------|--------|
| T-M1 | 改造merged-isc-quality-daily cron | cron prompt更新 | P0 |
| T-M2 | 健康报告格式实现 | `lto-core/core/alignment-engine.js` | P0 |
| T-M3 | 飞书告警集成 | `lto-core/core/alignment-engine.js` | P1 |

### Phase 6: 规则标准化迁移（原Phase 3，3-5天）
*不变，见第六部分*

### Phase 7: 旧通道清理（原Phase 4，1天）
*不变，见第六部分*

**总工期估算**：原方案7-11天 → 扩展后14-20天（增量8-10天用于三层自主决策）

---

## 9.8 新增文件清单汇总

### 感知层新文件

| 文件 | 职责 |
|------|------|
| `isc-core/services/rule-event-analyzer.js` | 规则语义→事件需求推断 |
| `isc-core/services/event-registry-maintainer.js` | 事件注册表自维护 |
| `isc-core/services/adaptive-source-manager.js` | 可插拔数据源管理 |
| `isc-core/services/skill-dir-watcher.js` | 技能目录变更感知 |
| `infrastructure/health-probes/api-health.js` | API健康探针 |

### 认知层新文件

| 文件 | 职责 |
|------|------|
| `isc-core/services/skeleton-completer.js` | SKELETON规则自动补全 |
| `isc-core/services/rule-conflict-detector.js` | 规则冲突检测 |
| `isc-core/services/rule-lifecycle-manager.js` | 规则生命周期管理 |
| `isc-core/services/trigger-coverage-analyzer.js` | Trigger覆盖率分析 |
| `isc-core/services/rule-dependency-graph.js` | 跨规则依赖图谱 |
| `lto-core/core/alignment-engine.js` | 三角对齐引擎 |
| `lto-core/core/subscription-reconciler.js` | 订阅对账 |
| `lto-core/core/action-effectiveness-tracker.js` | Action效果追踪 |

### 执行层新文件

| 文件 | 职责 |
|------|------|
| `lto-core/core/auto-remediation.js` | 自动修复引擎 |
| `lto-core/core/cascade-trigger.js` | 级联触发引擎 |
| `lto-core/core/feedback-engine.js` | 闭环反馈引擎 |
| `lto-core/core/human-review-queue.js` | 人工审核队列 |
| `isc-core/services/cron-compliance-checker.js` | Cron合规检查 |
| `isc-core/services/rule-self-evolution.js` | 规则自进化 |

### 增强的现有文件

| 文件 | 增强内容 |
|------|---------|
| `isc-core/event-bridge.js` | +cron监视 +skill-dir监视 +依赖变更监视 |
| `lto-core/core/task-executor.js` | +ExecutionPolicy +重试 +降级 +超时 |
| `lto-core/core/runtime-binder.js` | +trace_id +执行结果回写ISC |
| `lto-core/core/global-auto-decision-pipeline.js` | +breaking change识别 +飞书通知 |

---

## 9.9 关键设计决策总结

| # | 决策 | 理由 |
|---|------|------|
| D1 | SKELETON补全采用分级策略（>=0.8自动，<0.8审核） | 平衡自动化与安全性 |
| D2 | 事件注册表支持draft状态 | 允许系统自动创建但留人工确认窗口 |
| D3 | 对账合并到merged-isc-quality-daily而非新建cron | 减少cron膨胀，复用现有调度 |
| D4 | 数据源采用插件式注册而非硬编码 | 新数据源接入不需要改核心代码 |
| D5 | 执行结果回写ISC规则文件而非独立存储 | 规则自包含所有状态，单一真相源 |
| D6 | trace_id贯穿全链路 | 从事件产生到执行完成可追溯 |
| D7 | 自动修复每次不超过5条规则 | 防止批量误修改 |
| D8 | 级联触发通过事件间接完成 | 避免直接调用造成的紧耦合 |

---

*文档 v2.0 结束。全局自主决策架构扩展完成。等待评审。*

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

**文档**: isc-event-dto-binding-design
**生成时间**: 2026-03-06T13:01:12.507Z
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
