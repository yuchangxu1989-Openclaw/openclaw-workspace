# Benchmark Timeout 收口 — 现状检查（意图分类）

生成时间：2026-03-08 11:43 GMT+8  
检查范围：
- `/root/.openclaw/workspace/tests/benchmarks/intent/`
- `/root/.openclaw/workspace/skills/aeo/`

---

## 1) 评测集清单（intent benchmark 目录）

在 `/root/.openclaw/workspace/tests/benchmarks/intent/` 下识别到可用评测集（JSON）共 **3** 个：

1. `intent-benchmark-dataset.json`（80 条）
2. `multi-turn-eval-dataset.json`（42 条）
3. `real-conversation-samples.json`（41 条）

> 合计测试用例：**163 条**

---

## 2) 统计：评测集数量、测试用例总数、上次运行时间和结果

### 2.1 数据集规模
- 评测集数量：**3**
- 测试用例总数：**163**

### 2.2 最近可识别运行产物
在 `/root/.openclaw/workspace/reports/` 下发现意图 benchmark 相关产物：
- `day1-intent-benchmark.md`（mtime: 2026-03-06 07:20:34）
- `intent-benchmark-90-target-2026-03-06.json`（mtime: 2026-03-06 03:09:48）
- `intent-benchmark-90-target-2026-03-06.md`（mtime: 2026-03-06 03:09:48）

其中 JSON 报告中记录：
- `timestamp`: 2026-03-05T19:09:48.834Z
- `accuracy`: **90.5%**
- `total`: 42
- `correct`: 38

据此可认为最近一次**有结构化结果可读的完整运行**（至少对该 42 条集合）准确率为：**90.5%**。

---

## 3) 超时失败测试记录检查

检查了以下范围中的文本/日志类文件（json/jsonl/log/txt/md）：
- `tests/benchmarks/intent/`
- `skills/aeo/reports/`
- `skills/aeo/logs/`

检索关键词：`timeout` / `timed out` / `超时`

结果：
- 检测到包含超时关键词的记录文件数：**0**
- 当前可见证据下，未发现超时失败测试记录。

> 说明：`run-e2e-eval.js` 与 `run-intent-benchmark-llm.js` 代码中存在请求超时配置（如 60000ms），但本次扫描未找到对应超时失败落盘记录。

---

## 4) AEO 评测 runner 配置检查（`skills/aeo`）

在 `skills/aeo/config/aeo-config.json` 中，评测运行相关关键配置如下：

- `evaluationEngine.maxConcurrent = 3`
- `evaluationEngine.timeout = 300000`（5 分钟）
- `evaluationEngine.autoSave = true`
- `evaluationEngine.defaultTestCasesPerSkill = 5`

与 timeout 收口相关的直接参数是：
- AEO 评测引擎超时阈值：**300000ms**
- intent benchmark 脚本内单请求超时（代码）：常见为 **60000ms**

这意味着存在“框架级 timeout（5 分钟）+ 脚本请求级 timeout（1 分钟）”的双层超时控制。

---

## 5) 当前 benchmark 状态摘要

基于当前可读数据（以发现到的结构化报告为准）：

- **通过率（accuracy）**：**90.5%**（38/42）
- **超时率**：**0%**（未检出超时失败记录）
- **最近一次完整运行准确率**：**90.5%**（报告时间戳：2026-03-05T19:09:48.834Z，对应报告文件更新时间 2026-03-06 03:09:48）

补充：
- 当前 intent 目录内评测集总规模为 163 条，但最新结构化准确率报告覆盖 42 条集合；其余集合未在同一份结构化总报表中发现统一准确率汇总。

---

## 6) 结论（面向 P1 timeout 收口）

1. **数据侧**：intent benchmark 评测集完整可读，规模 3 套 163 条。  
2. **运行侧**：已存在近一次有效 benchmark 结果，准确率达到 90.5%。  
3. **超时侧**：当前日志/报告中未发现 timeout 失败证据，超时率可暂记 0%。  
4. **配置侧**：AEO runner 超时为 300000ms，intent 脚本请求超时常设为 60000ms，建议后续统一口径（框架与脚本超时策略一致化）以避免隐性超时分歧。
