# RCA：主Agent“口头说badcase”但未调用harvest入库

日期：2026-03-08  
作者：subagent

## 1) 根因分析

### 现象复述
主Agent在回复中出现“这是badcase/又是同一个badcase”等口头判断，但并未同步执行 `auto-badcase-harvest.sh`，导致：
- 口头承认与系统记账脱节
- 用户追问后才补录
- 同类错误反复出现，闭环延迟

### 根因拆解

1. **语义动作与系统动作分离（非原子）**  
   “说 badcase”只是自然语言输出，不等于系统状态变更；当前链路没有把“判定badcase”绑定为必执行副作用。

2. **触发机制依赖记忆与自觉**  
   现状是“想到就执行harvest”，属于人脑记忆触发，不是程序化触发；在高并发/多步骤回复里极易遗漏。

3. **缺少流程硬闸（hard gate）**  
   completion-handler 仅“检测关键词并提示”，没有“检测到即自动入库”的强制动作，导致提示不落地。

4. **缺少最小可审计反馈**  
   之前stdout没有明确“已自动入库ID”反馈，主链路难以一眼确认是否已落库，漏执行不易被即时发现。

## 2) 根治方案（原子化设计）

### 目标
把“识别badcase”与“入库badcase”做成**同一事务链**：检测到→立即入库→返回入库ID。

### 方案选择
在 `completion-handler.sh` 中落地自动化（而非依赖主Agent记忆）：
- 对 summary 做 badcase关键词检测
- 命中后立即调用 `auto-badcase-harvest.sh`
- 生成唯一 `HARVEST_ID`
- stdout输出“🧷 已自动Badcase入库: <id>”

该方案的优势：
- 与任务收口点绑定，覆盖所有子任务完成事件
- 不依赖主Agent在对话时“记得再执行一条命令”
- 可审计、可回放（日志+stdout双证据）

## 3) 实施改动

已修改文件：
- `/root/.openclaw/workspace/scripts/completion-handler.sh`

关键改动：
1. 新增变量：`HARVESTED`、`HARVEST_ID`
2. 保留原关键词检测，但从“仅提示”升级为“提示+自动入库”
3. 入库字段标准化：
   - category: `自主性缺失类`
   - description: 包含 task/status/summary
   - wrong_chain/correct_chain/root_cause 固化模板
4. stdout新增入库确认行，便于主Agent/用户即时看到是否已落库

## 4) 验证

执行：
```bash
bash /root/.openclaw/workspace/scripts/completion-handler.sh test-badcase-auto failed "这是badcase，第N次同类问题，手动触发"
```

实际输出包含：
- `🧷 已自动Badcase入库: auto-test-badcase-auto-20260308222949`

说明“检测→入库→回显”链路已打通。

## 5) 对“register-task按label失败次数自动入库”的评估

可作为增强项，但不应替代本次原子绑定：
- 优点：可抓“未显式说badcase”的重复失败模式
- 局限：滞后触发（至少第2次失败后）

建议后续做二级策略：
- 一级（已实现）：completion summary命中badcase语义立即入库
- 二级（后续可加）：同label在窗口期内 failed/timeout≥2 自动补充入库

## 6) 结论

本问题本质是**“口头语义”和“系统记账”未绑定**。已通过 completion-handler 的自动harvest实现强制原子化，消除“说了但没做”的断裂路径，满足根治要求。
