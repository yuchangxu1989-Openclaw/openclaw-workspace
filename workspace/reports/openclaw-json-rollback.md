# openclaw.json 回滚指令

## 变更内容

**日期**: 2026-03-09 20:00 CST

**改了什么**: 在 `agents.list[0]` (id=main) 的 `tools.deny` 中增加了 `apply_patch`。

原值:
```json
"deny": ["write", "edit"]
```

新值:
```json
"deny": ["write", "edit", "apply_patch"]
```

**为什么改**: 主Agent（main）定位为调度+通信+读取角色，不应有文件写操作能力。`write` 和 `edit` 之前已被禁用，但遗漏了 `apply_patch`（同属 `group:fs` 的写操作工具）。补上后，所有文件系统写入工具（`write`、`edit`、`apply_patch`）对 main agent 均被禁用。

**注意**: `exec` 保留（主Agent需要读取文件和运行脚本），`exec` 的写操作限制依靠认知规则兜底。子Agent不受影响，保持完整写权限。

## 备份文件

```
/root/.openclaw/openclaw.json.backup-20260309200022
```

## 一行回滚命令

```bash
cp /root/.openclaw/openclaw.json.backup-20260309200022 /root/.openclaw/openclaw.json && openclaw gateway restart
```
