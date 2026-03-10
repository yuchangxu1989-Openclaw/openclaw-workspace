# CAPABILITY-ANCHOR.md 完整性审计报告

> **审计时间**: 2026-03-06  
> **审计员**: 质量仲裁官 🔎  
> **被审文件**: `/root/.openclaw/workspace/CAPABILITY-ANCHOR.md`  
> **扫描目录**: `/root/.openclaw/workspace/skills/`

---

## 📊 总体评分

| 维度 | 结果 |
|------|------|
| 锚点声明技能总数 | 54 |
| 磁盘实际技能目录数 | 54（含 `_shared`）/ 53（排除共享库） |
| 状态标注错误数 | **10 条**（均为 📄 实为 FULL） |
| 锚点缺失技能 | **1 个**（`_shared`） |
| 锚点幽灵技能（无对应目录）| **6 个** |
| 综合完整性 | ⚠️ **中等风险** |

---

## 🔴 阻塞项（必须修复）

### 1. 状态标注错误：10 个技能被错误标注为 📄（仅文档），实际为 FULL（含代码）

| 技能 | 锚点标注 | 实际状态 | 证据 |
|------|---------|---------|------|
| `aeo` | 📄 | ✅ FULL | `aeo.cjs`, `assessment-store.js`, `build-sandbox.sh` 等 |
| `daily-ops-report` | 📄 | ✅ FULL | `generate.cjs` + `SKILL.md` |
| `evomap-uploader` | 📄 | ✅ FULL（数据文件）| 含多个 `.json` capsule 文件 |
| `caijuedian-tribunal` | 📄 | ✅ FULL | `council.js` + `SKILL.md` |
| `paths-center` | 📄 | ⚠️ 仅 SKILL.md | 无代码文件，标注部分正确但原因不同 |
| `pdf-generator` | 📄 | ✅ FULL | `diagram.js`, `generate.js` + `SKILL.md` |
| `project-mgmt` | 📄 | ✅ FULL | `lessons/`, `metrics/` + `SKILL.md` |
| `rule-hygiene` | 📄 | 仅 SKILL.md | 无代码文件，标注逻辑正确但描述有误 |
| `seef` | 📄 | ✅ FULL | `event-bridge.js`、`config/`、`docs/` 等 |
| `capability-anchor` | 📄 | 仅 SKILL.md | 无代码文件，标注逻辑正确 |

**注**: 锚点图例说明"📄=仅文档"，但 `aeo`、`daily-ops-report`、`caijuedian-tribunal`、`pdf-generator`、`project-mgmt`、`seef` 均有实质代码，应标注为 ✅。

---

### 2. 幽灵技能（锚点声明存在，但磁盘无对应目录）

以下 6 个技能在 ISC 路由部分声明，但 `skills/` 下无对应目录，且无 `技能路径` 标注：

| 技能 | 锚点位置 | 磁盘状态 |
|------|---------|---------|
| `glm-tts-clone` | ISC路由 | ❌ 无目录 |
| `charglm-video` | ISC路由 | ❌ 无目录 |
| `charglm-voice` | ISC路由 | ❌ 无目录 |
| `glm-thinking` | ISC路由 | ❌ 无目录 |
| `glm-ppt` | ISC路由 | ❌ 无目录 |
| `glm-5-coder` | ISC路由 | ❌ 无目录 |

**风险**: 这些 ISC 路由规则无法实际执行，触发时将找不到技能文件。

---

## 🟡 警告项（建议修复）

### 3. 遗漏技能：`_shared`

- `skills/_shared/` 存在，内含 `paths.js` + `SKILL.md`（共享工具库）
- 锚点文档中完全未提及
- 建议在全量清单中添加说明性条目（即使标注为 `🔧 共享库`）

### 4. `zhipu-keys` 状态异常

- 磁盘：仅有 `index.js`，无 `SKILL.md`（应标为 CODE-ONLY ⚙️）
- 锚点：在"智谱技能（无ISC路由）"区块列出，无图例标注
- 建议添加 ⚙️ 标注并补充 `SKILL.md`

### 5. 技能总数统计疑问

- 锚点声明 **技能总数: 54**
- 磁盘实际目录 **54 个**（含 `_shared`）
- 但锚点自身列出的唯一技能路径去重后约 **53 个**（不含 `_shared`，含 6 个无目录幽灵技能）
- 数字表面吻合但构成有误，建议重新校验计数逻辑

---

## ✅ 正确项

以下技能状态标注准确：

- **✅ 标注正确（共 34 个）**: `agent-mode-enforcer`, `api`, `api-aggregator`, `convert-helper`, `cras`, `cras-generated-*`(×4), `lto-core`, `etl`, `evolver`, `evomap-a2a`, `evomap-publisher`, `feishu-chat-backup`, `feishu-evolver-wrapper`, `feishu-report-sender`, `file-downloader`, `file-sender`, `github-api`, `isc-capability-anchor-sync`, `isc-core`, `isc-document-quality`, `lep-executor`, `new-skill`, `new-skill-v2`, `parallel-subagent`, `pdca-engine`, `system-monitor`, `test-skill-for-seef`, `verify-test-skill`
- **ISC/智谱区块已有目录的技能**: `glm-4v`, `glm-asr`, `glm-image`, `glm-ocr`, `glm-tts`, `glm-video`, `glm-vision`, `cogvideo`, `cogview`, `zhipu-image-gen`, `zhipu-vision`, `tavily-search` ✅

---

## 📋 修复清单（优先级排序）

| 优先级 | 操作 | 技能 |
|--------|------|------|
| P0 🔴 | 将幽灵 ISC 路由移除或创建对应目录 | `glm-tts-clone`, `charglm-video`, `charglm-voice`, `glm-thinking`, `glm-ppt`, `glm-5-coder` |
| P1 🟠 | 修正状态图标 📄 → ✅ | `aeo`, `daily-ops-report`, `caijuedian-tribunal`, `pdf-generator`, `project-mgmt`, `seef`, `evomap-uploader` |
| P2 🟡 | 补充 `SKILL.md` | `zhipu-keys` |
| P2 🟡 | 将 `_shared` 添加到锚点 | `_shared` |
| P3 🟢 | 重新验证技能总数统计 | 锚点头部元数据 |

---

## 🔧 建议自动化措施

当前 `isc-capability-anchor-sync` 技能负责自动同步，但本次审计发现其扫描逻辑存在以下盲区：
1. 未能检测"有 SKILL.md + 有代码"的 FULL 状态（仍写为 📄）
2. 未将无磁盘目录的 ISC 路由条目标记为幽灵
3. 未扫描 `_shared` 等共享库目录

建议在 `isc-capability-anchor-sync` 中增加目录存在性校验和代码文件检测逻辑。
