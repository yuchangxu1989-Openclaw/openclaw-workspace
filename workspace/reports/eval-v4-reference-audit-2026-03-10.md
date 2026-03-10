# 评测标准 V3→V4 引用核查报告

**日期**: 2026-03-10
**目标**: 核查系统中所有引用评测标准的地方，确认是否已切换到V4
**飞书文档token**: `JxhNdoc7ko7ZLwxJUJHcWyeDnYd`（该token不变，文档内容已升级为V4）

---

## 一、需要修复的活跃引用（V3→V4）

以下文件仍在用"V3"标签引用评测标准，需要更新为V4。

### 1. AGENTS.md（启动清单）

| 文件 | 行号 | 当前内容 | 应改为 |
|------|------|----------|--------|
| `AGENTS.md` | 17 | `feishu_doc read JxhNdoc7ko7ZLwxJUJHcWyeDnYd`（AEO评测标准**V3**） | （AEO评测标准**V4**） |

### 2. MEMORY.md（长期记忆）

| 文件 | 行号 | 当前内容 | 应改为 |
|------|------|----------|--------|
| `MEMORY.md` | 248 | `《AEO评测标准与基线V3》` | `《AEO评测标准与基线V4》` |

### 3. skills/public/eval-mining/（评测挖掘技能）— 重灾区

| 文件 | 行号 | 当前内容 | 应改为 |
|------|------|----------|--------|
| `config.json` | 6 | `"v3_standard_doc": "JxhNdoc7ko7ZLwxJUJHcWyeDnYd"` | `"v4_standard_doc": "JxhNdoc7ko7ZLwxJUJHcWyeDnYd"` |
| `config.json` | 11 | `"standard_version_cache": "skills/public/eval-mining/.v3-version-hash"` | `.../.v4-version-hash` |
| `SKILL.md` | 8 | `评测集与 V3 标准对齐` | `评测集与 V4 标准对齐` |
| `SKILL.md` | 12 | `按 V3 标准清洗已有评测集` | `按 V4 标准清洗` |
| `SKILL.md` | 20 | `按 V3 标准对已有评测集文件逐条检查` | `按 V4 标准` |
| `SKILL.md` | 26 | `node scripts/v3-eval-clean.js` | `node scripts/v4-eval-clean.js`（或重命名脚本） |
| `SKILL.md` | 31 | `bash scripts/v3-eval-clean-batch.sh` | `bash scripts/v4-eval-clean-batch.sh` |
| `SKILL.md` | 41 | `同一套 V3 合规检查` | `V4 合规检查` |
| `SKILL.md` | 63 | `读取 V3 标准文档` | `读取 V4 标准文档` |
| `SKILL.md` | 78 | `格式遵循 V3 标准` | `格式遵循 V4 标准` |
| `SKILL.md` | 83 | `格式遵循V3标准` | `格式遵循V4标准` |
| `SKILL.md` | 148 | `评测标准 V3 的唯一真相源` | `评测标准 V4 的唯一真相源` |
| `SKILL.md` | 152 | `拉取最新 V3 标准文档` | `拉取最新 V4 标准文档` |
| `SKILL.md` | 156 | `.v3-version-hash` | `.v4-version-hash` |
| `SKILL.md` | 157 | `sync-v3-standard.sh` | `sync-v4-standard.sh` |
| `SKILL.md` | 167 | `.v3-version-hash` | `.v4-version-hash` |
| `SKILL.md` | 170 | `validate-single-case.sh — 单条case V3合规验证` | `V4合规验证` |
| `SKILL.md` | 172 | `sync-v3-standard.sh — V3标准同步检测` | `sync-v4-standard.sh — V4标准同步检测` |
| `index.sh` | 23 | `V3_DOC=...` 变量名 | `V4_DOC=...` |
| `index.sh` | 52 | `格式遵循V3标准` | `格式遵循V4标准` |
| `scripts/sync-v3-standard.sh` | 全文件 | 文件名及内容全部引用V3 | 重命名为 `sync-v4-standard.sh`，内容中V3→V4 |
| `scripts/refresh-evalset.sh` | 全文件 | 多处引用V3标准 | 全部V3→V4 |
| `scripts/validate-single-case.sh` | 2 | `单条 case 的 V3 合规验证` | `V4 合规验证` |
| `scripts/clean-eval-cases.sh` | 2,22 | `按 V3 标准清洗评测集` | `按 V4 标准清洗评测集` |

