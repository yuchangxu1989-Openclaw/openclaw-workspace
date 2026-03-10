# Badcase自动采集未按V4标准生成并入库 — 根因分析报告

日期：2026-03-11
分析人：scout subagent

---

## 一、结论

**Badcase自动采集链路存在5个断裂点，导致采集到的badcase既不符合V4标准格式，也无法被评测系统直接使用。** 核心问题是：规则写了、代码也写了，但（1）事件驱动链路未接通，（2）产出格式与V4标准完全不对齐，（3）两套采集系统各自为政互不连通。

---

## 二、现状梳理：三套采集机制并存但互不连通

### 机制A：completion-handler关键词触发 → harvest.sh入库
- **位置**：`skills/public/multi-agent-reporting/completion-handler.sh` → `scripts/auto-badcase-harvest.sh` → `skills/public/auto-badcase-harvest/harvest.sh`
- **触发条件**：子任务完成时summary命中关键词（badcase/违反/纠偏/反复未果/头痛医头/又忘了/第N次等）
- **写入目标**：`tests/benchmarks/intent/c2-golden/00-real-badcases.json`
- **状态**：✅ 代码已实现，能触发，但产出格式不符合V4标准

### 机制B：ISC规则 + badcase-harvest-engine.js（事件驱动）
- **位置**：`skills/isc-core/rules/rule.auto-badcase-harvest-engine-001.json` + `skills/isc-core/handlers/badcase-harvest-engine.js`
- **触发条件**：监听 `user.correction`、`task.failed`、`rule.violated` 三类事件
- **写入目标**：`tests/benchmarks/intent/c2-golden/00-real-badcases.json`
- **状态**：❌ **从未被实际触发过**（见下方根因分析）

### 机制C：correction-harvester.js（定时扫描记忆文件）
- **位置**：`infrastructure/self-check/correction-harvester.js`
- **触发条件**：cron每5分钟扫描memory/目录，用正则匹配纠偏信号
- **写入目标**：`infrastructure/aeo/golden-testset/pending-cases.json`（与A/B完全不同的文件！）
- **状态**：⚠️ 代码在跑，但最近日志全是"0个纠偏信号"——正则匹配率极低，且产出写入pending队列而非评测集

---

## 三、根因分析：5个断裂点

### 断裂点1：事件驱动链路未接通（致命）

ISC规则 `rule.auto-badcase-harvest-engine-001.json` 声明监听 `user.correction`、`task.failed`、`rule.violated`，但：

- **`user.correction` 事件从未被emit过**。事件总线日志中只有2条 `user.feedback.correction`（注意：类型名不匹配！规则监听的是 `user.correction`，实际emit的是 `user.feedback.correction`）
- **`task.failed` 事件**：只有 `lep.task.failed` 被emit，而非裸的 `task.failed`。前缀不匹配，通配符规则也不覆盖
- **`rule.violated`**：仅在event-bus单元测试中出现，生产环境从未emit过
- **dispatcher routes.json 中没有 `user.correction` 的路由配置**，即使事件被emit也不会被分发到handler

**结论**：handler写好了但从来没被调用过。事件类型名不匹配 + 路由未配置 = 完全断路。

### 断裂点2：产出格式与V4标准完全不对齐（致命）

V4标准评测用例必须包含的字段 vs harvest实际产出：

| V4必需字段 | harvest是否产出 | 说明 |
|---|---|---|
| `scoring_rubric` (含pass/partial/badcase) | ❌ 缺失 | V4核心评分标准，harvest完全没有 |
| `north_star_indicator` | ❌ 缺失 | 关联哪个北极星指标，harvest没有 |
| `execution_chain_steps` | ❌ 缺失 | 预期执行链步骤，harvest没有 |
| `expected_output` | ❌ 缺失 | harvest用的是 `expected_behavior`，字段名不同且内容粒度不够 |
| `category` (V4分类) | ❌ 不匹配 | harvest用 `badcase_category`（如"自主性缺失类"），V4用的是功能分类（如"yanchu-fasu"） |
| `complexity` | ❌ 缺失 | harvest用 `difficulty`，字段名不同 |

**结论**：harvest产出的JSON记录无法直接作为V4评测用例使用。即使入库了，评测runner也跑不了。

### 断裂点3：goodcase翻转只补了scoring_rubric的皮毛

`badcase-to-goodcase.sh` 在翻转时确实生成了 `scoring_rubric` 字段，但：
- 只是简单拼接 `f'系统应执行: {exp[:100]}'`，不是V4要求的 `{pass, partial, badcase}` 三级结构
- 没有补 `north_star_indicator`、`execution_chain_steps`
- goodcase写入的是 `goodcases-from-badcases.json`，不是评测runner读取的评测集文件

### 断裂点4：correction-harvester产出写入pending队列，与评测集隔离

`correction-harvester.js` 的产出写入 `infrastructure/aeo/golden-testset/pending-cases.json`，状态全是 `pending_review`。但：
- 没有任何代码/流程将pending cases审核后转入正式评测集
- pending队列里5条case一直挂着，从未被消费
- 这套系统与机制A/B完全独立，数据不互通

### 断裂点5：completion-handler的关键词触发太窄且模板化

