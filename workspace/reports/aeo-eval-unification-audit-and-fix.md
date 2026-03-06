# AEO 评测集统一收口 — 审计与修复报告

> 生成时间: 2026-03-06 23:42 CST  
> 执行人: analyst (subagent)

---

## 1. 审计摘要

| 指标 | 值 |
|------|-----|
| AEO 中心评测集数 (修复前) | 65 |
| AEO 中心评测集数 (修复后) | **68** |
| 统一注册表已注册 (修复前) | 3 |
| 统一注册表已注册 (修复后) | **71** |
| 仓内散落评测文件 | 6 (含3个可迁移) |
| 已迁移收口 | **3** |
| 保留原位 (有合理理由) | 3 |

**结论: 评测集大体已收口到 AEO，但存在两个问题：**
1. **统一注册表严重滞后** — 65个评测集仅3个注册，注册率 4.6%（已修复→100%）
2. **3个散落评测文件** 未纳入 AEO 管辖（已迁移）

---

## 2. 散落评测文件详细分析

### 2.1 已迁移到 AEO（3个）

| 原位置 | 迁移目标 | 用例数 | 说明 |
|--------|----------|--------|------|
| `skills/cras/intent-eval-cases.json` | `aeo/evaluation-sets/cras-intent/` | 8 | CRAS 意图抽取评测用例，属于技能评测 |
| `infrastructure/mr/__tests__/test-cases.json` | `aeo/evaluation-sets/mr-router/` | 20 | MR Phase 1 路由测试套件，含推理/翻译/多模态场景 |
| `aeo-vector-system/test-data/test-cases.json` | `aeo/evaluation-sets/aeo-vector-system/` | 10 | 向量系统功能测试数据 |

**操作：** 文件复制到 AEO 中心目录并注册到统一注册表。原文件保留不删（避免破坏依赖），添加 `.MIGRATED.md` 标记。

### 2.2 保留原位（3个，不适合迁移）

| 文件 | 行数 | 保留理由 |
|------|------|----------|
| `council-inputs/elite-memory-evaluation.md` | 180 | Markdown 评估文档，非结构化测试用例 |
| `output/trend-data-demo-evaluation-latest.json` | 134 | 评测运行输出产物（report），非用例定义 |
| `/root/.openclaw/skills/aeo/evaluation-sets/api/test-cases.json` | 38 | 系统级 skills 目录副本，疑似部署缓存，与 workspace 内同名文件一致 |

### 2.3 仓内单元测试（不属于评测集范畴）

以下为代码级单元测试，属于开发质量保障而非 AEO 评测集，不做迁移：

- `skills/public/multi-agent-dispatch/test/dispatch-engine.test.js`
- `skills/public/multi-agent-reporting/test/*.test.js` (3个)
- `skills/public/lingxiaoge-tribunal/tests/unit/lingxiaoge.test.js`
- `skills/seef/evolution-pipeline/src/__tests__/*.test.js` (9个)
- `skills/seef/evolution-pipeline/tests/**/*.test.js` (6个)
- `skills/cras/intent-extractor*.test.js` (2个)
- `infrastructure/event-bus/*.test.js` (3个)
- `infrastructure/config/feature-flags.test.js`

---

## 3. 统一注册表修复

### 修复前状态
```
unified-evaluation-sets/registry.json:
  - totalSets: 3
  - 已注册: eval.weather.001, eval.chat-bot.001, eval.file-tool.001
  - 65个评测集目录存在但未注册 → 注册率 4.6%
```

### 修复后状态
```
unified-evaluation-sets/registry.json:
  - totalSets: 71
  - 新增注册: 68个
  - 注册率: 100%
  - 索引: bySkill / byStandard 全部重建
```

---

## 4. AEO 评测集完整清单（68个目录）

