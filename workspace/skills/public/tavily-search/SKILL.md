# tavily-search — AI 网络搜索

distribution: public

基于 Tavily API 的高质量网络搜索，专为 AI 优化。

## 前置配置
必须先配置 Tavily API Key（禁止在源码中硬编码）：

```bash
export TAVILY_API_KEY="你的_tavily_api_key"
```

可将上述配置写入 shell 配置文件（如 `~/.bashrc` / `~/.zshrc`）以便长期生效。

## 用法
```bash
node skills/public/tavily-search/index.js "搜索内容"
```

## API
```javascript
const { search } = require('./skills/public/tavily-search/index.js');
const result = await search('query', { maxResults: 5, includeAnswer: true });
// result.answer — AI 摘要
// result.results — 搜索结果列表
```

## 安全说明
- API Key 仅通过环境变量 `TAVILY_API_KEY` 读取
- 仓库中不应出现任何明文 Tavily Key
