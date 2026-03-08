# OpenClaw Gateway 配置快速参考

## 📁 配置文件位置

```bash
~/.openclaw/openclaw.json    # 主配置文件 (JSON5 格式)
~/.openclaw/.env             # 环境变量文件
```

## 🚀 快速开始

### 方法 1: 交互式配置向导 (推荐)

```bash
openclaw onboard       # 完整设置向导
openclaw configure     # 配置向导
```

### 方法 2: 手动配置

1. 创建配置文件:
```bash
cp openclaw.config.example.json5 ~/.openclaw/openclaw.json
```

2. 设置环境变量:
```bash
cat >> ~/.openclaw/.env <<EOF
OPENCLAW_GATEWAY_TOKEN=your-token
FEISHU_APP_SECRET=your-secret
TELEGRAM_BOT_TOKEN=your-token
DISCORD_BOT_TOKEN=your-token
EOF
```

3. 启动网关:
```bash
openclaw gateway
```

## 🔑 核心配置项

### 基础配置

```json5
{
  "gateway": {
    "port": 18789,              // 网关端口
    "bind": "loopback",         // 绑定地址
    "auth": {
      "mode": "token",
      "token": "${GATEWAY_TOKEN}"
    }
  },
  "identity": {
    "name": "Assistant",
    "emoji": "🦞"
  }
}
```

### 模型配置

```json5
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "anthropic/claude-sonnet-4-5",
        "fallbacks": ["openai/gpt-5.2"]
      },
      "models": {
        "anthropic/claude-sonnet-4-5": { "alias": "sonnet" },
        "openai/gpt-5.2": { "alias": "gpt" }
      }
    }
  }
}
```

### DM 访问控制

| 策略 | 说明 | 配置 |
|------|------|------|
| pairing | 配对码批准 (默认) | `"pairing"` |
| allowlist | 白名单用户 | `"allowlist"` + `allowFrom` |
| open | 开放所有用户 | `"open"` + `allowFrom: ["*"]` |
| disabled | 禁用 DM | `"disabled"` |

### 群组访问控制

| 策略 | 说明 |
|------|------|
| allowlist | 仅允许配置的群组 (默认) |
| open | 允许所有群组 |
| disabled | 禁用群组消息 |

## 📱 通道配置速查

### Feishu (飞书)

```json5
{
  "channels": {
    "feishu": {
      "enabled": true,
      "accounts": {
        "main": {
          "appId": "cli_xxx",
          "appSecret": "${FEISHU_APP_SECRET}"
        }
      },
      "dmPolicy": "pairing",
      "allowFrom": ["ou_xxxxx"],      // 用户 open_id
      "groupPolicy": "allowlist",
      "groupAllowFrom": ["oc_xxxxx"]  // 群组 chat_id
    }
  }
}
```

### Telegram

```json5
{
  "channels": {
    "telegram": {
      "enabled": true,
      "botToken": "${TELEGRAM_BOT_TOKEN}",
      "dmPolicy": "pairing",
      "allowFrom": ["tg:123456789"],  // 用户 ID
      "groups": {
        "-1001234567890": {
          "requireMention": true
        }
      }
    }
  }
}
```

### WhatsApp

```json5
{
  "channels": {
    "whatsapp": {
      "dmPolicy": "pairing",
      "allowFrom": ["+8613800138000"],  // E.164 格式
      "groups": {
        "*": { "requireMention": true }
      }
    }
  }
}
```

### Discord

```json5
{
  "channels": {
    "discord": {
      "enabled": true,
      "token": "${DISCORD_BOT_TOKEN}",
      "dm": {
        "enabled": true,
        "allowFrom": ["123456789012345678"]
      },
      "guilds": {
        "123456789012345678": {
          "requireMention": false,
          "channels": {
            "general": { "allow": true }
          }
        }
      }
    }
  }
}
```

## 🔒 安全配置

### 工具权限

