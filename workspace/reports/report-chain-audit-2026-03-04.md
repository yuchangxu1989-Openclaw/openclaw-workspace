# 四维意图仪表盘报告生成链路审计

**审计日期**: 2026-03-04  
**审计范围**: CRAS四维意图洞察仪表盘的完整数据链路  
**结论**: 🔴 **严重问题** — 仪表盘核心数据几乎全部来自硬编码静态值，伪装成动态分析结果

---

## 一、总体架构链路

```
cron (merged-cras-knowledge-6h, 每6小时)
  → python3 /root/.openclaw/workspace/cras/cron_entry.py
    → generate_dashboard() 函数
      → 硬编码的飞书卡片JSON
        → 写入 cras_insight_dashboard.json
          → 通过 feishu-report-sender 发送到飞书
```

---

## 二、逐文件审计

### 2.1 🔴 `cras/cron_entry.py` — 仪表盘生成器（核心问题）

**数据来源**: 100% 硬编码  
**伪装行为**: ✅ 严重伪装

**具体发现**:
- TOP10意图分布表格（指令执行18次/38%、架构设计12次/26%等）全部是**字符串字面量**，写死在Python源码中
- 四维趋势洞察（"架构治理型用户"、"中性偏积极"、"迭代优化型"、"晚间高峰23:00"）全部硬编码
- 洞察发现（"架构治理焦点"、"取其精华方法论"、"模型分工明确"、"闭环验证"）全部硬编码
- 心智闭环更新（已固化认知、新增洞察）全部硬编码
- 底部统计（累计交互47次、会话数12个、技能变更7个、ISC规则新增3个）全部硬编码
- **唯一动态值**：报告时间戳 `now.strftime("%Y-%m-%d %H:%M CST")`

**伪装手法**:
- 使用 `f"📅 报告周期: {report_time} | 过去24小时洞察"` 制造动态时间假象
- 内容暗示"过去24小时"分析，但实际没有任何数据读取或分析逻辑
- 每次生成的报告内容完全相同（除时间戳外）

### 2.2 🔴 `cras_insight_dashboard.json` — 仪表盘输出文件

**数据来源**: 由 `cron_entry.py` 生成的静态JSON  
**伪装行为**: ✅ 是伪装的产物

这是 `cron_entry.py` 的输出产物。内容与源码中的硬编码完全一致。每次运行只更新时间戳。

### 2.3 🟡 `cras/config/user-profile.json` — 用户画像

**数据来源**: 混合（半真半假）  
**伪装行为**: ⚠️ 部分伪装

- `profile.tags` 数组有53个标签（command/query/feedback/exploration），看起来像是某种分析结果
- `history` 数组有53条交互记录，时间戳从2026-02-23到2026-03-03，间隔精确到30分钟或整点
- **关键问题**: 每条记录的 `emotion` 都是 `"neutral"`，`pattern` 都是 `"recurring-theme"` — 这不是真实分析，是批量生成的模板数据
- 交互时间戳与cron触发时间高度吻合（每30分钟一次），说明这是cron任务自身的执行记录被当作"用户交互"记录

### 2.4 🔴 `cras/config/insight-analysis-*.json` — 洞察分析配置

**数据来源**: 静态配置  
**伪装行为**: ⚠️ 伪装

- `totalInteractions: 0` — 所有意图分布计数均为0
- 仪表盘上显示"指令执行18次"，但底层分析文件显示实际计数为0
- 证实仪表盘数据与底层分析结果完全脱节

### 2.5 🟡 `cras/cras-b-fixed.js` — CRAS-B用户洞察分析

**数据来源**: 尝试读取真实数据，但有大量fallback到硬编码  
**伪装行为**: ⚠️ 轻度伪装

```javascript
// 读取失败时使用默认值
const totalInteractions = recentInteractions.reduce(...) || 12; // fallback到12
const topIntent = '指令执行';  // 硬编码
const emotion = '中性';        // 硬编码
const pattern = '深度迭代';    // 硬编码
```

- 尝试读取memory目录下的markdown文件并用正则匹配时间戳来统计交互次数
- 但意图分类、情绪分析、模式识别全部是硬编码默认值
- 没有调用任何NLP/LLM进行真实的意图分类或情绪分析

### 2.6 🟡 `cras/knowledge/` — 知识库数据

**数据来源**: 大量是模板数据  
**伪装行为**: ⚠️ 存在问题

- `active-learning_*.json` 文件内容为 `"高价值洞察示例"` 的模板数据，confidence固定为0.85
- 后期文件改为 `[待搜索]` 占位符，说明学习引擎从未真正执行搜索
- 知识库中没有任何真实的学习产出

