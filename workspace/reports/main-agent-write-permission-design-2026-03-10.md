# 主Agent写权限控制方案

> 设计日期：2026-03-10
> 设计者：analyst (系统架构师)
> 状态：待实施

---

## 1. 问题定义

### 现状
主Agent(main)当前配置：
```json
{
  "id": "main",
  "tools": {
    "deny": ["write", "edit"]
  }
}
```

已封堵：`write`（创建/覆盖文件）、`edit`（精确编辑文件）。

### 未封堵的写入通道（漏洞清单）

| 漏洞 | 工具 | 危害 | 严重度 |
|------|------|------|--------|
| exec写命令 | `exec` (sed -i, tee, >, rm, mv) | 绕过write/edit限制直接改文件 | P0 |
| apply_patch | `apply_patch` | 等效于edit，可批量改文件 | P0 |
| 飞书文档写入 | `feishu_doc` (write/append/insert/create/update_block/delete_block等) | 直接改飞书文档 | P1 |
| 飞书表格写入 | `feishu_bitable_create_record/update_record/create_field/create_app` | 直接改飞书表格 | P1 |
| 飞书知识库写入 | `feishu_wiki` (create/move/rename) | 直接改知识库结构 | P2 |
| 飞书云盘写入 | `feishu_drive` (create_folder/move/delete) | 直接改云盘结构 | P2 |
| 浏览器操作 | `browser` (act) | 通过浏览器执行任意写操作 | P2 |
| Canvas操作 | `canvas` (eval/a2ui_push) | 执行任意JS | P2 |

### 为什么认知规则不够

历史上多次尝试通过AGENTS.md/SOUL.md中的认知规则限制主Agent写操作，均失败：
- LLM不稳定遵守"不要用exec写文件"这类软约束
- 上下文窗口长了之后规则容易被遗忘
- 子Agent继承的prompt中不一定包含这些限制
- **结论：必须通过openclaw.json的tools配置做硬限制**

---

## 2. 方案设计

### 2.1 核心原则

**主Agent = 大脑，不是手。** 主Agent负责思考、决策、调度、通信。所有"动手"操作委派给子Agent。

### 2.2 主Agent能力矩阵

#### ✅ 必须保留的能力

| 能力 | 工具 | 用途 |
|------|------|------|
| 读取文件 | `read` | 读代码、读配置、读记忆文件 |
| 执行只读命令 | `exec` | ls, cat, grep, wc, git log, git status, find等 |
| 派遣子Agent | `sessions_spawn` | 委派所有写操作给子Agent |
| 管理子Agent | `subagents` | list/steer/kill子Agent |
| 查看会话 | `sessions_list`, `sessions_history` | 查看子Agent状态和历史 |
| 发送消息 | `message` | 与用户通信（飞书/Discord等） |
| 搜索网页 | `web_search`, `web_fetch` | 信息检索 |
| 会话状态 | `session_status` | 获取时间等元信息 |
| 飞书文档读取 | `feishu_doc` (read/list_blocks/get_block) | 读取飞书文档内容 |
| 飞书表格读取 | `feishu_bitable_get_meta/list_fields/list_records/get_record` | 读取飞书表格 |
| 飞书知识库读取 | `feishu_wiki` (spaces/nodes/get/search) | 浏览知识库 |
| 飞书云盘读取 | `feishu_drive` (list/info) | 浏览云盘 |
| 飞书聊天信息 | `feishu_chat` | 获取群成员等信息 |
| 飞书权限查看 | `feishu_app_scopes` | 调试权限问题 |
| TTS | `tts` | 语音回复 |

#### ❌ 必须禁止的能力

