# GLM-Image

## 名称
`glm-image` — 智谱 GLM-Image 文生图技能

## 描述
调用智谱 `glm-image` 模型根据文字 prompt 生成图片，返回图片 URL。提示词限 1000 字符以内。使用 zhipu-keys 技能进行 API Key 管理。

## 触发条件
- 需要用智谱 GLM 生成图片时
- 与 CogView 的区别：glm-image 使用 `glm-image` 模型，定位为基础图像生成；CogView 使用 `cogview-3-plus`，定位为高质量艺术图
- 需要批量生成多张图片时（`n` 参数）

## 输入

**generate(prompt, options)** — 文生图
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| prompt | string | ✅ | 图片描述（≤1000字符） |
| options.size | string | ❌ | 图片尺寸（默认 `1024x1024`） |
| options.n | number | ❌ | 生成数量（默认 1） |

## 输出
返回第一张生成图片的 URL 字符串：
```
"https://cdn.bigmodel.cn/generated/image_xxx.png"
```

## 依赖
- `../zhipu-keys/index.js`（API Key 池，使用 `vision` 类型 key）
- API：`open.bigmodel.cn/api/coding/paas/v4/images/generations`
- Node.js 内置 `https`

## 使用示例

```js
const GLMImage = require('./skills/glm-image/index.js');
const img = new GLMImage();

// 生成图片
const url = await img.generate('一只可爱的柴犬坐在樱花树下', {
  size: '1024x1024',
  n: 1
});
console.log('图片URL:', url);

// 错误处理：提示词过长
try {
  await img.generate('x'.repeat(1001));
} catch (e) {
  console.error(e.message); // '提示词超过1000字符限制'
}
```

## 注意事项
- 提示词超过 1000 字符时直接抛出错误（不调用 API）
- 仅返回 `data[0].url`，多张图时需要直接使用 `request` 方法获取完整响应
- API Key 使用 `zhipu-keys` 的 `vision` 类型
