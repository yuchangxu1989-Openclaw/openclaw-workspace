# Day 3 详细设计方案

**制定时间**: 2026-03-05  
**更新时间**: 2026-03-05（债务结算子代理补充）  
**架构师**: 战略家（基于Day 1-2暴露所有问题的系统性输出）  
**方法论**: 反熵增 — 不是打补丁，是关闭每一个开环

---

## 债务结算前置更新

在执行Day3前，以下债务已被**直接修复**（减少Day3工作量）：

| 债务 | 修复内容 |
|------|---------|
| **D08+** | isc-rule-matcher.js修复trigger.events格式问题（dict→flat array），消灭71个rule-match错误 |
| **D10** | L3_PIPELINE_ENABLED: false → **true**（立即生效） |
| **D11** | skills/shared/SKILL.md已创建，**全部技能现在有SKILL.md** |
| **D15** | cron-healer模式库 2→**8个**（script-not-found, timeout, permission, syntax, api-key, network） |
| **D06** | l3-pipeline-cron.js和runner.js增加ISC advisory检查 |

详见: `reports/design-debt-settlement-report.md`

---

## TL;DR

Day 2 完成了骨架（执行引擎、事件驱动、Pipeline主路、自愈PoC），但留下了 **4个致命开环**：

1. **意图识别LLM路径延迟26s均值，无法生产可用** — 路由器仍用regex，LLM只是benchmark工具
2. **AEO评测体系形同虚设** — 无黄金评测集、无自动化评测、Badcase无根因归因
3. **ISC规则enforcement仅脚本层** — gate脚本存在但未嵌入任何执行路径（无hook、无中间件）
4. **D2-02/D2-04状态不明** — 无报告，守护进程/Gateway未生产部署

Day 3 的使命：**把Day 2造出来的零件装入真正跑起来的机器，并建立质量的客观尺。**

---

## 第一部分：Day 2 完成状态盘点

### D2-01 ISC运行时Enforcement引擎

| 指标 | 状态 | 细节 |
|------|------|------|
| 脚本存在 | ✅ | `infrastructure/enforcement/` 下4个gate脚本 |
| 单元测试 | ✅ | 6/6通过 |
| 生产规则enforcement率 | ✅ | P0:100%(24/24), P1:100%(45/45) via enforcement-closure |
| **真正嵌入执行路径** | ❌ **阻塞** | enforce.js仅CLI调用，未嵌入pre-commit hook |
| P0规则有gate代码 | ⚠️ | enforcement-closure修复了JSON触发字段，但gate代码实现仅3个 |

**结论**: JSON规则层100%修复，但**运行时代码拦截**仅3条。hook未安装。**Day 3必须完成hook集成**。

---

### D2-02 真实数据场景Benchmark

| 指标 | 状态 |
|------|------|
| 报告文件 | ❌ **缺失** — reports/无d2-02-*文件 |
| 真实数据来源 | **不明** — 无法确认 |

**结论**: **D2-02未交付**。Day 3开始前需补交或明确降级为Day 3任务D3-02的前置输入。

---

### D2-03 事件驱动自愈PoC

| 指标 | 状态 |
|------|------|
| 核心脚本 | ✅ — cron-healer.js跑通2个真实故障 |
| 模式库数量 | ⚠️ **仅2个** — 覆盖率~9% |
| 注册为cron任务 | ❌ — 未实际部署 |
| EventBus连通 | ❌ — 仍为手动脚本，未订阅错误事件 |

**结论**: PoC成立，但离**自动自愈**还差事件订阅和模式扩展两步。

---

### D2-04 版本号语义化

| 指标 | 状态 |
|------|------|
| 报告文件 | ❌ **缺失** |

**结论**: **D2-04状态不明**，降级为Day 4处理（不阻塞Day 3核心路径）。

---

### D2-05 Pipeline E2E独立可运行

✅ **已完成** — 38/38，任意目录可运行，cron入口修复。

---

### D2-06 任务自动流转

| 指标 | 状态 |
|------|------|
| Scope生成引擎 | ✅ — 12ms完成，EventBus handler已注册 |
| **Day N+1真正spawn执行** | ❌ **设计边界** | 生成scope，但不自动spawn子Agent。这是有意为之的安全边界（需人工确认才触发Day N+1） |

**结论**: 流转骨架完整，**自动spawn不在Day 3范围**（属于Day 4决策）。

---

### D2-07 Cron→事件驱动迁移

| 指标 | 状态 |
|------|------|
| 代码实现 | ✅ — 15/15测试通过 |
| **守护进程生产部署** | ❌ — 未注册为系统服务 |
| **Cron命令实际切换** | ❌ — 报告中Phase 2未完成，cron仍跑旧命令 |

**结论**: 代码就位，**实际部署是Day 3遗留项**。

---

### D2-08 L3 Pipeline主路

| 指标 | 状态 |
|------|------|
| Gateway代码 | ✅ — 39/39测试通过 |
| **生产install()** | ❌ — Gateway需在启动时调用，当前仅测试环境 |
| **LLM延迟** | ❌ **根本阻塞** — 均值26,784ms，P99估计>60s，生产不可用 |

**结论**: 架构正确，**LLM延迟是Day 3头号阻塞**。

---

### 意图识别专项（来自d2-intent-analysis.md + day2-intent-llm-benchmark.md）

| 指标 | Day 1 Regex | Day 2 LLM | 目标 |
|------|------------|----------|------|
| 整体准确率 | 23.8% | 83.8% | ≥88% |
| Hard样本准确率 | — | 37.5% | ≥65% |
| IC5复合意图 | 0% | 90.9% | ≥80% |
| IC4隐式意图 | 0% | 88.2% | ≥75% |
| LLM平均延迟 | <1ms | **26,784ms** | <500ms |
| Router与Registry整合 | 脱节 | 仍脱节 | 同一数据源驱动 |

**核心矛盾**: LLM准确率达标（83.8%）但延迟灾难性。Regex延迟完美但准确率只有23.8%。**Day 3必须融合**。

---

## 第二部分：Day 3 范围与优先级

### P0 — Day 3关门条件（全部完成才可closure）

| ID | 任务 | 驱动问题 |
|----|------|---------|
| D3-01 | **意图识别复合方案** — Regex快路+LLM兜底，延迟<500ms，准确率>88% | LLM 26s不可用 |
| D3-02 | **AEO黄金评测集 v1.0** — 50条真实标注样本 | 无客观质量尺 |
| D3-03 | **AEO自动化评测流水线** — 代码变更自动触发+Feishu报告 | 质量看不见 |
| D3-04 | **ISC运行时enforcement真正闭环** — pre-commit hook安装+pipeline中间件 | enforcement=0% |
| D3-05 | **Day 2遗留部署项补齐** — 守护进程生产部署、Gateway生产安装 | 代码就绪未部署 |

