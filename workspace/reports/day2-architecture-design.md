# Day2 架构设计方案：事件驱动的规则化→程序化自动链路

## 现状分析

### 已有基础设施（不需重建）
- **事件总线** `infrastructure/event-bus/bus.js`：JSONL存储、文件锁、游标、轮转、66KB已有事件数据
- **Dispatcher** `infrastructure/event-bus/dispatcher.js`：事件→ISC规则匹配→handler执行，支持通配符、递归深度控制
- **14个handler**：classify-skill-distribution、gate-check-trigger、capability-anchor-sync等已存在
- **event-bridge**：ISC、本地任务编排、CRAS、AEO、SEEF都有event-bridge对接事件总线
- **cron调度**：已有6个定时任务在运行

### 已有但未贯通的断点
1. **git hook → 事件总线**：pre-commit hook做检查但不emit事件到总线
2. **dispatcher → handler执行**：handler多数是日志记录，不做实际阻断/修复
3. **意图识别 → 事件**：CRAS有event-bridge但没有实时意图提取→emit能力
4. **规则匹配 → 代码生成**：dispatcher匹配到规则后不能自动生成三层代码

### 核心问题：链条断在4个节点
```
信号源 --①--> 事件总线 --②--> Dispatcher --③--> Handler --④--> 实际执行
       断：git hook        通              断：advisory_pass    断：无执行代码
            不emit                              不做实际判断         无自动修复
```

## 设计方案

### 架构原则
- **不重建，补断点**：在已有基础设施上补全4个断链节点
- **渐进式**：先跑通一条完整链路（public-skill分类），再复制模式到其他规则
- **三层分离**：每个链路的感知/认知/执行代码物理隔离，可独立替换

### 断点①：信号源 → 事件总线

**方案**：在git hooks中添加事件emit逻辑

```
pre-commit hook（已有）
  └→ 检测到skills/变更时
      └→ emit("skill.files.changed", { paths, diffs }) → 事件总线

post-commit hook（已有但空）
  └→ emit("skill.committed", { commitHash, changedSkills }) → 事件总线
  └→ emit("isc.rule.committed", { ruleFiles }) → 事件总线（如有规则变更）
```

**实现**：修改 `.git/hooks/post-commit`，添加约10行Node.js调用bus.publish()

**L2阈值事件**：cron扫描脚本定期检查指标，超阈值时emit
```
*/10 * * * * node infrastructure/event-bus/threshold-scanner.js
  └→ 黄灯规则数/总规则数 > 30% → emit("isc.yellow_light.threshold_exceeded")
  └→ skills/public/下有不合格技能 → emit("skill.public.quality_violation")
```

### 断点③：Handler从advisory改为实际执行

**方案**：将handler从"记日志"升级为"做判断+执行动作"

以 `classify-skill-distribution.js` 为例：
```javascript
// 当前：只分类并记日志
// 升级后：
module.exports = async function(event, rule, context) {
  // 1. 扫描变更的技能目录
  const skillPath = event.payload.skillPath;
  
  // 2. 实际检查通用性（4条标准）
  const violations = checkUniversalStandards(skillPath);
  
  // 3. 执行动作
  if (violations.length === 0 && isInternalDir(skillPath)) {
    // 合格但在internal → 建议移入public/
    bus.publish("skill.classification.suggest_public", { skillPath, reason: "满足通用标准" });
    notifyFeishu(`技能 ${skillName} 满足通用标准，建议移入 skills/public/`);
  } else if (violations.length > 0 && isPublicDir(skillPath)) {
    // 不合格但在public/ → 阻断或告警
    bus.publish("skill.classification.violation", { skillPath, violations });
    notifyFeishu(`⚠️ skills/public/${skillName} 不符合通用标准：${violations.join(', ')}`);
  }
};
```

### 断点④：ruleify执行引擎

**方案**：当dispatcher匹配到"需要规则化"的事件时，调用ruleify引擎自动生成三层代码

```
事件总线 → Dispatcher匹配 → ruleify-handler
  └→ 分析目标对象
  └→ 生成三层代码骨架：
      - 感知层：选择探针类型（git hook / cron / watcher），生成探针脚本模板
      - 认知层：生成判断函数模板（条件检查 or LLM调用）
      - 执行层：生成动作脚本模板（阻断/修复/告警）
  └→ 注册到对应触发机制
  └→ emit("ruleify.completed", { generatedFiles })
```

**关键决策**：代码骨架生成用LLM还是模板？
- 简单规则（条件检查类）→ 代码模板填充（快、确定性高）
- 复杂规则（需要语义理解）→ LLM生成（灵活但需review）
- 建议：先做模板方式跑通链路，再逐步引入LLM生成

### 意图事件（L3）的接入

**方案**：CRAS快通道作为意图探针

这部分需要单独详细设计（涉及你的意图识别专业领域），Day2先预留接口：

```
CRAS快通道（5min增量扫描对话流）
  └→ LLM提取意图信号
  └→ emit("user.intent.ruleify", { target, context })
  └→ emit("user.intent.query", { ... })
  └→ emit("user.intent.feedback", { ... })
```

事件总线的消费侧已经ready（Dispatcher + handler），生产侧（CRAS意图提取）需要：
1. 对话流的存取接口
2. 意图分类的prompt/模型
3. 意图类型的MECE体系（五种收敛类型你已定义过）

**建议**：意图识别的详细设计作为Day2的独立子方案，需要你review后再实现。

## 交付计划

### Day2 交付物（按优先级）

| # | 交付物 | 类型 | 说明 |
|---|--------|------|------|
| 1 | post-commit hook emit事件 | 感知层 | git变更→事件总线，约20行代码 |
| 2 | threshold-scanner.js | 感知层 | cron定期扫描阈值指标，emit L2事件 |
| 3 | classify-skill-distribution.js升级 | 认知+执行层 | 从advisory→实际判断+执行 |
| 4 | public-skill-quality-gate handler | 认知+执行层 | pre-commit阶段实际阻断不合格提交 |
| 5 | ruleify-handler骨架 | 执行层 | 模板方式生成三层代码 |
| 6 | 端到端验证 | 集成测试 | git commit新技能→事件→分类→执行 |
| 7 | CRAS意图接口预留 | 接口定义 | L3事件的生产侧接口，待详细设计 |

### 依赖关系
```
1 (post-commit emit) ──→ 3 (classify handler升级) ──→ 6 (端到端验证)
2 (threshold scanner) ──→ 4 (quality gate handler)
                          5 (ruleify handler) ──────→ 6
```

1和2可并行，3/4/5可并行（依赖1完成），6最后集成。

## 验收标准

1. git commit一个新技能目录 → post-commit自动emit事件 → dispatcher匹配规则 → handler执行分类检查 → 结果通知飞书
2. git commit一个不合格的skills/public/技能 → pre-commit自动阻断 → 输出具体违规项
3. cron扫描发现黄灯规则超30% → emit阈值事件 → 触发告警
4. 以上全程无需Agent记忆或手动干预

## 风险与假设

- **假设**：现有dispatcher的规则匹配逻辑足够用，不需要重写
- **假设**：handler的执行模型（同步函数）满足需求，不需要异步队列
- **风险**：post-commit emit如果耗时过长会影响git操作体验 → 异步emit，不阻塞
- **风险**：多个handler并发修改同一文件可能冲突 → 文件锁已有，需确认覆盖范围
- **暂不涉及**：L3意图事件的生产侧（CRAS意图提取），需要你定方向后再设计