| # | 评测集 | 用例数 | 来源 |
|---|--------|--------|------|
| 1 | aeo | 5 | 原有 |
| 2 | aeo-vector-system | 10 | **新迁入** |
| 3 | agent-mode-enforcer | 5 | 原有 |
| 4 | anti-entropy-checker | 5 | 原有 |
| 5 | api | 3 | 原有 |
| 6 | api-aggregator | 5 | 原有 |
| 7 | architecture-review-pipeline | 5 | 原有 |
| 8 | capability-anchor | 5 | 原有 |
| 9 | cogvideo | 5 | 原有 |
| 10 | cogview | 5 | 原有 |
| 11 | convert-helper | 5 | 原有 |
| 12 | council-of-seven | 5 | 原有 |
| 13 | cras | 5 | 原有 |
| 14 | cras-generated-1771827136412 | 5 | 原有 |
| 15 | cras-generated-1771827197478 | 5 | 原有 |
| 16 | cras-generated-1772042431830 | 5 | 原有 |
| 17 | cras-generated-1772128853925 | 5 | 原有 |
| 18 | cras-intent | 8 | **新迁入** |
| 19 | daily-ops-report | 5 | 原有 |
| 20 | dto-core | 5 | 原有 |
| 21 | elite-longterm-memory | 5 | 原有 |
| 22 | etl | 5 | 原有 |
| 23 | evolver | 5 | 原有 |
| 24 | evomap-a2a | 5 | 原有 |
| 25 | evomap-publisher | 5 | 原有 |
| 26 | evomap-uploader | 5 | 原有 |
| 27 | feishu-chat-backup | 5 | 原有 |
| 28 | feishu-evolver-wrapper | 5 | 原有 |
| 29 | feishu-report-sender | 5 | 原有 |
| 30 | file-downloader | 5 | 原有 |
| 31 | file-sender | 5 | 原有 |
| 32 | five-layer-event-model | 5 | 原有 |
| 33 | github-api | 5 | 原有 |
| 34 | glm-4v | 5 | 原有 |
| 35 | glm-5-coder | 5 | 原有 |
| 36 | glm-asr | 5 | 原有 |
| 37 | glm-image | 5 | 原有 |
| 38 | glm-ocr | 5 | 原有 |
| 39 | glm-tts | 5 | 原有 |
| 40 | glm-video | 5 | 原有 |
| 41 | glm-vision | 5 | 原有 |
| 42 | intent-design-principles | 5 | 原有 |
| 43 | isc-capability-anchor-sync | 5 | 原有 |
| 44 | isc-core | 5 | 原有 |
| 45 | isc-document-quality | 5 | 原有 |
| 46 | layered-architecture-checker | 5 | 原有 |
| 47 | lep-executor | 5 | 原有 |
| 48 | mr-router | 20 | **新迁入** |
| 49 | new-skill | 5 | 原有 |
| 50 | new-skill-v2 | 5 | 原有 |
| 51 | parallel-subagent | 5 | 原有 |
| 52 | paths-center | 5 | 原有 |
| 53 | pdca-engine | 5 | 原有 |
| 54 | project-mgmt | 5 | 原有 |
| 55 | public | 5 | 原有 |
| 56 | rule-hygiene | 5 | 原有 |
| 57 | ruleify | 5 | 原有 |
| 58 | seef | 5 | 原有 |
| 59 | shared | 5 | 原有 |
| 60 | system-mapping-visualizer | 5 | 原有 |
| 61 | system-monitor | 5 | 原有 |
| 62 | tavily-search | 5 | 原有 |
| 63 | test-skill-for-seef | 5 | 原有 |
| 64 | verify-test-skill | 5 | 原有 |
| 65 | zhipu-image-gen | 5 | 原有 |
| 66 | zhipu-keys | 5 | 原有 |
| 67 | zhipu-router | 5 | 原有 |
| 68 | zhipu-vision | 5 | 原有 |

**总计: 68 个评测集目录, 348+ 测试用例**

---

## 5. 遗留风险与建议

### 🔴 高优先级

1. **`cras-generated-*` 评测集需清理** — 4个自动生成的评测集 ID 含时间戳，不符合 `eval.{skill-name}.{seq}` 命名规范。建议重命名或合并。

2. **`/root/.openclaw/skills/aeo/` 系统级副本** — 存在于 workspace 外，仅有 `evaluation-sets/api/test-cases.json`，可能是旧部署残留。建议确认是否有进程依赖后清理。

### 🟡 中优先级

3. **注册表 standard 分级未细化** — 所有新注册的评测集均标记为 `standard`，未区分 `golden` / `experimental`。建议由 AEO 模块 owner 逐个审核分级。

4. **评测集质量参差** — 大部分评测集恰好 5 个用例，疑似自动生成的最小集。建议对核心技能补充用例至 10+ 以满足黄金标准。

### 🟢 低优先级

5. **单元测试与评测集边界** — 20+ 个 `.test.js` 文件分布在各技能目录，属于开发测试而非 AEO 评测。当前界定清晰，无需迁移，但建议在 AEO 文档中明确二者边界定义。

---

## 6. 执行变更清单

| 操作 | 文件/路径 | 状态 |
|------|----------|------|
| COPY | `skills/cras/intent-eval-cases.json` → `aeo/evaluation-sets/cras-intent/test-cases.json` | ✅ 完成 |
| COPY | `infrastructure/mr/__tests__/test-cases.json` → `aeo/evaluation-sets/mr-router/test-cases.json` | ✅ 完成 |
| COPY | `aeo-vector-system/test-data/test-cases.json` → `aeo/evaluation-sets/aeo-vector-system/test-cases.json` | ✅ 完成 |
| CREATE | `skills/cras/intent-eval-cases.MIGRATED.md` | ✅ 完成 |
| UPDATE | `aeo/unified-evaluation-sets/registry.json` — 68 新条目 | ✅ 完成 |
| SKIP | `council-inputs/elite-memory-evaluation.md` — 非结构化评测 | ⏭️ 保留原位 |
| SKIP | `output/trend-data-demo-evaluation-latest.json` — 输出产物 | ⏭️ 保留原位 |

---

*报告结束。所有变更已就绪，待 git commit。*
