# MR灰度切换方案 - 使用指南

## 概述

MR Phase 3 实现了渐进式上线机制，支持从MVP版平滑过渡到完整版MR，包含自动熔断和一键回滚功能。

## 文件结构

```
infrastructure/mr/
├── gradual-router.js          # 灰度路由器主模块
├── config/
│   └── rollout.json           # 灰度配置
└── scripts/
    ├── set-percentage.sh      # 设置灰度比例
    ├── check-health.sh        # 健康检查
    ├── rollback.sh            # 一键回滚
    └── emergency-stop.sh      # 紧急停止

monitoring/
└── metrics.json               # 监控数据
```

## 切换计划

| 阶段 | 时间 | 灰度比例 | 目标 |
|------|------|----------|------|
| Week 1 | 第1周 | 10% | 内部Agent测试 |
| Week 2 | 第2周 | 50% | 全量Agent测试 |
| Week 3 | 第3周 | 100% | 全面上线 |

## 使用方法

### 1. 设置灰度比例

```bash
# 进入脚本目录
cd infrastructure/mr/scripts

# 回滚到MVP版 (0%)
./set-percentage.sh 0

# Week 1: 10%灰度
./set-percentage.sh 10

# Week 2: 50%灰度
./set-percentage.sh 50

# Week 3: 100%上线
./set-percentage.sh 100
```

### 2. 健康检查

```bash
# 基础健康检查
./check-health.sh

# 详细模式
./check-health.sh --verbose

# JSON输出
./check-health.sh --json

# 静默模式 (仅返回状态码)
./check-health.sh --quiet
```

### 3. 一键回滚

```bash
# 交互式回滚
./rollback.sh

# 强制回滚
./rollback.sh --force

# 回滚并重置熔断器
./rollback.sh --reset

# 显示回滚后状态
./rollback.sh --status
```

### 4. 紧急停止

```bash
# 交互式紧急停止
./emergency-stop.sh

# 强制紧急停止
./emergency-stop.sh --force

# 紧急停止并清空白名单
./emergency-stop.sh --force --clear

# 带原因的紧急停止
./emergency-stop.sh --force --reason "严重bug"
```

## 配置说明

### rollout.json

```json
{
  "percentage": 0,              // 灰度比例 0-100
  "whitelist": [],              // 白名单Agent列表
  "blacklist": [],              // 黑名单Agent列表
  "fallback": "mvp",            // 失败回退策略
  "autoRollback": true,         // 是否启用自动熔断
  "circuitBreaker": {
    "enabled": true,            // 熔断器开关
    "errorThreshold": 5,        // 错误率阈值(%)
    "minRequests": 10,          // 最小触发请求数
    "cooldownMs": 30000,        // 熔断冷却时间
    "consecutiveErrors": 3      // 连续错误数阈值
  }
}
```

## 决策优先级

1. **黑名单** - 在黑名单中的Agent强制使用MVP版
2. **白名单** - 在白名单中的Agent强制使用完整版
3. **熔断器** - 熔断器打开时所有Agent使用MVP版
4. **百分比** - 根据配置的百分比随机分配

## 监控指标

### 查看指标

```javascript
const gradualRouter = require('./infrastructure/mr/gradual-router');

// 获取指标
const metrics = gradualRouter.getMetrics();
console.log(metrics);
```

### 指标内容

- **成功率对比** - MVP版 vs 完整版成功率
- **延迟对比** - P50/P95/P99延迟分位数
- **降级次数** - 回退到MVP版的次数
- **错误类型分布** - 各类错误发生次数
- **熔断次数** - 熔断器触发次数

## 自动熔断机制

### 触发条件

1. 错误率超过5%且请求数≥10
2. 连续3次请求失败

### 熔断行为

- 自动将灰度比例设为0%
- 30秒内拒绝所有完整版请求
- 30秒后进入半开状态

## 代码集成

```javascript
const { routeAndExecute } = require('./infrastructure/mr/gradual-router');

// 使用灰度路由器
const result = await routeAndExecute({
    agentId: 'agent-code-reviewer',
    description: '需要分析代码...',
    systemMessage: '你是一个代码审查助手',
    options: {
        timeoutMs: 60000
    }
});

// 结果包含版本信息
console.log(result._gradualRouter);
// {
//   version: 'mvp',        // 使用的版本
//   isFallback: false,     // 是否回退
//   totalLatency: 150      // 总延迟(ms)
// }
```

## 成功标准检查清单

- [ ] 灰度切换可平滑调整 (0%→10%→50%→100%)
- [ ] 回滚时间<30秒
- [ ] 自动熔断触发正确
- [ ] 监控数据完整
- [ ] 白名单覆盖工作正常
- [ ] 黑名单排除工作正常

## 故障排查

### 灰度比例不生效

1. 检查配置文件是否存在: `config/rollout.json`
2. 检查配置文件格式是否有效
3. 查看日志确认路由器已加载配置

### 熔断器误触发

1. 检查 `errorThreshold` 设置是否合理
2. 检查 `minRequests` 是否过小
3. 查看具体错误类型分布

### 完整版无法加载

1. 检查 `dist/mr-router.js` 是否存在
2. 检查文件是否有语法错误
3. 确认Node.js版本兼容

## 安全建议

1. **生产环境** - 始终保留MVP版作为回退
2. **变更管理** - 任何灰度比例变更需要记录
3. **监控告警** - 配置错误率告警
4. **应急预案** - 熟悉一键回滚流程

## 联系支持

如有问题，请联系:
- 技术负责人
- 运维团队
- 查看详细日志: `logs/emergency-stops.log`
