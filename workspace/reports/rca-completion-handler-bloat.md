# RCA：completion-handler.sh 输出膨胀导致主Agent会话卡顿

- 日期：2026-03-08
- 负责人：Subagent（depth 1/2）
- 影响范围：`completion-handler.sh`、`register-task.sh` 调用链中的重试信息输出

## 1) 现象与影响

每次触发 `completion-handler.sh` 时，主Agent会收到大量日志输出（历史上可达 400+ 行，常见为重试队列全量明细与建议项）。

影响：
- 主Agent需要额外 token 解析无关细节
- completion 事件处理时延上升
- 用户端感知为“卡顿/等待变久”

## 2) 根因分析（RCA）

### 直接根因
- completion 流程中夹带了“重试明细级”输出，导致每次 completion 事件都把同一批 pending 任务重复打印。
- register 流程中同样可能带出重试相关冗长输出，形成叠加噪音。

### 机制性根因
- **职责边界不清**：
  - `completion-handler.sh` 的职责应是“收口状态 + 给出是否有重试积压的信号”；
  - 重试明细应属于 `retry-dispatcher.sh` 的显式操作场景。
- **输出分级缺失**：
  - 未区分“默认摘要输出”与“按需详细输出”，导致默认路径承载了过多信息。

## 3) 修复方案

### 目标
将 completion/register 默认输出统一收敛为一行摘要：

`🔄 当前有N条任务待重试`

详细重试列表仅在显式执行 `retry-dispatcher.sh` 时输出。

### 实施改动

#### A. `/root/.openclaw/workspace/scripts/completion-handler.sh`
- 保留重试队列检测逻辑（读取 `retry-queue.json` 并统计 `status=pending`）。
- 删除/避免任何逐条任务或附加建议性明细输出。
- 仅在 `N>0` 时输出单行：
  - `🔄 当前有N条任务待重试`

#### B. `/root/.openclaw/workspace/scripts/register-task.sh`
- 新增重试队列摘要检测（同样统计 pending 数）。
- 仅输出单行摘要，不输出明细。
- 继续保留原有登记、看板展示与推送逻辑。

## 4) 预期效果

- completion/register 两条高频路径显著减小输出体积。
- 主Agent在 completion 事件上的 token 消耗与解析时延下降。
- 用户等待时长缩短，交互更稳定。

## 5) 回归验证建议

1. 构造 `retry-queue.json` 含 10~20 条 `pending` 记录。
2. 执行：
   - `bash scripts/completion-handler.sh <task> done "ok"`
   - `bash scripts/register-task.sh <id> <label> <agent> <model> "desc"`
3. 预期：
   - 两脚本均仅出现一行重试摘要：`🔄 当前有N条任务待重试`
   - 不出现每条任务详情。
4. 显式执行 `bash scripts/retry-dispatcher.sh`，确认详细列表仍可查看（职责下沉正确）。

## 6) 防再发措施

- 约定：默认路径只允许摘要级日志，明细级日志必须挂在显式命令。
- 在脚本注释中保留职责说明，避免后续改动回流到“默认明细输出”。
