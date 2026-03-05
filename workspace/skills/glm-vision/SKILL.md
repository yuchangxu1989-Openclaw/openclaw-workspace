# GLM-Vision

## 名称
`glm-vision` — 智谱 GLM-4V-Plus 图像理解技能

## 描述
调用智谱 `glm-4v-plus` 模型对图片进行多模态视觉理解，支持图像问答、描述生成、内容分析。支持图片 URL 和 Base64 两种输入方式，以及批量图像分析。

## 触发条件
- 需要理解/分析图片内容时
- 需要对多张图片批量进行同一问题分析时
- 与 glm-4v 的区别：glm-vision 仅支持图片（不支持视频），使用 `ZHIPU_API_KEY` 环境变量而非 zhipu-keys 轮换

## 输入

**understand(imageUrl, prompt)** — 单图理解
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| imageUrl | string | ✅ | 图片 URL 或 Base64（data:image/jpeg;base64,...） |
| prompt | string | ❌ | 提问内容（默认：`描述这张图片`） |

**batchAnalyze(images, prompt)** — 批量图像分析
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| images | string[] | ✅ | 图片 URL 数组 |
| prompt | string | ✅ | 统一的分析问题 |

**fileToBase64(filePath)** — 文件转 Base64
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| filePath | string | ✅ | 本地图片路径 |

## 输出

**understand** → 模型回答文字字符串

**batchAnalyze** → 数组
```json
[
  { "image": "https://...", "success": true, "result": "图片描述..." },
  { "image": "https://...", "success": false, "error": "网络错误" }
]
```

## 依赖
- 环境变量：`ZHIPU_API_KEY`（主）或 `KIMI_API_KEY`（备）
- 环境变量：`GLM_VISION_MODEL`（默认 `glm-4v-plus`）
- API：`open.bigmodel.cn` Chat Completions 接口
- Node.js 内置 `https`、`fs`

## 使用示例

```js
const GLMVision = require('./skills/glm-vision/index.js');
const vision = new GLMVision(process.env.ZHIPU_API_KEY);

// 分析图片
const desc = await vision.understand(
  'https://cdn.example.com/product.jpg',
  '请描述这张产品图片的主要特征'
);
console.log(desc);

// 本地图片
const base64 = await vision.fileToBase64('/tmp/screenshot.png');
const analysis = await vision.understand(base64, '这个UI界面有什么问题？');

// 批量分析
const results = await vision.batchAnalyze(
  ['https://...img1.jpg', 'https://...img2.jpg'],
  '这张图片的主体是什么？'
);
results.forEach(r => console.log(r.image, r.success ? r.result : r.error));
```

## 注意事项
- API Key 优先使用 `ZHIPU_API_KEY`，备用 `KIMI_API_KEY`
- 模型可通过 `GLM_VISION_MODEL` 环境变量配置
- 批量分析为串行执行（逐图调用），非并发
- Base64 图片格式：`data:image/jpeg;base64,{data}`