### 4. skills/public/eval-runner/（评测执行器）

| 文件 | 行号 | 当前内容 | 应改为 |
|------|------|----------|--------|
| `config.json` | 4 | `"description": "V3标准意图理解质量评测技能"` | `V4标准` |
| `config.json` | 15 | `"v3_standard_doc": "JxhNdoc7ko7ZLwxJUJHcWyeDnYd"` | `"v4_standard_doc"` |
| `SKILL.md` | 1 | `eval-runner — V3标准意图理解质量评测技能` | `V4标准` |
| `SKILL.md` | 9 | `按V3标准5维度判定` | `按V4标准` |
| `SKILL.md` | 11 | `## V3评测维度` | `## V4评测维度` |

### 5. skills/isc-core/（智能标准中心）

| 文件 | 行号 | 当前内容 | 应改为 |
|------|------|----------|--------|
| `rules/rule.eval-standard-auto-sync-001.json` | 11 | `"hook": "scripts/sync-v3-standard.sh"` | `sync-v4-standard.sh` |
| `rules/rule.eval-standard-auto-sync-001.json` | 12 | `当V3评测标准文档...内容发生变更时` | `当V4评测标准文档` |
| `config/unified-standards.json` | 2 | `"schema": "isc.unified-standards.v3"` | `isc.unified-standards.v4` |

### 6. scripts/（全局脚本）

| 文件 | 行号 | 当前内容 | 应改为 |
|------|------|----------|--------|
| `scripts/isc-hooks/rule.eval-standard-auto-sync-001.sh` | 全文件 | 多处V3引用（变量名、文件名、输出文本） | 全部V3→V4 |
| `scripts/clean-evalset.py` | 2 | `per V3 standard` | `per V4 standard` |
| `scripts/clean-evalset.py` | 237 | `V3标准来源` | `V4标准来源` |
| `scripts/clean-evalset.py` | 248 | `V3标准清洗规则` | `V4标准清洗规则` |
| `scripts/clean-evalset.py` | 252 | `category: V3八类之一` | `V4` |

### 7. skills/aeo/（AEO评测）

| 文件 | 行号 | 当前内容 | 应改为 |
|------|------|----------|--------|
| `scripts/eval-stats.sh` | 2 | `评测集V3实时统计` | `评测集V4实时统计` |
| `scripts/eval-stats.sh` | 28 | `评测集V3对齐状态` | `评测集V4对齐状态` |

---

## 二、不需要修改的引用（误报排除）

以下匹配到V3/v3但与评测标准无关，不需要修改：