```json5
{
  "tools": {
    "allow": ["exec", "read", "write", "edit", "web_search"],
    "deny": ["browser", "canvas"],
    "elevated": {
      "enabled": true,
      "allowFrom": {
        "whatsapp": ["+8613800138000"],
        "telegram": ["123456789"]
      }
    }
  }
}
```

### 命令控制

```json5
{
  "commands": {
    "native": "auto",
    "text": true,
    "bash": false,           // 危险！需要 elevated
    "config": false,         // 允许修改配置
    "restart": false         // 允许重启网关
  }
}
```

## 🤖 会话管理

```json5
{
  "session": {
    "dmScope": "per-channel-peer",  // 会话隔离级别
    "reset": {
      "mode": "daily",              // daily | idle | never
      "atHour": 4,
      "idleMinutes": 120
    },
    "resetTriggers": ["/new", "/reset"]
  }
}
```

## ⏰ 心跳配置

```json5
{
  "agents": {
    "defaults": {
      "heartbeat": {
        "every": "30m",             // 0m 禁用
        "target": "last",
        "prompt": "HEARTBEAT"
      }
    }
  }
}
```

## 🛠️ 常用命令

### 网关管理

```bash
openclaw gateway status      # 查看状态
openclaw gateway restart     # 重启
openclaw gateway stop        # 停止
openclaw logs --follow       # 查看日志
```

### 配对管理

```bash
openclaw pairing list        # 列出配对请求
openclaw pairing list <channel>
openclaw pairing approve <channel> <CODE>
openclaw pairing reject <channel> <CODE>
```

### 配置管理

```bash
openclaw doctor              # 诊断配置
openclaw doctor --fix        # 自动修复
openclaw config get <key>    # 查看配置
openclaw config set <key> <value>
```

### 模型管理

```bash
openclaw models status       # 查看模型状态
openclaw models auth paste-token --provider anthropic
```

## 📊 配置热重载

```json5
{
  "gateway": {
    "reload": {
      "mode": "hybrid"         // hybrid | hot | restart | off
    }
  }
}
```

| 模式 | 行为 |
|------|------|
| hybrid | 安全更改即时生效，关键更改自动重启 |
| hot | 仅应用安全更改，需要重启时记录警告 |
| restart | 任何更改都重启 |
| off | 禁用热重载 |

## 🔐 环境变量引用

```json5
{
  "env": {
    "OPENROUTER_API_KEY": "sk-or-xxx",
    "vars": {
      "GEMINI_API_KEY": "xxx"
    }
  },
  "channels": {
    "telegram": {
      "botToken": "${TELEGRAM_BOT_TOKEN}"
    }
  }
}
```

## 📝 完整示例

参考以下完整配置文件:

- `gateway-config-example.yaml` - YAML 格式详细说明版
- `openclaw.config.example.json5` - JSON5 格式可直接使用版

## ⚠️ 注意事项

1. **敏感信息**: 使用环境变量或 `.env` 文件，不要硬编码在配置中
2. **配置验证**: 修改后运行 `openclaw doctor` 检查
3. **配对码**: 1 小时过期，每通道最多 3 个待处理请求
4. **群组提及**: 默认需要 @提及才能触发回复
5. **会话范围**: 多用户场景建议使用 `per-channel-peer`

## 🆘 故障排查

### 机器人无响应

1. 检查网关状态：`openclaw gateway status`
2. 查看日志：`openclaw logs --follow`
3. 确认配对：`openclaw pairing list`
4. 验证配置：`openclaw doctor`

### 配置错误

```bash
# 查看具体错误
openclaw doctor

# 自动修复常见问题
openclaw doctor --fix

# 回滚配置
cp ~/.openclaw/openclaw.json.backup ~/.openclaw/openclaw.json
openclaw gateway restart
```

### 认证问题

```bash
# 检查模型认证状态
openclaw models status

# 粘贴新的 API token
openclaw models auth paste-token --provider anthropic
```
