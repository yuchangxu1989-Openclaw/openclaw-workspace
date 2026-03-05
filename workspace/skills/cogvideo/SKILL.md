# CogVideo

## 名称
`cogvideo` — 智谱 CogVideo 视频生成技能

## 描述
调用智谱 CogVideo 模型实现文生视频和图生视频。支持提交生成任务并轮询任务状态获取视频 URL。

## 触发条件
- 需要根据文字描述生成视频时
- 需要将图片动画化（图生视频）时
- 集成视频生成流水线时

## 输入

**generate(prompt, options)** — 文生视频
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| prompt | string | ✅ | 视频描述文字 |
| options.resolution | string | ❌ | 分辨率（默认 `720p`） |
| options.duration | number | ❌ | 视频时长秒数（默认 6） |

**imageToVideo(imageUrl, prompt, options)** — 图生视频
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| imageUrl | string | ✅ | 参考图片 URL |
| prompt | string | ✅ | 视频内容描述 |
| options.resolution | string | ❌ | 分辨率（默认 `720p`） |
| options.duration | number | ❌ | 时长秒数（默认 6） |

**queryStatus(taskId)** — 查询任务状态
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| taskId | string | ✅ | 生成任务 ID |

## 输出
```json
{
  "taskId": "task_xxx",
  "status": "processing",
  "videoUrl": null
}
```
完成后 `videoUrl` 为可下载链接，`status` 为 `"success"`。

## 依赖
- 环境变量：`ZHIPU_API_KEY`
- API：`open.bigmodel.cn` CogVideo 接口
- Node.js 内置 `https`

## 使用示例

```js
const CogVideo = require('./skills/cogvideo/index.js');
const cv = new CogVideo(process.env.ZHIPU_API_KEY);

// 文生视频
const task = await cv.generate('一只猫在雪地里奔跑', { duration: 6 });
console.log(task.taskId); // 轮询状态

// 轮询直到完成
let status = await cv.queryStatus(task.taskId);
while (status.status === 'processing') {
  await new Promise(r => setTimeout(r, 5000));
  status = await cv.queryStatus(task.taskId);
}
console.log('视频链接:', status.video_url);
```

## 注意事项
- 视频生成为异步任务，需轮询 `queryStatus` 获取结果
- 模型固定为 `cogvideo`，可通过构造函数参数覆盖
- 分辨率支持：`720p`、`1080p`（取决于账户配额）
