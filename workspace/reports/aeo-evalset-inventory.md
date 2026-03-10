# AEO 评测集盘点报告

## 1) 文件统计
- `tests/benchmarks/intent/` 文件总数：**10**
- `skills/aeo/` 文件总数：**254**
- `skills/aeo/` 中评测相关文件数（关键词过滤）：**222**

### tests/benchmarks/intent 文件清单
- `/root/.openclaw/workspace/tests/benchmarks/intent/intent-benchmark-dataset.json`
- `/root/.openclaw/workspace/tests/benchmarks/intent/intent-classification-prompt.txt`
- `/root/.openclaw/workspace/tests/benchmarks/intent/multi-turn-eval-dataset.json`
- `/root/.openclaw/workspace/tests/benchmarks/intent/real-conversation-samples.json`
- `/root/.openclaw/workspace/tests/benchmarks/intent/run-claude-benchmark.js`
- `/root/.openclaw/workspace/tests/benchmarks/intent/run-e2e-eval.js`
- `/root/.openclaw/workspace/tests/benchmarks/intent/run-intent-benchmark-llm.js`
- `/root/.openclaw/workspace/tests/benchmarks/intent/run-intent-benchmark.js`
- `/root/.openclaw/workspace/tests/benchmarks/intent/run-multi-turn-benchmark.js`
- `/root/.openclaw/workspace/tests/benchmarks/intent/run-real-conversation-benchmark.js`