### 2.7 🟢 `cras/cras-learning-engine.cjs` — 主动学习引擎

**数据来源**: 设计上调用外部API（智谱GLM-5）  
**伪装行为**: ❌ 无伪装（但可能无法成功执行）

- 代码结构合理，有真实的API调用逻辑
- 但依赖 `ZHIPU_API_KEY` 环境变量，不确定是否配置正确
- 这是链路中少数设计上有真实数据获取能力的模块

### 2.8 🟢 `feishu-report-sender/` — 飞书报告发送器

**数据来源**: 不产生数据，只负责发送  
**伪装行为**: ❌ 无伪装

- 纯粹的队列消费者，读取 `feishu_queue/` 下的JSON文件并发送到飞书
- 不修改或伪造数据内容
- 功能正常

### 2.9 🟢 `isc-core/rules/N016、N017` — ISC规则

**数据来源**: 静态配置文件（这是正确的，规则本身就应该是静态的）  
**伪装行为**: ❌ 无伪装

- N016 (`auto_repair_loop_post_pipeline`): 流水线后自动修复循环规则
- N017 (`cras_recurring_pattern_auto_resolve`): CRAS重复模式自动解决规则
- 编号来自ISC规则命名体系，N代表规则序号
- 这些是声明式规则定义，静态是合理的

### 2.10 `cron/jobs.json` — 定时任务

与仪表盘相关的cron任务:
- **`merged-cras-knowledge-6h`**: 每6小时执行，调用 `python3 cras/cron_entry.py` — 这就是仪表盘的触发入口
- **`CRAS-B-用户洞察分析-每日`**: 每日21:00执行 `node index.js --insight`
- **`CRAS-洞察复盘-每周`**: 每周一三五18:00执行 `insight-enhancer.js`

---

## 三、伪装链路总结

```
真实数据源（几乎不存在）
  ↓ (断裂)
cras-b-fixed.js → 尝试读取memory/*.md → 失败时fallback到硬编码默认值
  ↓ (断裂)
config/insight-analysis-*.json → 所有计数为0
  ↓ (完全忽略)
cron_entry.py → 100%硬编码 → cras_insight_dashboard.json
  ↓
feishu-report-sender → 发送到飞书（忠实传递，不修改）
  ↓
用户收到"四维意图洞察仪表盘" → 以为是动态分析结果
```

**核心问题**: `cron_entry.py` 完全不读取任何上游分析结果，所有展示数据写死在源码中。

---

## 四、修复建议

### 4.1 仪表盘数据应从哪里获取

| 仪表盘模块 | 当前来源 | 应有来源 |
|:--|:--|:--|
| TOP10意图分布 | 硬编码 | `sessions_list` / `sessions_history` API获取真实会话，用LLM分类意图 |
| 四维趋势洞察 | 硬编码 | 聚合 `user-profile.json` 历史数据，计算真实趋势 |
| 洞察发现 | 硬编码 | 基于真实交互数据的LLM摘要分析 |
| 心智闭环更新 | 硬编码 | diff对比上次画像，提取真实变化 |
| 底部统计 | 硬编码 | 从 `sessions_list`、git log、ISC rules目录实际计数 |

### 4.2 推荐实施路径

1. **Phase 1**: 修改 `cron_entry.py`，读取 `config/user-profile.json` 中的真实标签分布来生成TOP10
2. **Phase 2**: 让CRAS-B真正调用LLM进行意图分类和情绪分析，而不是hardcode
3. **Phase 3**: 从 `sessions_list` API获取真实会话数据作为分析输入
4. **Phase 4**: 实现真正的趋势计算（对比本周vs上周的意图分布变化）

### 4.3 user-profile.json 的修复

- 交互记录不应该是cron触发时间，而应该是用户实际发消息的时间
- emotion和pattern不应该全部是相同的默认值
- 需要真正的NLP分析或至少基于规则的分类

---

## 五、审计结论

| 严重程度 | 数量 | 说明 |
|:--|:--|:--|
| 🔴 严重 | 2 | cron_entry.py、cras_insight_dashboard.json — 100%硬编码伪装 |
| 🟡 中等 | 3 | user-profile.json、insight-analysis配置、cras-b-fixed.js — 部分伪装 |
| 🟢 正常 | 4 | learning-engine、feishu-sender、ISC规则、cron配置 |

**整体评价**: 四维意图仪表盘是一个**展示壳**，没有真实的数据分析链路支撑。用户看到的所有"洞察"和"分析结果"都是预设的静态文本，仅时间戳是动态的。这构成了对用户的误导。

---

*审计人: System Architect (researcher agent)*  
*审计时间: 2026-03-04 14:08 CST*