### P1 — 应该完成

| ID | 任务 |
|----|------|
| D3-06 | **Badcase根因分析框架** — miss case自动聚类，生成根因报告 |
| D3-07 | **自愈模式库扩展至≥8个+EventBus集成** |
| D3-08 | **端到端验收方案** — 一键跑全系统验收 |

### P2 — Day 4延后

| ID | 任务 | 说明 |
|----|------|------|
| D4-01 | Router-Registry统一数据源 | 技术债务，不阻塞功能 |
| D4-02 | D2-04版本号语义化补交 | 低优先级 |
| D4-03 | 13个技能补SKILL.md | 批量处理 |

---

## 第三部分：D3-01 意图识别复合方案

> **核心设计哲学**: Regex是第一道筛子（快、准、便宜），LLM是最后一道裁判（慢、强、贵）。中间加置信度路由，让高置信度案例不走LLM。

### 3.1 问题根因

```
两套系统并存，各自不完整：

Router（user-message-router.js）:
  ├── 11条hardcoded regex，first-match策略
  ├── IC5复合意图: 0条regex → 全走IC0 fallback（恰好是对的handler）
  ├── IC4隐式意图: 0条regex → 同上
  └── 与intent-registry.json完全脱节（两个独立系统）

IntentScanner（intent-scanner.js）:
  ├── LLM路径: GLM-5 API，26s均值，最高93s ← 不可生产
  ├── Regex降级: 仅覆盖IC1/IC2
  └── 未参与实际路由（只做CRAS感知，不影响Dispatcher）

根本矛盾: 唯一准确的（LLM）太慢，唯一快的（Regex）太不准
解法: 混合路由 + 超时降级 + 置信度门槛
```

### 3.2 三层混合识别架构

```
用户消息
    │
    ▼
┌───────────────────────────────────────────────┐
│  感知层 L1: 超快预筛（<5ms）                    │
│  ┌─ 长度检测: <3字 → IC1/IC4候选或IC0          │
│  ├─ 噪声检测: 纯符号/数字/空 → IC0直通          │
│  └─ 强信号关键词: 粗扫（不做正则，只做in判断）   │
│                                               │
│  输出: { hasStrongSignal: bool, hint: string? }│
└───────────────────┬───────────────────────────┘
                    │
          ┌─────────┴──────────┐
          │ hasStrongSignal?   │
          YES                  NO
          │                    │
          ▼                    ▼
┌─────────────────┐   ┌────────────────────────┐
│ 感知层 L2:       │   │ 认知层: LLM兜底          │
│ 结构化Regex引擎  │   │ GLM-5, timeout=500ms   │
│ (<2ms)          │   │                        │
│ IC1~IC5全覆盖   │   │ 超时 → 用L1 hint降级    │
│ 多意图并行匹配   │   │ 低置信(<0.7) → IC0     │
│ 返回列表+分数    │   │                        │
└────────┬────────┘   └───────────┬────────────┘
         │                        │
         ├────────────────────────┘
         │ 意图决策结果
         ▼
┌─────────────────────────────────────────────┐
│ 执行层: Dispatcher v2                        │
│  单意图 → 直接路由到handler                   │
│  多意图 → 按优先级选主意图                    │
│  IC0 → fallback handler (cras-knowledge)    │
│  写入decision-log + 发送intent.classified事件 │
└─────────────────────────────────────────────┘
```

### 3.3 各层分工明细

| 层次 | 实现模块 | 职责 | 延迟目标 |
|------|---------|------|---------|
| **感知层 L1** | 新增`preselector.js` | 超快预筛，<5ms内判断是否有强信号 | <5ms |
| **感知层 L2** | 扩展`user-message-router.js` | 结构化regex引擎，扩展至IC5覆盖，多意图并行 | <2ms |
| **认知层** | 新增`llm-fallback.js` | GLM-5调用+超时+置信度门槛 | <500ms（P95） |
| **执行层** | `Dispatcher v2`（已有） | 意图→handler路由，写decision-log | <10ms |

### 3.4 Regex规则扩展方案（新增至少7条）

```javascript
// user-message-router.js → INTENT_PATTERNS 追加
// 重要: IC5规则必须排在IC1之前，否则first-match会先命中情绪词

const NEW_PATTERNS = [
  // === IC5: 复合意图（优先级最高，放首位）===
  {
    pattern: /太慢.*重新|方向.*不对|进度.*停|先停.*重新|停下来.*重新|做的不对.*方向|节奏.*不对/i,
    category: 'IC5', name: 'feedback_redirect', confidence: 0.80
  },
  {
    pattern: /没问题.*再加|不错.*顺便|行.*另外|可以.*加个|就这样.*对了/i,
    category: 'IC5', name: 'approval_extend', confidence: 0.75
  },
  {
    pattern: /整体.*OK.*但|整体.*对.*细节|架构.*没问题.*实现|思路.*对.*具体.*改/i,
    category: 'IC5', name: 'approval_redesign', confidence: 0.80
  },

  // === IC4: 隐式意图（confidence设低，fallback到LLM验证）===
  {
    pattern: /换个方向|换个思路|换种方式|先不做这个|暂时搁置|先不管这个/i,
    category: 'IC4', name: 'implicit_direction_change', confidence: 0.65
  },
  {
    pattern: /不是很满意|不太对|有点问题|感觉不太好|差点意思/i,
    category: 'IC4', name: 'implicit_dissatisfaction', confidence: 0.70
  },

  // === IC3: 问题分析（扩展现有覆盖率）===
  // 现有: /效率|出了问题|哪里.*问题/i
  // 补充: "有问题"（更常见）、"问题在"
  {
    pattern: /有问题|问题在|出了什么|什么问题/i,
    category: 'IC3', name: 'problem_analysis_ext', confidence: 0.78
  },

  // === IC1: 情绪（补充更多口语表达）===
  // 现有缺失: "太慢了"作为负面反馈未被捕获
  {
    pattern: /太慢了|方向不对|越来越差|越搞越乱/i,
    category: 'IC1', name: 'emotion_negative_ext', confidence: 0.82
  },
];

// 合并策略: NEW_PATTERNS 插入到现有 INTENT_PATTERNS 首部
// 保持 first-match 语义，IC5优先于IC1被命中
```

### 3.5 LLM兜底实现规范

