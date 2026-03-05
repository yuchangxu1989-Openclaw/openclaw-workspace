---
name: glm-asr
description: GLM-ASR 语音转文本 - 使用智谱 GLM-ASR-2512 模型，支持多语言语音转录
version: "1.0.9"
status: active
tags: [asr, speech, audio, zhipu]
---

# GLM-ASR 语音转文本

distribution: internal


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
const asr = new GLMASR();

const text = await asr.transcribe('./audio.mp3', {
  language: 'zh',
  stream: false
});
console.log(text);
```

## API

- Base URL: `https://open.bigmodel.cn/api/coding/paas/v4/audio/transcriptions`
- Model: `glm-asr-2512`