### skills/aeo 评测相关文件（关键词过滤）
- `/root/.openclaw/workspace/skills/aeo/bin/evalset-cron/README.md`
- `/root/.openclaw/workspace/skills/aeo/bin/evalset-cron/dedup-engine.cjs`
- `/root/.openclaw/workspace/skills/aeo/bin/evalset-cron/session-sampler.cjs`
- `/root/.openclaw/workspace/skills/aeo/bin/generate-real-conv-evalset.cjs`
- `/root/.openclaw/workspace/skills/aeo/bin/migrate-evaluation-sets.cjs`
- `/root/.openclaw/workspace/skills/aeo/evalset-cron-output/run-log.jsonl`
- `/root/.openclaw/workspace/skills/aeo/evaluation-set-registry-standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/aeo-vector-system/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/aeo-vector-system/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/aeo/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/aeo/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/aeo/test-cases.json.backup.1772132532098`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/agent-mode-enforcer/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/agent-mode-enforcer/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/anti-entropy-checker/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/anti-entropy-checker/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/api-aggregator/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/api-aggregator/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/api/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/api/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/api/test-cases.json.backup.1772485618434`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/architecture-review-pipeline/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/architecture-review-pipeline/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/capability-anchor/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/capability-anchor/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/capability-anchor/test-cases.json.backup.1772132532099`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/cogvideo/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/cogvideo/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/cogview/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/cogview/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/convert-helper/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/convert-helper/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/convert-helper/test-cases.json.backup.1772132532099`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/council-of-seven/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/council-of-seven/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/council-of-seven/test-cases.json.backup.1772132532100`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/cras-generated-1771827136412/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/cras-generated-1771827136412/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/cras-generated-1771827136412/test-cases.json.backup.1772132532102`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/cras-generated-1771827197478/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/cras-generated-1771827197478/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/cras-generated-1771827197478/test-cases.json.backup.1772132532102`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/cras-generated-1772042431830/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/cras-generated-1772042431830/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/cras-generated-1772042431830/test-cases.json.backup.1772132532102`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/cras-generated-1772128853925/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/cras-generated-1772128853925/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/cras-generated-1772128853925/test-cases.json.backup.1772132532103`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/cras-intent/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/cras-intent/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/cras/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/cras/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/cras/test-cases.json.backup.1772132532101`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/daily-ops-report/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/daily-ops-report/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/lto-core/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/lto-core/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/lto-core/test-cases.json.backup.1772132532103`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/elite-longterm-memory/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/elite-longterm-memory/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/elite-longterm-memory/test-cases.json.backup.1772132532103`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/etl/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/etl/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/etl/test-cases.json.backup.1772485618436`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/eval_1772046931828_g4oqgl7io.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/eval_1772046981635_n2nakzo12.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/evolver/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/evolver/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/evolver/test-cases.json.backup.1772132532105`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/evomap-a2a/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/evomap-a2a/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/evomap-a2a/test-cases.json.backup.1772132532106`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/evomap-publisher/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/evomap-publisher/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/evomap-publisher/test-cases.json.backup.1772485618436`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/evomap-uploader/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/evomap-uploader/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/feishu-card-sender/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/feishu-card-sender/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/feishu-chat-backup/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/feishu-chat-backup/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/feishu-chat-backup/test-cases.json.backup.1772132532106`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/feishu-common/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/feishu-common/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/feishu-evolver-wrapper/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/feishu-evolver-wrapper/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/feishu-evolver-wrapper/test-cases.json.backup.1772485618437`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/feishu-report-sender/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/feishu-report-sender/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/feishu-report-sender/test-cases.json.backup.1772132532106`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/file-downloader/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/file-downloader/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/file-sender/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/file-sender/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/file-sender/test-cases.json.backup.1772132532106`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/five-layer-event-model/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/five-layer-event-model/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/fix-test-cases.cjs`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/github-api/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/github-api/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/glm-4v/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/glm-4v/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/glm-5-coder/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/glm-5-coder/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/glm-5-coder/test-cases.json.backup.1772132532106`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/glm-asr/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/glm-asr/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/glm-asr/test-cases.json.backup.1772132532106`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/glm-image/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/glm-image/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/glm-ocr/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/glm-ocr/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/glm-tts/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/glm-tts/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/glm-video/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/glm-video/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/glm-vision/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/glm-vision/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/intent-design-principles/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/intent-design-principles/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/isc-capability-anchor-sync/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/isc-capability-anchor-sync/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/isc-capability-anchor-sync/test-cases.json.backup.1772132532107`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/isc-core/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/isc-core/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/isc-core/test-cases.json.backup.1772132532107`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/isc-document-quality/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/isc-document-quality/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/isc-document-quality/test-cases.json.backup.1772132532107`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/isc-report-readability/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/isc-report-readability/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/layered-architecture-checker/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/layered-architecture-checker/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/lep-executor/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/lep-executor/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/lep-executor/test-cases.json.backup.1772132532107`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/mr-router/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/mr-router/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/new-skill-v2/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/new-skill-v2/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/new-skill-v2/test-cases.json.backup.1772485618438`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/new-skill/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/new-skill/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/new-skill/test-cases.json.backup.1772485618437`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/parallel-subagent/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/parallel-subagent/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/parallel-subagent/test-cases.json.backup.1772132532109`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/paths-center/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/paths-center/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/paths-center/test-cases.json.backup.1772132532109`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/pdca-engine/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/pdca-engine/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/pdca-engine/test-cases.json.backup.1772132532109`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/project-mgmt/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/project-mgmt/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/public/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/public/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/real-conv-2026-03-06/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/real-conv-2026-03-06/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/real-conv-2026-03-07-exec-chain-remediation/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/real-conv-2026-03-07-exec-chain-remediation/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/rule-hygiene/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/rule-hygiene/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/ruleify/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/ruleify/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/seef/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/seef/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/seef/test-cases.json.backup.1772132532109`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/shared/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/shared/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/system-mapping-visualizer/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/system-mapping-visualizer/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/system-monitor/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/system-monitor/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/system-monitor/test-cases.json.backup.1772132532109`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/tavily-search/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/tavily-search/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/test-skill-for-seef/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/test-skill-for-seef/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/test-skill-for-seef/test-cases.json.backup.1772485618438`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/verify-test-skill/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/verify-test-skill/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/verify-test-skill/test-cases.json.backup.1772485618438`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/zhipu-image-gen/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/zhipu-image-gen/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/zhipu-keys/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/zhipu-keys/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/zhipu-router/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/zhipu-router/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/zhipu-router/test-cases.json.backup.1772132532110`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/zhipu-vision/standard.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/zhipu-vision/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/修复建议报告.md`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/执行报告.md`
- `/root/.openclaw/workspace/skills/aeo/reports/api-evaluation-required.json`
- `/root/.openclaw/workspace/skills/aeo/reports/cras-evaluation-required.json`
- `/root/.openclaw/workspace/skills/aeo/reports/lep-executor-evaluation-required.json`
- `/root/.openclaw/workspace/skills/aeo/reports/report_eval_1772046931828_g4oqgl7io_1772046931884.json`
- `/root/.openclaw/workspace/skills/aeo/reports/report_eval_1772046931828_g4oqgl7io_1772046931884.txt`
- `/root/.openclaw/workspace/skills/aeo/reports/report_eval_1772046981635_n2nakzo12_1772046981689.json`
- `/root/.openclaw/workspace/skills/aeo/reports/report_eval_1772046981635_n2nakzo12_1772046981689.txt`
- `/root/.openclaw/workspace/skills/aeo/src/core/registry-manager.cjs`
- `/root/.openclaw/workspace/skills/aeo/src/evaluation/DELIVERY-REPORT.md`
- `/root/.openclaw/workspace/skills/aeo/src/evaluation/README.md`
- `/root/.openclaw/workspace/skills/aeo/src/evaluation/ai-effect-evaluator.cjs`
- `/root/.openclaw/workspace/skills/aeo/src/evaluation/executor.cjs`
- `/root/.openclaw/workspace/skills/aeo/src/evaluation/function-quality-evaluator.cjs`
- `/root/.openclaw/workspace/skills/aeo/src/evaluation/index.cjs`
- `/root/.openclaw/workspace/skills/aeo/src/evaluation/intent-alignment.cjs`
- `/root/.openclaw/workspace/skills/aeo/src/evaluation/run-demo.cjs`
- `/root/.openclaw/workspace/skills/aeo/src/evaluation/scheduler.cjs`
- `/root/.openclaw/workspace/skills/aeo/src/evaluation/scorer.cjs`
- `/root/.openclaw/workspace/skills/aeo/src/evaluation/selector.cjs`
- `/root/.openclaw/workspace/skills/aeo/src/evaluation/test-dual-track.cjs`
- `/root/.openclaw/workspace/skills/aeo/src/evaluation/test-intent-llm-primary.cjs`
- `/root/.openclaw/workspace/skills/aeo/unified-evaluation-sets/ai-effect-tests/model-router-cases.json`
- `/root/.openclaw/workspace/skills/aeo/unified-evaluation-sets/eval.file-tool.001.json`
- `/root/.openclaw/workspace/skills/aeo/unified-evaluation-sets/function-tests/evolver-unit-cases.json`
- `/root/.openclaw/workspace/skills/aeo/unified-evaluation-sets/function-tests/model-router-cases.json`
- `/root/.openclaw/workspace/skills/aeo/unified-evaluation-sets/function-tests/vector-system-cases.json`
- `/root/.openclaw/workspace/skills/aeo/unified-evaluation-sets/index.json`
- `/root/.openclaw/workspace/skills/aeo/unified-evaluation-sets/registry.json`

