# 文档质量门禁 - 执行状态机

## 触发条件
主Agent判断任务涉及：重大决策文档、重要报告、架构方案、评测基线

## 前置检查
派发文档任务前，执行感知探针：
```bash
bash /root/.openclaw/workspace/scripts/doc-quality-gate-hook.sh "任务描述"
```
若输出 `QUALITY_GATE_REQUIRED`，必须走以下状态机。

## 状态机

```
STATE_1: WRITE
  action: sessions_spawn(agentId=writer, task=文档撰写任务)
  next: STATE_2

STATE_2: REVIEW
  trigger: writer完成
  action: sessions_spawn(agentId=reviewer, task=质量审查+逐项检查)
  if: 通过 → STATE_5
  if: 不通过 → STATE_3

STATE_3: REWRITE
  action: sessions_spawn(agentId=从[coder,analyst,scout]中选一个不同于上次的, task=基于reviewer反馈重写)
  retry_count += 1
  if: retry_count > 2 → STATE_4
  next: STATE_2

STATE_4: ESCALATE
  action: 通知用户"3轮未通过质量门禁"，附上reviewer最新反馈

STATE_5: DONE
  action: 通知用户文档已通过质量审查
```

## 状态追踪
每次进入状态机时，更新 `doc-quality-gate-state.json` 中的 `active_gates` 数组。
完成或升级后从数组中移除。

## 审查清单（reviewer 使用）
1. 结构完整性：标题层级、段落逻辑
2. 内容准确性：数据、结论有据可查
3. 可操作性：读者能据此行动
4. 格式规范：符合飞书文档排版要求
5. 无遗漏：需求中的每个要点都有覆盖
