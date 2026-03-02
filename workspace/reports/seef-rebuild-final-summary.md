# SEEF自主决策流水线 架构重构方案 v2.0

**汇报日期**: 2026-03-01  
**设计团队**: Claude子Agent (penguinsaichat/claude-opus-4-6-thinking)  
**文档规模**: 分析报告38KB + 引擎路线图45KB = **83KB**  
**输出文件**:
- `/reports/seef-rebuild-analysis.md` - Claude现状分析
- `/reports/seef-rebuild-engine-roadmap.md` - Claude引擎与集成设计

---

## 一、核心问题诊断

### 1.1 现状偏离度

| 维度 | 设计蓝图 | 实际实现 | 偏离度 |
|------|---------|---------|-------|
| **语言栈** | Python (7子技能) | JavaScript流水线 | **100%** |
| **决策模式** | 动态分支选择 | 固定6阶段 | **高** |
| **ISC集成** | 双向闭环 | 单向检查 | **高** |
| **CRAS注入** | 7注入点 | 无集成 | **100%** |

### 1.2 7子技能实现状态

| 子技能 | 状态 | 核心问题 |
|--------|------|----------|
| evaluator | ⚠️ 部分可用 | 未被DTO调用，输出格式不兼容 |
| discoverer | ❌ 缺失 | 能力发现未实现 |
| optimizer | ⚠️ 概念映射 | autoFix未连接ISC规则 |
| creator | ❌ 缺失 | 新技能生成未实现 |
| aligner | ❌ 缺失 | 全局对齐未实现 |
| validator | ⚠️ 部分映射 | 验证维度不完整 |
| recorder | ⚠️ 功能弱化 | 仅日志，无知识库 |

### 1.3 根本矛盾

**SEEF设计目标**: 基于评估结果的**自主决策闭环**  
**当前实现**: 固定顺序的**EvoMap发布流水线**

差距：缺乏动态决策引擎、ISC双向集成、CRAS知识注入

---

## 二、重构架构总览

### 2.1 新架构五层

```
┌─────────────────────────────────────────────────────────────────┐
│  编排层 (Orchestration)                                          │
│  CTO固定闭环 / LLM自由编排 / 混合模板                             │
├─────────────────────────────────────────────────────────────────┤
│  决策层 (Decision)                                               │
│  Evaluator → Discoverer → Optimizer → Creator                   │
│  (基于结果动态分支，非固定顺序)                                    │
├─────────────────────────────────────────────────────────────────┤
│  韧性层 (Resilience)                                             │
│  LEP(规则执行+桥接) + Parallel-Subagent(并发控制) + Adapter      │
├─────────────────────────────────────────────────────────────────┤
│  网关层 (Gateway)                                                │
│  ISC Check-in → Checkpoint → Check-out (N016/N017/N036)         │
├─────────────────────────────────────────────────────────────────┤
│  执行层 (Execution)                                              │
│  Aligner ← Validator ← Recorder                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 核心设计决策

| 决策 | 方案 | 理由 |
|------|------|------|
| **动态决策** | 基于evaluator分数分支选择 | 避免固定7阶段，实现真正自主 |
| **Python-JS桥接** | 子进程+符号链接(短期)/gRPC(长期) | 快速打通，未来可扩展 |
| **韧性整合** | LEP负责规则，Parallel-Subagent负责并发 | 职责分离，避免重复开发 |
| **ISC门禁** | Check-in/Checkpoint/Check-out三级 | 实现真正的准入准出 |

---

## 三、决策引擎设计

### 3.1 动态决策逻辑

```
DTO Event (skill.registered/updated)
    │
    ▼
┌─────────────┐
│  Evaluator  │──→ 评估报告 {score, issues, suggestions}
└─────────────┘
    │
    ▼
决策引擎 (Decision Engine)
    │
    ├─── score ≥ 90 ──→ [Recorder] (高分通过)
    │
    ├─── score ≥ 70 ──→ [Optimizer → Validator → Recorder] (需优化)
    │
    ├─── score < 70 ──→ [Discoverer → Optimizer → Creator → Validator → Recorder] (严重问题)
    │
    └─── 能力缺口 ──→ [Creator → Validator → Recorder] (创建新技能)