| 能力 | 工具 | 替代方案 |
|------|------|----------|
| 创建/覆盖文件 | `write` | spawn子Agent执行 |
| 精确编辑文件 | `edit` | spawn子Agent执行 |
| 批量补丁 | `apply_patch` | spawn子Agent执行 |
| 飞书文档写入 | `feishu_doc` (write/append/insert/create等) | spawn子Agent执行 |
| 飞书表格写入 | `feishu_bitable_create_record/update_record/create_field/create_app` | spawn子Agent执行 |
| 飞书知识库写入 | `feishu_wiki` (create/move/rename) | spawn子Agent执行 |
| 飞书云盘写入 | `feishu_drive` (create_folder/move/delete) | spawn子Agent执行 |
| 浏览器操作 | `browser` | spawn子Agent执行 |
| Canvas操作 | `canvas` | spawn子Agent执行 |

### 2.3 exec的特殊处理

exec是最大的漏洞——它既是必需的（读操作），又是危险的（写操作）。

**OpenClaw的tools.deny机制只能deny整个工具，不能deny工具的某些参数/用法。** 因此exec不能简单deny。

#### 方案A：deny exec + 全部委派（推荐度：⭐⭐）

```json
"tools": {
  "deny": ["write", "edit", "apply_patch", "exec", "process",
           "feishu_bitable_create_record", "feishu_bitable_update_record",
           "feishu_bitable_create_field", "feishu_bitable_create_app",
           "browser", "canvas"]
}
```

- 优点：彻底封堵exec写入漏洞
- 缺点：主Agent连`ls`、`cat`、`grep`都不能用，严重影响效率。每次读文件只能用`read`工具（不支持glob、不支持管道）

#### 方案B：保留exec + sandbox allowlist模式（推荐度：⭐⭐⭐⭐⭐）

为主Agent启用sandbox隔离 + exec allowlist，只允许只读命令：

```json
{
  "id": "main",
  "tools": {
    "deny": ["write", "edit", "apply_patch",
             "feishu_bitable_create_record", "feishu_bitable_update_record",
             "feishu_bitable_create_field", "feishu_bitable_create_app",
             "browser", "canvas"]
  },
  "sandbox": {
    "mode": "all",
    "scope": "agent"
  }
}
```

同时配置 `~/.openclaw/exec-approvals.json` 中主Agent的策略：

```json
{
  "agents": {
    "main": {
      "security": "allowlist",
      "ask": "off",
      "askFallback": "deny",
      "allowlist": []
    }
  }
}
```

- exec在sandbox内运行 → 只能访问workspace目录
- 需要主机执行时走allowlist → 只允许白名单命令
- 重定向（`>`）和链式命令（`;`, `&&`）在allowlist模式下被自动拒绝
- 优点：exec可用但被sandbox限制，写操作被物理隔离
- 缺点：需要启用sandbox（Docker），增加资源开销；sandbox内的exec仍可写sandbox内的文件

#### 方案C：保留exec + 认知规则兜底 + deny其他写工具（推荐度：⭐⭐⭐）

```json
{
  "id": "main",
  "tools": {
    "deny": ["write", "edit", "apply_patch",
             "feishu_bitable_create_record", "feishu_bitable_update_record",
             "feishu_bitable_create_field", "feishu_bitable_create_app",
             "browser", "canvas"]
  }
}
```

exec保留但通过AGENTS.md认知规则约束（作为最后一道防线，不作为主要依赖）。

- 优点：简单，不需要sandbox
- 缺点：exec写入漏洞仍存在（sed -i, tee, >），依赖认知规则

#### 方案D：保留exec + allow白名单模式（推荐度：⭐⭐⭐⭐）

使用`tools.allow`白名单代替`tools.deny`黑名单：

```json
{
  "id": "main",
  "tools": {
    "allow": [
      "read", "exec", "process",
      "sessions_spawn", "sessions_list", "sessions_history", "session_status",
      "subagents",
      "message",
      "web_search", "web_fetch",
      "feishu_doc", "feishu_bitable_get_meta", "feishu_bitable_list_fields",
      "feishu_bitable_list_records", "feishu_bitable_get_record",
      "feishu_wiki", "feishu_drive", "feishu_chat", "feishu_app_scopes",
      "tts"
    ]
  }
}
```

