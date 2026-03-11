# 审计报告：Badcase采集→黄金评测集链路

> 审计时间：2026-03-11 22:50 GMT+8
> 审计人：subagent/auditor

---

## 1. Badcase采集量统计

| 数据源 | 数量 | 说明 |
|--------|------|------|
| `00-real-badcases.json` | **3条** | badcase-harvest-engine写入的唯一目标文件 |
| MemOS correction chunks | **0条** | correction-harvester从未成功写入过 |
| `tests/badcases/` 目录 | 1个文件 | 仅一份历史分析JSON |
| auto-qa-queue | 33个任务 | 这些是QA任务，非badcase |

**结论：实际采集到的badcase极少，仅3条。**

### 3条badcase内容审查

全部3条的模板高度雷同：
- 同一个 `badcase_category`："自主性缺失类"
- 同一个 `root_cause`："口头判断与结构化记录脱钩，缺少强制原子绑定"
- 同一个 `context` 模板："任务总结含badcase语义 then仅口头标记 then未程序化入库"
- 来源均为 `auto-harvest-engine`，非用户手动标记

**这3条本质上是harvest-engine自己检测到的同类问题的重复记录，不是用户标记的真实badcase。**

---

## 2. 黄金评测集现状

### 总量：852条（分布在44个JSON文件中）

| 文件类型 | 条数 | 占比 | 来源 |
|----------|------|------|------|
| `mined-r2-*.json` (28个) | 280 | 32.9% | 记忆挖掘第2轮 |
| `mined-r4-*.json` (11个) | 110 | 12.9% | 记忆挖掘第4轮 |
| `mined-r3-01.json` | 10 | 1.2% | 记忆挖掘第3轮 |
| `mined-from-memory.json` | 14 | 1.6% | 记忆直接挖掘 |
| `mined-glm5-test.json` | 9 | 1.1% | GLM-5测试 |
| **mined小计** | **423** | **49.6%** | **← 用户说的"423条"** |
| `goodcases-from-badcases.json` | 426 | 50.0% | badcase翻转 |
| `00-real-badcases.json` | 3 | 0.4% | 原始badcase |
| **总计** | **852** | 100% | |

### 关键发现

用户说的"423条"是 `mined-*` 系列文件的总和。但实际上还有426条 `goodcases-from-badcases.json`——**这426条并非来自3条real-badcase的翻转，而是翻转脚本扫描了所有mined-*.json后生成的**。

也就是说：
- 423条mined → 被翻转脚本再生成了423条goodcase（加上3条real-badcase翻转 = 426条）
- **goodcases-from-badcases.json 是 mined-*.json 的镜像翻转，不是独立数据源**
- 去重后实际独立评测样本 = **423条**（mined系列），goodcases只是换了expected_output的副本

---

## 3. 转化链路分析：哪里断了

### 设计链路（应该是）

```
用户标记badcase / 事件触发
       ↓
  badcase-harvest-engine (handler)
       ↓ 写入
  00-real-badcases.json
       ↓ 触发
  badcase-auto-flip / badcase-to-goodcase.sh
       ↓ 翻转写入
  goodcases-from-badcases.json
       ↓
  黄金评测集（评测时加载）
```

### 实际断点

#### 断点1：事件触发层 — 几乎没有事件进入harvest-engine

- harvest-engine监听3种事件：`user.feedback.correction`、`task.failed`、`rule.violated`
- 但 **MemOS中correction chunks = 0**，说明correction-harvester从未成功执行
- completion-handler的keyword检测（"badcase"、"纠偏"、"又忘了"等）理论上能触发，但实际只触发了3次
- **根因：用户口头说"这是badcase"时，没有结构化事件被发射到事件总线**

#### 断点2：correction-harvester完全失效

- handler代码完整（FTS5搜索→标记deprecated→插入correction chunk→双写MEMORY.md）
- 但MemOS中0条correction kind的chunk
- 可能原因：`better-sqlite3`原生模块加载失败（与之前MemOS插件崩溃是同一个问题）
- **correction-harvester从未成功运行过**

