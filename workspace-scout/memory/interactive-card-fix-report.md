# 飞书 Interactive Card 稳定送达路径 — 侦察报告

**验证时间**: 2026-03-07 10:37 CST  
**验证状态**: ✅ 3条路径全部成功送达  
**验证消息ID**: `om_x100b558d404a30a`, `om_x100b558d5f9deca`, `om_x100b558d5ccf84a`, `om_x100b558d5bffa0a`

---

## 一、已验证的3条可用路径

### PATH 1: 零代码 — Agent 回复自动转卡片 ⭐ 最简

**原理**: OpenClaw 飞书 outbound 适配器内置 `renderMode=auto`，当回复文本包含 markdown 表格或代码块时，自动使用 `sendMarkdownCardFeishu` 以 `msg_type=interactive` 发送。

**触发条件**: 文本中包含:
- 代码块: ` ```...``` `
- Markdown 表格: `|...|` + `|---|`

**代码路径**: 
```
Agent回复 → deliverOutboundPayloads → feishuOutbound.sendText 
→ shouldUseCard(text) → sendMarkdownCardFeishu → sendCardFeishu
→ POST /im/v1/messages (msg_type=interactive, schema 2.0)
```

**限制**: 
- 只有 markdown 内容区（无自定义 header/color/buttons）
- schema 2.0 格式，飞书自动渲染

**使用**: Agent 回复时包含一个表格即可:
```
| Agent | 状态 |
|-------|------|
| Scout | ✅   |
```

### PATH 2: 配置项 — renderMode=card

在 `openclaw.json` 中设置:
```json
{
  "channels": {
    "feishu": {
      "renderMode": "card"
    }
  }
}
```

**效果**: 所有飞书消息都以 markdown card 格式发送（不推荐，影响普通文本消息）。

### PATH 3: 独立模块 — feishu-card-sender ⭐ 推荐用于丰富卡片

**模块位置**: `/root/.openclaw/workspace/skills/feishu-card-sender/index.js`

**特点**:
- 完整控制: header(颜色/标题)、lark_md、hr、note、buttons
- Token 自动缓存 (110分钟)
- 自动推断 receive_id_type
- 支持 open_id (ou_xxx) 和 chat_id (oc_xxx)
- 从 openclaw.json 自动读取凭证

**API**:
```javascript
const { sendCard, sendTaskQueueCard, getCurrentSessionReceiveId } = require('./feishu-card-sender');

// 当前会话用户
const userId = getCurrentSessionReceiveId(); // → ou_a113e465324cc55f9ab3348c9a1a7b9b

// 发送任务队列看板
await sendTaskQueueCard({
  receiveId: userId,
  tasks: [
    { agent: 'Scout', task: '卡片路径验证', model: 'opus-4', status: 'running', duration: '5m' },
  ],
  risks: [{ agent: 'Coordinator', description: '向量服务延迟' }],
});

// 发送自定义卡片
await sendCard({
  receiveId: userId,
  card: {
    config: { wide_screen_mode: true },
    header: { title: { tag: 'plain_text', content: '📊 标题' }, template: 'blue' },
    elements: [
      { tag: 'div', text: { tag: 'lark_md', content: '**内容**' } },
      { tag: 'hr' },
      { tag: 'note', elements: [{ tag: 'plain_text', content: '脚注' }] }
    ]
  }
});
```

---

## 二、修复的阻塞问题

### 问题1: feishu-common 模块缺失
- **症状**: `feishu-evolver-wrapper/feishu-helper.js` 和 `report.js` 的 `require('../feishu-common/index.js')` 报错
- **修复**: 创建了 `/root/.openclaw/workspace/skills/feishu-common/index.js`，提供 `fetchWithAuth` + 自动 token 管理
- **验证**: feishu-helper.js 的 `sendCard` 已恢复工作 ✅

### 问题2: open_id 跨应用
- **症状**: delivery-queue 和 feishu-report-sender 中硬编码的 `ou_8eafdc7241d381d714746e486b641883` 是另一个飞书应用的 open_id
- **正确ID**: `ou_a113e465324cc55f9ab3348c9a1a7b9b` (当前应用 cli_a92f2a545838dcc8 对应的 open_id)
- **来源**: 从 `/root/.openclaw/agents/main/sessions/sessions.json` 的 `deliveryContext.to` 字段获取

### 问题3: dto-core 补丁未应用
- **位置**: `/root/.openclaw/workspace/skills/dto-core/patches/feishu-outbound.ts`
- **状态**: 这是一个提案补丁，给 outbound 添加 `sendCard` 方法。但实际 OpenClaw 已在 `outbound.ts` 中通过 `shouldUseCard` 实现了自动卡片转换，所以此补丁**不需要应用**。

---

## 三、最短落地改法

### 对于 main agent（发送任务队列看板卡片到当前会话）:

**方案A — 立即可用 (0改动)**: 
Agent 回复时包含 markdown 表格，系统自动转为 interactive card。

**方案B — 丰富卡片 (推荐)**: 
在 cron job 或 heartbeat 中调用:
```javascript
const { sendTaskQueueCard, getCurrentSessionReceiveId } = 
  require('/root/.openclaw/workspace/skills/feishu-card-sender/index.js');

await sendTaskQueueCard({
  receiveId: getCurrentSessionReceiveId(),
  tasks: [...],
  risks: [...],
});
```

**方案C — 全局卡片模式**: 
`openclaw.json` → `channels.feishu.renderMode: "card"`

---

## 四、关键发现

| 项目 | 值 |
|------|-----|
| 正确 open_id | `ou_a113e465324cc55f9ab3348c9a1a7b9b` |
| 正确 chat_id | `oc_4768948b56a7fc2c1be3077c9e7b26ce` |
| App ID | `cli_a92f2a545838dcc8` |
| renderMode 默认值 | `auto` (含表格/代码块时自动转卡片) |
| 飞书卡片 API | `POST /im/v1/messages` + `msg_type=interactive` |
| feishu-card-sender | `/root/.openclaw/workspace/skills/feishu-card-sender/index.js` |
| feishu-common | `/root/.openclaw/workspace/skills/feishu-common/index.js` (新建) |
