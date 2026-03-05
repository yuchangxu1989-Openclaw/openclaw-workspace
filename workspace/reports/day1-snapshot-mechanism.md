# Day 1 关门条件 #5: 报告快照锁定机制

## 问题

报告生成后，底层数据文件被后续操作修改，导致报告中的数字与实际文件不一致（"幽灵数据"问题）。

## 解决方案

每份报告生成时，同步创建 `.snapshot.json`，记录报告本身及其数据依赖文件的 SHA-256 哈希指纹。验证时对比当前文件哈希与快照哈希，检测数据漂移。

## 文件清单

| 文件 | 用途 |
|------|------|
| `infrastructure/report-snapshot.js` | 核心库：snapshot() 创建快照，verify() 验证一致性 |
| `scripts/verify-report-snapshot.js` | CLI工具：批量验证 reports/*.snapshot.json |
| `tests/unit/report-snapshot.test.js` | 单元测试（7个用例） |

## API

```js
const { snapshot, verify } = require('./infrastructure/report-snapshot');

// 创建快照
snapshot('reports/my-report.md', ['data/results.json', 'data/metrics.csv']);

// 验证快照
const result = verify('reports/my-report.md.snapshot.json');
// → { status: 'VALID' | 'STALE', changes: [...] }
```

## 验证输出

```bash
$ node scripts/verify-report-snapshot.js
✅ VALID  day1-pipeline-benchmark.md (snapshot: 2026-03-05T15:15:25.800Z)
```

STALE 时输出变更详情：
```
❌ STALE  my-report.md
   ⚠️  DATA_MODIFIED: results.json
      expected: 933bd1bb68fd1ae8...
      actual:   a1b2c3d4e5f6a7b8...
```

## 检测能力

- `REPORT_MODIFIED` — 报告文件本身被改动
- `REPORT_DELETED` — 报告文件被删除
- `DATA_MODIFIED` — 数据依赖文件内容变化
- `FILE_DELETED` — 数据依赖文件被删除
- `FILE_APPEARED` — 快照时缺失的文件现在出现了
