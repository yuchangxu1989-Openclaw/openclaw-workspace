# LEP 删除独立模块后的能力回迁说明

## 目标
将原先由 LEP 独立模块承载的最小可用韧性能力，回迁到 dispatcher / resilience / self-healing 主链，避免继续保留“LEP 独立中心”主路叙事。

## 本次回迁内容
1. `infrastructure/resilience/mainline-capabilities.js`
   - 新增主链最小能力实现：
     - retry/backoff
     - circuit breaker state
     - WAL append/query
     - trace jsonl
     - recovery trigger log
2. `infrastructure/dispatcher/dispatcher.js`
   - 接入主链 retry 执行
   - 接入 dispatcher 级 circuit breaker
   - 在 start/success/failure/circuit-open 写入 trace + WAL
   - 失败入 manual queue 时同步触发 recovery 记录
3. `infrastructure/resilience/resilient-dispatcher.js`
   - 在 handler disable / dispatch blocked 等场景写入主链 trace/WAL/recovery
4. `infrastructure/self-healing/cron-healer.js`
   - 修复与升级动作写入主链 trace/WAL
   - escalate 时写 recovery 记录

## 主链叙事调整
- 韧性能力的主入口改为：
  - dispatcher：执行与失败治理入口
  - resilience：熔断、追踪、WAL 等基础能力层
  - self-healing：恢复触发与升级治理层
- LEP 可保留为历史参考或兼容资产，但不再作为主链能力中心叙事。

## 产物位置
- WAL 默认目录：`infrastructure/resilience/wal/`
- Trace 默认文件：`infrastructure/resilience/trace.jsonl`
- Recovery 默认文件：`infrastructure/self-healing/recovery-log.jsonl`
- Circuit state：`infrastructure/resilience/circuit-state.json`

## 最小验证
运行：

```bash
node infrastructure/tests/resilience/test-mainline-capabilities.js
node infrastructure/tests/resilience/test-resilient-dispatcher.js
```

## 迁移备注
- 本次是“最小可用回迁”，先把主链闭环补齐，而不是完整复制 LEP 全量抽象。
- 后续若继续清理 LEP 资产，建议顺序：
  1. 删除主文档中的 LEP 中心化表述
  2. 将残余调用点逐步改名为 mainline resilience / dispatcher execution
  3. 对 `infrastructure/lep-core` 保留兼容层或归档
