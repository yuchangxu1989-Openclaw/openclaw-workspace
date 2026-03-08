---
name: isc-auto-align
description: ISC规则增删改时自动检查感知/执行/验真三层对齐
distribution: local
---

# isc-auto-align

对 ISC 规则文件执行三层对齐检查（感知层/执行层/验真层），自动生成缺失层的脚本骨架。

## 触发条件

- ISC 规则文件新增或修改时
- pre-commit hook 检测到规则变更
- 手动对齐检查

## 输入/输出

- **输入**: `<rule.json>` 规则文件路径
- **输出**: JSON 对齐报告 `{rule_id, sense, exec, verify, generated_files}`

## 依赖

- jq
- bash 4+

## 用法

```bash
bash index.sh /path/to/rule.json
```