```javascript
// infrastructure/intent-engine/llm-fallback.js

const LLM_TIMEOUT_MS = 500;
const CONFIDENCE_THRESHOLD = 0.70;

/**
 * 调用GLM-5做意图分类（含超时降级）
 * @param {string} message - 用户消息
 * @param {string|null} hint - L1预筛的类别提示（减少LLM推理量）
 * @returns {Promise<{category, confidence, source, intents}>}
 */
async function classifyWithLLM(message, hint) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  
  const prompt = buildPrompt(message, hint); // hint注入减少token消耗
  
  try {
    const result = await callGLM5({ prompt, signal: controller.signal });
    clearTimeout(timer);
    
    if (result.confidence < CONFIDENCE_THRESHOLD) {
      return { category: 'IC0', confidence: result.confidence,
               source: 'llm_low_confidence', intents: [] };
    }
    return { ...result, source: 'llm' };
    
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      // 超时降级: hint → 低置信返回；无hint → IC0
      return hint 
        ? { category: hint, confidence: 0.50, source: 'llm_timeout_hint', intents: [] }
        : { category: 'IC0', confidence: 0.0, source: 'llm_timeout', intents: [] };
    }
    // API错误 → IC0
    return { category: 'IC0', confidence: 0.0, source: 'llm_error', intents: [] };
  }
}

// Prompt设计原则:
// 1. 消息 + hint → 减少LLM歧义推理量（hint告诉LLM"偏向哪个方向"）
// 2. 要求输出结构化JSON（category, confidence, intents列表）
// 3. System prompt描述IC1-IC5定义，引用intent-registry.json（缓存）
// 4. 最大token控制（输出<100 tokens），减少延迟
```

**关键优化：Prompt Token最小化**
- 用简洁System Prompt（<200 tokens）描述5类意图
- 要求输出只包含 `{"c":"IC3","conf":0.85}` 格式
- 不要求LLM解释推理过程（去掉chain-of-thought节省60%延迟）
- 估算优化后延迟: <2s（当前26s→优化目标<2s，500ms超时后降级）

### 3.6 置信度路由逻辑

```
Regex返回结果后:
  confidence ≥ 0.85 → 直接路由，不调LLM（约覆盖70%常规case）
  confidence 0.65~0.85 → 调LLM验证（中等置信，需二次确认）
  confidence < 0.65 → 直接调LLM（弱信号，Regex不可信）
  category = IC0 → 直接调LLM

LLM超时后:
  有Regex hint → 用Regex结果（confidence降至0.5，标注"unverified"）
  无Regex hint → IC0 fallback
```

### 3.7 验收标准（D3-01）

- ✅ Regex路径延迟 < 5ms（P99）
- ✅ 端到端延迟（含LLM超时降级逻辑）< 500ms（P95）
- ✅ 14条真实数据集整体准确率 ≥ 88%
- ✅ IC5复合意图准确率 ≥ 80%（新增3条regex）
- ✅ LLM超时率在500ms阈值下 < 10%（每次benchmark记录）
- ✅ IC0/unknown fallback准确率 ≥ 90%（fallback handler碰巧正确不算，需真正IC0才路由fallback）

---

## 第四部分：D3-02 AEO黄金评测集 v1.0

> **设计哲学**: 评测集是系统质量的唯一客观尺。50条真实标注样本 > 10,000条合成数据。

### 4.1 数据来源规范

| 来源类型 | code | 说明 | 目标占比 |
|---------|------|------|---------|
| 真实会话历史 | `real_session` | 从Feishu/session历史提取的真实用户消息 | ≥60% (30条) |
| 对抗样本 | `adversarial` | 人工设计的边界/误判/对抗case | ≥20% (10条) |
| 回归样本 | `regression` | 历史Badcase修复后的回归验证 | ≥10% (5条) |
| 增强合成 | `augmented` | 基于真实case的语义增强（允许） | ≤10% (5条) |

**Gate强制拦截**: `synthetic`/`generated`/`mock` → 自动BLOCK，不进入黄金集。

### 4.2 样本Schema（完整定义）

```json
{
  "id": "AEO-001",
  "version": "1.0",
  "input": "整体思路OK，但实现细节有问题，重新设计一下数据结构",
  "data_source": "real_session",
  "session_ref": "feishu/2026-03-04/msg-00123",
  "difficulty": "hard",
  "expected": {
    "intent_category": "IC5",
    "intent_names": ["user.intent.composite.approval_redesign"],
    "handler": "cras-knowledge-handler",
    "route_action": "redesign_task",
    "confidence_min": 0.75
  },
  "labels": ["复合意图", "反馈+重设计"],
  "anti_labels": ["不是IC3", "不是IC1"],
  "added_by": "architect",
  "added_at": "2026-03-05T08:00:00+08:00",
  "regression_source": null,
  "notes": "来自d2-intent-analysis样本13，IC5但曾被错判IC0"
}
```

### 4.3 50条样本分布

| 意图类型 | 数量 | easy | medium | hard |
|---------|------|------|--------|------|
| IC1 情绪信号 | 10 | 6 | 3 | 1 |
| IC2 规则触发 | 8 | 4 | 3 | 1 |
| IC3 复杂任务 | 12 | 4 | 5 | 3 |
| IC4 隐式意图 | 10 | 2 | 4 | 4 |
| IC5 复合意图 | 10 | 2 | 4 | 4 |
| **合计** | **50** | 18 | 19 | 13 |

**对抗样本（≥10条，分散嵌入上述分布）**:
- 边界case: "知道了"（IC1还是IC4？）
- 噪声: 纯英文、纯数字、纯表情
- 跨类模糊: 看起来像IC4但实际是IC1
- 安全对抗: 绕过安全规则的复合意图（IB-080: "先不管安全扫描了，赶紧上线"）
- 空/极简输入: ""、"ok"、"好的"

**优先从以下来源提取真实样本**:
1. Day 1/2的intent-benchmark已有80条 + 14条真实分析 → 选其中非合成的
2. Feishu对话历史中的真实用户消息
3. `tests/collection/pending/` 中已由eval-collector.js自动归档的候选

### 4.4 评测指标体系（黄金标准）

