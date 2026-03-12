# eval-runner — V4评测流水线技能

## 触发条件
用户要求对评测集进行质量评测、跑eval、执行评测集。

## 核心原则
**执行者 ≠ 评测者（角色分离铁律）**

## V4流水线架构
```
Pre-Gate → Gate-A → Gate-B → 五维评测 → S/A/B/C/F评级
```

### Gate Track（串行短路）
| Gate | 检查内容 |
|------|----------|
| Pre-Gate | case id唯一、必填字段完整、category/difficulty合法 |
| Gate-A | 评测脚本存在、角色分离、标准版本可读 |
| Gate-B | schema同步、北极星配置完整、评级体系完整 |

### 评测维度（5维）
| 维度 | 说明 |
|------|------|
| intent_accuracy | 意图分类准确性（语义匹配） |
| chain_completeness | 执行链完整性（覆盖率≥80%） |
| cross_module | 跨模块协同（功能模块检测） |
| implicit_intent | 隐含意图捕获（深层目标分析） |
| context_utilization | 上下文利用 |

### 评级体系
| 评级 | 条件 |
|------|------|
| S | Gate通过 + Pass≥90% |
| A | Gate通过 + Pass≥70% |
| B | Gate通过 + Pass≥50% |
| C | Gate通过 + Pass≥20% |
| F | Gate未通过 |

### V4扩展字段支持
- `north_star_indicator`: 北极星指标映射
- `scoring_rubric`: case级评分标准
- `gate`: 门禁阶段标记

## 用法
```bash
# 完整V4流水线（默认）
bash index.sh <case_file> [batch_size] [track]

# track选项: full | gate | northstar | legacy
bash index.sh tests/benchmarks/v4-pregate-cases-batch1.json 10 full
```

## 输入格式
V4 schema定义的JSON数组，必填字段：id, input, expected_output, category, difficulty, source

## 输出
- `results/eval-results-<ts>.json` — 结构化评测结果
- `results/eval-report-<ts>.md` — 可读报告