```

### 3.2 决策分支示例

| 条件 | 执行路径 | 预计耗时 |
|------|----------|----------|
| 高分通过 | evaluator → recorder | 30s |
| 中等问题 | evaluator → optimizer → validator → recorder | 2min |
| 严重问题 | evaluator → discoverer → optimizer → creator → validator → recorder | 5min |
| 能力缺口 | evaluator → creator → validator → recorder | 3min |

---

## 四、统一韧性层

### 4.1 职责划分

| 组件 | 职责 | 关键解决 |
|------|------|----------|
| **LEP** | 规则执行、Python-JS桥接、WAL日志 | LEP引用路径 → 符号链接方案 |
| **Parallel-Subagent** | 并发控制(5并发)、熔断(5失败)、重试(2次) | 资源耗尽保护 |
| **Adapter** | 统一接口，屏蔽底层差异 | 简化调用方代码 |

### 4.2 LEP路径问题解决

```bash
# 方案: 符号链接 (推荐)
ln -s /root/.openclaw/workspace/skills/lep-executor \
      /root/.openclaw/workspace/node_modules/@openclaw/lep

# 使用:
const lep = require('@openclaw/lep');  // ✅ 稳定路径
```

---

## 五、ISC网关

### 5.1 三级门禁

| 门禁 | 规则 | 检查内容 | 失败处理 |
|------|------|----------|----------|
| **Check-in** | N036 | 记忆完整性、输入格式、依赖完整 | 触发自动恢复 |
| **Checkpoint** | N016 | 修复循环进度、中间结果校验 | 继续迭代或退出 |
| **Check-out** | N017 | 输出质量、重复问题检测 | 标记人工介入 |

### 5.2 规则映射

```javascript
// Check-in: N036 记忆恢复
checkIn(skillId, input) {
  if (!memoryIntact) {
    await lep.executeRule('N036', { trigger: 'pre_execution' });
  }
}

// Checkpoint: N016 修复循环
checkpoint(skillId, result) {
  if (result.fixableIssues?.length > 0) {
    await lep.executeRule('N016', { fixableIssues });
  }
}

// Check-out: N017 重复根治
checkOut(skillId, output) {
  await lep.executeRule('N017', { skillId, recentEvents });
}
```

---

## 六、DTO-ISC-CRAS集成

### 6.1 双向消息协议

```
DTO ──skill.registered──→ SEEF ──evaluation.completed──→ ISC
                              ──evolution.completed──→ CRAS
                              
