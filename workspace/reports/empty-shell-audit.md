# 空架子技能审计报告

审计范围：`/root/.openclaw/workspace/skills/`

判定口径：
- `有 SKILL.md 且无 .js/.py/.sh 代码` => **空架子**
- `有代码且总代码行数 > 50` => **实质性技能**
- 其余 => **半成品**

| 技能 | SKILL.md | 代码文件数(.js/.py/.sh) | 代码总行数 | 测试文件 | 分类 | 处置建议 |
|---|---:|---:|---:|---:|---|---|
| aeo | 是 | 5 | 802 | 否 | 实质性技能 | - |
| agent-mode-enforcer | 是 | 1 | 24 | 否 | 半成品 | - |
| anti-entropy-checker | 是 | 1 | 191 | 否 | 实质性技能 | - |
| api | 是 | 1 | 40 | 否 | 半成品 | - |
| api-aggregator | 是 | 2 | 245 | 是 | 实质性技能 | - |
| architecture-review-pipeline | 是 | 1 | 247 | 否 | 实质性技能 | - |
| capability-anchor | 是 | 1 | 24 | 否 | 半成品 | - |
| cogvideo | 是 | 1 | 96 | 否 | 实质性技能 | - |
| cogview | 是 | 1 | 82 | 否 | 实质性技能 | - |
| convert-helper | 是 | 1 | 36 | 否 | 半成品 | - |
| cras | 是 | 17 | 6592 | 是 | 实质性技能 | - |
| cras-generated-1771827136412 | 是 | 1 | 14 | 否 | 半成品 | - |
| cras-generated-1771827197478 | 是 | 1 | 14 | 否 | 半成品 | - |
| cras-generated-1772042431830 | 是 | 1 | 14 | 否 | 半成品 | - |
| cras-generated-1772128853925 | 是 | 1 | 14 | 否 | 半成品 | - |
| daily-ops-report | 是 | 1 | 24 | 否 | 半成品 | - |
| lto-core | 是 | 46 | 10898 | 是 | 实质性技能 | - |
| etl | 是 | 1 | 40 | 否 | 半成品 | - |
| evolver | 是 | 49 | 10272 | 否 | 实质性技能 | - |
| evomap-a2a | 是 | 1 | 702 | 否 | 实质性技能 | - |
| evomap-publisher | 是 | 1 | 547 | 否 | 实质性技能 | - |
| evomap-uploader | 是 | 1 | 24 | 否 | 半成品 | - |
| feishu-card-sender | 是 | 2 | 360 | 否 | 实质性技能 | - |
| feishu-chat-backup | 是 | 1 | 316 | 否 | 实质性技能 | - |
| feishu-common | 是 | 1 | 79 | 否 | 实质性技能 | - |
| feishu-evolver-wrapper | 是 | 20 | 4500 | 否 | 实质性技能 | - |
| feishu-report-sender | 是 | 4 | 384 | 否 | 实质性技能 | - |
| file-downloader | 是 | 1 | 155 | 否 | 实质性技能 | - |
| five-layer-event-model | 是 | 1 | 95 | 否 | 实质性技能 | - |
| github-api | 是 | 1 | 141 | 否 | 实质性技能 | - |
| glm-4v | 是 | 1 | 78 | 否 | 实质性技能 | - |
| glm-image | 是 | 1 | 73 | 否 | 实质性技能 | - |
| glm-ocr | 是 | 1 | 91 | 否 | 实质性技能 | - |
| glm-tts | 是 | 1 | 86 | 否 | 实质性技能 | - |
| glm-video | 是 | 1 | 84 | 否 | 实质性技能 | - |
| glm-vision | 是 | 1 | 106 | 否 | 实质性技能 | - |
| intent-design-principles | 是 | 1 | 375 | 否 | 实质性技能 | - |
| isc-capability-anchor-sync | 是 | 1 | 242 | 否 | 实质性技能 | - |
| isc-core | 是 | 39 | 8132 | 否 | 实质性技能 | - |
| isc-document-quality | 是 | 1 | 557 | 否 | 实质性技能 | - |
| isc-report-readability | 是 | 1 | 24 | 否 | 半成品 | - |
| layered-architecture-checker | 是 | 1 | 139 | 否 | 实质性技能 | - |
| lep-executor | 是 | 8 | 3219 | 否 | 实质性技能 | - |
| new-skill | 是 | 1 | 40 | 否 | 半成品 | - |
| new-skill-v2 | 是 | 1 | 40 | 否 | 半成品 | - |
| parallel-subagent | 是 | 2 | 167 | 否 | 实质性技能 | - |
| paths-center | 是 | 1 | 24 | 否 | 半成品 | - |
| pdca-engine | 是 | 1 | 241 | 否 | 实质性技能 | - |
| project-mgmt | 是 | 1 | 141 | 否 | 实质性技能 | - |
| public | 是 | 57 | 13422 | 是 | 实质性技能 | - |
| rule-hygiene | 是 | 1 | 24 | 否 | 半成品 | - |
| ruleify | 是 | 1 | 24 | 否 | 半成品 | - |
| seef | 是 | 69 | 33562 | 是 | 实质性技能 | - |
| shared | 是 | 2 | 68 | 否 | 实质性技能 | - |
| system-mapping-visualizer | 是 | 1 | 25 | 否 | 半成品 | - |
| test-skill-for-seef | 是 | 1 | 35 | 否 | 半成品 | - |
| verify-test-skill | 是 | 1 | 40 | 否 | 半成品 | - |
| zhipu-image-gen | 是 | 1 | 81 | 否 | 实质性技能 | - |
| zhipu-keys | 是 | 1 | 64 | 否 | 实质性技能 | - |
| zhipu-vision | 是 | 1 | 124 | 否 | 实质性技能 | - |

## 汇总

- 实质性技能：40
- 半成品：20
- 空架子：0

## 空架子清单与整改计划

未发现空架子。

## 三阶段治理建议（P0）

1. **本周止血**：先删除明确模板/生成残留目录；为保留项补最小可运行脚本与1个冒烟测试。
2. **两周收敛**：将重复功能技能合并，统一脚手架（入口脚本、README、tests）。
3. **长期机制**：在CI加入准入规则：无SKILL.md或无>50行实现、无测试则禁止入库。
