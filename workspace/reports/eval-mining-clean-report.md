# 评测集清洗报告

**清洗时间**: 2026-03-09
**V4标准来源**: feishu_doc JxhNdoc7ko7ZLwxJUJHcWyeDnYd

## 格式修复
以下文件从非标准格式修复为标准JSON数组：
- （无需修复，所有文件已是标准JSON数组）

## V4标准清洗规则
- 必须有字段：id, input, expected_output, category, difficulty, source
- difficulty: C1或C2
- source: real_conversation
- category: V3八类之一
- input长度 ≥ 20字
- C2: multi_turn=true + 执行链/复杂度标签≥3项

## 清洗结果
- 原始总条数: 35
- 不合格删除: 21
- 去重删除: 0
- **最终保留: 14**

## 删除明细（不合格）
| 文件 | Case ID | 原因 |
|------|---------|------|
| mined-from-memory.json | mined-001 | input_too_short:18chars |
| mined-from-memory.json | mined-004 | invalid_category:多意图类, input_too_short:9chars |
| mined-from-memory.json | mined-005 | invalid_category:认知类 |
| mined-from-memory.json | mined-008 | invalid_category:认知类 |
| mined-from-memory.json | mined-009 | invalid_category:认知类 |
| mined-from-memory.json | mined-010 | invalid_category:情绪信号类 |
| mined-from-memory.json | mined-013 | input_too_short:15chars |
| mined-from-memory.json | mined-014 | invalid_category:认知类 |
| mined-from-memory.json | mined-015 | invalid_category:多意图类 |
| mined-from-memory.json | mined-016 | invalid_category:多意图类 |
| mined-from-memory.json | mined-019 | invalid_category:认知类 |
| mined-from-memory.json | mined-021 | invalid_category:认知类 |
| mined-from-memory.json | mined-022 | input_too_short:7chars |
| mined-from-memory.json | mined-026 | invalid_category:认知类 |
| mined-from-memory.json | mined-027 | input_too_short:19chars |
| mined-from-memory.json | mined-028 | invalid_category:认知类 |
| mined-from-memory.json | mined-029 | invalid_category:认知类 |
| mined-from-memory.json | mined-031 | invalid_category:认知类 |
| mined-from-memory.json | mined-032 | input_too_short:15chars |
| mined-from-memory.json | mined-033 | invalid_category:情绪信号类, input_too_short:19chars |
| mined-from-memory.json | mined-035 | invalid_category:认知类 |

## 最终统计
- **总条数**: 14
- **C2**: 14 (100%)
- **C1**: 0 (0%)

### Category分布
| Category | 数量 | 占比 |
|----------|------|------|
| 纠偏类 | 10 | 71% |
| 认知错误类 | 0 | 0% |
| 全局未对齐类 | 0 | 0% |
| 头痛医头类 | 0 | 0% |
| 反复未果类 | 4 | 28% |
| 连锁跷跷板类 | 0 | 0% |
| 自主性缺失类 | 0 | 0% |
| 交付质量类 | 0 | 0% |

### 各文件条数
| 文件 | 原始 | 保留 |
|------|------|------|
| mined-from-memory.json | 35 | 14 |
| mined-glm-01.json | 0 | 0 |
| mined-glm-02.json | 0 | 0 |
| mined-glm-03.json | 0 | 0 |
| mined-glm-04.json | 0 | 0 |
| mined-glm-06.json | 0 | 0 |
| mined-session-01.json | 0 | 0 |
| mined-session-05.json | 0 | 0 |
| mined-session-07.json | 0 | 0 |
| mined-session-10.json | 0 | 0 |
| mined-session-11.json | 0 | 0 |
| mined-v2-01.json | 0 | 0 |
| mined-v2-03.json | 0 | 0 |
| mined-v2-05.json | 0 | 0 |
| mined-v2-06.json | 0 | 0 |
| mined-v2-07.json | 0 | 0 |
| mined-v2-09.json | 0 | 0 |
| mined-v2-10.json | 0 | 0 |
| mined-v2-11.json | 0 | 0 |
| mined-v2-12.json | 0 | 0 |
| mined-v2-13.json | 0 | 0 |