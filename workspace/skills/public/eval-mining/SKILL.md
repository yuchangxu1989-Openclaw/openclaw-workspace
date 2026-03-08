## 触发条件
当用户意图匹配以下场景时，必须调用本技能：
- 挖掘/补充/生成评测集
- C2 case批量生成
- 评测数据质量刷新
- 评测集与V3标准对齐

# 评测集挖掘技能 (Eval Mining) ⛏️

从 session 日志中挖掘 C2 意图识别评测用例的标准化流程。

## 核心策略：小批量原则

经过大量实验验证，**小批量策略**是挖掘成功的关键：

| 参数 | 值 | 原因 |
|------|-----|------|
| 每路挖掘条数 | **10条**（不多不少） | 超过15条子Agent大概率空转 |
| 每路读取日志行数 | **500行** | 防止50KB截断导致空转 |
| 并发上限 | 16路 | 填满并发池，总量靠路数堆 |

### 空转率统计（经验数据）

| 模型 | 大批量(15-20条) | 小批量(10条) |
|------|-----------------|-------------|
| boom | ~60% 空转 | 显著降低 |
| opus | ~5% 空转 | 接近0% |
| GLM-5 | 待观察 | 待观察 |

**结论：小批量(10条)成功率 >> 大批量(15-20条)**

## 挖掘流程

### 1. 准备阶段
- 读取 V3 标准文档：`feishu_doc read` token `OKmrd21OsotmFkxpT4gcLXjunze`
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
- 只挖 10 条，格式遵循 V3 标准

Task prompt 模板：
```
读取文件 {session_file} 的第 {start_line} 到 {end_line} 行。
从中挖掘恰好10条C2意图识别评测用例，格式遵循V3标准（参考 feishu_doc token OKmrd21OsotmFkxpT4gcLXjunze）。
用 write 工具将结果写入 {output_dir}/mined-{batch_id}.json，JSON数组格式，每条包含 input/expected_intent/context 字段。
一次性完成不要等确认。
```

### 4. 验证规则（关键！）

子Agent completion 后**必须**检查：
1. 文件是否存在（`read` 或 `exec ls`）
2. JSON 数组条数 > 0
3. 不满足则标记 **failed**（不是 done）

```bash
# 验证伪代码
if [ ! -f "$output_file" ]; then
  echo "FAILED: file not written"
elif [ "$(jq length "$output_file")" -eq 0 ]; then
  echo "FAILED: empty array"
else
  echo "DONE: $(jq length "$output_file") cases mined"
fi
```

### 5. 去重

挖掘全部完成后，运行去重脚本：
```bash
bash scripts/dedup-eval-cases.sh
```
基于 input 字段文本相似度去重（完全相同 或 >90% 相似）。

## 标准自动同步

### 唯一真相源

评测标准 V3 的唯一真相源为飞书文档 `OKmrd21OsotmFkxpT4gcLXjunze`。
任何本地缓存、记忆中的标准描述均不可作为最终依据，必须以飞书文档实时内容为准。

### 挖掘前必读最新标准

每次执行挖掘任务前，**必须**先通过 `feishu_doc read` 拉取最新 V3 标准文档内容，确保挖掘口径与最新标准对齐。

### 标准版本变更自动刷新

- 标准内容的 hash 缓存于 `skills/public/eval-mining/.v3-version-hash`
- 每次挖掘前运行 `scripts/sync-v3-standard.sh` 检测标准是否变更
- 若标准变更：
  1. 更新 hash 缓存
  2. 写信号文件到 `.eval-mining-signals/standard-updated`
  3. 自动触发 `scripts/refresh-evalset.sh` 对全量评测集进行合规检查
- 若未变更：跳过刷新，正常挖掘

### 相关脚本

| 脚本 | 用途 |
|------|------|
| `scripts/sync-v3-standard.sh` | 检测 V3 标准是否变更，更新 hash 缓存 |
| `scripts/refresh-evalset.sh` | 读取最新标准，扫描评测集，输出不合格 case |

## 文件结构

```
eval-mining/
├── SKILL.md          # 本文件
├── config.json       # 配置参数
├── index.sh          # 一键挖掘入口
├── .v3-version-hash  # V3标准内容hash缓存
├── scripts/
│   ├── dedup-eval-cases.sh  # 去重脚本
│   ├── sync-v3-standard.sh  # V3标准同步检测
│   └── refresh-evalset.sh   # 评测集合规刷新
└── tests/
    └── test-mining.sh       # 验证脚本
```

## 使用方式

```bash
# 一键挖掘
bash index.sh <session日志目录> <目标条数> [并发数]

# 单独去重
bash scripts/dedup-eval-cases.sh [output_dir]

# 验证产出
bash tests/test-mining.sh [output_dir]
```
