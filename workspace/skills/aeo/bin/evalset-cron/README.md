# 评测集 Cron 生成管线

## 概述

每24小时自主从真实会话中抽取高价值片段，生成评测集。

## 架构

```
真实会话 (memory/*.md)
        │
        ▼
┌─────────────────┐
│ session-sampler  │ ← 版本化采样策略 (v1.0)
│ (采样器)         │   支持: 显式对话、结构化笔记、持久化指令
└────────┬────────┘
         │ 候选用例
         ▼
┌─────────────────┐
│  dedup-engine    │ ← SHA-256 精确去重 + Jaccard 模糊去重
│  (去重引擎)      │   交叉: cron ↔ adhoc ↔ 已有评测集
└────────┬────────┘
         │ 唯一用例
         ▼
┌─────────────────┐     ┌─────────────────┐
│ generate-real-   │ ──→ │ evaluation-sets/ │ (落盘)
│ conv-evalset.cjs │     └────────┬────────┘
│ (生成器主流程)    │              │
└─────────────────┘     ┌────────▼────────┐
                        │ registry.json    │ (注册)
                        └─────────────────┘
```

## 文件结构

```
skills/aeo/
├── bin/
│   ├── generate-real-conv-evalset.cjs   # 生成器主入口
│   └── evalset-cron/
│       ├── dedup-engine.cjs             # 统一去重引擎
│       └── session-sampler.cjs          # 会话采样器
├── evaluation-sets/
│   └── real-conv-YYYY-MM-DD/            # 每日生成的评测集
│       ├── test-cases.json
│       └── standard.json
├── evalset-cron-output/
│   ├── .dedup-fingerprints.json         # 去重指纹库
│   └── run-log.jsonl                    # 运行日志
└── unified-evaluation-sets/
    └── registry.json                    # 注册表
```

## 去重机制

### 两级去重

1. **精确去重 (SHA-256)**：对 user_message + expected behavior + category 的规范化文本取 hash
2. **模糊去重 (Jaccard ≥ 0.85)**：中英文混合分词 + bigram，阈值 85%

### 统一去重范围

- ✅ cron 批次内去重
- ✅ 跨 cron 运行去重（持久化指纹库）
- ✅ cron ↔ 按需(adhoc) 交叉去重
- ✅ 与所有已有 evaluation-sets/ 下的用例交叉去重

### 指纹库

路径: `skills/aeo/evalset-cron-output/.dedup-fingerprints.json`
格式: `{ hashes: { [hash]: { id, source, addedAt } }, totalEntries, totalDedups }`

## 闭卷安全

严格遵循 ISC-CLOSED-BOOK-001：

- ✅ 仅读取 `memory/YYYY-MM-DD.md`（原始日记/笔记）
- ✅ 不读取任何标注、答案、参考文件
- ✅ 每次运行生成 `closedBookEvidence` 结构
- ✅ 落盘文件中附带完整闭卷证据链
- ❌ 不读取 `labels/`, `annotations/`, `answers/`, `ground_truth/`, `expected_outputs/`

## 版本化

### 生成器版本

`GENERATOR_VERSION = '1.0.0'`
每个输出文件包含 `generatorVersion` 字段，可追溯。

### 采样策略版本

```javascript
SAMPLING_STRATEGIES = {
  'v1.0': {
    name: 'default-daily-sampler',
    minMessageLength: 15,
    maxCasesPerRun: 40,
    complexityThreshold: 'IC3',
    signalKeywords: { correction, teaching, frustration, multi_intent, meta, capability_gap },
    categoryMapping: { ... },
    forbiddenReadPaths: [ ... ]
  }
};
```

添加新策略：在 `session-sampler.cjs::SAMPLING_STRATEGIES` 中增加 `v1.1` 即可，CLI 通过 `--strategy v1.1` 选用。

## Cron 配置

```
schedule: 0 5 * * * (每日凌晨5点)
script: skills/aeo/bin/generate-real-conv-evalset.cjs --source cron
model: zhipu/glm-5
```

注册在:
- `infrastructure/cron/jobs.json` (evalset-cron-daily)
- `skills/isc-core/rules/rule.evalset-cron-daily-generation-001.json`

## CLI 用法

```bash
# cron 模式（默认当日）
node skills/aeo/bin/generate-real-conv-evalset.cjs --source cron

# 指定日期
node skills/aeo/bin/generate-real-conv-evalset.cjs --source cron --date 2026-03-06

# 按需模式
node skills/aeo/bin/generate-real-conv-evalset.cjs --source adhoc --date 2026-03-06

# 干跑
node skills/aeo/bin/generate-real-conv-evalset.cjs --source cron --date 2026-03-06 --dry-run

# 指定策略版本
node skills/aeo/bin/generate-real-conv-evalset.cjs --source cron --strategy v1.0
```

## 测试

```bash
npx jest tests/unit/evalset-cron.test.js --verbose
# 22 tests, 100% pass
```
