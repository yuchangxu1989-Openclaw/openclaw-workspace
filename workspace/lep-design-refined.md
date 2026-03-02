# LEP 韧性执行中心 - 精炼设计方案

## 核心洞察（取精华）

### 参考版本优点 ✅
1. **统一执行接口** - 所有系统通过LEP.execute()调用
2. **熔断机制** - 防止级联故障
3. **全链路追踪** - executionId贯穿始终
4. **状态持久化** - 执行记录可查

### 参考版本缺点 ❌（去糟粕）
1. **过于复杂** - 多层抽象，学习成本高
2. **与PCEC耦合** - PCEC不存在，需解耦
3. **SEEF历史包袱** - 需保留兼容层

---

## 适配我方架构的设计

### 核心原则
**不新建复杂系统，整合现有分散能力**

```
现有能力 → LEP统一封装 → 对外提供标准接口
```

### 1. 极简执行接口

```javascript
// skills/lep-executor/index.js
class LEPExecutor {
  async execute(task) {
    // 1. 生成追踪ID
    const execId = generateId();
    
    // 2. 调用现有parallel-subagent v3.0.1（已含重试/熔断）
    return await parallelSubagent.spawn({
      ...task,
      label: `lep-${execId}`,
      tracing: { execId, startTime: Date.now() }
    });
  }
}
```

**关键决策**: 不复刻参考版本的复杂熔断/重试逻辑，直接复用已验证的parallel-subagent v3.0.1

### 2. 与现有系统集成（非侵入式）

| 系统 | 当前方式 | LEP集成后 |
|:---|:---|:---|
| parallel-subagent | 直接调用 | LEP.execute()包装，添加统一追踪 |
| DTO流水线 | 直接执行 | 失败时LEP.triggerRecovery()触发修复 |
| ISC规则 | 未实现代码 | LEP.execute()执行N016/N017 |
| CRAS | 直接调用 | 可选LEP包装，非强制 |

### 3. 状态追踪（轻量级）

参考版本: 复杂持久化存储  
**我们**: WAL日志 + 内存热数据

```javascript
// 执行记录写入WAL（不阻塞主流程）
wal.append({
  execId,
  task: task.type,
  status: 'started|success|failed',
  timestamp: Date.now(),
  duration: elapsed
});
```

### 4. 修复联动（关键差异化）

参考版本: 未明确修复机制  
**我们**: 明确联动DTO流水线 + ISC规则

```javascript
async onExecutionFailure(task, error, execId) {
  // 触发N017重复问题检测
  if (await isRecurringPattern(error)) {
    await cras.markRecurringPattern(error.pattern);
  }
  
  // 触发N016修复循环
  await dtoPipeline.triggerAutoFix({
    source: 'lep-failure',
    execId,
    error: error.message
  });
}
```

---

## 实施路径（最小可行）

### 方案A: 极简版（推荐）
```
LEP = parallel-subagent v3.0.1 + 统一追踪ID + WAL日志
```
- 工作量: 1天
- 价值: 统一入口，可追踪

### 方案B: 增强版
```
LEP = parallel-subagent + DTO修复联动 + CRAS模式检测
```
- 工作量: 3天
- 价值: 完整韧性闭环

### 方案C: 完整版（参考版本）
```
LEP = 独立熔断/重试/追踪/存储系统
```
- 工作量: 2周
- 价值: 高度可控，但与现有能力重复

---

## 推荐: 方案A（极简版）

理由:
1. **parallel-subagent v3.0.1已是成熟韧性执行器**
2. **不复刻参考版本的复杂抽象**
3. **快速上线，验证价值**
4. **后续可逐步增强**

**是否立即实施方案A？**