- 优点：白名单比黑名单安全（新增工具默认不可用）；不需要sandbox
- 缺点：
  - `feishu_doc`是一个工具包含读写两种action，allow了就全allow了
  - `feishu_wiki`同理（spaces/nodes/get/search是读，create/move/rename是写）
  - `feishu_drive`同理（list/info是读，create_folder/move/delete是写）
  - exec写入漏洞仍存在
  - 需要维护白名单（新增只读工具时需要手动加入）

---

## 3. 推荐方案：方案C增强版

综合考虑实施成本、系统稳定性、防护效果，推荐**方案C增强版**：

### 3.1 openclaw.json 配置变更

将主Agent的tools配置从：
```json
{
  "id": "main",
  "tools": {
    "deny": ["write", "edit"]
  }
}
```

改为：
```json
{
  "id": "main",
  "tools": {
    "deny": [
      "write",
      "edit",
      "apply_patch",
      "feishu_bitable_create_record",
      "feishu_bitable_update_record",
      "feishu_bitable_create_field",
      "feishu_bitable_create_app",
      "browser",
      "canvas"
    ]
  }
}
```

### 3.2 feishu_doc / feishu_wiki / feishu_drive 的处理

这三个工具的读写操作混在同一个工具名下，无法通过tools.deny区分action。

**两个选择：**

**选择A（保守）：deny这三个工具，主Agent读飞书也要委派子Agent**
```json
"deny": [..., "feishu_doc", "feishu_wiki", "feishu_drive"]
```
- 代价：主Agent不能直接读飞书文档，每次都要spawn子Agent读
- 收益：彻底封堵飞书写入

**选择B（务实）：保留这三个工具，通过认知规则限制写action**
- 代价：飞书写入漏洞仍存在（依赖认知规则）
- 收益：主Agent可以直接读飞书文档，效率高

**推荐选择B**，理由：
1. 主Agent频繁需要读飞书文档（评测标准、需求文档等），每次spawn子Agent读取太低效
2. 飞书写入的危害远小于文件系统写入（飞书有版本历史可回滚）
3. 认知规则对飞书写入的约束比对exec的约束更可靠（飞书写入需要明确的action参数，不像exec那样隐蔽）

### 3.3 exec写入的处理

exec是唯一无法通过tools.deny完美解决的漏洞。

**短期方案（立即实施）：**
- 在主Agent的AGENTS.md中添加硬性认知规则（作为兜底，不作为唯一依赖）
- 规则内容：`禁止使用exec执行任何写操作（sed -i, tee, >, >>, rm, mv, cp, mkdir, touch, chmod, chown）。所有写操作必须spawn子Agent执行。`

**中期方案（建议OpenClaw支持后实施）：**
- 如果OpenClaw未来支持per-agent `tools.exec.security = "allowlist"`（非sandbox模式下），可以配置只允许只读命令
- 或者如果OpenClaw支持tool-level action过滤（如 `deny: ["exec:write"]`），可以更精细控制

**长期方案（如果exec漏洞频繁被利用）：**
- 启用主Agent的sandbox隔离（方案B），彻底隔离文件系统写入
- 代价是需要Docker + 资源开销

### 3.4 不受影响的功能清单（验证矩阵）

| 功能 | 依赖工具 | 是否受影响 | 说明 |
|------|----------|-----------|------|
| 飞书通信 | message | ❌ 不受影响 | message不在deny列表 |
| spawn子Agent | sessions_spawn | ❌ 不受影响 | |
| 管理子Agent | subagents | ❌ 不受影响 | |
| 读取文件 | read | ❌ 不受影响 | |
| 执行只读命令 | exec | ❌ 不受影响 | exec未被deny |
| 读飞书文档 | feishu_doc | ❌ 不受影响 | feishu_doc未被deny |
| 读飞书表格 | feishu_bitable_list_records等 | ❌ 不受影响 | 只读工具未被deny |
| 搜索网页 | web_search/web_fetch | ❌ 不受影响 | |
| heartbeat | message + read + exec | ❌ 不受影响 | |
| 写文件 | write/edit | ✅ 被阻止 | 需spawn子Agent |
| 写飞书表格 | feishu_bitable_create/update | ✅ 被阻止 | 需spawn子Agent |
| 浏览器操作 | browser | ✅ 被阻止 | 需spawn子Agent |

