# 凌霄阁-7人裁决神殿 v1.0 ⚡🏛️

distribution: publishable

> 七位神官，三轮battle，一个裁决。用户是最终裁决者。

---

## 这是什么

一个**完整可运行的深度决策引擎**。通过LLM驱动7个独立视角对同一议题进行三轮对抗式审议，输出结构化裁决报告。

**核心能力**：
- ✅ LLM驱动的多角色三轮对抗（Round 1并行 → Round 2串行交叉质疑 → Round 3终审裁决）
- ✅ 7/5/3席降级模式（全席 / 精简 / 极限）
- ✅ OpenAI-compatible API（默认GLM-5，可切换任意模型）
- ✅ CLI入口 + 模块导出（`convene()` 函数）
- ✅ 单Agent失败容错（标记"缺席"，不影响整体流程）
- ✅ 结构化JSON输出（含评分、耗时、各轮详情）

**能力边界**：
- ⚠️ 不支持流式输出（每轮完成后才返回）
- ⚠️ 不包含持久化存储（结果仅在内存/stdout）
- ⚠️ Round 2/3必须串行，总耗时取决于LLM响应速度
- ⚠️ 不含Web UI或交互式界面

---

## 快速开始

### CLI 调用

```bash
# 设置环境变量
export LLM_API_KEY=your-api-key
export LLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4  # 可选，默认GLM-5

# 运行裁决
node council.js --topic "是否应该重构核心模块" --context "当前技术债较重" --mode 7

# 精简模式
node council.js --topic "议题" --mode 3 --model gpt-4

# 查看帮助
node council.js --help
```

### 模块调用

```javascript
const { convene } = require('./council.js');

const result = await convene('是否应该重构核心模块', '当前技术债较重', {
  mode: '7',        // '7' | '5' | '3'
  model: 'glm-5',   // 任意OpenAI-compatible模型
  apiKey: 'xxx',     // 或设置 LLM_API_KEY 环境变量
  baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  parallel: true,    // Round 1 并行
});

console.log(result.rounds.round3.verdict);
console.log(result.rounds.round3.score);
```

### 输出格式

```json
{
  "topic": "...",
  "mode": "7",
  "rounds": {
    "round1": [{ "seat": "dao", "seatTitle": "🏛️ 道席", "result": "...", "status": "ok" }, ...],
    "round2": [{ "seat": "dao", "seatTitle": "🏛️ 道席", "result": "...", "status": "ok" }, ...],
    "round3": { "verdict": "...", "score": 7.5, "status": "ok" }
  },
  "duration_ms": 12345,
  "model": "glm-5"
}
```

---

## 七席神官

| 席位 | 角色 | 审视维度 | 核心问题 |
|------|------|---------|---------|
| 🏛️ **道席** | 第一性原理守护者 | 本质与边界 | 根基上有没有错？ |
| ⚔️ **战席** | 战略决策者 | 方向与取舍 | 该不该做？值不值得？ |
| 🔧 **工席** | 工程实现者 | 可落地性 | 能实现吗？成本多大？ |
| 🛡️ **盾席** | 质量与安全守护者 | 风险与韧性 | 最坏情况？回滚方案？ |
| 👁️ **眼席** | 用户与市场洞察者 | 用户价值与体验 | 用户真的需要吗？ |
| 🔮 **远席** | 未来与进化预判者 | 可扩展性与成长 | 3年后还适用吗？ |
| ⚖️ **衡席** | 综合仲裁者 | 平衡与整合 | 最优平衡点在哪？ |

### 降级模式

| 模式 | 席位 | Token消耗 | 适用场景 |
|------|------|----------|---------|
| **7席** | 全部7席 | ~85K | 重大架构决策 |
| **5席** | 道+战+工盾+眼远+衡 | ~60K | 一般决策 |
| **3席** | 道+战+衡 | ~35K | 快速评估 |

---

## 三轮对抗协议

1. **Round 1 — 独立审议**（可并行）：每席独立分析，输出立场+论点+风险+信心度
2. **Round 2 — 交叉Battle**（串行）：看到所有观点后，挑战漏洞、回应质疑、修正立场
3. **Round 3 — 终审裁决**（串行）：衡席+道席综合裁决，输出分歧分析+最终建议+评分

---

## 测试

```bash
node --test tests/unit/lingxiaoge.test.js
```

21条测试覆盖：模式切换、prompt生成、结果结构化、容错、CLI解析、轮次间数据传递、评分提取。

---

## 元数据

```yaml
name: lingxiaoge-tribunal
display_name: 凌霄阁-7人裁决神殿
version: "1.0.0"
description: LLM驱动的7视角三轮对抗式深度决策引擎。完整可运行，支持CLI和模块调用。
status: active
distribution: publishable
author: Strategic Commander & 长煦
license: MIT
tags: [decision-making, multi-agent, council, battle, governance, llm]
min_agents: 1
dependencies: none (uses native fetch)
avg_tokens: ~85,000 (7-seat) / ~60,000 (5-seat) / ~35,000 (3-seat)
```
