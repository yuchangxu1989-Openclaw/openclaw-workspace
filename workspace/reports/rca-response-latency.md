# 主Agent响应卡顿根因分析报告

## 1. 现象
- 时间点：2026-03-08 20:55（GMT+8）
- 表现：用户发消息后，主Agent长时间未回应，用户感知明显卡顿。
- 关联行为：completion event触发后，`completion-handler.sh`执行链路较重、输出量大。

## 2. 根因分析

### 根因A：completion-handler输出膨胀
`/root/.openclaw/workspace/scripts/completion-handler.sh` 每次completion都会执行多步骤并输出大量文本：
1. 更新任务状态
2. 输出看板
3. 超时扫描
4. 嵌入重试队列详情输出

其中第4项会触发`retry-dispatcher.sh`打印全量待重试项（当前约16条），每条含多行建议，导致单次completion输出可达约200+行。

### 根因B：重试队列重复全量打印（高噪音）
`retry-dispatcher.sh`在被handler调用时，每次都输出全部pending任务的重试建议，即使队列无变化。
这造成：
- 重复信息占据绝大多数输出
- completion事件越频繁，冗余输出越多

### 根因C：主Agent token处理负载增加
大块stdout需要被主Agent读取、解析、拼接上下文，直接提升token处理成本与响应等待时间，形成用户感知“卡顿”。

## 3. 影响评估
- **用户体验**：首响延迟上升，交互不流畅。
- **系统效率**：主Agent在无效信息上消耗上下文与推理预算。
- **稳定性风险**：高频completion时，输出风暴会放大排队与处理延迟。

## 4. 已实施修复

### 修复1：completion-handler改为“重试摘要输出”
文件：`/root/.openclaw/workspace/scripts/completion-handler.sh`

调整：
- 移除每次completion中对`retry-dispatcher.sh`的全量详情调用。
- 改为仅输出摘要：
  - 当前待重试总数
  - 是否有“新近超时”进入队列（3分钟窗口）
  - 提示主Agent按需显式运行`retry-dispatcher.sh`查看详情

效果：将原80+行重试详情降为2~3行摘要提示。

### 修复2：retry-dispatcher支持摘要模式，详情仅显式调用
文件：`/root/.openclaw/workspace/scripts/retry-dispatcher.sh`

调整：
- 新增`--summary`模式，仅打印队列统计（pending/dispatched/done）。
- 默认`detail`模式保留原能力（全量重试建议），用于人工显式排障/派发。
- 不再依赖completion-handler隐式触发详情输出。

效果：重试详情从“每次completion自动刷屏”转为“需要时才看”。

## 5. 进一步建议
1. **看板输出分层**：默认简版，详细版通过参数开启（如`--verbose`）。
2. **输出预算控制**：completion handler设置行数/字符上限，超过则折叠为摘要。
3. **事件去重**：同一批pending重试项若无变化，不重复提示。
4. **观测指标**：记录handler耗时、stdout字节数、主Agent首响延迟，建立回归告警。

## 6. 结论
本次卡顿的直接根因是completion链路中的高冗余输出（尤其重试队列全量重复打印）导致主Agent处理负担增加。通过“默认摘要 + 显式详情”已完成降噪修复，可显著降低completion事件对主响应时延的影响。
