# 评测集大盘点报告
生成时间: 2026-03-12 08:34:09

## 总览
| 指标 | 数值 |
|------|------|
| 来源数 | 98 |
| 原始总条数 | 551 |
| 跨来源重复条数 | 254 |
| 去重后条数 | 297 |
| V4字段覆盖(去重后) | 175/297 (58%) |
| 覆盖技能数 | 41 |

## 按来源分类
| 来源类别 | 来源数 | 原始条数 | V4条数 | 重复条数 |
|----------|--------|----------|--------|----------|
| evaluation-sets | 70 | 353 | 100 | 0 |
| generated | 1 | 17 | 0 | 0 |
| registry-inline | 1 | 5 | 0 | 0 |
| skill-evals | 21 | 134 | 120 | 0 |
| unified | 5 | 42 | 0 | 0 |

## 按技能分布 (去重后)
| 技能 | 条数 | V4覆盖 |
|------|------|--------|
| aeo | 11 | 11/11 |
| aeo-vector-system | 10 | 10/10 |
| agent-mode-enforcer | 12 | 12/12 |
| anti-entropy-checker | 6 | 6/6 |
| api | 3 | 3/3 |
| api-aggregator | 11 | 11/11 |
| architecture-review-pipeline | 6 | 6/6 |
| cogvideo | 6 | 6/6 |
| cogview | 6 | 6/6 |
| convert-helper | 11 | 11/11 |
| council-of-seven | 5 | 5/5 |
| cras | 12 | 12/12 |
| cras-intent | 8 | 8/8 |
| cron-health | 6 | 6/6 |
| daily-ops-report | 6 | 6/6 |
| dispatch-protocol | 6 | 6/6 |
| dto-core | 6 | 6/6 |
| evalset-refresh | 17 | 0/17 |
| evolver | 11 | 8/11 |
| evolver-unit | 1 | 0/1 |
| evomap-a2a | 6 | 6/6 |
| evomap-publisher | 6 | 6/6 |
| evomap-uploader | 6 | 6/6 |
| feishu-card-sender | 6 | 6/6 |
| feishu-chat-backup | 11 | 6/11 |
| feishu-common | 6 | 6/6 |
| file-sender | 5 | 0/5 |
| file-tool | 8 | 0/8 |
| glm-5-coder | 5 | 0/5 |
| glm-asr | 5 | 0/5 |
| isc-core | 1 | 0/1 |
| lep-executor | 6 | 0/6 |
| lto-core | 5 | 0/5 |
| model-router | 19 | 0/19 |
| parallel-subagent | 5 | 0/5 |
| quality-audit | 14 | 0/14 |
| real-conv-2026-03-06 | 2 | 0/2 |
| real-conv-2026-03-07-exec-chain-remediation | 8 | 0/8 |
| real-conv-2026-03-08 | 3 | 0/3 |
| seef | 5 | 0/5 |
| weather | 5 | 0/5 |

## V4字段缺失分析
完全无V4字段的技能: 17个
  - evalset-refresh (17条)
  - evolver-unit (1条)
  - file-sender (5条)
  - file-tool (8条)
  - glm-5-coder (5条)
  - glm-asr (5条)
  - isc-core (1条)
  - lep-executor (6条)
  - lto-core (5条)
  - model-router (19条)
  - parallel-subagent (5条)
  - quality-audit (14条)
  - real-conv-2026-03-06 (2条)
  - real-conv-2026-03-07-exec-chain-remediation (8条)
  - real-conv-2026-03-08 (3条)
  - seef (5条)
  - weather (5条)

## 输出文件
- 统一评测集: `evals/unified/all-cases.json` (297条)
- 按技能拆分: `evals/unified/by-skill/` (41个文件)