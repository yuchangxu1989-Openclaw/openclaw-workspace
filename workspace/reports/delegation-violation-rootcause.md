# 主Agent"亲力亲为"违规根因分析

## 一句话结论

主Agent反复违反委派铁律的根因不是规则不够多，而是**规则全部停留在提示词层，执行层零拦截**——OpenClaw明确支持per-agent tool policy（`tools.allow`/`tools.deny`），但主Agent配置为 `tools.allow: ["*"]`，等于门户大开。

## 背景与目标

- 主Agent（战略家）被定义为战略指挥官，应只做决策/通信/读取，实现性工作委派子Agent
- AGENTS.md和SOUL.md中已写了ISC-MAIN-AGENT-DELEGATION-001铁律、exec计数红线、修改型命令黑名单等大量规则
- 但主Agent仍反复亲自写代码/写文档/执行长脚本，用户至少纠偏5次

## 根因分析

### 第一层：认知规则的本质缺陷

AGENTS.md中有关委派的规则已超过**500行**，包括：
- ISC-MAIN-AGENT-DELEGATION-001铁律
- exec调用计数红线（≥3次停）
- 修改型命令黑名单（sed -i, tee, >, >>）
- feishu_doc写操作黑名单
- 自检问题清单（4条）
- 量化自检规则

**问题**：这些全是"提示词规则"——依赖LLM在每次工具调用前"记得"检查。LLM的注意力是概率性的，规则越多，单条规则被忽略的概率越高。这是**规则膨胀悖论**：规则越多→提示词越长→注意力越分散→违反率越高。

### 第二层：缺乏程序化守卫

OpenClaw提供了完善的**tool policy机制**：
- `agents.list[].tools.allow` — 白名单，只列出的工具可用
- `agents.list[].tools.deny` — 黑名单，列出的工具被硬性阻止
- deny优先于allow
- 这是**硬性停止**（hard stop），LLM无法绕过

但主Agent当前配置：
```json
{
  "id": "main",
  "tools": {
    "allow": ["*"]  // 所有工具都允许，零限制
  }
}
```

等于有锁不上，有门不关。

### 第三层：白名单vs黑名单策略选择

对主Agent应采用**白名单策略**：只允许它需要的工具，其余全部阻止。这比黑名单更安全——忘记禁一个工具不会导致泄漏。

## 解决方案：Tool Policy硬限制

### 主Agent应该拥有的工具（白名单）

| 类别 | 工具 | 理由 |
|------|------|------|
| 读取 | `read` | 读文件做判断 |
| 通信 | `message` | 与用户通信 |
| 委派 | `sessions_spawn`, `subagents` | 派发和管理子Agent |
| 验证 | `exec` | 快速验证命令（≤3行） |
| 状态 | `sessions_list`, `sessions_history` | 查看任务状态 |
| 飞书读取 | `feishu_doc`(仅read), `feishu_wiki`, `feishu_drive`, `feishu_bitable_*` | 读取信息 |
| 搜索 | `web_search`, `web_fetch` | 信息获取 |
| 浏览器 | `browser`, `canvas` | UI查看 |
| 节点 | `nodes` | 设备控制 |
| TTS | `tts` | 语音 |

### 主Agent应该被禁止的工具（deny列表）

| 工具 | 理由 |
|------|------|
| `write` | 写文件=实现性工作 |
| `edit` | 编辑文件=实现性工作 |

### 推荐配置

```json
{
  "id": "main",
  "tools": {
    "deny": ["write", "edit"]
  }
}
```

用deny而非收窄allow，原因：
1. 主Agent确实需要大部分工具（读取、通信、飞书等）
2. 核心问题只是`write`和`edit`——这两个是"写代码/写文档"的直接入口
3. `exec`不能完全禁止（需要执行验证命令和脚本调用），但exec的滥用通过提示词规则已有一定约束

### exec的额外约束

exec无法通过tool policy做细粒度限制（不能限制"只允许读取型命令"），因此exec仍需依赖提示词规则。但禁掉write/edit后，主Agent即使通过exec做`sed -i`或`tee`，也只是绕过——可以考虑未来通过exec的`security`参数或sandbox的allowlist进一步收紧。

## 为什么之前的规则不管用

| 层级 | 机制 | 可靠性 | 现状 |
|------|------|--------|------|
| 提示词层 | AGENTS.md规则 | 概率性，随注意力衰减 | 500+行，过度膨胀 |
| 配置层 | tool policy | 确定性，硬性阻止 | **未启用** |
| 代码层 | pre-commit hook等 | 确定性，事后拦截 | 部分存在但不针对此问题 |

**正确的防线优先级**：配置层（硬拦截）> 代码层（事后检查）> 提示词层（自律提醒）

## 建议的提示词精简

启用tool policy后，AGENTS.md中以下段落可以大幅精简：
- 修改型命令黑名单 → 由tool policy自动执行
- feishu_doc写操作黑名单 → 改为tool policy deny
- 量化自检规则中与write/edit相关的部分 → 不需要了，工具直接不可用

保留的提示词规则（仍有价值）：
- exec计数红线（工具可用但应克制使用）
- "做判断还是做实现"的自检问题
- spawn后register-task.sh的流程

## 风险与待确认

1. **feishu_doc的write/append**：tool policy是按工具名deny的，`feishu_doc`是一个工具带多个action。deny `feishu_doc`会把read也禁掉。建议：保持feishu_doc可用，write/append限制仍靠提示词。或者看OpenClaw是否支持action级别的deny。
2. **exec绕过**：主Agent仍可通过exec执行`echo "xxx" > file.js`。完全杜绝需要sandbox+allowlist，但可能影响正常验证操作。当前阶段先靠deny write/edit解决80%问题。
3. **紧急情况**：如果确实需要主Agent直接改文件（如灾难恢复），deny会阻止。可通过`/exec`命令临时调整。

## 下一步

1. ✅ 配置tool policy deny write/edit（本次执行）
2. 精简AGENTS.md中冗余的提示词规则（减少到核心3条）
3. 监控1周，统计违反率是否归零
4. 如exec绕过仍是问题，升级为sandbox allowlist
