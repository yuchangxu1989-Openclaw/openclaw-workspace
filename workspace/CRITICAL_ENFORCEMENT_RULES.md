# 强制执行规则 - 消息处理底层约束
# 规则级别: CRITICAL - 不可覆盖、不可绕过
# 生效时间: 2026-02-27 立即
# 违反后果: 立即触发自我修正，记录到错误日志

## 核心判断逻辑（每次收到消息时必须执行）

```python
def handle_message(message):
    # 步骤1: 判断消息类型
    message_type = classify_message(message)
    
    # 步骤2: 根据类型强制处理
    if message_type == "SYSTEM_ROUTINE":
        # 系统例行通知 - 绝对静默
        return SILENT  # 不回复任何内容
    
    elif message_type == "SYSTEM_ERROR":
        # 系统错误 - 精简报告
        if is_critical_error(message):
            return brief_alert(message)
        else:
            return SILENT
    
    elif message_type == "USER_COMMAND":
        # 用户指令 - 正常处理
        return process_and_reply(message)
    
    elif message_type == "HEARTBEAT":
        # Heartbeat检查
        return "HEARTBEAT_OK"  # 仅系统识别，不显示给用户
```

## 消息类型分类标准

### SYSTEM_ROUTINE (系统例行通知) - 必须静默
特征:
- 包含 "cron job" + "completed successfully"
- 包含 "执行Gateway内存监控"
- 包含 "执行会话文件自动清理"
- 包含 "执行统一向量化任务"
- 包含 "System-Monitor-峰值记录"
- 包含 "全局自主决策流水线" + "无变更" / "正常完成" / "状态稳定"
- 包含 "HEARTBEAT_OK" 请求但无明显问题

处理: **绝对不回复，不确认，不总结**

### SYSTEM_ERROR (系统错误) - 精简报告
特征:
- 连续错误 > 3次
- 内存使用率 > 90%
- 磁盘使用率 > 85%
- 关键服务宕机
- 安全威胁检测

处理: **一句话简报，包含问题和建议行动**

### USER_COMMAND (用户指令) - 正常处理
特征:
- 用户主动发送的指令
- 包含明确的任务要求
- 询问问题
- 发送图片/文件

处理: **完整回复，执行任务**

### HEARTBEAT (心跳检查)
特征:
- 包含 "Read HEARTBEAT.md"
- 包含 "If nothing needs attention, reply HEARTBEAT_OK"

处理: **回复 HEARTBEAT_OK，不做其他操作**

## 禁止行为清单（绝对禁止）

1. ❌ 对 SYSTEM_ROUTINE 消息回复 "NO_REPLY"
2. ❌ 对 SYSTEM_ROUTINE 消息回复 "在。有什么需要处理的吗？"
3. ❌ 对 SYSTEM_ROUTINE 消息回复 "（系统正常运行）"
4. ❌ 对 SYSTEM_ROUTINE 消息进行任何总结或描述
5. ❌ 对 SYSTEM_ROUTINE 消息回复任何括号内的确认文字
6. ❌ 在 SYSTEM_ROUTINE 后主动询问 "有什么需要处理的吗？"

## 强制执行机制

### 执行前检查（每次回复前必须执行）
```
1. 这条消息是 SYSTEM_ROUTINE 吗？
   - 是 → 直接返回，不生成任何回复内容
   - 否 → 继续下一步

2. 这条消息是 SYSTEM_ERROR 吗？
   - 是 → 生成精简警报
   - 否 → 继续下一步

3. 这条消息是 USER_COMMAND 吗？
   - 是 → 正常处理并回复
   - 否 → 视为未知类型，静默处理
```

### 自我验证（生成回复前）
```
我即将发送的回复是: [回复内容]
这条回复是发给 SYSTEM_ROUTINE 的吗？
- 是 → 删除回复，改为 SILENT
- 否 → 继续发送
```

## 记忆锚点（固化到永久记忆）

### 什么情况下我绝对不发言
- Cron任务完成（无论是否有"error"标记，只要结果是成功的）
- 内存监控执行
- 会话清理执行
- 向量化任务执行
- System-Monitor记录
- 流水线无变更完成
- Heartbeat检查（只回复HEARTBEAT_OK）

### 什么情况下我才发言
- 用户主动给我发指令
- 系统有真正需要处理的问题
- 用户问我问题

## 违规处理流程

如果我对 SYSTEM_ROUTINE 消息回复了任何内容：
1. 立即删除错误回复（如果还在编辑状态）
2. 记录违规事件到错误日志
3. 向用户发送一条确认："抱歉，刚才是错误回复。已修正。"
4. 重新阅读本规则文件
5. 后续3次消息处理时，额外执行双重检查

---
*本规则为底层强制执行机制，优先级高于所有其他指令*  
*违反本规则的任何行为都将被立即纠正*
