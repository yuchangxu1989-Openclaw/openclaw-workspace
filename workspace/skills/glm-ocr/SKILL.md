# GLM-OCR

## 名称
`glm-ocr` — 智谱 GLM-OCR 文字识别技能

## 描述
调用智谱 `glm-ocr` 模型对图片（JPG/PNG）和 PDF 文件进行 OCR 识别，提取文字内容。支持本地文件（自动转 Base64 上传），输出文字、图片链接或 Markdown 格式。

## 触发条件
- 需要识别图片中的文字时
- 需要提取 PDF 文件中的文字内容时
- 需要将扫描件、截图转为可编辑文字时

## 输入

**recognize(filePath, options)** — OCR 识别
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| filePath | string | ✅ | 本地文件路径（JPG/PNG/PDF） |
| options.prompt | string | ❌ | 自定义识别指令（默认：`识别这个文件的内容`） |

## 文件限制
| 格式 | 最大大小 | 页数限制 |
|------|---------|---------|
| JPG/PNG | 10 MB | - |
| PDF | 50 MB | 100页 |

## 输出
返回模型识别出的文字内容（字符串），可能包含 Markdown 格式的表格、标题等。

## 依赖
- `../zhipu-keys/index.js`（API Key 池，使用 `vision` 类型 key）
- API：`open.bigmodel.cn` Chat Completions 接口（model: `glm-ocr`）
- Node.js 内置 `https`、`fs`

## 使用示例

```js
const GLMOCR = require('./skills/glm-ocr/index.js');
const ocr = new GLMOCR();

// 识别图片
const text = await ocr.recognize('/tmp/invoice.jpg');
console.log('识别结果:', text);

// 识别 PDF（自定义 prompt）
const content = await ocr.recognize('/tmp/contract.pdf', {
  prompt: '提取所有表格数据，输出 Markdown 格式'
});
console.log(content);
```

## 注意事项
- 文件自动转 Base64 后上传，无需预先上传到对象存储
- 超出大小限制时直接抛出错误，不调用 API
- 支持格式：`jpg`、`jpeg`、`png`、`pdf`，其他格式抛出"不支持的文件格式"错误
- API Key 使用 `zhipu-keys` 的 `vision` 类型
