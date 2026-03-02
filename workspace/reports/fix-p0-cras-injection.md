# P0修复报告: CRAS真正注入Evaluator

**修复日期**: 2026-03-01  
**修复人**: SubAgent (P0-CRAS注入Evaluator)  
**严重等级**: P0  
**状态**: ✅ 已修复并验证

---

## 1. 问题诊断

### 根因分析

CRAS→Evaluator 的数据通道存在 **3 个断裂点**：

| # | 文件 | 问题 | 影响 |
|---|------|------|------|
| 1 | `sub-skills/evaluator/index.cjs` → `loadCRASInsight()` | 查找 `{skillId}.json`，但实际文件名是 `user-insight-YYYY-MM-DD.json` | **永远找不到洞察文件** |
| 2 | `sub-skills/evaluator/index.cjs` → `adjustScoreWithCRAS()` | 访问 `crasInsight.userIntent`、`crasInsight.capabilityGaps`、`crasInsight.qualityConcerns` | 字段名与实际数据 schema 完全不匹配（实际是 `user_profile.primary_intent`、`capability_gaps`、`optimization_recommendations`） |
| 3 | `evolution-pipeline/lib/skill-evaluator.js` → `SkillEvaluator` 类 | 整个类无任何 CRAS 相关代码 | 流水线级评估完全忽略用户洞察 |

**结论**: CRAS 目录结构和洞察数据都正常生成，但 Evaluator 从未成功读取过任何一条洞察数据。`crasInjected` 字段永远是 `false`。

---

## 2. 修复内容

### 2.1 `sub-skills/evaluator/index.cjs` — 洞察加载重写

**修改**: `loadCRASInsight(skillId)` 函数

- ❌ 旧逻辑: 查找 `/skills/cras/insights/{skillId}.json` → 永不匹配
- ✅ 新逻辑:
  1. 扫描 `insights/` 目录所有 `user-insight-*.json` 文件
  2. 按文件名排序取最新一份
  3. 额外加载 `config/user-profile.json` 作为补充
  4. 若无洞察文件但有画像，合成最小洞察对象

新增辅助函数:
- `_inferPrimaryIntent(profile)` — 从画像 tags 推断主要意图
- `_buildIntentDistribution(profile)` — 构建意图分布

### 2.2 `sub-skills/evaluator/index.cjs` — 权重调整重写

**修改**: `adjustScoreWithCRAS(baseScore, crasInsight)` 函数

旧版仅有 3 个简单 if 判断且字段名全错；新版实现完整策略矩阵:

| 调整维度 | 触发条件 | 影响 |
|----------|----------|------|
| 按主要意图 | `primary_intent` 匹配 8 种意图类型 | 对应维度 ×1.2~1.5 |
| 按意图分布 | command 占比 >30% | functionality ×1.1 |
| 能力缺口衰减 | `capability_gaps.length > 0` | completeness ×0.75~0.85 |
| 严重缺口 | gap severity=high/critical | functionality ×0.9 |
| 高频操作微调 | operation 包含 architecture/pipeline/capability | 对应维度 ×1.1~1.15 |

### 2.3 `evolution-pipeline/lib/skill-evaluator.js` — 完整 CRAS 集成

**新增方法**:

- `_loadCRASInsight()` — 与 sub-skills 版本一致的洞察加载逻辑
- `_applyCRASWeights(insight)` — 动态调整评估维度权重并归一化

**修改点**:
- `constructor`: 分离 `defaultWeights` 和运行时 `weights`，增加 CRAS 缓存字段
- `evaluate()`: 首次评估时加载 CRAS 洞察并应用权重
- `SkillEvaluationResult`: 增加 `crasInjected`、`crasWeights` 字段
- `toJSON()`: 输出 CRAS 注入状态

---

## 3. 验证结果

### 3.1 运行日志确认 CRAS 读取

```
[SEEF Evaluator] ✅ 加载CRAS洞察: user-insight-2026-03-01.json (共 1 个洞察文件)
[SEEF Evaluator] ✅ 补充加载用户画像 (interactions: 52)
[SEEF Evaluator] CRAS注入: primary_intent=exploration, gaps=3, highFreqOps=3
[SEEF Evaluator] CRAS注入: intent_distribution={"command":7,"query":6,"feedback":11,"exploration":2}
```

### 3.2 CRAS 注入前后评分对比 (技能: CRAS)

| 维度 | 基础分 | CRAS调整后 | 变化原因 |
|------|--------|-----------|----------|
| completeness | 100 | 83 | capability_gaps=3 → ×0.75, 再被 capability_verification 高频操作 ×1.1 |
| documentation | 60 | 84 | primary_intent=exploration → ×1.4 |
| structure | 100 | 100 | architecture 高频操作 ×1.15，已封顶100 |
| functionality | 100 | 100 | pipeline_execution 高频操作 ×1.1，已封顶100 |
| **总分** | **90** | **92** | 文档维度大幅提升抵消完整性衰减 |

### 3.3 报告输出确认

```json
{
  "crasInjected": true,
  "score": 92,
  "dimensions": {
    "completeness": 83,
    "documentation": 84,
    "structure": 100,
    "functionality": 100
  }
}
```

---

## 4. 修改的文件清单

| 文件 | 修改类型 | 行数变化 |
|------|---------|---------|
| `skills/seef/sub-skills/evaluator/index.cjs` | 重写2个函数 + 新增2个辅助函数 | +120 / -25 |
| `skills/seef/evolution-pipeline/lib/skill-evaluator.js` | 新增2个方法 + 修改constructor/evaluate/Result | +130 / -5 |

---

## 5. 注意事项

1. **洞察文件命名约定**: Evaluator 现在期望 `user-insight-*.json` 格式，CRAS 生成端需保持此命名
2. **权重归一化**: evolution-pipeline 的 SkillEvaluator 会将 CRAS 调整后的权重归一化到总和 1.0
3. **缓存策略**: evolution-pipeline 的 SkillEvaluator 在一次 evaluate 生命周期内只加载一次 CRAS 洞察；如需刷新需调用 `clearCache()` 并重置 `_crasLoaded = false`
4. **降级行为**: 如果 CRAS 目录不存在或文件解析失败，两个 Evaluator 都会静默降级到默认权重，不会中断评估流程
