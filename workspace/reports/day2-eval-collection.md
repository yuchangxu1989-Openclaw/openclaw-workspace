# Day 2 Report: 评测样本自动回收机制

**日期**: 2026-03-05  
**ISC规则**: rule.eval-sample-auto-collection-001  

---

## 完成项

### 1. ISC规则定义 ✅

**文件**: `skills/isc-core/rules/rule.eval-sample-auto-collection-001.json`

- **domain**: quality
- **enforcement_tier**: P1_process
- **核心规则**:
  - IntentScanner处理真实用户消息 → 记录input+output到样本池
  - Pipeline完整执行 → 记录事件链到场景样本池
  - 测试失败 → 自动归档为regression test
  - 样本池每周review，人工标注后入库到tests/registry.json
- **触发事件**: intent.classified, pipeline.completed, test.failed
- **触发动作**: auto_collect

### 2. 评测样本收集器 ✅

**文件**: `infrastructure/observability/eval-collector.js`

**核心能力**:
- `register(eventBus)` — 注册到EventBus，监听 intent.classified / pipeline.completed
- `collectSample(eventType, payload, context)` — 手动收集单条样本
- `reviewPending()` — 列出所有待review样本（含input预览）
- `reviewSample(filename, decision, reviewer)` — 标记样本为approved/rejected

**数据流**: 事件触发 → 写入JSON到 `tests/collection/pending/` → 命名格式 `{timestamp}-{event-type}.json` → 人工review → 入库

**附加**: 自动维护 `tests/collection/meta.json` 统计元数据（收集总数、review总数、按事件类型分类）

### 3. 失败case自动归档 ✅

**文件**: `tests/regression/auto-archive.js`

**核心能力**:
- `archiveFailedCases(failedCases)` — 批量归档失败用例，去重写入
- `onTestFailed(payload, context)` — 单条失败事件处理
- `register(eventBus)` — 注册到EventBus，监听 test.failed
- `listRegressions()` — 列出所有回归测试样本
- `getStats()` — 获取统计数据

**数据流**: 测试失败 → 写入JSON到 `tests/regression/archived/` → 更新 `tests/registry.json`（source标记为"regression"，自动去重）

## 文件清单

| 文件 | 类型 | 说明 |
|------|------|------|
| `skills/isc-core/rules/rule.eval-sample-auto-collection-001.json` | ISC规则 | 评测样本自动回收策略 |
| `infrastructure/observability/eval-collector.js` | 收集器 | 监听事件，收集样本到pending |
| `tests/regression/auto-archive.js` | 归档器 | 失败case自动归档+registry更新 |
| `tests/registry.json` | 注册表 | 自动创建，统一管理所有评测样本 |
| `tests/collection/pending/` | 目录 | 待review样本存放 |
| `tests/regression/archived/` | 目录 | 回归测试归档存放 |

## 使用示例

```javascript
// 注册收集器
const { register: registerCollector } = require('./infrastructure/observability/eval-collector');
const { register: registerArchiver } = require('./tests/regression/auto-archive');

registerCollector(eventBus);
registerArchiver(eventBus);

// 手动收集
const { collectSample } = require('./infrastructure/observability/eval-collector');
collectSample('intent.classified', { input: '天气怎么样', output: { intent: 'weather' } });

// 手动归档失败case
const { archiveFailedCases } = require('./tests/regression/auto-archive');
archiveFailedCases([{ test_id: 'test-001', input: '...', expected: '...', actual: '...' }]);

// 查看待review
const { reviewPending } = require('./infrastructure/observability/eval-collector');
console.log(reviewPending());
```
