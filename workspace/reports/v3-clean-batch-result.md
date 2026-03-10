# V3 清洗批量结果

> 执行时间: 2026-03-09 02:24 CST
> 脚本: `node scripts/v3-eval-clean.js`

| 文件 | 总数 | 合格 | 不合格(flag) | 缺字段(missing) |
|------|------|------|-------------|----------------|
| 00-real-badcases.json | 44 | 0 | 44 | 44 |
| goodcases-from-badcases.json | 479 | 0 | 479 | 479 |
| 纠偏类.json | 54 | 0 | 21 | 54 |
| session-20260308-evening.json | 45 | 0 | 45 | 45 |
| 01-academic-insight.json | 30 | 0 | 30 | 30 |
| 02-conversation-insight.json | 30 | 0 | 30 | 30 |
| 03-global-rename.json | 30 | 0 | 30 | 30 |
| 交付质量类.json | 22 | 0 | 22 | 22 |
| **合计** | **734** | **0** | **701** | **734** |

## 结论

所有734条记录均存在V3合规问题：
- **734条缺字段** — 大部分文件的记录缺少V3必需字段（id/context/execution_chain_steps等）
- **701条被flag** — 除缺字段外还有difficulty/source/category/input长度等问题
- 纠偏类.json相对较好，54条中仅21条被flag（但全部缺字段）

## 备份

所有原文件已备份为 `*.bak`，可随时回滚。
