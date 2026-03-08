---
name: detect-deep-think-intent
description: 检测用户输入中的深度思考意图关键词，触发子Agent委派
distribution: local
---

# detect-deep-think-intent

分析用户消息文本，匹配深度思考关键词，返回是否应委派给专业子Agent。

## 触发条件

- 用户消息到达时，作为意图预处理探针
- ISC 意图识别流水线中的一环

## 输入/输出

- **输入**: 用户消息文本（第一个参数或 stdin）
- **输出**: JSON `{"should_delegate": bool, "matched_keywords": [...], "suggested_agent": "..."}`

## 依赖

- jq
- bash 4+
- 配置文件: `skills/isc-core/config/deep-think-keywords.json`

## 用法

```bash
bash index.sh "帮我深度分析这个架构方案"
echo "请仔细想想这个问题" | bash index.sh
```
