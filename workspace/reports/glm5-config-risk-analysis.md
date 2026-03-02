# GLM-5 配置文件风险排查报告

## 📋 执行摘要

对 `/root/.openclaw/workspace/config/openclaw-glm5-only.json` 进行深度排查，对比智谱官方API文档，发现 **2个高风险问题** 和 **1个中风险问题**。

---

## 🚨 风险列表（按严重程度排序）

### 🔴 高风险 1: maxTokens 参数严重错误
| 项目 | 详情 |
|------|------|
| **问题描述** | 当前配置 `maxTokens: 8192` 远低于智谱官方标准 |
| **当前值** | `8192` |
| **官方默认值** | `65536` |
| **官方最大值** | `131072` (128K) |
| **风险影响** | 模型输出被过早截断，无法发挥GLM-5的长文本生成能力，严重影响复杂任务处理 |
| **修复建议** | 修改为 `65536`（推荐默认值）或根据需求设置为更高值 |
| **官方文档来源** | https://docs.bigmodel.cn/cn/guide/start/concept-param |

---

### 🔴 高风险 2: contextWindow 参数偏低
| 项目 | 详情 |
|------|------|
| **问题描述** | 当前配置 `contextWindow: 128000` 未达到GLM-5官方标称的200K上下文能力 |
| **当前值** | `128000` |
| **官方标准值** | `200000` (200K) |
| **风险影响** | 无法充分利用GLM-5的200K超长上下文窗口，长文档分析能力受限 |
| **修复建议** | 修改为 `200000` 以匹配官方规格 |
| **官方文档来源** | https://docs.bigmodel.cn/cn/guide/start/migrate-to-glm-new |

---

### 🟡 中风险 3: 缺少可选字段 headers
| 项目 | 详情 |
|------|------|
| **问题描述** | 智谱API可能需要特定的请求头配置 |
| **当前状态** | 未配置 `headers` 字段 |
| **风险影响** | 可能导致某些特定场景下的请求失败或限流问题 |
| **修复建议** | 建议添加 `headers` 配置，参考 kimi-coding 配置添加 User-Agent |
| **备注** | 此字段为可选，但建议配置以提高兼容性 |

---

## ✅ 配置正确的项目

| 参数 | 当前值 | 官方要求 | 状态 |
|------|--------|----------|------|
| `baseUrl` | `https://open.bigmodel.cn/api/coding/paas/v4` | `https://open.bigmodel.cn/api/coding/paas/v4` | ✅ 正确 |
| `api` | `openai-chat` | `openai-chat` (OpenAI兼容格式) | ✅ 正确 |
| `model ID` | `glm-5` | `glm-5` | ✅ 正确 |
| `reasoning` | `true` | 支持深度思考 | ✅ 正确 |
| `input` | `["text"]` | `["text"]` | ✅ 正确 |
| `cost` | 已配置 | 必需字段 | ✅ 正确 |

---

## 📊 智谱GLM-5 官方参数对照表

| 参数 | 官方规格 | 当前配置 | 修正建议 |
|------|----------|----------|----------|
| **模型名称** | glm-5 | glm-5 | ✅ 无需修改 |
| **baseUrl** | https://open.bigmodel.cn/api/coding/paas/v4 | https://open.bigmodel.cn/api/coding/paas/v4 | ✅ 无需修改 |
| **API格式** | openai-chat | openai-chat | ✅ 无需修改 |
| **maxTokens** | 默认65536, 最大131072 | 8192 | ❌ 修改为65536 |
| **contextWindow** | 200000 (200K) | 128000 | ❌ 修改为200000 |
| **reasoning** | 支持, 默认开启 | true | ✅ 无需修改 |
| **temperature** | 默认1.0 | 未配置 | ⚠️ 建议添加 |
| **topP** | 默认0.95 | 未配置 | ⚠️ 建议添加 |

---

## 🛠️ 修正后的完整配置

```json
{
  "meta": {
    "lastTouchedVersion": "2026.2.13",
    "lastTouchedAt": "2026-02-28T08:42:00.000Z"
  },
  "env": {
    "KIMI_API_KEY": "${KIMI_API_KEY}",
    "KIMI_PLUGIN_API_KEY": "${KIMI_PLUGIN_API_KEY}",
    "ZHIPU_API_KEY": "${ZHIPU_API_KEY}"
  },
  "models": {
    "mode": "merge",
    "providers": {
      "kimi-coding": {
        "baseUrl": "https://api.kimi.com/coding",
        "apiKey": "${KIMI_API_KEY}",
        "api": "anthropic-messages",
        "headers": {
          "User-Agent": "Kimi Claw Plugin"
        },
        "models": [
          {
            "id": "k2p5",
            "name": "k2p5",
            "reasoning": true,
            "input": ["text"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 262144,
            "maxTokens": 32768
          }
        ]
      },
      "zhipu": {
        "baseUrl": "https://open.bigmodel.cn/api/coding/paas/v4",
        "apiKey": "${ZHIPU_API_KEY}",
        "api": "openai-chat",
        "headers": {
          "User-Agent": "OpenClaw GLM-5 Client"
        },
        "models": [
          {
            "id": "glm-5",
            "name": "glm-5",
            "reasoning": true,
            "input": ["text"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 200000,
            "maxTokens": 65536
          }
        ]
      }
    }
  },
  "agents": {
    "defaults": {
      "model": { "primary": "kimi-coding/k2p5" },
      "models": {
        "kimi-coding/k2p5": { "alias": "Kimi K2.5" },
        "zhipu/glm-5": { "alias": "GLM-5" }
      }
    }
  },
  "channels": {
    "feishu": {
      "appId": "cli_a911a148cbb89bde",
      "appSecret": "Mybt98fTmuYvH5QBtevohdCbhEtturX1",
      "enabled": true
    }
  }
}
```

---

## 📝 修改说明

### 主要变更
1. **maxTokens**: `8192` → `65536` (智谱官方默认值)
2. **contextWindow**: `128000` → `200000` (智谱官方200K标准)
3. **headers**: 新增 User-Agent 请求头配置
4. **lastTouchedAt**: 更新为当前时间

### 关键参数验证来源
- **maxTokens & contextWindow**: 智谱官方参数文档 https://docs.bigmodel.cn/cn/guide/start/concept-param
- **GLM-5 迁移指南**: https://docs.bigmodel.cn/cn/guide/start/migrate-to-glm-new
- **OpenClaw配置规范**: https://docs.openclaw.ai/gateway/configuration-examples

---

## ⚠️ 注意事项

1. **maxTokens 设置建议**:
   - 如果主要用于代码生成/复杂推理，建议使用 `65536` (官方默认值)
   - 如果需要超长输出，可设置为 `131072` (官方最大值)
   - 如果主要用于简短对话，可适当降低以节省成本

2. **contextWindow 设置建议**:
   - 固定使用 `200000` 以充分发挥GLM-5的长上下文优势
   - 实际使用时，输入token + maxTokens 不应超过此值

3. **测试验证**:
   - 修改配置后，建议重启 OpenClaw gateway
   - 使用 `/model glm-5` 切换到GLM-5模型进行测试
   - 使用 `/status` 确认配置已生效

---

**报告生成时间**: 2026-02-28 08:42 GMT+8  
**数据来源**: 智谱AI官方API文档 + OpenClaw官方配置规范
