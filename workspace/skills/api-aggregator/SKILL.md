# API Aggregator

## 名称
`api-aggregator` — API 并行聚合器

## 描述
并发调用多个外部 API，支持超时控制、分批执行、顺序调用和结果去重合并。适用于需要同时请求多个数据源并汇总结果的场景。

## 触发条件
- 需要并发调用 2 个以上 HTTP API 时
- 有依赖关系的 API 顺序调用场景
- 多数据源结果合并去重时

## 输入

**parallel(requests, options)**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| requests | Array | ✅ | 请求列表（URL对象或async函数） |
| options.timeout | number | ❌ | 超时毫秒（默认30000） |

**sequential(requests, options)**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| requests | Array | ✅ | 顺序请求列表 |
| options.stopOnError | boolean | ❌ | 失败时是否停止（默认false） |

**mergeResults(results, options)**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| results | Array | ✅ | parallel/sequential 返回的结果 |
| options.uniqueKey | string | ❌ | 去重字段（默认'id'） |
| options.sortBy | string | ❌ | 排序字段 |

## 输出
```json
{
  "results": [
    { "request": {}, "status": "fulfilled", "data": {...}, "error": null },
    { "request": {}, "status": "rejected", "data": null, "error": "超时" }
  ],
  "summary": { "total": 3, "success": 2, "failed": 1 }
}
```

## 依赖
- Node.js 内置 `fetch`（v18+）
- 无第三方依赖

## 配置
```js
const aggregator = new APIAggregator({
  timeout: 30000,      // 全局超时（毫秒）
  maxConcurrency: 5    // 最大并发数
});
```

## 使用示例

**并行调用多个 API：**
```js
const APIAggregator = require('./skills/api-aggregator/index.js');
const agg = new APIAggregator({ timeout: 10000 });

const results = await agg.parallel([
  { url: 'https://api.example.com/users' },
  { url: 'https://api.example.com/posts' },
  async () => fetchSomeData()
]);

console.log(results.summary); // { total: 3, success: 2, failed: 1 }
```

**顺序调用（有依赖关系）：**
```js
const results = await agg.sequential([
  { url: 'https://api.example.com/auth' },
  { url: 'https://api.example.com/profile' }
], { stopOnError: true });
```

**合并去重：**
```js
const merged = agg.mergeResults(results.results, {
  uniqueKey: 'id',
  sortBy: 'createdAt',
  sortDesc: true
});
```
