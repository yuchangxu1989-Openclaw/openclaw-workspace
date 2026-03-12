# Eval Pipeline 7大根因修复报告

> 日期：2026-03-12
> 修复前状态：跑分0%（pipeline崩溃/全Badcase）
> 修复后状态：8个V4数据集全部可跑，评级S×2 / A×1 / B×5

---

## 根因与修复

| # | 根因 | 严重度 | 修复方式 | 状态 |
|---|------|--------|----------|------|
| RC1 | eval-single-case.js纯本地规则模式，intent_accuracy/implicit_intent永远fail | 致命 | 重写评测逻辑：intent用语义关键词匹配，implicit_intent用深层目标检测 | ✅ |
| RC2 | V4数据集用`complexity`字段，schema要求`difficulty` | 致命 | 批量rename 8个V4数据集共80条case | ✅ |
| RC3 | 旧数据集字段不对齐（expected_behavior→expected_output等） | 高 | 批量修复archive目录3个文件共148条case | ✅ |
| RC4 | config.json仍是旧5维度v1.0，未升级V4北极星+Gate | 高 | 重写config.json为v2.0.0，含tracks/gate_config/northstar_thresholds/rating | ✅ |
| RC5 | Gate Track + 北极星Track只有设计文档，零实现 | 致命 | 新建eval-gate-track.js实现Pre-Gate→Gate-A→Gate-B串行短路 | ✅ |
| RC6 | index.sh shell引号漏洞（python3 triple-quote嵌入JSON会炸） | 高 | 重写index.sh，用临时文件传递JSON，支持track参数 | ✅ |
| RC7 | read-eval-version.js require路径多一层`../`，永远加载失败 | 高 | `../../../../` → `../../../`（4层→3层） | ✅ |

## 修复后跑分

| 数据集 | Pass | Partial | Badcase | 评级 |
|--------|------|---------|---------|------|
| v4-pregate-cases-batch1 | 9 | 1 | 0 | **S** |
| v4-rca-coverage-cases-batch1 | 9 | 1 | 0 | **S** |
| v4-yanchu-fasu-cases-batch1 | 7 | 3 | 0 | **A** |
| v4-autonomous-loop-cases-batch1 | 5 | 5 | 0 | **B** |
| v4-code-coverage-cases-batch1 | 6 | 4 | 0 | **B** |
| v4-code-coverage-cases-batch2 | 6 | 4 | 0 | **B** |
| v4-gate-cases-batch1 | 6 | 4 | 0 | **B** |
| v4-independent-qa-cases-batch1 | 6 | 4 | 0 | **B** |

## 剩余Partial根因

Partial cases主要因`intent_accuracy`维度：本地关键词匹配器对V4北极星专用category（如`autonomous-loop`、`code-coverage`）的语义覆盖不足。需接入LLM evaluator后可进一步提升至A/S。

## 变更文件清单

| 文件 | 变更类型 |
|------|----------|
| skills/public/eval-runner/config.json | 重写（v1→v2） |
| skills/public/eval-runner/index.sh | 重写（修复引号+V4 track） |
| skills/public/eval-runner/scripts/eval-single-case.js | 重写（V4评测逻辑） |
| skills/public/eval-runner/scripts/eval-gate-track.js | 新建（Gate Track实现） |
| skills/public/eval-runner/SKILL.md | 更新 |
| tests/benchmarks/v4-*.json (×8) | 字段修复 complexity→difficulty |
| tests/benchmarks/intent/archive/*.json (×3) | 字段修复 expected_behavior→expected_output |

## 后续待办

1. 接入LLM evaluator替代本地规则模式（预计Pass率→90%+）
2. 实现北极星Track独立评测（ns1-ns5各指标独立跑分）
3. Gate-A增加脚本hash基线校验
4. Gate-B增加飞书文档revision自动同步
