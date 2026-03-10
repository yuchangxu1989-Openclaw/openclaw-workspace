## 触发条件
当用户意图匹配以下场景时，必须调用本技能：
- 挖掘/补充/生成评测集 → **mine 模式**
- 清洗/校验/对齐评测集 → **clean 模式**
- 刷新评测集 → **refresh 模式**（先 clean 全量再 mine 补缺）
- C2 case 批量生成
- 评测数据质量刷新
- 评测集与 V4 标准对齐

# 评测集生成与清洗技能 (eval-mining) ⛏️🧹

从 session 日志中挖掘 C2 意图识别评测用例，并按 V4 标准清洗已有评测集的统一流程。

## 两种模式

### 生成模式 (mine)
从 session 日志挖掘 C2 评测用例。

### 清洗模式 (clean)
按 V4 标准对已有评测集文件逐条检查、修复、删除不合格 case。

#### 程序化清洗（推荐，防止LLM幻写）

单文件清洗：
```bash
node scripts/v4-eval-clean.js <json文件路径>
```

批量清洗c2-golden目录：
```bash
bash scripts/v4-eval-clean-batch.sh
```

脚本自动备份原文件为 `.bak`，只追加 `_flag` 和 `_missing` 字段，不修改现有数据。

### 刷新模式 (refresh)
先 clean 全量评测集，再 mine 补缺。

## 统一质量标准

无论生成还是清洗，都使用同一套 V4 合规检查（定义在 `config.json` 的 `quality_rules`）：

| 规则 | 说明 |
|------|------|
| 必填字段 | id, input, expected_output, category, difficulty, source |
| C2 要求 | 多轮对话、input≥20字符、来源为真实对话、执行步骤≥4 |
| 合法分类 | 纠偏类/认知错误类/全局未对齐类/头痛医头类/反复未果类/连锁跷跷板类/自主性缺失类/交付质量类 |
| 合法难度 | C1, C2 |

## 核心策略：小批量原则

经过大量实验验证，**小批量策略**是挖掘成功的关键：

| 参数 | 值 | 原因 |
|------|-----|------|
| 每路挖掘条数 | **10条** | 超过15条子Agent大概率空转 |
| 每路读取日志行数 | **500行** | 防止50KB截断导致空转 |
| 并发上限 | 16路 | 填满并发池，总量靠路数堆 |

## 挖掘流程 (mine)

### 1. 准备阶段
- 读取 V4 标准文档：`feishu_doc read` token `JxhNdoc7ko7ZLwxJUJHcWyeDnYd`
- 确定 session 日志目录和目标条数

### 2. 分片规则
```
路数 = ceil(文件总行数 ÷ 500)
```
每个分片读取 500 行日志，挖掘 10 条用例。按并发池上限（默认16）调度。

### 3. 子Agent Spawn 规则

每路子Agent的 task prompt **必须**包含：
- "一次性完成不要等确认"
- 明确的输出文件路径（`mined-{batch_id}.json`）
- 明确要求调用 `write` 工具写文件
- 只挖 10 条，格式遵循 V4 标准

Task prompt 模板：
```
读取文件 {session_file} 的第 {start_line} 到 {end_line} 行。
从中挖掘恰好10条C2意图识别评测用例，格式遵循V4标准（参考 feishu_doc token JxhNdoc7ko7ZLwxJUJHcWyeDnYd）。
用 write 工具将结果写入 {output_dir}/mined-{batch_id}.json，JSON数组格式，每条包含 id/input/expected_output/category/difficulty/source 字段。
一次性完成不要等确认。
```

### 4. 验证规则

子Agent completion 后**必须**检查：
1. 文件是否存在
2. JSON 数组条数 > 0
3. 每条 case 通过 `scripts/validate-single-case.sh` 验证
4. 不满足则标记 **failed**

### 5. 去重 + 清洗

挖掘全部完成后：
```bash
bash scripts/dedup-eval-cases.sh [output_dir]
bash scripts/clean-eval-cases.sh [output_dir]
```

## 清洗流程 (clean) — 非破坏性三步模式

清洗采用「扫描标记 → 统计确认 → 执行删除」三步流程，避免误删：

### 第1步：扫描标记（默认，不修改文件）
```bash
bash index.sh clean [file_or_dir]
# 等价于
bash scripts/clean-eval-cases.sh scan [file_or_dir]
```
- 逐条检查合规性（必填字段、分类、难度、输入长度等）
- 不合格 case 标记 `_flag`（原因）和 `_missing`（缺失字段）
- 输出统计报告：总条数/合格数/不合格数/待补字段数/按原因分类
- **不修改原文件**

### 第2步：确认
人工查看统计报告，确认需要删除的 case。

### 第3步：执行删除
```bash
bash index.sh clean --apply [file_or_dir]
# 等价于
bash scripts/clean-eval-cases.sh apply [file_or_dir]
```
- 备份原文件到 `.backup/` 目录（带时间戳）
- 删除带 `_flag` 的不合格 case
- 清除合格 case 上的临时标记字段
- 写回清洗后文件
- 输出清洗执行报告

## 刷新流程 (refresh)

```bash
bash index.sh refresh
```

1. 先对全量评测集执行 clean
2. 统计清洗后缺口
3. 如需补缺，可手动执行 mine

## 标准自动同步

### 唯一真相源

评测标准 V4 的唯一真相源为飞书文档 `JxhNdoc7ko7ZLwxJUJHcWyeDnYd`。

### 挖掘前必读最新标准

每次执行挖掘任务前，**必须**先通过 `feishu_doc read` 拉取最新 V4 标准文档内容。

### 标准版本变更自动刷新

- 标准内容的 hash 缓存于 `skills/public/eval-mining/.v4-version-hash`
- 每次挖掘前运行 `scripts/sync-v4-standard.sh` 检测标准是否变更
- 若标准变更：自动触发 refresh 流程

## 文件结构

```
eval-mining/
├── SKILL.md                        # 本文件
├── config.json                     # 配置参数（含 quality_rules）
├── index.sh                        # 统一入口（mine/clean/refresh）
├── .v4-version-hash                # V4标准内容hash缓存
├── scripts/
│   ├── clean-eval-cases.sh         # 清洗脚本
│   ├── validate-single-case.sh     # 单条case V4合规验证
│   ├── dedup-eval-cases.sh         # 去重脚本
│   ├── sync-v4-standard.sh         # V4标准同步检测
│   └── refresh-evalset.sh          # 评测集合规刷新
└── tests/
    └── test-mining.sh              # 验证脚本
```

## 使用方式

```bash
# 挖掘模式
bash index.sh mine <session日志目录> <目标条数> [并发数]

# 清洗模式（扫描统计，不删除）
bash index.sh clean [file_or_dir]

# 清洗模式（确认后执行删除）
bash index.sh clean --apply [file_or_dir]

# 刷新模式（clean全量 + 统计缺口）
bash index.sh refresh

# 单独去重
bash scripts/dedup-eval-cases.sh [output_dir]

# 单条case验证
bash scripts/validate-single-case.sh '<json_string>'

# 验证产出
bash tests/test-mining.sh [output_dir]
```
