# MR v2 实现计划

## 1. 实施步骤

### Phase 1: 基础设施准备 (Day 1-2)

| 任务 | 描述 | 产出物 |
|:---|:---|:---|
| 1.1 CapabilityAnchor更新 | 添加模型能力定义模板 | `CAPABILITY-ANCHOR.md` 模型章节 |
| 1.2 LEP接口确认 | 确认`lep.execute()`接口契约 | 接口确认文档 |
| 1.3 意图模板库 | 创建初始意图模板（推理/多模态/通用） | `intents/` 目录 |
| 1.4 配置Schema | 定义N019/N020配置校验规则 | `CONFIG-SCHEMA.json` |

### Phase 2: 核心模块开发 (Day 3-6)

| 任务 | 描述 | 产出物 |
|:---|:---|:---|
| 2.1 IntentClassifier | 语义意图识别引擎 | `intent-classifier.ts` |
| 2.2 PreferenceMerger | 子Agent偏好融合器 | `preference-merger.ts` |
| 2.3 SandboxValidator | 三层沙盒验证 | `sandbox-validator.ts` |
| 2.4 LEPDelegate | LEP执行委托层 | `lep-delegate.ts` |
| 2.5 MRRouter | 主路由入口 | `mras-router.ts` |

### Phase 3: 集成与测试 (Day 7-8)

| 任务 | 描述 | 产出物 |
|:---|:---|:---|
| 3.1 LEP集成测试 | 验证LEP韧性复用 | 测试报告 |
| 3.2 沙盒测试 | 验证三层沙盒 | 测试报告 |
| 3.3 多Agent集成 | 与并行子Agent v3.0.1集成 | 集成测试报告 |
| 3.4 主模型保护测试 | 验证通信独立性 | 测试报告 |

### Phase 4: 文档与上线 (Day 9-10)

| 任务 | 描述 | 产出物 |
|:---|:---|:---|
| 4.1 使用文档 | 子Agent配置指南 | `USAGE.md` |
| 4.2 示例配置 | 3个典型Agent配置示例 | `examples/` |
| 4.3 N022审计 | 自检ISC合规性 | 审计报告 |
| 4.4 灰度上线 | 1个子Agent试点 | 上线报告 |

---

## 2. 风险分析

| 风险ID | 风险描述 | 概率 | 影响 | 缓解措施 |
|:---:|:---|:---:|:---:|:---|
| R001 | 语义识别准确率低 | 中 | 高 | 保留人工覆盖，迭代优化 |
| R002 | LEP接口变更 | 低 | 高 | LEP已下沉，接口稳定 |
| R003 | 子Agent配置复杂 | 中 | 中 | 提供配置生成工具 |
| R004 | 性能开销（嵌入计算） | 中 | 低 | 缓存意图结果，批量处理 |
| R005 | 断连风险（沙盒失效） | 低 | 极高 | 强制降级链包含本地模型 |

---

## 3. 测试策略

### 3.1 单元测试

```typescript
// 意图识别测试用例
describe('IntentClassifier', () => {
  test('识别代码生成任务', () => {
    const intent = classifier.classify('写一个Python爬虫');
    expect(intent.taskCategory).toBe('reasoning');
    expect(intent.complexity).toBe('medium');
  });
  
  test('识别多模态任务', () => {
    const intent = classifier.classify('分析这张图片');
    expect(intent.inputModality).toBe('image');
  });
});
```

### 3.2 集成测试

| 测试场景 | 输入 | 预期结果 |
|:---|:---|:---|
| 正常路由 | 代码审查任务 | 成功调用`{{MODEL_CODE_REVIEW}}` |
| LEP降级 | 首选模型失败 | LEP自动降级到fallback |
| 沙盒拦截 | 不健康模型 | 跳过不健康模型，使用健康fallback |
| 主模型保护 | 子Agent超时 | 主Agent可正常响应新请求 |

### 3.3 压力测试

- 100并发子Agent请求
- 模拟模型熔断场景
- 验证LEP连接池稳定性

---

## 4. 与另一个AI方案的差异实现

| 差异点 | 另一个AI | MR v2 实现方式 |
|:---|:---|:---|
| 全局vs独立 | 全局单一路由 | 每个子Agent`mras-preference.json` |
| 硬编码vs配置 | `"reasoning": "zhipu/glm-5"` | `"preferred": "{{MODEL_DEEP_THINKING}}"` |
| 自建vs委托 | 自建降级逻辑 | `lep.execute({modelChain})` |
| 无vs有沙盒 | 直接调用 | 健康检查→影子测试→生产 |
| Markdown vs ISC | 简单文档 | `ARCHITECTURE.json` + `DESIGN.md` |

---

## 5. 验收标准

- [ ] 所有7条约束满足（C001-C007）
- [ ] N022审计通过（无硬编码，ISC格式正确）
- [ ] 单元测试覆盖率>80%
- [ ] 集成测试全部通过
- [ ] 压力测试无断连
- [ ] 文档完整（使用指南+示例）

---

*版本: 2.0.0*
*预计工期: 10天*
*等待用户确认后启动开发*
