# Day2 交付物质量审计报告

**审计时间**: 2026-03-06 13:10 CST  
**审计员**: 质量仲裁官（QA Arbiter）  
**工作目录**: `/root/.openclaw/workspace`

---

## 一、总体评分

| 维度 | 状态 | 备注 |
|------|------|------|
| 语法正确性 | ✅ PASS | 69/69 handler文件全部通过 `node -c` |
| E2E测试 | ✅ PASS | 40/40 通过（独立runner） |
| Handler覆盖率 | ✅ PASS | 105/105 规则有handler绑定且文件存在 |
| 意图提取LLM failover | ✅ PASS | 6 provider优先级 + 全量fallback |
| 基础设施核心文件 | ✅ PASS | 7个核心文件语法无误 |
| 技能化交付 | ✅ PASS | 5个必需技能均存在SKILL.md + index.js |
| Git状态 | ⚠️ WARN | 审计前有9个未提交文件（均为runtime产物，已commit） |
| handler-executor/circuit-breaker单元测试 | ❌ MISSING | 无独立单元测试，仅E2E覆盖 |

---

## 二、通过项 ✅

### 2.1 语法正确性（全量检查）

- **infrastructure/event-bus/handlers/**：64个文件，`node -c` 全部 exit 0
- **skills/isc-core/handlers/**：5个文件，`node -c` 全部 exit 0  
- **基础设施核心文件**：bus-adapter.js、circuit-breaker.js、condition-evaluator.js、handler-executor.js、dispatcher.js、sensors/git-sensor.js、sensors/threshold-scanner.js — 全部通过

### 2.2 E2E测试（40/40）

```
Stage 1: EventBus基础      ✅ 6/6
Stage 2: CircuitBreaker    ✅ 5/5
Stage 3: ConditionEvaluator ✅ 8/8
Stage 4: Dispatcher        ✅ 7/7
Stage 5: HandlerExecutor   ✅ 6/6
Stage 6: 全链路集成         ✅ 8/8
总计: 40 passed, 0 failed
```

注：e2e-event-pipeline.test.js 是自研 runner，不兼容 Jest（已知设计决策）。

### 2.3 Handler覆盖率（105/105）

- isc-core/rules/ 有效规则文件：105个（排除`_deprecated`）
- 所有105条规则均含 `action.handler` 字段
- handler文件全部可被解析器定位：✅
- handler类型分布：
  - eval-quality-check（16条）、log-action（10条）、document-structure-check（9条）等
  - 19条规则使用全路径handler引用（详见风险项）

### 2.4 意图提取LLM层（provider failover）

`skills/cras/intent-extractor-llm.js` 实现了完整的 failover 机制：

```
优先级: zhipu-cron → claude-scout → claude-main → boom-scout → boom-cron-worker → boom-main
兜底: 遍历 openclaw.json 所有 providers
```

openclaw.json 中注册了 19 个 provider，failover 健壮。✅

### 2.5 API Failover

- `scripts/api-probe.js`：存在，支持 Anthropic + OpenAI 双协议探测 ✅
- `scripts/api-failover-probe.sh`：存在 ✅
- openclaw.json 包含 19 个 provider（claude-main/boom-main/zhipu 系列等）✅

### 2.6 技能化交付（5/5）

| 技能 | SKILL.md | index.js |
|------|----------|----------|
| intent-design-principles | ✅ | ✅ |
| anti-entropy-checker | ✅ | ✅ |
| five-layer-event-model | ✅ | ✅ |
| layered-architecture-checker | ✅ | ✅ |
| architecture-review-pipeline | ✅ | ✅ |

### 2.7 condition-evaluator 单元测试

`condition-evaluator.test.js`（独立runner）直接运行结果：

```
Results: 108 passed, 0 failed, 108 total — ✅ All tests passed!
```

---

## 三、问题项 ❌

### 3.1 circuit-breaker 无独立单元测试

**严重等级：中**

- 无 `circuit-breaker.test.js` 或等效文件
- 当前仅通过 E2E Stage 2 覆盖（5个测试用例）
- circuit-breaker 实现了三层保护（速率/链深度/全局），逻辑复杂，缺乏边界条件单元测试

**必须修改**：补充 `tests/unit/circuit-breaker.test.js`，覆盖：
- 速率限制触发与冷却恢复
- 链深度超限拦截
- 全局限流
- 并发安全

### 3.2 handler-executor 无独立单元测试

**严重等级：中**

- 无 `handler-executor.test.js` 或等效文件
- E2E Stage 5 有6个测试用例，但不覆盖错误路径
- handler-executor 包含超时处理、context构建、双目录查找等核心逻辑

**必须修改**：补充单元测试覆盖超时、handler找不到、handler抛错等边界路径。

### 3.3 isc-change-alignment.js 主路径运行时错误

**严重等级：中**

在 E2E 测试输出中发现：
```
[isc-change-alignment] Checker execution failed: Class constructor ISCDTOAlignmentChecker cannot be invoked without 'new'
```

- 原因：handler尝试以函数方式调用一个需要`new`的Class
- 降级路径（built-in alignment check）会接管，功能不中断，但主路径失效
- 涉及规则：`rule.isc-change-auto-trigger-alignment-001`

**必须修改**：`isc-change-alignment.js` 第27-35行，加 `new` 或检查 `typeof checker === 'function'` 的同时处理 Class 情况。

---

## 四、风险项 ⚠️

### 4.1 Dispatcher handler路径解析存在静默失败风险

**严重等级：高**

`dispatcher.js` 的 `_executeHandler` 方法：

```javascript
const handlerPath = path.join(__dirname, 'handlers', `${handlerName}.js`);
if (!fs.existsSync(handlerPath)) return; // 静默跳过！
```

- 该方法只在 `infrastructure/event-bus/handlers/` 下按短名查找
- **19条规则**的 `action.handler` 是完整路径（如 `infrastructure/event-bus/handlers/anti-entropy-check.js`）
- 这19条规则通过 dispatcher 触发时，handler 会**静默跳过**，不报错、不日志
- handler-executor.js 会正确处理（两目录查找），但 dispatcher 的内联执行路径不经过 handler-executor

**受影响规则示例**：
- rule.anti-entropy-design-principle-001（handler: `infrastructure/event-bus/handlers/anti-entropy-check.js`）
- rule.five-layer-event-model-001（handler: `skills/five-layer-event-model/index.js`）
- rule.isc-rule-creation-dedup-gate-001（handler: `scripts/check-rule-dedup.js`）

**建议修改**：dispatcher `_executeHandler` 支持绝对/相对路径解析：
```javascript
const handlerPath = path.isAbsolute(handlerName)
  ? handlerName
  : handlerName.includes('/')
    ? path.resolve(this.workspaceRoot, handlerName)
    : path.join(__dirname, 'handlers', `${handlerName}.js`);
```

### 4.2 meta-enforcement.js 规则目录路径错误

**严重等级：中**

```javascript
const rulesDir = path.join(workspace, 'infrastructure', 'isc', 'rules'); // ❌ 路径不存在
```

实际路径为 `skills/isc-core/rules`，导致该 handler 每次都 `return { status: 'skipped', reason: 'rules_dir_not_found' }`，功能完全失效。

**必须修改**：
```javascript
const rulesDir = path.join(workspace, 'skills', 'isc-core', 'rules');
```

### 4.3 浅层Handler：dedup-scan.js

**严重等级：低**

```javascript
// Simulate dedup scan
const details = `去重扫描触发：规则${ruleId}...`;
```

该 handler 仅记录日志，不执行真正的去重逻辑。对应规则 `rule.isc-rule-modified-dedup-scan-001` 实际无执行力。相比之下，`scripts/check-rule-dedup.js` 才是真正的去重实现。

**建议改进**：dedup-scan.js 调用 `check-rule-dedup.js` 的核心逻辑，或替换为真实实现。

### 4.4 log-action.js 被10条规则用作唯一handler

**严重等级：低**

`log-action.js` 是纯日志记录器，被以下类型规则使用：
- rule.cras-dual-channel-001
- rule.glm-vision-priority-001
- rule.planning-time-granularity-037 等

这些规则触发时仅写JSONL，不执行任何自主修复或闭环动作。属于"感知层覆盖，执行层空白"。

**建议改进**：区分"仅观察类"规则与"执行类"规则，后者应替换为具体执行handler。

### 4.5 notify-alert.js 是纯JSONL写入，无实际通知

**严重等级：低**

4条规则（failure-pattern-alert-001、lingxiaoge-tribunal-001等）使用 notify-alert，但该 handler 只写 `infrastructure/logs/alerts.jsonl`，无Feishu/Discord推送，依赖 heartbeat 被动读取。

**建议改进**：接入 Feishu Webhook 或 OpenClaw bus 通知机制。

### 4.6 未提交的Runtime产物

审计前存在9个未提交文件（均为运行时产物，非业务代码）：
- `infrastructure/logs/*.jsonl`（dispatcher/handler执行日志）
- `reports/e2e-test-report.md`
- `scripts/.probe-state.json`
- `infrastructure/event-bus/signals/processed/*.signal`

**已在审计时统一 commit**（commit: `🔍 qa: Day2 QA audit run`）

建议：将 `infrastructure/logs/` 加入 `.gitignore`，保持仓库干净。

---

## 五、建议项 💡

### 5.1 建立 Jest 兼容的单元测试套件

当前独立runner (`node test.js`) 无法被 CI 工具链（jest --coverage、GitHub Actions）直接集成：
- condition-evaluator.test.js → 独立runner
- e2e-event-pipeline.test.js → 独立runner

建议：增加 Jest 适配层（`describe/it` 包装），或建立统一test runner。

### 5.2 circuit-breaker 三层保护补充边界测试

当前三层保护实现完整，但需测试：
- 速率恢复窗口（cooldownMs过后是否正确重置）
- 边界值（exactly at limit vs over limit）
- 并发事件下的计数器一致性

### 5.3 Handler签名标准化

抽查10个handler，发现签名存在两种风格：
- 标准：`async function(event, rule, context)` — 大多数 handler ✅
- 无标准context：`module.exports = async function(event, rule, context) { const logger = context.logger || console; }` — 部分handler直接解构 context ✅

签名一致，但有2个handler（`dedup-scan.js`, `enforcement-audit.js`）未使用 `context.logger`，直接返回结果，丢失了统一日志链路。

### 5.4 isc-skill-security.js 委托设计

`isc-skill-security.js` 委托给 `isc-skill-security-gate-030.js`，设计合理。  
但如果 `isc-skill-security-gate-030.js` 出错，两条规则同时失效。建议添加独立降级路径。

### 5.5 将19条全路径handler改为短名引用

规则JSON中的handler字段从全路径 `infrastructure/event-bus/handlers/xxx.js` 改为短名 `xxx`，与dispatcher解析逻辑保持一致，消除静默失败风险（详见风险4.1）。

---

## 六、审计摘要

| 类别 | 数量 |
|------|------|
| ✅ 通过项 | 7 |
| ❌ 问题项（阻塞） | 3 |
| ⚠️ 风险项（需关注） | 6 |
| 💡 建议项（优化） | 5 |

**阻塞项总结**：
1. circuit-breaker 无单元测试 → 补测试
2. handler-executor 无单元测试 → 补测试  
3. isc-change-alignment.js 主路径运行时错误 → 修Bug

**最高风险**：  
Dispatcher 对19条全路径handler的静默跳过，可能导致关键规则（如 anti-entropy、five-layer-event-model）在生产中从不执行，且无任何错误日志。

---

*报告生成：质量仲裁官 | `/root/.openclaw/workspace/reports/day2-qa-report.md`*
