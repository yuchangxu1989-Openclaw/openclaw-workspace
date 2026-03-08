---
name: badcase-to-goodcase
description: 扫描badcase文件，自动翻转生成goodcase评测集
distribution: local
---

# badcase-to-goodcase

扫描 `c2-golden/` 下的 badcase JSON 文件，自动翻转为 goodcase 评测集。

## 触发条件

- ISC rule `badcase-auto-flip-001` 触发时
- pre-commit hook 检测到 badcase 文件变更
- 手动执行

## 输入/输出

- **输入**: 无参数，自动扫描 `tests/benchmarks/intent/c2-golden/*.json`
- **输出**: `goodcases-from-badcases.json`（同目录），包含翻转后的 goodcase 数组

## 依赖

- python3
- jq（可选，用于后续处理输出）

## 用法

```bash
bash index.sh
```
