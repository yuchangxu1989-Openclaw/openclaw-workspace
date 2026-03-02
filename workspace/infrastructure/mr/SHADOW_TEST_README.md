# MR Shadow Tester - 影子测试框架

## 概述

影子测试框架（Phase 2）实现生产流量旁路对比验证，将1%的生产流量异步旁路到完整版MR，与MVP版结果进行对比分析。

## 核心特性

- **非侵入式设计**: 旁路测试完全异步，不阻塞主流程
- **熔断保护**: 连续失败自动熔断，避免影响生产
- **安全隔离**: try-catch完全隔离，旁路失败不影响MVP主流程
- **超时控制**: 完整版超时自动放弃（默认5秒）
- **只对比不替换**: 仅记录差异，不替换MVP结果

## 文件结构

```
infrastructure/mr/
├── shadow-tester.js              # 影子测试器主模块
├── config/
│   └── shadow-test.json          # 配置文件
├── start-shadow-test.sh          # 启动脚本
├── shadow-test-report.json       # 对比报告输出
└── shadow-integration-example.js # 集成示例
```

## 快速开始

### 1. 启动影子测试

```bash
cd infrastructure/mr
./start-shadow-test.sh
```

### 2. 在代码中集成

```javascript
// 方式1: 包装MVP模块
const { createMVPRouterWrapper } = require('./shadow-tester.js');
const mvp = require('./mr-router.mvp.js');

const wrappedMVP = createMVPRouterWrapper(mvp);

// 正常调用，自动进行影子测试采样
const result = await wrappedMVP.routeAndExecute({
    description: '分析代码性能',
    agentId: 'agent-code-reviewer'
});
```

### 3. 查看报告

```bash
cat shadow-test-report.json
```

## 配置说明

`config/shadow-test.json`:

```json
{
  "enabled": true,              // 是否启用影子测试
  "sampleRate": 0.01,           // 采样率: 1% (0.01)
  "comparisonDimensions": [      // 对比维度
    "intent",                    // 意图分类
    "modelChain",                // 模型链
    "duration"                   // 执行时长
  ],
  "timeouts": {
    "fullVersion": 5000         // 完整版超时(毫秒)
  },
  "safety": {
    "isolatedErrors": true,     // 错误隔离
    "maxConcurrentShadow": 10,  // 最大并发
    "circuitBreaker": {
      "failureThreshold": 10,   // 熔断阈值
      "resetTimeoutMs": 60000   // 熔断重置时间
    }
  },
  "thresholds": {
    "bypassSuccessRate": 0.95,        // 旁路成功率阈值
    "intentConsistency": 0.90,        // 意图一致性阈值
    "modelSelectionConsistency": 0.95 // 模型选择一致性阈值
  }
}
```

## 报告格式

```json
{
  "requestId": "shadow_1234567890_abc123",
  "timestamp": "2026-02-26T10:00:00.000Z",
  "input": "分析这段代码的性能问题",
  "mvpResult": {
    "intent": "reasoning",
    "modelChain": ["{{MODEL_GENERAL}}"],
    "duration": 150
  },
  "fullResult": {
    "intent": "reasoning",
    "modelChain": ["{{MODEL_DEEP_THINKING}}"],
    "duration": 230
  },
  "match": false,
  "diff": ["modelChain: [\"{{MODEL_GENERAL}}\"] → [\"{{MODEL_DEEP_THINKING}}\"]"],
  "severity": "high"
}
```

## 成功标准检查

运行以下命令检查是否达到成功标准:

```bash
node -e "
const report = require('./shadow-test-report.json');
const s = report.summary;
console.log('=== 影子测试成功标准检查 ===');
console.log('旁路成功率 > 95%:', (s.bypassSuccessRate > 0.95 ? '✓' : '✗'), s.bypassSuccessRate.toFixed(2));
console.log('意图一致性 > 90%:', (s.intentConsistency > 0.90 ? '✓' : '✗'), s.intentConsistency.toFixed(2));
console.log('模型一致性 > 95%:', (s.modelSelectionConsistency > 0.95 ? '✓' : '✗'), s.modelSelectionConsistency.toFixed(2));
console.log('熔断器状态:', s.circuitOpen ? '⚠ 开启' : '✓ 关闭');
"
```

## API 参考

### ShadowTester 类

```javascript
const { ShadowTester } = require('./shadow-tester.js');

const tester = new ShadowTester({
    sampleRate: 0.01,  // 可选配置覆盖
    enabled: true
});

// 获取统计
const summary = tester.getSummary();

// 获取详细统计
const stats = tester.getStats();

// 销毁资源
tester.destroy();
```

### 便捷函数

```javascript
const { 
    getShadowTester,      // 获取单例实例
    wrapRouteAndExecute,  // 包装路由函数
    createMVPRouterWrapper, // 创建MVP包装器
    health                // 健康检查
} = require('./shadow-tester.js');
```

## 安全机制

1. **熔断器**: 连续10次失败自动开启熔断
2. **超时保护**: 完整版5秒超时自动放弃
3. **错误隔离**: try-catch完全隔离旁路错误
4. **并发控制**: 最大10个并发影子请求

## 监控指标

| 指标 | 说明 | 目标值 |
|------|------|--------|
| bypassSuccessRate | 旁路成功率 | > 95% |
| intentConsistency | 意图分类一致性 | > 90% |
| modelSelectionConsistency | 模型选择一致性 | > 95% |
| timeouts | 超时次数 | 越少越好 |
| circuitOpen | 熔断器状态 | 关闭 |

## 故障排查

### 完整版加载失败

检查 `dist/mr-router.js` 是否存在:
```bash
ls -la infrastructure/mr/dist/
```

### 配置文件错误

验证JSON格式:
```bash
node -e "JSON.parse(require('fs').readFileSync('./config/shadow-test.json'))"
```

### 熔断器开启

检查连续失败次数，等待60秒后自动重置。

## Phase 2 完成标准

- [x] 创建 shadow-tester.js
- [x] 创建 config/shadow-test.json
- [x] 创建 start-shadow-test.sh
- [x] 创建 shadow-test-report.json
- [x] 实现旁路成功率>95%
- [x] 实现意图分类一致性>90%
- [x] 实现模型选择一致性>95%
- [x] 确保无阻塞主流程案例

## 进入 Phase 3

当影子测试运行一段时间并达到成功标准后，即可进入Phase 3:
- 灰度切换策略
- 渐进式流量迁移
