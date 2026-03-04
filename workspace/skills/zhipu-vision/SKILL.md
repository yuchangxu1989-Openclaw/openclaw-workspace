# zhipu-vision — 智谱图像理解

distribution: internal


基于 GLM-4V-Plus 的图像理解能力。

## 用法

```bash
# 分析本地图片
node skills/zhipu-vision/index.js /path/to/image.jpg "图片里有什么？"
```

## API

```javascript
const { analyzeImage, analyzeImageURL } = require('./skills/zhipu-vision/index.js');
const result = await analyzeImage('/path/to/image.jpg', '描述内容');
```

## 模型
- glm-4v-plus: 高精度图像理解