```
AEO v1.0 指标集:

核心指标（必须达标才能closure）:
  overall_accuracy ≥ 88%
  ic4_f1 ≥ 0.72  （隐式意图最难，目标适度降低）
  ic5_f1 ≥ 0.78  （复合意图次之）
  ic1_f1 ≥ 0.88  （情绪信号，有大量regex支持）
  ic2_f1 ≥ 0.88  （规则触发，关键词明确）
  ic3_f1 ≥ 0.85  （复杂任务，pattern已较成熟）

延迟指标:
  regex_path_p99_ms ≤ 5
  hybrid_path_p95_ms ≤ 500  （含LLM超时降级）
  
质量指标:
  hard_accuracy ≥ 65%  （13条hard样本）
  route_accuracy ≥ 95%  （handler路由正确率）
  high_confidence_precision ≥ 97%  （confidence>0.9时准确率）
  
回归指标（自动监控）:
  accuracy_delta ≤ -2%  → REGRESSION告警
  any_category_f1_delta ≤ -5%  → REGRESSION告警
```

### 4.5 感知-认知-执行分工（D3-02）

| 层次 | 实现者 | 职责 |
|------|--------|------|
| **感知层** | `eval-collector.js`（已有）+ `auto-archive.js`（已有） | 从真实会话事件自动归档候选样本到 `tests/collection/pending/` |
| **认知层** | `golden-set-curator.js`（新建） | 从pending池中批量review → 标注expected → 质量评分 → 写入 `tests/golden-set/` |
| **执行层** | `aeo-runner.js`（新建） | 加载黄金集，运行意图识别，计算指标，输出报告 |

---

## 第五部分：D3-03 AEO自动化评测流水线

> **设计目标**: 意图识别相关代码每次变更 → 自动触发AEO评测 → Feishu报告 → 防regression。

### 5.1 触发机制设计

```
触发链路（事件驱动）:

git-change-watcher 检测到变更
  └─ 变更文件匹配: user-message-router.js | intent-*.js | llm-fallback.js
        └─ emit('file.changed.code', { files: [...], category: 'code' })
              └─ AEO Dispatcher Handler监听
                    └─ 触发 aeo-pipeline.run({ trigger: 'code_change' })

cron兜底（每天09:00）:
  └─ node scripts/aeo-daily-check.js
        └─ aeo-pipeline.run({ trigger: 'cron_daily' })
```

### 5.2 Pipeline实现结构

```javascript
// infrastructure/aeo/aeo-pipeline.js

class AEOPipeline {
  /**
   * 完整评测流水线
   * @returns { status: 'OK'|'REGRESSION'|'ERROR', metrics, diff }
   */
  async run(options = {}) {
    const { trigger = 'manual', dryRun = false } = options;
    
    // Step 1: 加载黄金评测集
    const samples = this.loadGoldenSet();  // tests/golden-set/*.json
    if (samples.length === 0) {
      return { status: 'ERROR', reason: 'golden_set_empty' };
    }
    
    // Step 2: 批量评测（10并发，避免LLM API过载）
    const results = await this.evaluateBatch(samples, { concurrency: 10 });
    
    // Step 3: 计算指标
    const metrics = this.computeMetrics(results);
    
    // Step 4: 与基线对比
    const baseline = this.loadBaseline();  // aeo-baseline.json
    const diff = this.compareBaseline(metrics, baseline);
    
    // Step 5: 写报告
    const reportPath = `reports/aeo-${Date.now()}.md`;
    await this.writeReport(reportPath, { metrics, diff, trigger, samples, results });
    
    // Step 6: Feishu通知
    if (!dryRun) {
      await this.notifyFeishu(metrics, diff, { trigger, reportPath });
    }
    
    // Step 7: 回归处理
    if (diff.hasRegression) {
      await this.createRegressionIssue(diff);
      return { status: 'REGRESSION', metrics, diff };
    }

    // Step 8: 更新基线
    this.updateBaseline(metrics);  // 仅在无回归时更新
    return { status: 'OK', metrics, diff };
  }

  /**
   * 单条样本评测
   */
  async evaluateSample(sample) {
    const startMs = Date.now();
    let result;
    try {
      result = await intentRouter.classify(sample.input);
    } catch (err) {
      result = { category: 'IC0', error: err.message };
    }
    return {
      id: sample.id,
      expected: sample.expected,
      predicted: result,
      latency_ms: Date.now() - startMs,
      correct: result.category === sample.expected.intent_category,
      route_correct: result.handler === sample.expected.handler
    };
  }
}
```

### 5.3 Feishu报告卡片格式

```
AEO评测报告 [触发: code_change / cron_daily]
时间: 2026-03-05 09:30

整体准确率: 89.2% ▲ +1.4pp vs 基线
IC1 F1: 0.92 ✅  IC2 F1: 0.90 ✅
IC3 F1: 0.87 ✅  IC4 F1: 0.74 ✅
IC5 F1: 0.82 ✅

Hard样本准确率: 67.7% ✅
延迟P95: 423ms ✅

Badcase数量: 6条 → [查看详情]
状态: ✅ 无回归 / ❌ 发现回归: IC4 F1 下降 8pp
```

### 5.4 感知-认知-执行分工（D3-03）

| 层次 | 实现者 | 职责 |
|------|--------|------|
| **感知层** | `git-change-watcher.js`（已有）+ cron scheduler | 检测代码变更事件和定时触发 |
| **认知层** | `aeo-pipeline.js`（新建） | 评测逻辑、指标计算、回归判断 |
| **执行层** | Feishu通知 + 报告写入 + 回归issue创建 | 结果分发和持久化 |

---

## 第六部分：D3-04 ISC运行时Enforcement真正闭环

> **问题**: D2-01交付的是3个gate脚本+JSON规则修复，但没有任何地方**自动调用**这些脚本。enforcement=0%（人工主动调用除外）。

### 6.1 当前状态 vs 目标状态

```
当前状态:
  enforce.js  ← 只有人手动 node enforce.js skill-publish path/ 时才执行
  gate-*.js   ← 从未被自动调用
  ISC规则JSON  ← 100% trigger字段填写，但无代码运行

目标状态:
  pre-commit hook → 自动调用 enforce.js（代码提交时）
  L3 Pipeline middleware → 自动调用 enforce.js（消息处理前）
  Cron audit → 每小时扫描enforcement合规（兜底）
```

### 6.2 Pre-commit Hook安装方案

