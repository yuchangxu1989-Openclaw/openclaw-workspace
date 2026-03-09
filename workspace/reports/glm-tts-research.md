# GLM-TTS 研究报告

## 基本信息

- **模型名称**: `glm-tts`
- **提供商**: 智谱AI (BigModel)
- **API Endpoint**: `POST https://open.bigmodel.cn/api/paas/v4/audio/speech`
- **认证方式**: `Authorization: Bearer <API_KEY>`

## 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| model | string | ✅ | 固定 `glm-tts` |
| input | string | ✅ | 要合成的文本 |
| voice | string | ❌ | 音色选择，默认 `female` |
| speed | float | ❌ | 语速，默认 1.0 |
| volume | float | ❌ | 音量，默认 1.0 |
| response_format | string | ❌ | 输出格式：`wav`、`pcm`（不支持mp3） |
| stream | boolean | ❌ | 是否流式返回 |
| encode_format | string | ❌ | 流式时编码格式，如 `base64` |

## 音频输出格式

- **支持**: `wav`、`pcm`
- **不支持**: `mp3`（需自行用 ffmpeg 转换）
- **采样率**: 24000 Hz（流式返回中标明）

## 可用音色

| 音色名 | 说明 |
|--------|------|
| female | 默认女声 |
| 彤彤 | 默认角色 |
| 小陈 | - |
| 锤锤 | - |
| jam | - |
| kazi | - |
| douji | - |
| luodo | - |

## 中文支持

✅ 完全支持中文，这是其核心使用场景。

## 计费

详见 [价格页面](https://open.bigmodel.cn/pricing)，文档未直接标明具体价格。

## 技术特点

- 两阶段生成：text2token（大语言模型）+ token2wav（扩散模型）
- 训练引入 GRPO 强化学习
- 流式首帧响应 <400ms
- 支持情感表达，根据上下文自动预判语调

## 脚本

已创建 `/root/.openclaw/workspace/scripts/glm-tts.js`：
```
node glm-tts.js <文本> <输出文件> [voice] [speed] [volume]
```
- 支持 .wav 直出，.mp3 自动通过 ffmpeg 转换
- API Key 从 `/root/.openclaw/.secrets/zhipu-keys.env` 读取

## 测试结果

- 测试文本："你好长煦，我是焰崽"
- 输出：`/tmp/glm-tts-test.mp3`（22.5 KB）、`/tmp/glm-tts-test.wav`（264.1 KB）
- 状态：✅ 成功