| 类别 | 文件示例 | 原因 |
|------|----------|------|
| **飞书API版本** | `cras/cloud-storage/feishu-doc.js:37` `/auth/v3/tenant_access_token` | 飞书开放平台API路径，与评测标准无关 |
| **飞书API版本** | `auto-badcase-harvest/harvest.sh:77` `/auth/v3/` | 同上 |
| **飞书API版本** | `scripts/evolution-daily-report.js:73` `/auth/v3/` | 同上 |
| **飞书API版本** | `badcase-to-goodcase/scripts/badcase-to-goodcase.sh:131` `/auth/v3/` | 同上 |
| **软件版本号** | `isc-core/index.js` ISC-Core-v3, v3.0.0 | ISC软件自身版本，非评测标准 |
| **软件版本号** | `isc-core/SKILL.md` ISC v3.1.0 | ISC软件版本 |
| **软件版本号** | `lto-core/` v3.0.x | LTO软件版本 |
| **软件版本号** | `parallel-subagent/` v3.0.1 | 并行子代理软件版本 |
| **软件版本号** | `lep-design-refined.md` parallel-subagent v3.0.1 | 设计文档引用软件版本 |
| **软件版本号** | `CAPABILITY-ANCHOR.md:109` lto-core v3.0.11 | 能力锚点引用软件版本 |
| **版本规则** | `isc-core/rules/rule.version-integrity-gate-001.json` | 版本号规范说明（v0→v2, v1→v3） |
| **任务文件ID** | `lto-core/tasks/task_*_pv3m.json` 等 | 随机ID含v3字符，非引用 |
| **历史归档** | `skills/aeo/archive/v3-eval-clean-batch.sh` | 已归档的旧V3脚本 |
| **历史归档** | `skills/aeo/archive/v3-eval-clean.js` | 已归档的旧V3脚本 |
| **聊天备份** | `skills/feishu-chat-backup/logs/` | 历史聊天记录 |
| **向量备份** | `infrastructure/vector-service/backup/` | 历史向量化快照 |
| **黄金测试集数据** | `infrastructure/aeo/golden-testset/*.json` | 测试数据中的历史上下文引用 |
| **SEEF/EvoMap** | `skills/seef/evomap/pending/` | 进化请求中的软件版本号 |
| **ISC升级文档** | `skills/isc-core/UPGRADE-v3.1.0.md` | ISC自身升级文档 |
| **USER.md** | `USER.md:25` V1→V2→V3（终版） | 用户工作风格描述，非评测标准 |

---

## 三、修复清单汇总

**需修复文件总计: 17个**

### 高优先级（活跃代码路径）

1. `skills/public/eval-mining/config.json` — 配置中心，key名+缓存路径
2. `skills/public/eval-mining/index.sh` — 挖掘入口脚本
3. `skills/public/eval-mining/scripts/sync-v3-standard.sh` — **需重命名为 sync-v4-standard.sh**
4. `skills/public/eval-mining/scripts/refresh-evalset.sh` — 刷新脚本
5. `skills/public/eval-mining/scripts/validate-single-case.sh` — 验证脚本
6. `skills/public/eval-mining/scripts/clean-eval-cases.sh` — 清洗脚本
7. `skills/public/eval-runner/config.json` — 评测执行器配置
8. `skills/isc-core/rules/rule.eval-standard-auto-sync-001.json` — ISC规则
9. `skills/isc-core/config/unified-standards.json` — 统一标准schema
10. `scripts/isc-hooks/rule.eval-standard-auto-sync-001.sh` — ISC钩子脚本
11. `scripts/clean-evalset.py` — 清洗脚本

### 中优先级（文档/说明）

12. `AGENTS.md:17` — 启动清单V3标签
13. `MEMORY.md:248` — 长期记忆V3标签
14. `skills/public/eval-mining/SKILL.md` — 技能文档（~20处V3引用）
15. `skills/public/eval-runner/SKILL.md` — 技能文档
16. `skills/aeo/scripts/eval-stats.sh` — 统计脚本

### 需要重命名的文件

- `skills/public/eval-mining/scripts/sync-v3-standard.sh` → `sync-v4-standard.sh`
- `skills/public/eval-mining/.v3-version-hash` → `.v4-version-hash`（如果存在）
- `skills/public/eval-mining/.v3-standard-cache.md` → `.v4-standard-cache.md`（如果存在）

### 需要重命名的缓存文件（ISC钩子）

- `scripts/isc-hooks/` 下的 `v3-standard-latest.md` → `v4-standard-latest.md`
- `.v3-standard.sha256` → `.v4-standard.sha256`

---

## 四、结论

- **飞书文档token `JxhNdoc7ko7ZLwxJUJHcWyeDnYd` 不需要变更**（同一文档，内容已升级为V4）
- **17个文件需要将"V3"标签更新为"V4"**，其中11个是活跃代码路径（高优先级）
- **重灾区是 `skills/public/eval-mining/`**，该技能几乎所有文件都硬编码了V3标签
- **大量误报已排除**：飞书API路径(`/auth/v3/`)、软件版本号(isc-core v3.x等)、历史归档、任务ID中的随机字符
- **PDCA相关目录不存在**，无需处理
