# GLM-Video

## 名称
`glm-video` — 智谱 GLM-Video 图生视频技能

## 描述
调用智谱 CogVideo 模型将本地图片转换为视频（图生视频）。自动将本地图片转 Base64 编码上传，提交异步生成任务，支持查询任务状态获取视频 URL。

## 触发条件
- 需要将本地图片生成视频时（区别于 cogvideo 的 URL 输入）
- 图生视频场景，图片来源为本地文件时

## 与 CogVideo 的区别
| 特性 | glm-video | cogvideo |
|------|-----------|---------|
| 图片输入 | 本地文件（自动 Base64） | 图片 URL |
| API Key | zhipu-keys 轮换 | 构造函数参数 |
| 文生视频 | ❌ 不支持 | ✅ 支持 |
| 图生视频 | ✅ 本地图片 | ✅ URL 图片 |

## 输入

**generate(imagePath, prompt, options)** — 图生视频
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| imagePath | string | ✅ | 本地图片路径（JPG/PNG） |
| prompt | string | ✅ | 视频内容描述 |
| options.resolution | string | ❌ | 分辨率（默认 `720p`） |
| options.duration | number | ❌ | 时长秒数（默认 6） |

**queryStatus(taskId)** — 查询任务状态
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| taskId | string | ✅ | 任务 ID |

## 输出
```json
{
  "taskId": "task_xxx",
  "status": "processing",
  "videoUrl": null
}
```
完成后 `videoUrl` 为可下载视频链接。

## 依赖
- `../zhipu-keys/index.js`（API Key 池，使用 `vision` 类型 key）
- API：`open.bigmodel.cn` CogVideo 接口（model: `cogvideo`）
- Node.js 内置 `https`、`fs`

## 使用示例

```js
const GLMVideo = require('./skills/glm-video/index.js');
const video = new GLMVideo();

// 提交生成任务
const task = await video.generate(
  '/tmp/photo.jpg',
  '人物微笑转头，背景有风吹过',
  { duration: 6, resolution: '720p' }
);

// 轮询等待完成
let status = await video.queryStatus(task.taskId);
while (status.status === 'processing') {
  await new Promise(r => setTimeout(r, 5000));
  status = await video.queryStatus(task.taskId);
}
console.log('视频链接:', status.video_url);
```

## 注意事项
- 视频生成为异步任务，必须轮询 `queryStatus`
- 本地图片自动转为 `data:image/jpeg;base64,...` 格式上传
- API Key 由 `zhipu-keys` 自动轮换
