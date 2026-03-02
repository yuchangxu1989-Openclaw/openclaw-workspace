---
name: isc-council-integration
description: ISC与Council of Seven集成标准 - 关键决策必经七人议会审议
version: "1.0.0"
status: active
---

# ISC与Council of Seven集成标准

## 核心原则

**所有关键决策必须经过七人议会审议**，确保多视角、全方位评估。

## 触发条件

| 场景 | 触发条件 | 优先级 |
|:-----|:---------|:------:|
| **新增技能** | 任何新技能创建 | P9 |
| **合并技能** | 技能合并/重构 | P10 |
| **关键准入规则** | 影响 >3 个子系统的规则 | P9 |
| **高优先级规则** | P9-P10 级别规则变更 | P8-P10 |
| **架构变更** | 基础设施层变更 | P10 |
| **安全相关** | 安全策略/权限变更 | P10 |
| **新增规则** | **任何新规则创建** | **P10** |
| **订阅变更** | **自主决策流水线模块对ISC的新增订阅** | **P10** |
| **流水线更新** | **自主决策流水线模块更新** | **P9** |

## 七人议会审议流程

```
┌─────────────────────────────────────────────────────────────┐
│  ISC 标准变更提案                                            │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  检查触发条件                                                │
│  - 影响范围 > 3 个子系统？                                   │
│  - 优先级 >= P9？                                           │
│  - 安全/架构相关？                                           │
└──────────────────────┬──────────────────────────────────────┘
                       │
         ┌─────────────┴─────────────┐
         │                           │
    不需要审议                      需要审议
         │                           │
         ▼                           ▼
┌─────────────────┐    ┌──────────────────────────────────────┐
│ 直接执行变更     │    │ 触发 Council of Seven                │
└─────────────────┘    │                                      │
                       │ 1. Strategist - 战略视角评估          │
                       │ 2. Critic - 批判性审查                │
                       │ 3. Optimist - 机会分析                │
                       │ 4. Pessimist - 风险预警               │
                       │ 5. Analyst - 数据分析                 │
                       │ 6. Creative - 创新方案                │
                       │ 7. Executive - 执行可行性             │
                       │                                      │
                       └──────────────┬───────────────────────┘
                                      │
                                      ▼
                       ┌──────────────────────────────┐
                       │ 投票统计                      │
                       │ - 支持率 >= 60%：通过        │
                       │ - 支持率 40-60%：暂缓        │
                       │ - 支持率 < 40%：否决        │
                       └──────────────┬───────────────┘
                                      │
                                      ▼
                       ┌──────────────────────────────┐
                       │ 决策结果                      │
                       │ ✓ 通过 → 执行变更            │
                       │ ○ 暂缓 → 补充材料再审        │
                       │ ✗ 否决 → 终止变更            │
                       └──────────────────────────────┘
```

## 集成API

```javascript
const { ISCCore } = require('./isc-core');
const { CouncilOfSeven } = require('../council-of-seven/council.py');

// ISC决策入口
class ISCCouncilIntegration {
  constructor() {
    this.isc = new ISCCore();
    this.council = new CouncilOfSeven();
  }

  // 提案评估
  async proposeChange(proposal) {
    // 1. 检查是否需要审议
    if (this.requiresCouncilReview(proposal)) {
      // 2. 提交七人议会
      const decision = await this.council.deliberate(
        proposal.title,
        proposal.description
      );
      
      // 3. 根据结果执行
      if (decision.decision === 'approved') {
        return this.isc.executeChange(proposal);
      } else {
        return { status: 'rejected', reason: decision };
      }
    } else {
      // 直接执行
      return this.isc.executeChange(proposal);
    }
  }

  // 判断是否需要审议
  requiresCouncilReview(proposal) {
    return (
      proposal.impact > 3 ||           // 影响 >3 个子系统
      proposal.priority >= 9 ||        // 优先级 P9+
      proposal.type === 'security' ||  // 安全相关
      proposal.type === 'architecture' // 架构变更
    );
  }
}
```

## 决策记录

所有七人议会审议记录保存至：
```
/root/.openclaw/workspace/skills/isc-core/council-decisions/
```

记录格式：
```json
{
  "id": "dec_20260223_181500",
  "proposal": "新增技能 isc-council-integration",
  "council_decision": "approved",
  "support_ratio": 0.75,
  "perspectives": [...],
  "executed_at": "2026-02-23T18:15:00Z"
}
```

## 标准更新

此标准本身已通过七人议会审议：
- **审议时间**: 2026-02-23 18:00
- **决策结果**: ✓ 通过 (支持率 75%)
- **生效状态**: 已生效