## 2) 评测集逐项统计

| 评测集文件 | 用例数 | 覆盖意图类型(IC1-IC5) | 来源 |
|---|---:|---|---|
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/aeo-vector-system/test-cases.json` | 10 | IC1/IC3 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/aeo/test-cases.json` | 5 | IC2 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/agent-mode-enforcer/test-cases.json` | 6 | IC1/IC5 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/anti-entropy-checker/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/api-aggregator/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/api/test-cases.json` | 3 | IC3 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/architecture-review-pipeline/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/capability-anchor/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/cogvideo/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/cogview/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/convert-helper/test-cases.json` | 5 | IC1 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/council-of-seven/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/cras-generated-1771827136412/test-cases.json` | 5 | 未标注 | 合成 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/cras-generated-1771827197478/test-cases.json` | 5 | 未标注 | 合成 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/cras-generated-1772042431830/test-cases.json` | 5 | 未标注 | 合成 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/cras-generated-1772128853925/test-cases.json` | 5 | 未标注 | 合成 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/cras-intent/test-cases.json` | 8 | IC1/IC4/IC5 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/cras/test-cases.json` | 6 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/daily-ops-report/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/lto-core/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/elite-longterm-memory/test-cases.json` | 5 | IC1 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/etl/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/evolver/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/evomap-a2a/test-cases.json` | 5 | IC1 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/evomap-publisher/test-cases.json` | 5 | IC1 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/evomap-uploader/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/feishu-card-sender/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/feishu-chat-backup/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/feishu-common/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/feishu-evolver-wrapper/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/feishu-report-sender/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/file-downloader/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/file-sender/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/five-layer-event-model/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/github-api/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/glm-4v/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/glm-5-coder/test-cases.json` | 5 | IC1 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/glm-asr/test-cases.json` | 5 | IC5 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/glm-image/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/glm-ocr/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/glm-tts/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/glm-video/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/glm-vision/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/intent-design-principles/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/isc-capability-anchor-sync/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/isc-core/test-cases.json` | 6 | IC1/IC4 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/isc-document-quality/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/isc-report-readability/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/layered-architecture-checker/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/lep-executor/test-cases.json` | 6 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/new-skill-v2/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/new-skill/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/parallel-subagent/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/paths-center/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/pdca-engine/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/project-mgmt/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/public/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/real-conv-2026-03-06/test-cases.json` | 2 | IC1/IC5 | 真实对话 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/real-conv-2026-03-07-exec-chain-remediation/test-cases.json` | 8 | IC1/IC2/IC4/IC5 | 真实对话 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/rule-hygiene/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/ruleify/test-cases.json` | 6 | IC1/IC5 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/seef/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/shared/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/system-mapping-visualizer/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/system-monitor/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/tavily-search/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/test-skill-for-seef/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/verify-test-skill/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/zhipu-image-gen/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/zhipu-keys/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/zhipu-router/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/evaluation-sets/zhipu-vision/test-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/unified-evaluation-sets/ai-effect-tests/model-router-cases.json` | 10 | IC1 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/unified-evaluation-sets/eval.file-tool.001.json` | 8 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/unified-evaluation-sets/function-tests/evolver-unit-cases.json` | 5 | 未标注 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/unified-evaluation-sets/function-tests/model-router-cases.json` | 9 | IC5 | 标注 |
| `/root/.openclaw/workspace/skills/aeo/unified-evaluation-sets/function-tests/vector-system-cases.json` | 10 | IC1/IC3 | 标注 |
| `/root/.openclaw/workspace/tests/benchmarks/intent/intent-benchmark-dataset.json` | 80 | IC1/IC2/IC3/IC4/IC5 | 标注 |
| `/root/.openclaw/workspace/tests/benchmarks/intent/multi-turn-eval-dataset.json` | 42 | IC1/IC4/IC5 | 标注 |
| `/root/.openclaw/workspace/tests/benchmarks/intent/real-conversation-samples.json` | 41 | IC3/IC4/IC5 | 真实对话 |

## 3) 真实对话样本占比
- 总用例数：**576**
- 真实对话用例数：**51**
- 真实对话占比：**8.85%**

## 4) 说明与方法
- 用例数优先从 JSON 中常见字段提取：`testCases/test_cases/cases/items/dataset/samples/conversations/data`。
- 意图类型通过显式 `IC1-IC5` 标签检索；若缺失，基于关键词进行弱推断。
- 来源按文件名规则识别：`real-conv/real-conversation` 视为真实对话，`generated/synthetic` 视为合成，其余归为标注。