# LEP Executor

LEP (Local Execution Protocol) 韧性执行中心 - 全局统一韧性任务执行引擎

## 快速开始

```bash
# 安装依赖
cd skills/lep-executor
npm install

# 执行ISC规则
node index.js execute-rule N016
node index.js execute-rule N017
node index.js execute-rule N018 '{"oldName": "foo", "newName": "bar"}'

# 健康检查
node index.js health

# 执行统计
node index.js stats
```

## 特性

- ✅ **统一执行入口** - 所有韧性任务通过 `execute()` 执行
- ✅ **声明式规则** - N016/N017/N018 规则声明式配置
- ✅ **韧性保障** - 复用 parallel-subagent 成熟实现
- ✅ **深度集成** - 与ISC-DTO、CRAS、流水线形成闭环
- ✅ **可观测性** - WAL + 指标 + 追踪三位一体

## 文档

- [架构设计文档](docs/ARCHITECTURE.md)
- [集成方案](docs/INTEGRATION.md)
- [实施路线图](docs/ROADMAP.md)

## 架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         LEP Executor                             │
├─────────────────────────────────────────────────────────────────┤
│  API Layer        │  execute(), schedule(), query(), health()   │
├───────────────────┼─────────────────────────────────────────────┤
│  Orchestration    │  Rule Engine, Workflow Orchestrator         │
├───────────────────┼─────────────────────────────────────────────┤
│  Execution        │  Resilience Core, N-Rule Executor           │
├───────────────────┼─────────────────────────────────────────────┤
│  Recovery         │  Pipeline Bridge, ISC-DTO Bridge            │
├───────────────────┼─────────────────────────────────────────────┤
│  Observability    │  WAL Log, Metrics, Tracing                  │
└───────────────────┴─────────────────────────────────────────────┘
```

## API

### execute(task)

执行一个韧性任务。

```javascript
const { execute } = require('./skills/lep-executor');

const result = await execute({
  type: 'function',
  fn: async () => {
    // 你的任务逻辑
    return 'result';
  },
  retryPolicy: {
    maxRetries: 3,
    backoff: 'exponential'
  }
});
```

### executeRule(ruleId, context)

执行ISC规则。

```javascript
const { executeRule } = require('./skills/lep-executor');

// 执行N016修复循环
const result = await executeRule('N016', {
  fixableIssues: [...]
});

// 执行N017重复问题根治
const result = await executeRule('N017', {});

// 执行N018全局引用对齐
const result = await executeRule('N018', {
  oldName: 'old-skill',
  newName: 'new-skill'
});
```

## 配置

环境变量:

```bash
# WAL日志路径
LEP_WAL_PATH=.lep-wal

# 日志级别
LEP_LOG_LEVEL=INFO

# 熔断器阈值
LEP_CIRCUIT_BREAKER_THRESHOLD=5
```

## 测试

```bash
# 运行所有测试
npm test

# 测试N016
npm run test:n016

# 测试N017
npm run test:n017

# 测试N018
npm run test:n018
```

## 许可证

MIT
