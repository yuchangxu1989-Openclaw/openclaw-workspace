# zhipu-image-gen — 智谱文生图

基于 CogView-3-Plus 的文生图能力。

## 用法
```bash
node skills/zhipu-image-gen/index.js "一只可爱的猫咪" /tmp/cat.png
```

## API
```javascript
const { generateImage, generateAndSave } = require('./skills/zhipu-image-gen/index.js');

// 只获取URL
const urls = await generateImage('描述');

// 生成并保存到本地
const result = await generateAndSave('描述', '/tmp/output.png');
```

## 选项
- `model`: 默认 `cogview-3-plus`
- `size`: 默认 `1024x1024`
- `n`: 生成数量，默认 1