```bash
#!/bin/bash
# .git/hooks/pre-commit — 安装脚本: isc-core/enforcement/hooks/install-hooks.sh

WORKSPACE="/root/.openclaw/workspace"
ENFORCE="$WORKSPACE/infrastructure/enforcement/enforce.js"

# 检测变更文件类型
CHANGED_SKILLS=$(git diff --cached --name-only | grep "^skills/" | grep -v "SKILL.md$" | head -5)
CHANGED_BENCHMARKS=$(git diff --cached --name-only | grep -E "benchmark.*\.json$" | head -3)
CHANGED_REPORTS=$(git diff --cached --name-only | grep "^reports/.*\.md$" | head -3)

# Gate 1: SKILL.md检查（有skills/变更时触发）
if [ -n "$CHANGED_SKILLS" ]; then
  for skill_dir in $(echo "$CHANGED_SKILLS" | xargs -I{} dirname {} | sort -u | head -3); do
    node "$ENFORCE" skill-publish "$WORKSPACE/$skill_dir" || exit 1
  done
fi

# Gate 2: Benchmark数据源检查
if [ -n "$CHANGED_BENCHMARKS" ]; then
  for bench_file in $CHANGED_BENCHMARKS; do
    node "$ENFORCE" benchmark-submit "$WORKSPACE/$bench_file" || exit 1
  done
fi

# Gate 3: 报告完整性检查
if [ -n "$CHANGED_REPORTS" ]; then
  for report_file in $CHANGED_REPORTS; do
    node "$ENFORCE" report-generate "$WORKSPACE/$report_file" || exit 1
  done
fi

echo "[ISC Gate] All checks passed"
exit 0
```

### 6.3 Pipeline运行时中间件

```javascript
// infrastructure/pipeline/isc-middleware.js
// 在L3 Gateway处理每个事件前调用

const { execSync } = require('child_process');
const ENFORCE = '/root/.openclaw/workspace/infrastructure/enforcement/enforce.js';

/**
 * ISC运行时中间件
 * 在事件处理前检查关键合规点
 */
function iscMiddleware(event, next) {
  // 仅对特定事件类型做gate检查（不影响高频事件性能）
  const gateableEvents = ['skill.publish', 'benchmark.submit', 'day.closure'];
  
  if (!gateableEvents.includes(event.type)) {
    return next(event);  // 透传，不检查
  }
  
  try {
    // 根据事件类型选择gate
    const gateMap = {
      'skill.publish': `skill-publish ${event.payload.skillPath}`,
      'benchmark.submit': `benchmark-submit ${event.payload.benchmarkFile}`,
      'day.closure': `report-generate ${event.payload.reportFile}`
    };
    
    execSync(`node ${ENFORCE} ${gateMap[event.type]}`, { stdio: 'pipe' });
    return next(event);  // Gate通过，继续执行
    
  } catch (err) {
    // Gate阻塞 — 写入enforcement-log，不继续执行
    const reason = err.stderr?.toString() || err.message;
    event.bus.emit('isc.gate.blocked', { 
      event_type: event.type, 
      reason,
      timestamp: new Date().toISOString()
    });
    return { blocked: true, reason };
  }
}

module.exports = { iscMiddleware };
```

### 6.4 Cron兜底审计

```javascript
// 注册到cron: 每小时执行一次
// scripts/isc-compliance-audit.js

// 扫描过去1小时内的git commits
// 检查每个commit是否有对应的enforcement-log记录
// 发现"无gate记录的变更" → 发送合规告警

// 输出到reports/isc-audit-YYYY-MM-DD.md
```

### 6.5 感知-认知-执行分工（D3-04）

| 层次 | 实现者 | 职责 |
|------|--------|------|
| **感知层** | pre-commit hook + `iscMiddleware` | 检测代码提交和关键事件，判断是否需要gate检查 |
| **认知层** | `enforce.js` + gate脚本（skill-md, benchmark-data, report-validation） | 执行具体合规检查，返回pass/block |
| **执行层** | Git（拦截commit）/ EventBus（阻塞事件传播）/ Feishu告警 | 根据gate结果阻塞或放行，记录audit日志 |

### 6.6 验收标准（D3-04）

- ✅ pre-commit hook安装并激活（`git config core.hooksPath`验证）
- ✅ 故意提交无SKILL.md的skills/ → commit被自动拦截
- ✅ 故意提交合成数据benchmark → commit被自动拦截
- ✅ L3 Pipeline处理`skill.publish`事件 → middleware自动调用gate
- ✅ enforcement-log.jsonl每次gate执行后有新记录

---

## 第七部分：D3-05 Day 2遗留部署项补齐

### 7.1 守护进程生产部署（D2-07遗留）

```bash
# 步骤1: 注册为系统服务（或cron @reboot）
# 方案A: cron @reboot（简单）
echo "@reboot cd /root/.openclaw/workspace && node infrastructure/event-driven/event-watcher-daemon.js >> /var/log/oc-event-watcher.log 2>&1" | crontab -l | cat - | crontab -

# 方案B: systemd服务（推荐）
# 写入 /etc/systemd/system/oc-event-watcher.service

# 步骤2: 切换4个cron任务命令到适配器
# 在openclaw cron配置中更新4条任务的command字段

# 步骤3: 验证
node infrastructure/event-driven/event-watcher-daemon.js --status
# 预期: { running: true, watchers: 4, uptime: '...' }
```

**感知层**: cron scheduler → **认知层**: event-watcher-daemon → **执行层**: 4个watcher + Dispatcher

### 7.2 L3 Gateway生产安装（D2-08遗留）

```javascript
// 在系统启动入口（或主cron脚本开始时）添加:
const gateway = require('./infrastructure/pipeline/l3-gateway');

// 安装Gateway（单次，幂等）
if (!gateway.isInstalled()) {
  const { uninstall, stats } = gateway.install();
  console.log('[L3 Gateway] Installed, intercepting user.message events');
}

// 每小时输出一次统计
setInterval(() => {
  const s = gateway.stats();
  console.log(`[L3 Gateway] intercepted=${s.intercepted} l3_ok=${s.l3_success} fallback=${s.l3_fallback}`);
}, 3600000);
```

**关键**: Gateway的install()是幂等的，可以在任何脚本开头调用，不会重复安装。

---

## 第八部分：D3-06 Badcase根因分析框架

> **设计目标**: 不是人工翻每个badcase，而是**自动聚类miss case → 机器生成根因假设 → 人确认**。

### 8.1 根因分类体系

```
Badcase根因树（可扩展）:

ROOT
├── R01: 意图覆盖缺失 (coverage_gap)
│   ├── R01.1: Regex无pattern（新意图类型）
│   ├── R01.2: Registry有定义但Router未实现
│   └── R01.3: LLM训练数据无此类意图
│
├── R02: 置信度校准问题 (calibration_error)
│   ├── R02.1: 低置信度被错误路由（应降级但没降级）
│   └── R02.2: 高置信度但结果错误（过度自信）
│
├── R03: 语义歧义 (semantic_ambiguity)
│   ├── R03.1: 跨类别模糊（多个意图同等可能）
│   └── R03.2: 上下文依赖（没有对话历史无法判断）
│
├── R04: 对抗/边界 (adversarial_boundary)
│   ├── R04.1: 噪声输入（非自然语言）
│   ├── R04.2: 极简输入（"好的"/"知道了"）
│   └── R04.3: 反向意图（"先不管安全扫描，赶紧上线"）
│
└── R05: 系统性偏差 (systematic_bias)
    ├── R05.1: 训练数据分布偏斜（某类意图样本过多）
    └── R05.2: Regex first-match优先级错误（IC5被IC1抢先）
```

