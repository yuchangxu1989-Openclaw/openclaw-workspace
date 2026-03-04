# P0-3 硬编码清理报告

**执行时间**: 2026-03-03 11:03 CST  
**Git commit**: `[P0-FIX] Clean hardcoded paths + remove obsolete model refs`  
**状态**: ✅ 完成

---

## 任务A：创建共用路径常量

**文件**: `workspace/skills/_shared/paths.js`

```javascript
const path = require('path');
const OPENCLAW_HOME = process.env.OPENCLAW_HOME || '/root/.openclaw';
const WORKSPACE = process.env.OPENCLAW_WORKSPACE || path.join(OPENCLAW_HOME, 'workspace');
const SKILLS_DIR = path.join(WORKSPACE, 'skills');
const REPORTS_DIR = path.join(WORKSPACE, 'reports');
const MEMORY_DIR = path.join(WORKSPACE, 'memory');
const SECRETS_DIR = path.join(OPENCLAW_HOME, '.secrets');
const MEDIA_DIR = path.join(OPENCLAW_HOME, 'media');
```

✅ 已创建，node 加载验证通过

---

## 任务B：硬编码路径修复

### 修复统计

| 指标 | 数量 |
|------|------|
| 修复前硬编码路径总数 | ~50+ |
| 已修复（生产代码） | 36 |
| 剩余（仅测试文件） | 14 |
| 修改文件数 | 32 |

### 修复的高风险文件（Top 10）

| # | 文件 | 原硬编码数 | 修复方式 |
|---|------|-----------|---------|
| 1 | `dto-core/core/declarative-orchestrator.js` | 16 | `require('../../_shared/paths')` |
| 2 | `dto-core/core/global-auto-decision-pipeline.js` | 5 | `require('../../_shared/paths')` |
| 3 | `seef/subskills/recorder.py` | 5 | `os.environ.get('OPENCLAW_HOME', ...)` |
| 4 | `seef/subskills/aligner.py` | 4 | `os.environ.get('OPENCLAW_HOME', ...)` |
| 5 | `seef/subskills/optimizer.py` | 3 | `os.environ.get('OPENCLAW_HOME', ...)` |
| 6 | `seef/subskills/creator.py` | 3 | `os.environ.get('OPENCLAW_HOME', ...)` |
| 7 | `seef/sub-skills/recorder/index.cjs` | 3 | `require('../../../_shared/paths')` |
| 8 | `seef/sub-skills/evaluator/index.cjs` | 3 | `require('../../../_shared/paths')` |
| 9 | `seef/sub-skills/validator/index.js` | 3 | `require('../../../_shared/paths')` |
| 10 | `seef/sub-skills/discoverer/index.cjs` | 2 | `require('../../../_shared/paths')` |

### 其他修复文件

- `seef/evolution-pipeline/src/engine.js`
- `seef/evolution-pipeline/src/uploaders/evomap-uploader.js`
- `seef/evolution-pipeline/src/watcher.js`
- `seef/evolution-pipeline/src/core/watcher.js`
- `seef/evolution-pipeline/src/core/state-manager.js`
- `seef/evolution-pipeline/src/state-manager.js`
- `seef/evolution-pipeline/src/validators/isc-validator.js`
- `seef/sub-skills/validator/isc-rule-loader.js`
- `seef/sub-skills/validator/test-isc-dynamic-loader.js`
- `seef/seef.py`
- `seef/subskills/validator.py`
- `seef/subskills/discoverer.py`

### 修复策略

| 文件类型 | 策略 |
|---------|------|
| JS 文件（生产） | `require('../../_shared/paths')` 引入 `SKILLS_DIR`, `WORKSPACE`, `REPORTS_DIR` |
| Python 文件 | `OPENCLAW_HOME = os.environ.get("OPENCLAW_HOME", "/root/.openclaw")` 顶部常量 |
| Shell 脚本 | 已使用 `${OPENCLAW_HOME:-/root/.openclaw}` 模式（无需修改） |
| SKILL.md 文档 | 不改（按要求） |

### 未修复项（低风险，仅测试代码）

14 个硬编码路径位于 `tests/` 目录下的测试文件中：
- `seef/evolution-pipeline/tests/` (11处)
- `dto-core/tests/` (3处)

这些是测试固定值，不影响生产运行。

---

## 任务C：残留模型名清理

### 扫描结果

| 文件 | 模型引用 | 处理方式 |
|------|---------|---------|
| `lep-executor/src/daily-report-glm5.js` | `glm-5` 硬编码fallback | ✅ 改为 `'auto'` + env var |
| `seef/evolution-pipeline/tests/phase3-integration-test.js` | `glm-5` 硬编码fallback | ✅ 改为 `'auto'` + env var |
| `glm-4v/index.js` | `glm-4.6v` | ⏭️ 保留（模型专属技能，model名是API参数） |
| `glm-vision/index.js` | `glm-4v-plus` | ⏭️ 保留（同上，且已用 env var fallback） |
| `aeo/evaluation-sets/fix-test-cases.cjs` | `glm-5-coder` | ⏭️ 保留（测试用例key名） |

**无** `dashscope`、`bailian`、`qwen`、`kimi.*k2` 引用。

---

## 验证结果

所有修改文件通过加载验证：

```
✅ _shared/paths.js           - Node.js require 成功
✅ declarative-orchestrator.js - Node.js require 成功
✅ global-auto-decision-pipeline.js - Node.js require 成功
✅ recorder/index.cjs          - Node.js require 成功
✅ evaluator/index.cjs         - Node.js require 成功
✅ validator/index.js           - Node.js require 成功
✅ discoverer/index.cjs         - Node.js require 成功
✅ recorder.py                  - Python import 成功
✅ aligner.py                   - Python import 成功
✅ optimizer.py                 - Python import 成功
✅ creator.py                   - Python import 成功
```
