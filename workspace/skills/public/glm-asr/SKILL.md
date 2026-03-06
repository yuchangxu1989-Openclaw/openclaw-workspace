---
name: glm-asr
description: GLM-ASR 语音转文本 - 使用智谱 GLM-ASR-2512 模型，支持多语言语音转录
version: "1.0.11"
status: active
tags: [asr, speech, audio, zhipu]
---

# GLM-ASR 语音转文本

distribution: public

## 配置

本技能不依赖 `zhipu-keys`，支持以下 API Key 配置方式（优先级从高到低）：

1. 构造函数参数：`new GLMASR({ apiKey: 'xxx' })`
2. 环境变量：`ZHIPU_API_KEY`
3. `openclaw.json` 中的 `channels/providers` 配置

示例（环境变量）：

```bash
export ZHIPU_API_KEY="your_api_key"
node index.js ./audio.mp3
```

## 功能

- 语音转文本（支持 mp3, wav, m4a, ogg, webm）
- 多语言支持
- 流式实时转录
- 单文件最大200MB

## 使用

```bash
# 基础转录
node index.js ./audio.mp3

# 流式输出
node index.js ./audio.mp3 --stream

# 指定语言
node index.js ./audio.mp3 --language=zh
```

## 编程调用

```javascript
const GLMASR = require('./index.js');

// 方式1：通过构造参数传入
const asr = new GLMASR({ apiKey: process.env.ZHIPU_API_KEY });

const text = await asr.transcribe('./audio.mp3', {
  language: 'zh',
  stream: false
});
console.log(text);
```

## API

- Base URL: `https://open.bigmodel.cn/api/coding/paas/v4/audio/transcriptions`
- Model: `glm-asr-2512`