completion-handler虽然能触发harvest，但：
- 只在子任务completion时触发，不覆盖对话中的实时纠偏场景
- 入库的 `wrong_chain`/`correct_chain`/`root_cause` 全是固定模板文本（"任务总结含badcase语义 then仅口头标记 then未程序化入库"），不是实际的错误链和正确链
- 3条已入库的badcase内容几乎一模一样，都是同一个模板，没有实际诊断价值

---

## 四、缺失清单

| # | 缺失环节 | 严重程度 | 当前状态 |
|---|---|---|---|
| 1 | 事件类型名不匹配（user.correction vs user.feedback.correction） | 🔴 致命 | handler从未被触发 |
| 2 | dispatcher未配置user.correction/task.failed路由到harvest handler | 🔴 致命 | 事件即使emit也不会被分发 |
| 3 | harvest产出缺少V4必需字段（scoring_rubric/north_star_indicator/execution_chain_steps） | 🔴 致命 | 产出无法用于评测 |
| 4 | 没有从pending-cases到正式评测集的审核转化流程 | 🟡 严重 | pending队列是死胡同 |
| 5 | completion-handler入库内容模板化，无实际诊断价值 | 🟡 严重 | 入库了但内容无用 |
| 6 | 三套采集机制数据不互通 | 🟡 严重 | 各写各的文件 |
| 7 | correction-harvester正则匹配率为0 | 🟠 中等 | 跑了但什么都没抓到 |

---

## 五、修复方案（按优先级排序）

### P0-1：修复事件类型名匹配 + 添加dispatcher路由

**目标**：让harvest handler能被实际触发

1. 将ISC规则中的 `user.correction` 改为 `user.feedback.correction`（与实际emit的事件名对齐）
2. 在 `infrastructure/dispatcher/routes.json` 中添加：
   - `user.feedback.correction` → `badcase-harvest-engine`
   - `task.failed` / `lep.task.failed` → `badcase-harvest-engine`
3. 确保 `badcase-harvest-engine.js` 在dispatcher的handler注册表中

**预估工作量**：1小时

### P0-2：harvest产出增加V4必需字段

**目标**：入库的badcase能直接被评测runner使用

修改 `harvest.sh` 和 `badcase-harvest-engine.js`，在写入记录时补充：
```json
{
  "scoring_rubric": {
    "pass": "<从correct_chain生成>",
    "partial": "<部分完成的描述>",
    "badcase": "<从wrong_chain生成>"
  },
  "north_star_indicator": "<根据category映射到5个北极星指标之一>",
  "execution_chain_steps": ["<从correct_chain拆解>"],
  "expected_output": "<从expected_behavior映射>",
  "category": "<从badcase_category映射到V4分类>",
  "complexity": "C2"
}
```

category映射表：
- 纠偏类/认知错误类 → `yanchu-fasu`（言出法随）
- 自主性缺失类 → `autonomous-loop`（自主闭环）
- 反复未果类/头痛医头类/连锁跷跷板类 → `rca-coverage`（根因分析）
- 交付质量类 → `code-coverage`（代码覆盖）
- 全局未对齐类 → `independent-qa`（独立QA）

**预估工作量**：2小时

### P1-1：统一三套采集机制的数据出口

**目标**：所有采集路径写入同一个评测集

1. correction-harvester的产出从 `pending-cases.json` 改为写入 `tests/benchmarks/intent/c2-golden/` 目录
2. 或者建立pending → formal的自动审核转化流程（pending超过24小时无人review则自动转正）
3. 统一字段schema，所有路径产出都符合V4标准

**预估工作量**：2小时

### P1-2：completion-handler入库内容去模板化

**目标**：入库的badcase有实际诊断价值

1. 从子任务的实际执行日志中提取真实的wrong_chain和correct_chain
2. 用LLM对summary做语义分析，生成有意义的root_cause而非固定模板
3. 自动关联到具体的session/commit/文件变更

**预估工作量**：3小时

### P2-1：提升correction-harvester的检测率

**目标**：让定时扫描能实际抓到纠偏信号

1. 当前正则只扫memory/目录的markdown文件，但实际纠偏发生在飞书对话中，memory文件里未必有原始用户措辞
2. 考虑接入对话历史（sessions_history）而非只扫文件
3. 或者在对话流中直接emit `user.feedback.correction` 事件，让事件驱动链路（P0-1修复后）来处理

**预估工作量**：4小时

---

## 六、总结

根本原因是**"规则-代码-运行时"三层脱节**：

1. **规则层**（AGENTS.md + ISC rule）写了8类自动采集场景，但事件类型名写错了
2. **代码层**（harvest-engine.js + harvest.sh）实现了入库逻辑，但没有V4字段
3. **运行时层**（event-bus + dispatcher）没有配置路由，handler从未被调用

加上三套采集机制各自为政、产出格式不统一，导致即使有少量badcase被completion-handler触发入库，内容也是模板化的、不符合V4标准的、评测runner无法使用的。

**最小可行修复**：先做P0-1（修事件名+加路由，1小时）+ P0-2（补V4字段，2小时），即可打通"检测→入库→可评测"的最短路径。
