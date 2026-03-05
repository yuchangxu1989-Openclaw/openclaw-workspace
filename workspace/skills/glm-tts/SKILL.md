# GLM-TTS

## 名称
`glm-tts` — 智谱 GLM-TTS 文字转语音技能

## 描述
调用智谱 `glm-tts` 模型将文字转换为语音音频。输出 MP3 文件保存到本地，支持声音类型、语速和音量调节。使用 zhipu-keys 技能进行 API Key 管理。

## 触发条件
- 需要将文字内容转换为语音文件时
- 需要生成播报音频、配音素材时
- 与 OpenClaw 内置 `tts` 工具的区别：glm-tts 使用智谱模型，输出到本地文件；内置 tts 直接播放到频道

## 输入

**synthesize(text, options)** — 文字转语音
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| text | string | ✅ | 要转换的文字 |
| options.voice | string | ❌ | 声音类型（`female`/`male`，默认 `female`） |
| options.speed | number | ❌ | 语速（0.5-2.0，默认 1.0） |
| options.volume | number | ❌ | 音量（0.0-1.0，默认 1.0） |
| options.format | string | ❌ | 输出格式（`mp3`/`wav`，默认 `mp3`） |

## 输出
```json
{
  "path": "/tmp/tts-1740733500000.mp3",
  "size": 48000,
  "format": "mp3"
}
```

## 依赖
- `../zhipu-keys/index.js`（API Key 池，使用 `vision` 类型 key）
- API：`open.bigmodel.cn/api/coding/paas/v4/audio/speech`
- Node.js 内置 `https`、`fs`

## 使用示例

```js
const GLMTTS = require('./skills/glm-tts/index.js');
const tts = new GLMTTS();

// 生成语音文件
const result = await tts.synthesize('你好，这是一段测试语音。', {
  voice: 'female',
  speed: 1.0,
  format: 'mp3'
});

console.log('语音文件:', result.path);
// 使用 file-sender 技能发送或直接播放
```

## 输出文件路径
- 文件保存到 `/tmp/tts-{timestamp}.mp3`
- 如需持久化保存，使用 `fs.copyFileSync` 移动到目标路径

## 注意事项
- API Key 使用 `zhipu-keys` 的 `vision` 类型
- 音频为二进制流，自动检测 Content-Type 写入文件
- 若 API 返回 JSON（错误时），也会正常 resolve 而非 reject