ISC ──standard.updated──→ SEEF (规则变更通知)
CRAS ──insight.generated──→ SEEF (洞察实时影响决策)
```

### 6.2 七个CRAS知识注入点

| 注入点 | 子技能 | CRAS输入 | 影响 |
|:------|:-------|:---------|:-----|
| 1 | Evaluator | 用户意图洞察 | 调整评估权重 |
| 2 | Discoverer | 能力缺口分析 | 优先发现方向 |
| 3 | Optimizer | 历史优化模式 | 选择最佳策略 |
| 4 | Creator | 技能模板库 | 加速原型生成 |
| 5 | Aligner | 标准演化趋势 | 预测性对齐 |
| 6 | Validator | 质量基准数据 | 动态阈值调整 |
| 7 | Recorder | 知识图谱 | 关联历史进化 |

### 6.3 自由编排支持

| 场景 | 调用方式 | 执行子技能 |
|------|----------|-----------|
| 快速评估 | `seef.runFlexible(['evaluator', 'recorder'])` | 2个 |
| 紧急修复 | `seef.runFlexible(['evaluator', 'optimizer', 'validator', 'recorder'])` | 4个 |
| 能力扩展 | `seef.runFlexible(['creator', 'validator', 'recorder'])` | 3个 |

---

## 七、实施路线图 (10周)

### P0 阶段 (1-2周): 基础打通

| 任务 | 工作量 | 产出 |
|:-----|:------|:-----|
| LEP全局注册(符号链接) | 2天 | 稳定引用路径 |
| DTO订阅实现 | 3天 | skill.registered触发器 |
| Evaluator重构 | 5天 | 支持CRAS注入 |
| 基础测试 | 2天 | 端到端冒烟测试 |

**验收**: DTO事件 → Evaluator → 决策建议 (全流程跑通)

### P1 阶段 (3-4周): 决策引擎 + ISC网关

| 任务 | 工作量 | 产出 |
|:-----|:------|:-----|
| 决策引擎开发 | 5天 | DecisionEngine类 |
| ISC网关实现 | 5天 | ISCGateway类 |
| N016/N017集成 | 4天 | 规则执行器对接 |
| Adapter开发 | 3天 | ExecutionAdapter |
| 集成测试 | 3天 | 完整流程测试 |

**验收**: 动态分支选择 + ISC三级门禁 (非固定7阶段)

### P2 阶段 (5-8周): 完整闭环 + 优化

| 任务 | 工作量 | 产出 |
|:-----|:------|:-----|
| CRAS集成 | 5天 | 7个知识注入点 |
| 消息总线优化 | 4天 | 事件溯源 + 重放 |
| Parallel-Subagent集成 | 3天 | 并发控制 |
| 性能优化 | 5天 | 响应时间<2s |
| 文档完善 | 3天 | 完整API文档 |
| 压力测试 | 5天 | 100并发稳定 |

**验收**: 双向反馈闭环 + 自由编排 + 性能达标

---

## 八、关键约束与风险

### 8.1 技术约束

| 约束 | 缓解措施 |
|:-----|:---------|
| Python-JS互操作性能开销 | 连接池复用子进程 |
| 消息总线延迟 | 优先级队列 |
| 并发控制死锁风险 | 使用Parallel-Subagent成熟方案 |

### 8.2 实施风险

| 风险 | 概率 | 影响 | 应对 |
|:-----|:-----|:-----|:-----|
| LEP路径问题未解决 | 中 | 高 | P0阶段优先验证 |
| ISC规则冲突 | 低 | 中 | 规则优先级机制 |
| CRAS数据质量不足 | 中 | 中 | 降级为无CRAS模式 |
| 性能不达标 | 中 | 高 | 预留P2优化时间 |

---

## 九、成功指标

| 指标 | 目标 | 测量方式 |
|:-----|:-----|:---------|
| 决策准确率 | >85% | 人工评审100次决策 |
| 平均执行时间 | <2s | 监控系统统计 |
| ISC门禁拦截率 | 5-10% | 日志分析 |
| CRAS注入覆盖率 | 100% | 代码覆盖率 |
| 系统可用性 | >99.5% | 7x24监控 |

---

## 十、总结与下一步

### 10.1 核心变更

| 维度 | 变更前 | 变更后 |
|------|--------|--------|
| **定位** | EvoMap发布流水线 | SEEF自主决策流水线 |
| **决策** | 固定6阶段 | 基于evaluator结果的动态分支 |
| **ISC** | 单向检查 | 双向通信+三级门禁 |
| **CRAS** | 未集成 | 7注入点深度集成 |
| **韧性** | 分散实现 | LEP+Parallel-Subagent统一 |

### 10.2 设计亮点

1. **动态决策**: 不是固定7阶段，是基于结果的智能分支
2. **三级门禁**: Check-in/Checkpoint/Check-out实现真正准入准出
3. **双向闭环**: DTO→SEEF→ISC→SEEF，结果回流影响下次决策
4. **知识驱动**: CRAS洞察实时注入7个子技能
5. **渐进实施**: P0/P1/P2三阶段，每阶段有明确验收标准

### 10.3 下一步行动

1. **立即启动P0** (本周): LEP符号链接 + DTO订阅实现
2. **并行决策**: discoverer/creator/aligner是补全Python还是JS重写
3. **设计评审**: 召集CTO/ISC/CRAS相关方评审方案
4. **资源准备**: 申请2名开发(全栈+Python)，10周周期

---

**附件**:
- [现状分析报告 38KB](/reports/seef-rebuild-analysis.md)
- [引擎与集成设计 45KB](/reports/seef-rebuild-engine-roadmap.md)
