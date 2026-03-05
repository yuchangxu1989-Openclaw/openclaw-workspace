# File Downloader

## 名称
`file-downloader` — 文件下载器（断点续传）

## 描述
支持断点续传的文件下载工具，提供进度追踪、MD5 校验和超时控制。适用于下载大文件、不稳定网络环境下的可靠下载。

## 触发条件
- 需要从 HTTP/HTTPS URL 下载文件时
- 下载可能中断、需要断点续传时
- 需要校验下载文件完整性时
- 需要追踪下载进度时

## 输入

**download(url, outputPath, options)** — 下载文件
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| url | string | ✅ | 文件 HTTP/HTTPS URL |
| outputPath | string | ✅ | 本地保存路径 |
| options | object | ❌ | 附加选项 |

**verifyChecksum(filePath, expectedHash)** — 校验 MD5
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| filePath | string | ✅ | 本地文件路径 |
| expectedHash | string | ✅ | 期望的 MD5 hash |

## 输出
```json
{
  "path": "/tmp/downloaded-file.zip",
  "size": 10485760
}
```

## 依赖
- Node.js 内置模块：`https`、`http`、`fs`、`path`、`crypto`
- 无第三方依赖

## 配置
```js
const downloader = new FileDownloader({
  chunkSize: 1048576,  // 分片大小（默认 1MB）
  maxRetries: 3,       // 最大重试次数
  timeout: 30000       // 请求超时（毫秒）
});
```

## 使用示例

**基本下载：**
```js
const FileDownloader = require('./skills/file-downloader/index.js');
const dl = new FileDownloader({ timeout: 60000 });

const result = await dl.download(
  'https://example.com/large-file.zip',
  '/tmp/large-file.zip'
);
console.log(`下载完成: ${result.path} (${result.size} bytes)`);
```

**带 MD5 校验：**
```js
const ok = await dl.verifyChecksum('/tmp/large-file.zip', 'abc123def456...');
console.log(ok ? '✅ 文件完整' : '❌ 文件损坏');
```

**断点续传（自动）：**
- 下载中断后，再次调用 `download()` 同一 URL 和输出路径，自动从断点继续
- 进度状态保存在 `{outputPath}.stats` 临时文件中

## 进度输出
```
[下载] 文件大小: 50.00 MB
[下载] 进度: 10% (5.00 MB/50.00 MB)
[下载] 进度: 20% (10.00 MB/50.00 MB)
...
[下载] 完成: /tmp/large-file.zip
```