### 8.2 自动聚类实现

```javascript
// infrastructure/aeo/badcase-analyzer.js

function analyzeBadcases(failedSamples) {
  const clusters = {};
  
  for (const sample of failedSamples) {
    const root_cause = inferRootCause(sample);
    clusters[root_cause] = clusters[root_cause] || [];
    clusters[root_cause].push(sample);
  }
  
  return generateReport(clusters);
}

function inferRootCause(sample) {
  const { expected, predicted } = sample;
  
  // R04: 对抗/边界
  if (sample.labels?.includes('adversarial')) return 'R04';
  if (sample.input.length < 5) return 'R04.2';
  if (/^[a-zA-Z0-9\s\?\!\.]+$/.test(sample.input) && !/[\u4e00-\u9fff]/.test(sample.input)) 
    return 'R04.1'; // 纯英文/数字
  
  // R01: 覆盖缺失
  if (predicted.category === 'IC0' && expected.intent_category !== 'IC0') {
    // 检查Registry是否有此意图定义
    const inRegistry = intentRegistry.has(expected.intent_names[0]);
    const inRouter = intentRouter.hasPattern(expected.intent_category);
    if (inRegistry && !inRouter) return 'R01.2';
    if (!inRegistry) return 'R01.1';
  }
  
  // R05: 系统性偏差（first-match优先级问题）
  if (expected.intent_category === 'IC5' && predicted.category === 'IC1') return 'R05.2';
  
  // R03: 语义歧义（LLM预测与expected不同类但都"合理"）
  if (predicted.source === 'llm' && predicted.confidence > 0.7) return 'R03.1';
  
  // R02: 置信度问题
  if (predicted.confidence > 0.85 && predicted.category !== expected.intent_category) return 'R02.2';
  
  return 'UNKNOWN';
}
```

### 8.3 感知-认知-执行分工（D3-06）

| 层次 | 实现者 | 职责 |
|------|--------|------|
| **感知层** | AEO Pipeline输出的failed samples | 收集每次评测的错误样本 |
| **认知层** | `badcase-analyzer.js`（新建）| 规则推断+聚类，生成根因假设 |
| **执行层** | 报告写入 + Feishu通知（附根因统计）| 可操作的修复建议输出 |

---

## 第九部分：D3-07 自愈模式库扩展+EventBus集成

> **D2-03遗留**: cron-healer只有2个模式，未注册到cron，未连接EventBus。

### 9.1 扩展模式库（从2个→≥8个）

```javascript
// infrastructure/self-healing/cron-healer.js → KNOWN_PATTERNS 扩展

const KNOWN_PATTERNS = [
  // 已有 (2个)
  { id: 'delivery-target-to-to', ... },
  { id: 'delivery-missing-to', ... },
  
  // 新增 (≥6个)
  {
    id: 'script-not-found',
    description: '脚本文件不存在',
    detect: (job) => job.lastError?.includes('MODULE_NOT_FOUND') || 
                     job.lastError?.includes('Cannot find module') ||
                     job.lastError?.includes('No such file'),
    fix: (job) => {
      // 禁用该job并通知
      job.disabled = true;
      job.disabledReason = 'script-not-found';
      return { action: 'disable', notify: true };
    }
  },
  {
    id: 'timeout-too-short',
    description: '任务超时时间过短（<30s但任务复杂）',
    detect: (job) => job.lastError?.includes('timed out') && 
                     (job.timeoutSeconds || 60) < 60,
    fix: (job) => {
      job.timeoutSeconds = Math.min((job.timeoutSeconds || 60) * 2, 300);
      return { action: 'extend_timeout', newTimeout: job.timeoutSeconds };
    }
  },
  {
    id: 'api-key-expired',
    description: 'API key失效（401/403错误）',
    detect: (job) => job.lastError?.match(/401|403|Unauthorized|Forbidden/),
    fix: (job) => {
      // 无法自动修复，发送告警
      return { action: 'escalate', urgency: 'high', 
               message: `Job ${job.id} requires API key rotation` };
    }
  },
  {
    id: 'out-of-memory',
    description: '内存溢出',
    detect: (job) => job.lastError?.includes('heap out of memory') ||
                     job.lastError?.includes('ENOMEM'),
    fix: (job) => {
      // 降低并发度或延长执行间隔
      if (job.concurrency > 1) {
        job.concurrency = Math.max(1, Math.floor(job.concurrency / 2));
        return { action: 'reduce_concurrency', newConcurrency: job.concurrency };
      }
      return { action: 'escalate', urgency: 'medium' };
    }
  },
  {
    id: 'network-unreachable',
    description: '网络不通（ECONNREFUSED/ETIMEDOUT）',
    detect: (job) => job.lastError?.match(/ECONNREFUSED|ETIMEDOUT|ENOTFOUND/),
    fix: (job) => {
      // 推迟5分钟重试（设置retry backoff）
      job.retryBackoffMs = (job.retryBackoffMs || 60000) * 2;
      return { action: 'retry_with_backoff', backoffMs: job.retryBackoffMs };
    }
  },
  {
    id: 'feishu-rate-limit',
    description: '飞书API限流',
    detect: (job) => job.lastError?.includes('rate limit') || 
                     job.lastError?.includes('429'),
    fix: (job) => {
      // 增加间隔，避免频繁调用
      job.intervalMultiplier = (job.intervalMultiplier || 1) * 1.5;
      return { action: 'throttle', multiplier: job.intervalMultiplier };
    }
  }
];
```

### 9.2 EventBus集成

```javascript
// infrastructure/self-healing/cron-healer.js — 新增事件订阅

function registerToEventBus(bus) {
  // 监听cron错误事件（由cron调度器emit）
  bus.consume('cron.task.error', async (event) => {
    const { jobId, error, consecutiveErrors } = event.payload;
    if (consecutiveErrors >= 3) {
      await healJob(jobId);
    }
  });
  
  // 监听系统健康检查事件
  bus.consume('system.health.check', async () => {
    const errorJobs = getJobsWithErrors(3);
    for (const job of errorJobs) {
      await healJob(job.id);
    }
  });
}

// 注册后，cron-healer真正变成事件驱动
module.exports = { registerToEventBus, healJob, KNOWN_PATTERNS };
```

