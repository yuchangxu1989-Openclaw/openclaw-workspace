# tavily-search — AI 网络搜索

基于 Tavily API 的高质量网络搜索，专为 AI 优化。

## 用法
```bash
node skills/tavily-search/index.js "搜索内容"
```

## API
```javascript
const { search } = require('./skills/tavily-search/index.js');
const result = await search('query', { maxResults: 5, includeAnswer: true });
// result.answer — AI 摘要
// result.results — 搜索结果列表
```

## 配置
- 环境变量: TAVILY_API_KEY