#### 断点3：badcase→golden翻转逻辑有设计缺陷

- `badcase-to-goodcase.sh` 扫描 `c2-golden/` 下**所有JSON**（不只是00-real-badcases.json）
- 这导致mined-*.json（本身就是golden样本）也被翻转，产生了语义错误的"goodcase"
- 翻转逻辑只是机械地把 `expected_behavior` 复制到 `expected_output`，加前缀 `"系统应执行: "`
- **426条goodcase中377个unique scoring_rubric，但全部缺少V4核心字段**

#### 断点4：没有从用户对话中自动提取badcase的机制

- 用户在飞书对话中说"这个做错了"、"又犯了"等，没有任何listener将其转化为结构化badcase事件
- 主Agent需要手动调用 `auto-badcase-harvest.sh`，但实际几乎没有调用过

---

## 4. V4字段覆盖率

### 全量852条覆盖率

| V4字段 | 有值条数 | 覆盖率 | 状态 |
|--------|----------|--------|------|
| `scoring_rubric` | 849 | 99.6% | ✅ 基本覆盖 |
| `north_star_indicator` | 423 | 49.6% | ⚠️ 仅mined-*有 |
| `gate_relevance` | 0 | 0% | ❌ 完全缺失 |
| `process_indicators` | 0 | 0% | ❌ 完全缺失 |
| `layer` | 0 | 0% | ❌ 完全缺失 |

### goodcases-from-badcases.json（426条）单独覆盖率

| V4字段 | 覆盖率 |
|--------|--------|
| `scoring_rubric` | 100%（但全是机械生成的"系统应执行: ..."前缀） |
| `north_star_indicator` | **0%** |
| `gate_relevance` | **0%** |
| `process_indicators` | **0%** |
| `layer` | **0%** |

### 结论

- **V4合规率极低**：5个V4字段中，只有 `scoring_rubric` 基本覆盖，其余4个字段覆盖率为0%或仅一半
- goodcases的scoring_rubric是机械翻转生成的，质量存疑
- mined-*系列的V4覆盖相对好（有north_star_indicator和scoring_rubric），但也缺3个字段
- **badcase采集handler（badcase-harvest-engine）完全不填充任何V4字段**

---

## 5. 修复建议

### P0：修复badcase采集入口（链路断点1+4）

1. **在主Agent SOUL/系统提示中加入badcase识别指令**：当用户表达不满、纠偏、重复问题时，主Agent必须发射 `user.feedback.correction` 事件
2. **修复completion-handler的keyword触发**：当前keyword列表过窄，且触发后只写了3条同质badcase，需要扩展检测逻辑并确保payload包含真实上下文

### P1：修复correction-harvester（链路断点2）

1. 确认 `better-sqlite3` 原生模块可用（与MemOS插件修复同步）
2. 添加correction-harvester的端到端测试：模拟事件→验证MemOS中出现correction chunk

### P1：修复翻转脚本设计缺陷（链路断点3）

1. `badcase-to-goodcase.sh` 应**只扫描 `00-real-badcases.json`**，不应扫描mined-*.json
2. 翻转时必须填充V4字段（至少 `north_star_indicator`、`layer`、`gate_relevance`）
3. 当前426条goodcase需要清洗：去除从mined-*翻转的无效条目

### P2：补全V4字段

1. 对现有423条mined-*补充 `gate_relevance`、`process_indicators`、`layer` 字段
2. 建立V4 schema校验gate：新增评测样本必须通过V4字段完整性检查才能入库

---

## 总结

| 维度 | 评分 | 说明 |
|------|------|------|
| Badcase采集 | 🔴 1/10 | 仅3条，且是同质自动生成，非真实用户badcase |
| 黄金评测集量 | 🟡 5/10 | 423条独立样本，但goodcases是无效镜像 |
| 链路完整性 | 🔴 2/10 | 4个断点，correction-harvester完全失效 |
| V4合规率 | 🔴 2/10 | 5个字段中3个=0%覆盖 |
| **综合** | **🔴 2.5/10** | **链路基本不通，badcase无法流入golden** |
