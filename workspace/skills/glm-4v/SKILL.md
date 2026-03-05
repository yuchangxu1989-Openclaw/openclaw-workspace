# GLM-4V (GLM-4.6V)

## 名称
`glm-4v` — 智谱 GLM-4.6V 视频 & 图像理解模型

## 描述
调用智谱 GLM-4.6V 多模态模型，支持视频理解和图像理解。输入视频 URL 或图片 URL，结合文字 prompt，返回模型的文字理解输出。使用 zhipu-keys 技能进行 API Key 轮换。

## 触发条件
- 需要理解/分析视频内容时（视频问答）
- 需要对图片进行多模态理解时
- 与 glm-vision 的区别：glm-4v 支持视频输入，glm-vision 仅支持图片

## 输入

**understandVideo(videoUrl, prompt)** — 视频理解
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| videoUrl | string | ✅ | 视频文件 URL |
| prompt | string | ❌ | 提问内容（默认：`描述这个视频`） |

**understandImage(imageUrl, prompt)** — 图像理解
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| imageUrl | string | ✅ | 图片 URL |
| prompt | string | ❌ | 提问内容（默认：`描述这张图片`） |

## 输出
返回模型回答的文字字符串，例如：
```
"这个视频展示了一只橘猫在雪地里奔跑，背景是白色雪地，猫的动作轻快活泼..."
```

## 依赖
- `../zhipu-keys/index.js`（API Key 轮换池）
- 环境变量：`GLM_VISION_MODEL`（默认 `glm-4.6v`）
- API：`open.bigmodel.cn` Chat Completions 接口
- Node.js 内置 `https`

## 使用示例

```js
const GLM4V = require('./skills/glm-4v/index.js');
const model = new GLM4V();

// 视频理解
const desc = await model.understandVideo(
  'https://cdn.example.com/video.mp4',
  '这个视频里发生了什么？请详细描述'
);
console.log(desc);

// 图像理解
const analysis = await model.understandImage(
  'https://cdn.example.com/screenshot.png',
  '这张截图中有哪些UI元素？'
);
console.log(analysis);
```

## 注意事项
- 模型通过 `GLM_VISION_MODEL` 环境变量配置，默认 `glm-4.6v`
- API Key 由 `zhipu-keys` 技能自动轮换，避免单 Key 限流
- 视频 URL 需为公网可访问链接
