# P1修复报告: Recorder关联CRAS知识图谱

**日期**: 2026-03-01  
**文件**: `/skills/seef/sub-skills/recorder/index.cjs`  
**版本**: 1.0.0 → 1.1.0  
**状态**: ✅ 已完成并通过测试

---

## 问题描述

原 `linkToCRAS()` 函数仅写入一条简单的进化链接到 `evolution-links/` 目录，缺乏：
- 未读取 CRAS 洞察数据（`/skills/cras/insights/`）
- 未建立洞察→进化的反向引用
- 无知识图谱节点结构，无法表达三角关联

## 修改内容

### 新增常量

```javascript
const CRAS_BASE = '/root/.openclaw/workspace/skills/cras';
const CRAS_INSIGHTS_DIR  = path.join(CRAS_BASE, 'insights');
const CRAS_KNOWLEDGE_DIR = path.join(CRAS_BASE, 'knowledge');
const CRAS_EVOLUTION_LINKS_DIR = path.join(CRAS_BASE, 'evolution-links');
const CRAS_GRAPH_DIR = path.join(CRAS_BASE, 'knowledge-graph');
```

### 新增/重写函数（8个）

| 函数 | 用途 |
|------|------|
| `linkToCRAS()` | **重写** — 编排5步关联流程 |
| `loadRelatedInsights()` | 从 insights/ 和 knowledge/ 读取相关洞察，7天时间窗口 |
| `matchesSkill()` | 判断 gap/recommendation 是否匹配技能 |
| `extractSkillKeywords()` | 从技能ID提取领域关键词用于宽泛匹配 |
| `matchesKnowledgeEntry()` | 判断知识条目是否与进化相关 |
| `writeEvolutionLink()` | 增强版 evolution-links 写入（兼容旧格式） |
| `writeKnowledgeGraphNode()` | **核心** — 写入三角关联知识图谱节点 |
| `updateGraphIndex()` | 维护知识图谱全局索引 |
| `updateInsightBacklinks()` | 在洞察文件中追加 evolution_backlinks |

### 三角关联架构

```
  [技能节点: skill:{skillId}]
       │ has_evolution       │ analyzed_by
       ▼                     ▼
  [进化节点: evo:{recordId}] ──references──→ [洞察节点: insight:{insightId}]
```

**三个写入位置**:
1. `cras/evolution-links/{skillId}.json` — 进化→洞察（增强，向后兼容）
2. `cras/knowledge-graph/evo-{recordId}.json` + `skill-{skillId}.json` + `index.json` — 图谱节点
3. `cras/insights/{file}.json` 追加 `evolution_backlinks` — 洞察→进化反向引用

### 洞察匹配逻辑

1. **时间窗口**: 过去7天内的洞察数据
2. **内容匹配**: capability_gaps 和 optimization_recommendations 中匹配技能ID/名称
3. **领域关键词**: 从技能ID提取领域映射（如 dto→数据传输, seef→进化）
4. **知识库匹配**: knowledge/ 中与技能ID或触发来源相关的条目

### 容错设计

- CRAS关联失败**不阻断主流程**（catch后写入error到record）
- 单个洞察文件解析失败跳过继续
- 反向引用去重（避免重复添加相同recordId）

## 测试结果

```
[SEEF Recorder] 开始CRAS知识图谱关联: dto-core
[SEEF Recorder] 找到 1 条相关洞察
[SEEF Recorder] evolution-link已写入: .../evolution-links/dto-core.json
[SEEF Recorder] 知识图谱节点已写入: .../knowledge-graph/evo-evo-adbc2fb83d9b.json
[SEEF Recorder] 洞察反向引用已更新: .../insights/user-insight-2026-03-01.json
[SEEF Recorder] CRAS关联完成: 1 条洞察已关联
```

### 验证结果

| 检查项 | 状态 |
|--------|------|
| `node -c index.cjs` 语法检查 | ✅ 通过 |
| 记录进化事件 | ✅ 通过 |
| 读取 insights/ 洞察数据 | ✅ 找到 1 条匹配 |
| evolution-links 增强写入 | ✅ 向后兼容 |
| knowledge-graph 节点创建 | ✅ evo + skill + index |
| insights 反向引用 | ✅ backlink 已追加 |
| 进化报告含CRAS信息 | ✅ 三角关联图已渲染 |
| 失败容错 | ✅ 不阻断主流程 |

## 生成的新文件/目录

```
skills/cras/knowledge-graph/           # 新增目录
├── index.json                         # 全局图谱索引
├── skill-dto-core.json                # 技能节点（含边）
└── evo-evo-adbc2fb83d9b.json          # 进化节点（含边和洞察摘要）
```

## 向后兼容性

- `evolution-links/{skillId}.json` 保持原有字段不变，仅追加新字段
- 旧的 `crasInsightUsed: false` 条目不受影响
- 新条目增加 `linkedInsightCount`, `linkedInsightIds`, `insightTypes`, `evaluationScore`