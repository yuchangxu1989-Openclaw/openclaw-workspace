# EvoMap manifest closeout

- 时间: 2026-03-07 00:25 GMT+8
- 目标: 重新扫描 EvoMap manifest 漂移，并对尾项做可直接收口处理。

## 结论

- 已扫描技能目录中带 `SKILL.md` 的顶层技能: **56** 个
- manifest 原已覆盖: **11** 个
- 本次直接纳入: **0** 个
- 收口后 manifest 覆盖: **11** 个

## 本次直接纳入

- 无

## 未直接纳入的尾项分类说明

### 暂不纳入：治理/工具类尾项，保留后续专题收敛

- `agent-mode-enforcer`
- `anti-entropy-checker`
- `architecture-review-pipeline`
- `five-layer-event-model`
- `intent-design-principles`
- `layered-architecture-checker`
- `public`
- `rule-hygiene`
- `ruleify`
- `shared`

### 不能纳入：明确 internal / 本地治理技能

- `api`
- `capability-anchor`
- `cras-generated-1771827136412`
- `cras-generated-1771827197478`
- `cras-generated-1772042431830`
- `cras-generated-1772128853925`
- `daily-ops-report`
- `etl`
- `evolver`
- `feishu-chat-backup`
- `feishu-evolver-wrapper`
- `feishu-report-sender`
- `isc-capability-anchor-sync`
- `new-skill`
- `new-skill-v2`
- `paths-center`
- `pdca-engine`
- `project-mgmt`
- `system-mapping-visualizer`
- `test-skill-for-seef`
- `verify-test-skill`
- `zhipu-image-gen`
- `zhipu-vision`

### 暂不纳入：通用集成技能，缺少当前收口必要性

- `api-aggregator`
- `file-downloader`
- `github-api`

### 暂不纳入：供应商/模型封装，泛用但非 EvoMap 核心清单

- `cogvideo`
- `cogview`
- `glm-4v`
- `glm-image`
- `glm-ocr`
- `glm-tts`
- `glm-video`
- `glm-vision`
- `zhipu-keys`

### 不能纳入：存储/状态目录，不是可发布技能

- `evomap-uploader`

## manifest 变更

- 文件: `skills/isc-core/config/evomap-upload-manifest.json`
- 版本: `1.0.2` → `1.0.3`
- 新增 `allowed_skills`: `parallel-subagent`

## 收口判断标准

- 直接纳入：有明确 publishable/对外复用定位，且不是纯内部治理、测试模板、存储目录。
- 不直接纳入：标记 `distribution: internal`、为测试/生成物、仅运维配套、或本质是数据目录/供应商封装。

## 当前 allowed_skills

- `dto-core`
- `isc-core`
- `evomap-a2a`
- `evomap-publisher`
- `lep-executor`
- `lep-subagent`
- `cras`
- `parallel-subagent`
- `seef`
- `aeo`
- `isc-document-quality`