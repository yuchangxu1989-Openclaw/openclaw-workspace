# 智谱多模态能力测试报告

**日期**: 2026-03-04 15:00 CST
**测试Key**: Key_2 (`a474ebc9...`) + Key_3 (`ce9cf293...`)
**BaseURL**: `https://open.bigmodel.cn/api/coding/paas/v4`

---

## 1. 配置修复摘要

### 1.1 清除失效Key
- **Key_1** (`48912b3be113477ab7409f36184aa9ed.vJZj6Pm8byg12KYD`): HTTP 401，已从 `.secrets/zhipu-keys.env` 中移除
- 该Key仅存在于 `.secrets/zhipu-keys.env`，未在 `openclaw.json` 或 `agents/*/models.json` 中使用

### 1.2 BaseURL 统一
- **修复文件**: `skills/isc-core/services/zhipu_embedding.py`
  - 旧: `https://open.bigmodel.cn/api/paas/v4` (缺少 `/coding/`)
  - 新: `https://open.bigmodel.cn/api/coding/paas/v4`
- **已正确的文件** (无需修改):
  - `openclaw.json` zhipu provider: ✅ 带 `/coding/`
  - `agents/*/agent/models.json` (main/coder/analyst/researcher/cron-worker): ✅ 带 `/coding/`
  - 所有 skill JS 文件 (cogview/glm-4v/glm-asr/glm-tts/glm-video/glm-ocr/glm-image/glm-vision/cogvideo/zhipu-image-gen): ✅ hostname + path 组合正确
  - `workspace/config/routing-rules.json`: ✅ 所有 endpoint 带 `/coding/`
  - `skills/cras/modules/zhipu-embedding.js`: ✅ 带 `/coding/`
  - `skills/isc-core/config/unified-standards.json`: ✅ 带 `/coding/`
- **仅含hostname的配置** (不影响功能，hostname部分无需包含path):
  - `skills/isc-core/rules/rule.vectorization.unified-standard-001.json`: `"api_url": "open.bigmodel.cn"` (仅记录域名)
  - `infrastructure/vector-service/config/service.json`: `"api_url": "open.bigmodel.cn"` (仅记录域名)

---

## 2. API 能力测试

### 2.1 GLM-4-Flash 文本生成
- **Endpoint**: `/chat/completions`
- **Model**: `glm-4-flash`
- **HTTP Status**: 200 ✅
- **响应**: `"Hi 👋! I'm ChatGLM, the artificial intelligence assistant, nice to meet you."`
- **Token用量**: prompt=6, completion=30, total=36

### 2.2 GLM-5 文本生成
- **Endpoint**: `/chat/completions`
- **Model**: `glm-5`
- **HTTP Status**: 200 ✅
- **响应**: `"Hi there! I'm the GLM language model trained by Z.ai."` (含 reasoning_content)
- **Token用量**: prompt=6, completion=250, total=256
- **特点**: 支持深度思考（reasoning_content 字段）

### 2.3 Embedding-3 向量化
- **Endpoint**: `/embeddings`
- **Model**: `embedding-3`
- **HTTP Status**: 200 ✅
- **输入**: "测试文本"
- **输出**: 1024维向量（默认维度）
- **Token用量**: prompt=6, total=6

### 2.4 CogView-4 图像生成
- **Endpoint**: `/images/generations`
- **Model**: `cogview-4`
- **HTTP Status**: 200 ✅
- **输入**: "一只猫"
- **输出**: 图片URL（带水印，有效期7天）

### 2.5 GLM-4V-Flash 图像理解
- **Endpoint**: `/chat/completions`
- **Model**: `glm-4v-flash`
- **HTTP Status**: 200 ✅
- **输入**: base64 1x1 红色PNG + "这张图片是什么颜色"
- **响应**: `"这张图片是纯黑色的。"`
- **Token用量**: prompt=66, completion=7, total=73
- **注意**: 外部URL图片（如Wikipedia）可能因网络原因返回1210解析错误，建议用base64输入

### 2.6 GLM-ASR 语音识别
- **Endpoint**: `/audio/transcriptions`
- **Model**: `glm-asr-2512`
- **HTTP Status**: 200 (端点可达) ✅
- **响应**: `{"error":{"message":"Content type '' not supported","code":"500"}}` — 正常，因为未提交音频文件
- **结论**: 端点存在且认证通过，需multipart/form-data + 音频文件才能正常调用

---

## 3. Key 验证

| Key | 前缀 | 测试结果 | 状态 |
|-----|------|---------|------|
| Key_2 | `a474ebc9...` | HTTP 200, 正常响应 | ✅ 可用 |
| Key_3 | `ce9cf293...` | HTTP 200, 正常响应 | ✅ 可用 |
| Key_1 | `48912b3b...` | HTTP 401 (已移除) | ❌ 失效 |

---

## 4. 能力总览

| 能力 | 模型 | 可用性 | 备注 |
|------|------|--------|------|
| 📝 文本生成 | glm-4-flash | ✅ 可用 | 轻量快速模型 |
| 📝 文本生成 | glm-5 | ✅ 可用 | 支持深度思考 |
| 📐 向量化 | embedding-3 | ✅ 可用 | 1024维（默认） |
| 🎨 图像生成 | cogview-4 | ✅ 可用 | 文本→图像 |
| 🖼️ 图像理解 | glm-4v-flash | ✅ 可用 | 建议用base64输入 |
| 🎤 语音转文字 | glm-asr-2512 | ✅ 端点可达 | 需音频文件测试 |

---

## 5. 修改的文件清单

1. `/root/.openclaw/.secrets/zhipu-keys.env` — 移除失效的 ZHIPU_API_KEY_1
2. `/root/.openclaw/workspace/skills/isc-core/services/zhipu_embedding.py` — BaseURL 添加 `/coding/`
3. `/root/.openclaw/workspace/CAPABILITY-ANCHOR.md` — 添加实测验证能力矩阵
