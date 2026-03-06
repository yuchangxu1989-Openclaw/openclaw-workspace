# shared — 共享工具模块

**类型**: 内部共享库（非独立技能）  
**角色**: 提供跨技能复用的路径常量和工具函数

---

## 用途

`shared` 不是独立的技能，而是供其他技能 `require` 的公共工具包。

### 目前提供的模块

#### `paths.js` — 标准路径常量

```javascript
const { WORKSPACE, SKILLS_DIR, REPORTS_DIR, MEMORY_DIR, SECRETS_DIR } = require('../shared/paths');
```

| 常量 | 说明 | 默认值 |
|------|------|--------|
| `OPENCLAW_HOME` | OpenClaw 根目录 | `/root/.openclaw` |
| `WORKSPACE` | 工作区目录 | `$HOME/workspace` |
| `SKILLS_DIR` | 技能目录 | `workspace/skills` |
| `REPORTS_DIR` | 报告目录 | `workspace/reports` |
| `MEMORY_DIR` | 记忆目录 | `workspace/memory` |
| `SECRETS_DIR` | 密钥目录 | `.openclaw/.secrets` |
| `MEDIA_DIR` | 媒体目录 | `.openclaw/media` |
| `AGENTS_DIR` | Agent目录 | `.openclaw/agents` |
| `CRON_DIR` | 任务目录 | `.openclaw/cron` |

所有路径均可通过环境变量覆盖：`OPENCLAW_HOME`、`OPENCLAW_WORKSPACE`。

---

## 维护规则

- `shared` 中只放**真正跨多技能共用**的内容
- 禁止放业务逻辑（业务逻辑属于具体技能）
- 新增模块需在本文档中记录
