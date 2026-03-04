# L3 意图识别层实施计划

> **版本**: v1.0.0  
> **日期**: 2026-03-05

---

## 第一部分：实施步骤

### Day 1（已完成 ✅）

| 步骤 | 产出 | 状态 |
|------|------|------|
| 现有系统事件盘点 | 7个事件生产者 + 5个消费者完整清单 | ✅ |
| 新旧总线API对比 | 4个致命不兼容点识别 | ✅ |
| 6个新L3模块集成现状分析 | 6/6模块零集成确认 | ✅ |
| 迁移方案对比与决策 | 方案A（适配层）胜出 | ✅ |
| 具体改动清单（10个文件） | Phase 1-3完整规划 | ✅ |
| 接口契约定义 | EventBus/IntentEngine/Registry 三件套 | ✅ |
| 依赖方向图与禁止线 | CI门禁规则5条 | ✅ |
| Decision Log格式定义 | JSONL格式 + 30天保留 | ✅ |
| ISC N022合规输出物 | DESIGN.md + ARCHITECTURE.json + IMPLEMENTATION.md | ✅ |

### Day 2（计划）

**Phase 1：适配层建设（消除数据竞争 + 接通新旧总线）**

| 步骤 | 文件 | 预估时间 |
|------|------|---------|
| 1. 创建bus-adapter.js | `infrastructure/event-bus/bus-adapter.js` | 1.5h |
| 2. 修改L3Pipeline require路径 | `infrastructure/pipeline/l3-pipeline.js` L24 | 5min |
| 3. 修改E2E测试require路径 | `infrastructure/tests/l3-e2e-test.js` L23 | 5min |
| 4. event-bus.js添加废弃标记 | `infrastructure/event-bus/event-bus.js` L1 | 2min |
| 5. P1验证（旧↔新互通测试） | 手动验证脚本 | 30min |

**Phase 2：L3模块接入现有事件流**

| 步骤 | 文件 | 预估时间 |
|------|------|---------|
| 6. L3Pipeline改为cursor消费模式 | `infrastructure/pipeline/l3-pipeline.js` | 1h |
| 7. 新增user.intent.*路由 | `infrastructure/dispatcher/routes.json` | 10min |
| 8. 创建intent-dispatch handler | `infrastructure/dispatcher/handlers/intent-dispatch.js` | 45min |
| 9. DecisionLogger接入Observability | `infrastructure/observability/dashboard.js` | 30min |
| 10. P2验证（闭环测试） | 手动+cron验证 | 30min |

### Day 3（计划）

**Phase 3：交叉验证与闭环打通**

| 步骤 | 文件 | 预估时间 |
|------|------|---------|
| 11. ISC→RuleMatcher联动钩子 | `infrastructure/event-bus/bus-adapter.js` | 45min |
| 12. CRAS→RegistryManager联动 | `infrastructure/pipeline/l3-pipeline.js` | 45min |
| 13. AEO→DecisionLogger联动 | `infrastructure/event-bus/bus-adapter.js` | 30min |
| 14. 全链路端到端测试 | 验证ISC→...→L3→Dispatcher闭环 | 1h |
| 15. CI门禁规则实施 | 依赖方向检查5条规则 | 30min |

---

## 第二部分：风险分析

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| 适配层引入性能瓶颈 | 低 | 低 | 文件I/O为实际瓶颈，适配层开销可忽略 |
| bus.history()不完全兼容consume语义 | 中 | 中 | 适配层内做cursor模拟+ack转发，P1验证阶段确认 |
| 旧bus.js文件锁在高并发下阻塞 | 低 | 中 | 现有系统已稳定运行，L3增量写入量小（5min/次） |
| Phase 2改动引入回归 | 中 | 高 | 旧event-bridge完全不动，影响范围限于L3Pipeline |
| Phase 3交叉联动逻辑复杂度 | 中 | 中 | 钩子设计为可选增强，关闭钩子不影响主流程 |
| event-bus.js被其他代码直接引用 | 低 | 高 | grep扫描确认引用点，全部替换后添加废弃警告 |

### 回滚方案

- **Phase 1回滚**：删除bus-adapter.js，恢复L3Pipeline和E2E测试的require路径
- **Phase 2回滚**：恢复L3Pipeline的consume逻辑，删除新增路由和handler
- **Phase 3回滚**：禁用适配层钩子（配置开关），不影响Phase 1-2功能

---

## 第三部分：测试策略

### 单元测试

| 测试 | 覆盖 | 优先级 |
|------|------|--------|
| bus-adapter.emit → bus.emit委托 | emit映射正确性 | P0 |
| bus-adapter.consume → bus.history委托 | consume映射正确性 | P0 |
| bus-adapter.healthCheck | events.jsonl完整性检查 | P1 |
| IntentScanner降级路径 | LLM失败→正则fallback | P0 |
| DecisionLogger格式校验 | JSONL写入+字段完整性 | P1 |

### 集成测试

| 测试 | 覆盖 | 优先级 |
|------|------|--------|
| 旧bus emit → 适配层consume 互通 | 新旧总线数据一致性 | P0 |
| 适配层emit → 旧bus consume 互通 | 反向一致性 | P0 |
| L3Pipeline完整运行（cron模拟） | 编排层端到端 | P0 |
| Dispatcher user.intent.*路由 | 新路由正确触发handler | P1 |

### 端到端测试

| 测试 | 覆盖 | 优先级 |
|------|------|--------|
| ISC规则变更→全链路→L3意图识别→Dispatcher | 完整闭环 | P0 |
| LLM不可用→降级→正则识别→Dispatcher | 降级闭环 | P1 |
| 高频事件→风暴抑制→正常处理 | 鲁棒性 | P2 |

### 验证命令

```bash
# P1验证
node -e "const adapter=require('./infrastructure/event-bus/bus-adapter'); \
  adapter.emit('test.verify',{},'test'); \
  console.log(adapter.consume({type_filter:'test.*'}))"

# P2验证
node infrastructure/tests/l3-e2e-test.js

# P3验证：全链路
node -e "const bus=require('./infrastructure/event-bus/bus'); \
  bus.emit('isc.rule.updated',{rule_id:'R001'},'verify')"
# 等5分钟cron，检查 decision-logs/ 和 dispatcher decision.log
```