### 9.3 感知-认知-执行分工（D3-07）

| 层次 | 实现者 | 职责 |
|------|--------|------|
| **感知层** | EventBus `cron.task.error`事件 + cron定时触发 | 检测连续失败信号 |
| **认知层** | `cron-healer.js` + `KNOWN_PATTERNS` | 模式匹配，选择修复策略 |
| **执行层** | 修复jobs.json + 飞书通知 + 写heal日志 | 执行修复动作，验证修复效果 |

---

## 第十部分：D3-08 端到端验收方案

> **设计目标**: 质量仲裁官一键运行全系统验收，产出标准化报告，不依赖开发者解释。

### 10.1 验收范围

```
Day 3 端到端验收清单:

[模块1] 意图识别 (D3-01)
  □ 1.1 Regex路径延迟 < 5ms (P99)
  □ 1.2 14条真实数据集准确率 ≥ 88%
  □ 1.3 IC5复合意图3条regex已生效
  □ 1.4 LLM兜底超时降级正确触发

[模块2] AEO评测集 (D3-02)  
  □ 2.1 黄金集≥50条，数据源100%非synthetic
  □ 2.2 样本schema完整（id/input/expected/data_source）
  □ 2.3 各类别分布符合计划（IC1-IC5均有覆盖）

[模块3] AEO自动化流水线 (D3-03)
  □ 3.1 代码变更 → 自动触发评测（git-change-watcher集成）
  □ 3.2 评测完成 → Feishu卡片报告
  □ 3.3 模拟回归 → REGRESSION状态被检测并告警

[模块4] ISC Enforcement (D3-04)
  □ 4.1 pre-commit hook已安装（git hooks路径验证）
  □ 4.2 故意提交无SKILL.md的技能 → commit被拦截
  □ 4.3 故意提交synthetic benchmark → commit被拦截
  □ 4.4 enforcement-log.jsonl有记录

[模块5] 遗留部署 (D3-05)
  □ 5.1 event-watcher-daemon运行中（--status验证）
  □ 5.2 4个cron任务已切换到adapter命令
  □ 5.3 L3 Gateway已install（stats()显示已激活）

[模块6] 自愈模式库 (D3-07)
  □ 6.1 KNOWN_PATTERNS ≥ 8个
  □ 6.2 EventBus订阅已注册
  □ 6.3 模拟cron.task.error事件 → 自动触发修复
```

### 10.2 一键验收脚本设计

```bash
#!/bin/bash
# scripts/day3-e2e-acceptance.sh
# 质量仲裁官使用: bash day3-e2e-acceptance.sh

set -e
WORKSPACE="/root/.openclaw/workspace"
REPORT="$WORKSPACE/reports/day3-acceptance-$(date +%Y%m%d-%H%M).md"
PASS=0
FAIL=0

check() {
  local desc="$1"
  local cmd="$2"
  if eval "$cmd" > /dev/null 2>&1; then
    echo "✅ $desc"
    PASS=$((PASS+1))
  else
    echo "❌ $desc"
    FAIL=$((FAIL+1))
  fi
}

echo "=== Day 3 E2E Acceptance ==="

# Module 1: 意图识别
check "1.1 Regex延迟<5ms" "node $WORKSPACE/infrastructure/intent-engine/perf-test.js --threshold 5"
check "1.2 真实数据集≥88%" "node $WORKSPACE/infrastructure/intent-engine/quick-eval.js --threshold 0.88"
check "1.3 IC5 regex已生效" "node $WORKSPACE/infrastructure/intent-engine/ic5-smoke.js"

# Module 2: AEO评测集
check "2.1 黄金集≥50条" "[ $(ls $WORKSPACE/tests/golden-set/*.json 2>/dev/null | wc -l) -ge 50 ]"
check "2.2 无synthetic来源" "node $WORKSPACE/infrastructure/enforcement/gate-check-benchmark-data.js $WORKSPACE/tests/golden-set/"

# Module 3: AEO流水线
check "3.1 AEO pipeline可运行" "node $WORKSPACE/infrastructure/aeo/aeo-pipeline.js --dry-run"

# Module 4: ISC Enforcement
check "4.1 pre-commit hook已安装" "[ -f $WORKSPACE/../.git/hooks/pre-commit ] || [ -f /root/.openclaw/.git/hooks/pre-commit ]"
check "4.2 Gate拦截synthetic benchmark" "! node $WORKSPACE/infrastructure/enforcement/gate-check-benchmark-data.js $WORKSPACE/infrastructure/enforcement/test/synthetic-sample.json 2>/dev/null"

# Module 5: 部署
check "5.1 event-watcher运行中" "node $WORKSPACE/infrastructure/event-driven/event-watcher-daemon.js --status 2>/dev/null | grep -q 'running.*true'"
check "5.3 L3 Gateway激活" "node $WORKSPACE/infrastructure/pipeline/l3-gateway.js --status 2>/dev/null | grep -q 'installed.*true'"

# Module 6: 自愈
check "6.1 模式库≥8个" "node -e \"const h=require('$WORKSPACE/infrastructure/self-healing/cron-healer.js'); process.exit(h.KNOWN_PATTERNS.length>=8?0:1)\""

echo ""
echo "结果: $PASS 通过 / $FAIL 失败"
echo "$(date)" > "$REPORT"
echo "Day 3 Acceptance: PASS=$PASS FAIL=$FAIL" >> "$REPORT"

[ $FAIL -eq 0 ] && echo "✅ Day 3 PASS — 可以closure" || echo "❌ Day 3 FAIL — 需修复后重跑"
exit $FAIL
```

### 10.3 验收通过条件

**Day 3 closure条件**（全部满足才可关闭）:

| 条件 | 验收方式 |
|------|---------|
| 意图识别端到端延迟 < 500ms (P95) | 自动化脚本测量 |
| AEO评测整体准确率 ≥ 88% | aeo-pipeline.run()输出 |
| 黄金评测集 ≥ 50条，全部非synthetic | gate-check + wc |
| pre-commit hook拦截过至少1次违规 | enforcement-log.jsonl有记录 |
| L3 Gateway已在生产install | gateway.stats()验证 |
| 自愈模式库 ≥ 8个 | KNOWN_PATTERNS.length检查 |
| E2E验收脚本 0 FAIL | day3-e2e-acceptance.sh |

---

## 第十一部分：执行计划

### Day 3 时间线

