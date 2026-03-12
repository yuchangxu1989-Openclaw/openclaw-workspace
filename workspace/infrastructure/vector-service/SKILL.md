---
name: vector-service
description: 统一语义向量服务 — 基于智谱Embedding API（1024维），提供向量化、语义搜索、批量处理与维护
version: "2.0.0"
status: active
allowed-tools: exec
---

# 语义向量服务（Vector Service）v2.0.0

基于智谱Embedding API的统一向量化基础设施，为技能、记忆、知识库、AEO评测用例提供1024维语义向量支持。

## 三大动作

### 1. vectorize — 向量化
- 扫描 skills/、memory/、knowledge/、aeo/ 四类源文件
- 调用智谱 embedding-3 模型生成1024维向量
- 支持增量模式（仅处理新增/变更文件）
- 支持 `--continuous` 全量连续执行
- 支持 `--check-missing` 检查缺失向量 + `--auto-fix` 自动补全
- 支持 `--cleanup-orphans` 清理孤儿向量

### 2. search — 语义搜索
- 输入自然语言查询，返回最相似的K个结果
- 支持类型过滤：all | skill | memory | knowledge | aeo
- 基于余弦相似度排序

### 3. maintenance — 向量维护
- 清理孤儿向量（源文件已删除但向量仍存在）
- 检查并修复缺失向量（源文件存在但未向量化）
- 生成维护报告（JSON格式）
- 每日凌晨2点自动执行（cron）

## 使用方式

### CLI
```bash
# 向量化（增量）
node skills/vector-service/index.js --action vectorize

# 向量化（全量连续）
node skills/vector-service/index.js --action vectorize --continuous

# 检查缺失并自动修复
node skills/vector-service/index.js --action vectorize --check-missing --auto-fix

# 语义搜索
node skills/vector-service/index.js --action search --query "如何创建技能" --top-k 5 --type skill

# 维护（清理+修复+报告）
node skills/vector-service/index.js --action maintenance
```

### 程序调用
```js
const vectorService = require('./skills/vector-service/index.js');
// vectorize
await vectorService.run({ action: 'vectorize', continuous: true });
// search
await vectorService.run({ action: 'search', query: '语义搜索', topK: 5, type: 'all' });
// maintenance
await vectorService.run({ action: 'maintenance' });
```

## 技术架构

| 组件 | 说明 |
|------|------|
| 引擎 | 智谱 embedding-3（1024维） |
| 向量存储 | `infrastructure/vector-service/vectors/*.json` |
| 配置 | `infrastructure/vector-service/config/service.json` |
| 核心脚本 | `src/zhipu-vectorizer.cjs`、`src/batch-vectorize.cjs`、`src/semantic-search.cjs` |
| Shell入口 | `vectorize.sh`、`search.sh`、`vector-maintenance.sh` |
| 定时任务 | 向量化每6小时、维护每日凌晨2点 |

## 源文件类型

| 类型 | 路径 | 匹配模式 |
|------|------|----------|
| skill | `workspace/skills/` | `**/SKILL.md` |
| memory | `workspace/memory/` | `*.md` |
| knowledge | `workspace/knowledge/` | `*.json` |
| aeo | `workspace/aeo/evaluation-sets/` | `**/*.json` |

## 依赖

- 智谱API密钥（API_KEY_8）：`/root/.openclaw/.secrets/zhipu-keys.env`
- Node.js（用于 .cjs 脚本）
