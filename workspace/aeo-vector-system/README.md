# AEO Vector System - 向量系统集成

评测用例语义检索系统，支持测试用例的向量化存储、相似度检索和历史问题匹配。

## 📦 交付组件

| 组件 | 文件 | 功能描述 |
|------|------|----------|
| 用例向量化 | `case-indexer.cjs` | 将测试用例转换为向量索引 |
| 相似用例检索 | `similarity-search.cjs` | 基于语义相似度搜索相关用例 |
| 历史问题匹配 | `history-matcher.cjs` | 匹配当前问题与历史问题，检测重复/回归 |
| 核心向量库 | `vector-core.cjs` | TF-IDF向量化和相似度计算 |

## 🚀 快速开始

### 1. 构建用例索引

```bash
node case-indexer.cjs ./test-cases.json ./index
```

### 2. 搜索相似用例

```bash
# 文本搜索
node similarity-search.cjs --query "登录功能测试" --index ./index

# 基于用例搜索
node similarity-search.cjs --case case_login_001 --index ./index

# 带过滤的搜索
node similarity-search.cjs --query "API测试" --category performance --index ./index
```

### 3. 匹配历史问题

```bash
# 文本查询
node history-matcher.cjs --issue "数据库连接错误" --history ./issues.json

# 回归检测
node history-matcher.cjs --check-regression --current ./v2-bugs.json --baseline ./v1-bugs.json

# 趋势分析
node history-matcher.cjs --trends --history ./issues.json --export ./trends.json
```

## 📊 系统集成测试

```bash
node test-integration.cjs
```

测试结果：
- ✅ 24 tests passed
- ✅ 0 failed

## 🔧 API 使用

### CaseIndexer

```javascript
const { CaseIndexer } = require('./case-indexer.cjs');

const indexer = new CaseIndexer();
await indexer.buildIndex('./test-cases.json');
indexer.saveIndex('./index');
```

### SimilaritySearch

```javascript
const { SimilaritySearch } = require('./similarity-search.cjs');

const searcher = new SimilaritySearch({ indexDir: './index' });
searcher.load();

// 文本搜索
const results = searcher.searchByText('登录测试', { k: 5 });

// 用例相似度
const similar = searcher.searchByCase('case_001', { k: 3 });

// 带过滤的搜索
const filtered = searcher.searchWithFilter('API测试', { category: 'performance' });
```

### HistoryMatcher

```javascript
const { HistoryMatcher } = require('./history-matcher.cjs');

const matcher = new HistoryMatcher();
matcher.loadHistory('./issues.json');
matcher.buildIndex();

// 匹配问题
const matches = matcher.match({ title: '登录失败', description: '...' });

// 检测重复
const dup = matcher.detectDuplicate(newIssue);

// 回归检测
const regression = matcher.detectRegression(currentIssues, baselineIssues);
```

## 📁 项目结构

```
ae-vector-system/
├── vector-core.cjs          # 核心向量库 (TF-IDF + 余弦相似度)
├── case-indexer.cjs         # 用例向量化模块
├── similarity-search.cjs    # 相似用例检索模块
├── history-matcher.cjs      # 历史问题匹配模块
├── test-integration.cjs     # 集成测试
├── test-report.json         # 测试报告
├── test-data/
│   ├── test-cases.json      # 示例测试用例
│   └── history-issues.json  # 示例历史问题
└── README.md
```

## 🔬 技术特性

- **TF-IDF向量化**：基于词频-逆文档频率的向量化方法
- **中文支持**：支持中英文混合分词
- **L2归一化**：向量归一化处理
- **余弦相似度**：计算文本语义相似度
- **阈值过滤**：支持相似度阈值过滤
- **多重检索**：支持文本、用例ID、分类过滤等多种检索方式

## 📈 应用场景

1. **用例推荐**：为新功能自动推荐相关测试用例
2. **重复检测**：发现重复的测试用例，减少维护成本
3. **回归分析**：检测新问题是否是历史问题的回归
4. **问题聚类**：分析历史问题的分布和趋势
5. **知识发现**：发现测试用例之间的隐藏关联

## 🎯 交付状态

- ✅ case-indexer.cjs - 用例向量化
- ✅ similarity-search.cjs - 相似用例检索
- ✅ history-matcher.cjs - 历史问题匹配
- ✅ 测试通过 (24/24)