| 时段 | 任务 | 并行度 | 负责层 |
|------|------|--------|-------|
| 09:00-10:00 | D3-05遗留部署（守护进程+Gateway install）| 1 | 执行层 |
| 09:00-10:30 | D3-01意图识别复合方案（Regex扩展+LLM兜底）| 并行 | 感知+认知层 |
| 10:00-11:30 | D3-02黄金评测集构建（50条，来源标注）| 1 | 认知层 |
| 11:30-12:00 | D3-04 pre-commit hook安装+测试 | 1 | 执行层 |
| 12:00-13:00 | D3-03 AEO流水线实现+Feishu报告 | 1 | 执行+认知层 |
| 13:00-14:00 | D3-06 Badcase根因分析框架 | 1 | 认知层 |
| 14:00-14:30 | D3-07 自愈模式库扩展+EventBus集成 | 1 | 感知+执行层 |
| 14:30-15:30 | D3-08 端到端验收（质量仲裁官独立执行）| 1 | 质量仲裁官 |
| 15:30-16:00 | 凌霄阁裁决 | 1 | 全局 |

### 并行化建议

```
可并行执行:
  D3-01（意图识别）|| D3-02（评测集构建）  ← 互不依赖，先跑
  D3-04（hook）|| D3-07（自愈扩展）        ← 互不依赖，穿插进行

必须串行:
  D3-
02 → D3-03 → D3-08  （评测集就绪才能跑流水线，流水线就绪才能做E2E验收）
  D3-01 → D3-08      （意图识别就绪才能做完整验收）
```

---

## 第十二部分：风险与兜底

### 主要风险

| 风险 | 概率 | 影响 | 兜底方案 |
|------|------|------|---------|
| GLM-5 API不稳定，LLM兜底超时率>30% | 中 | 高 | Regex路径兜底到IC0 fallback，准确率退回72%（可接受） |
| 黄金评测集真实样本不足50条 | 中 | 中 | 降低至30条，但需在Day 4补齐；对抗样本可补充到20% |
| pre-commit hook在CI/CD中不触发 | 低 | 中 | Cron hourly audit作为兜底，发现漏网提交后告警 |
| D3-08 E2E验收脚本依赖链太深 | 低 | 低 | 分模块验收，不强制一键通过，按模块报告结果 |

### 降级方案

**如果 Day 3 无法完成所有P0项**，按以下优先级降级：

```
必须完成（不可降级）:
  D3-01: 意图识别复合方案 — LLM 26s不可用，系统实际无效
  D3-04: ISC hook安装 — 这是所有gate的入口

可延至Day 4:
  D3-02/D3-03: 黄金集可从30条开始，流水线可只有cron触发（无事件触发）
  D3-06: Badcase分析是增值，不是阻断
  D3-07: 自愈模式库可从5个开始
```

---

## 第十三部分：全局感知-认知-执行架构总览

### Day 3 完成后的三层架构

```
┌─────────────────────────────────────────────────────────────┐
│                     感知层 (Perception)                      │
│                                                             │
│  L1 Preselector        超快预筛，<5ms判断消息信号强度          │
│  L2 RegexEngine        11+7条pattern，IC1-IC5全覆盖           │
│  git-change-watcher    代码变更检测 → 触发AEO评测             │
│  event-watcher-daemon  4个fs.watch监听ISC/DTO/EventBus/Git   │
│  eval-collector.js     真实消息自动采集到样本池                │
│  cron.task.error事件   感知cron连续失败                       │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                     认知层 (Cognition)                       │
│                                                             │
│  llm-fallback.js       GLM-5意图分类，500ms超时降级           │
│  golden-set-curator.js 评测集标注、质量评分、维护              │
│  aeo-pipeline.js       指标计算、回归检测、基线对比            │
│  badcase-analyzer.js   miss case聚类、根因推断                │
│  cron-healer.js        8+个模式库，故障诊断与修复策略          │
│  enforce.js / gates    ISC合规检查，gate-check执行            │
│  day-transition.js     Day完成检测、scope生成                │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                     执行层 (Execution)                       │
│                                                             │
│  Dispatcher v2         意图 → handler路由                    │
│  L3 Gateway            user.message事件拦截，L3全流程执行     │
│  pre-commit hook       拦截违规提交                          │
│  iscMiddleware         Pipeline中间件，拦截违规事件           │
│  Feishu通知            AEO报告、告警、回归通知                │
│  jobs.json修改         自愈执行，修复cron配置                 │
│  enforcement-log.jsonl 执法审计，所有gate结果持久化           │
└─────────────────────────────────────────────────────────────┘
```

---

## 附录：Day 2 未完成项汇总表

| 项目 | 状态 | Day 3处理方式 | 负责人 |
|------|------|-------------|--------|
| D2-01 hook安装 | ❌未部署 | D3-04完成 | 开发工程师 |
| D2-02 真实benchmark | ❌无报告 | 纳入D3-02黄金集构建 | 洞察分析师 |
| D2-03 cron-healer注册 | ❌未部署 | D3-07完成 | 开发工程师 |
| D2-04 版本语义化 | ❌无报告 | 降级Day 4 | — |
| D2-07 守护进程部署 | ❌未部署 | D3-05完成 | 开发工程师 |
| D2-08 Gateway生产安装 | ❌未部署 | D3-05完成 | 开发工程师 |

---

*架构师签章: Day 3的本质是把Day 2的零件装上发动机。意图识别复合方案+AEO评测体系是动力，ISC enforcement是安全锁，端到端验收是出发前的最终检查。*

*反熵增原则验证: 每个设计项都有明确的感知/认知/执行三层归属，每个指标都可测量，每个验收标准都可自动化检查。系统有序度在Day 3结束后必须高于Day 2。*

## 目标

> TODO: 请补充目标内容

## 方案

> TODO: 请补充方案内容

## 风险

> TODO: 请补充风险内容

## 验收

> TODO: 请补充验收内容

---

## 📋 架构评审清单 (自动生成)

**文档**: day3-detailed-design
**生成时间**: 2026-03-06T13:01:12.502Z
**状态**: 待评审

### ⚠️ 缺失章节
- [ ] 补充「目标」章节
- [ ] 补充「方案」章节
- [ ] 补充「风险」章节
- [ ] 补充「验收」章节

### 评审检查项
- [ ] 方案可行性评估
- [ ] 技术风险已识别
- [ ] 依赖关系已明确
- [ ] 回滚方案已准备
- [ ] 性能影响已评估

### 审核门
审核门: 待通过

> 评审完成后，将上方「待通过」改为「通过」即可放行。
