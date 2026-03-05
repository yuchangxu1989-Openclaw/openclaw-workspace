# CogView

## 名称
`cogview` — 智谱 CogView 图像生成技能

## 描述
调用智谱 CogView-3-Plus 模型实现文生图和图生图（图像编辑）。输入文字描述或参考图，输出高质量图片 URL。

## 触发条件
- 需要根据文字描述生成图片时
- 需要在现有图片基础上进行 AI 编辑时
- 集成图像生成流水线时

## 输入

**generate(prompt, options)** — 文生图
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| prompt | string | ✅ | 图片描述文字 |
| options.size | string | ❌ | 尺寸（默认 `1024x1024`） |
| options.quality | string | ❌ | 质量（`standard`/`hd`，默认 `standard`） |

**edit(imageUrl, prompt, options)** — 图生图
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| imageUrl | string | ✅ | 参考图片 URL |
| prompt | string | ✅ | 编辑描述 |
| options.size | string | ❌ | 输出尺寸（默认 `1024x1024`） |

## 输出
返回生成图片的 URL 字符串：
```
"https://cdn.bigmodel.cn/generated/xxx.png"
```

## 依赖
- 环境变量：`ZHIPU_API_KEY`
- API：`open.bigmodel.cn` CogView 接口
- Node.js 内置 `https`
- 默认模型：`cogview-3-plus`

## 使用示例

```js
const CogView = require('./skills/cogview/index.js');
const cg = new CogView(process.env.ZHIPU_API_KEY);

// 文生图
const url = await cg.generate('一只橘猫坐在书桌上看书，水彩画风格', {
  size: '1024x1024',
  quality: 'hd'
});
console.log('图片URL:', url);

// 图生图编辑
const editedUrl = await cg.edit('https://example.com/cat.png', '把猫的颜色改成蓝色');
console.log('编辑后URL:', editedUrl);
```

## 注意事项
- 模型为 `cogview-3-plus`，可在构造时替换
- 支持的尺寸：`1024x1024`、`768x1344`、`864x1152` 等
- 生成结果为同步返回（直接得到 URL，非异步任务）
