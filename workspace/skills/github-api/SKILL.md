# GitHub API

## 名称
`github-api` — GitHub API 客户端（自动限流 & 分页）

## 描述
封装 GitHub REST API v3，自动处理速率限制（Rate Limit）等待、分页自动翻页、文件 Base64 编解码和文件提交。适用于操作 GitHub 仓库文件、读写代码内容。

## 触发条件
- 需要读取 GitHub 仓库中的文件时
- 需要向 GitHub 仓库提交/更新文件时
- 需要分页获取大量数据（Issues、PR、Commits 等）时
- 需要自动处理 GitHub API 限流的场景

## 输入

**getFile(owner, repo, path, ref)** — 读取文件
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| owner | string | ✅ | 仓库所有者 |
| repo | string | ✅ | 仓库名 |
| path | string | ✅ | 文件路径 |
| ref | string | ❌ | 分支/标签（默认 `main`） |

**commitFile(owner, repo, path, content, message, branch)** — 提交文件
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| owner | string | ✅ | 仓库所有者 |
| repo | string | ✅ | 仓库名 |
| path | string | ✅ | 文件路径 |
| content | string | ✅ | 文件内容（UTF-8） |
| message | string | ✅ | Commit 信息 |
| branch | string | ❌ | 目标分支（默认 `main`） |

**paginate(path, options)** — 分页获取
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| path | string | ✅ | API 路径（如 `/repos/owner/repo/issues`） |
| options.maxPages | number | ❌ | 最大翻页数（默认 10） |

## 输出

**getFile** → 文件内容字符串（UTF-8）

**commitFile** → GitHub API 响应对象（含 commit SHA）

**paginate** → 数组（所有分页合并后的完整列表）

## 依赖
- 环境变量：`GITHUB_TOKEN`（Personal Access Token）
- Node.js 内置 `https`
- 无第三方依赖

## 使用示例

```js
const GitHubAPI = require('./skills/github-api/index.js');
const gh = new GitHubAPI(process.env.GITHUB_TOKEN);

// 读取文件
const content = await gh.getFile('myorg', 'myrepo', 'README.md');
console.log(content);

// 提交文件
await gh.commitFile(
  'myorg', 'myrepo',
  'docs/changelog.md',
  '# Changelog\n\n- 新增功能',
  'docs: update changelog'
);

// 分页获取所有 Issues
const issues = await gh.paginate('/repos/myorg/myrepo/issues?state=open');
console.log(`共 ${issues.length} 个 Issue`);
```

## 注意事项
- API 限制：未认证 60次/小时，认证后 5000次/小时
- 速率限制时自动等待到重置时间
- `commitFile` 自动检测文件是否存在并携带正确的 SHA（更新 vs 创建）