---

## 4. 实施步骤

### Step 1：修改openclaw.json（需用户手动执行或授权）

```bash
openclaw config set 'agents.list[0].tools.deny' '["write","edit","apply_patch","feishu_bitable_create_record","feishu_bitable_update_record","feishu_bitable_create_field","feishu_bitable_create_app","browser","canvas"]'
```

或者直接编辑openclaw.json，将main agent的tools.deny扩展为上述列表。

### Step 2：重启gateway使配置生效

```bash
openclaw gateway restart
```

### Step 3：验证配置

主Agent会话中测试：
1. `read` 工具 → 应正常工作
2. `exec` 运行 `ls -la` → 应正常工作
3. `write` 工具 → 应被拒绝
4. `edit` 工具 → 应被拒绝
5. `feishu_bitable_create_record` → 应被拒绝
6. `browser` → 应被拒绝
7. `message` 发消息 → 应正常工作
8. `sessions_spawn` → 应正常工作

### Step 4：更新主Agent的AGENTS.md认知规则（兜底）

在主Agent的AGENTS.md中添加：
```markdown
## ⚠️ exec写操作禁令（认知兜底）
- 禁止使用exec执行任何文件写操作：sed -i, tee, >, >>, rm, mv, cp写入, mkdir, touch, chmod, chown
- 禁止使用exec执行 python/node/bash 脚本来写文件
- 所有写操作必须通过 sessions_spawn 委派给子Agent
- 此规则是tools.deny的补充兜底，不是唯一防线
```

---

## 5. 已知限制与风险

| 限制 | 影响 | 缓解措施 |
|------|------|----------|
| exec写入无法通过tools.deny阻止 | 主Agent仍可通过exec -i/tee/>写文件 | 认知规则兜底 + 未来sandbox方案 |
| feishu_doc读写不可分离 | 保留feishu_doc意味着写action也可用 | 认知规则兜底 + 飞书版本历史可回滚 |
| feishu_wiki/feishu_drive同上 | 保留意味着create/move/delete也可用 | 认知规则兜底 |
| 新增工具可能绕过deny | 未来新增的写工具不在deny列表中 | 定期审计deny列表 |

---

## 6. 未来演进

1. **OpenClaw功能请求：tool action级别的deny** — 如果支持 `deny: ["feishu_doc.write", "feishu_doc.append"]` 这样的语法，可以精确控制
2. **OpenClaw功能请求：per-agent exec security** — 如果支持 `agents.list[].tools.exec.security = "allowlist"`（非sandbox模式），可以限制exec只运行只读命令
3. **sandbox方案备选** — 如果exec漏洞被频繁利用，启用主Agent sandbox隔离
4. **审计机制** — 定期检查主Agent的exec历史，发现写操作立即告警

---

## 附录：完整配置对比

### 变更前
```json
{
  "id": "main",
  "tools": {
    "deny": ["write", "edit"]
  }
}
```

### 变更后
```json
{
  "id": "main",
  "tools": {
    "deny": [
      "write",
      "edit",
      "apply_patch",
      "feishu_bitable_create_record",
      "feishu_bitable_update_record",
      "feishu_bitable_create_field",
      "feishu_bitable_create_app",
      "browser",
      "canvas"
    ]
  }
}
```

封堵了6个额外的写入通道，剩余漏洞（exec写命令、feishu_doc/wiki/drive写action）通过认知规则兜底。
