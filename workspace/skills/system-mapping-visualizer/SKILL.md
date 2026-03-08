---
name: system-mapping-visualizer
chinese_name: 系统映射可视化器
version: "1.0.1"
status: active
layer: method
category: visualization
purpose: 面向 OpenClaw / ISC / 本地任务编排 / CRAS / SEEF 体系的专业系统图绘制规范与产出技能。
inputs:
  - openclaw.json
  - cron/jobs.json
  - workspace/skills/isc-core/rules/*.json
  - workspace/infrastructure/event-bus/events.jsonl
  - workspace/CAPABILITY-ANCHOR.md
outputs:
  - 专业 Mermaid 图源
  - PNG/SVG 实际图片
  - 架构审计说明
---

# 系统映射可视化器（System Mapping Visualizer）

distribution: internal

## 1. 定位

该技能用于把复杂系统状态转成 **可审计、可汇报、可复盘** 的正式图件，而不是只生成草图式 Mermaid。

适用对象：
- OpenClaw 全局架构盘点
- Day2 完成度 / 缺口分析
- Day3 路线图 / 收尾计划
- ISC / 本地任务编排 / CRAS / SEEF / EventBus 关系图
- 面向评审会、日报、复盘、架构审计的高可读图件

---

## 2. 推荐输入源（按可信度优先）

### A. 一级事实源（优先直接引用）
1. `openclaw.json`
   - 模型提供方、角色分工、运行时配置
   - 用于判断“认知/执行/模型供给层”

2. `cron/jobs.json`
   - 定时任务、兜底链路、告警/日报/补扫机制
   - 用于判断“运营层、补偿层、调度层”

3. `workspace/skills/isc-core/rules/*.json`
   - ISC 规则、触发事件、自动动作、门禁
   - 用于判断“治理层、标准层、硬约束层”

4. `workspace/infrastructure/event-bus/events.jsonl`
   - 实际事件流、事件类型、source、consumer
   - 用于判断“真实主干链路”和“数据闭环”

5. `workspace/CAPABILITY-ANCHOR.md`
   - 技能全景、能力锚点、模型路由、可用技能
   - 用于判断“能力地图”和“可调用边界”

### B. 二级证据源（用于补叙事）
- `workspace/reports/day2-*.md`
- `workspace/reports/day3-*.md`
- `workspace/reports/*audit*.md`
- `workspace/reports/*assessment*.md`
- `workspace/reports/*observability*.md`

### C. 使用原则
- **图中每个关键判断尽量能回指到文件**。
- 若无一级事实源，只能标注为“推断/待验证”。
- 运营结论必须与报告证据和真实配置同时对齐。

---

## 3. 图类型模板

## 3.1 架构图模板（Architecture Map）

### 适用场景
- 讲系统分层
- 讲模块职责边界
- 讲数据流 / 控制流 / 门禁

### 标准结构
- 顶部：外部输入 / 用户 / 定时器 / 配置源
- 中部：治理编排核心（ISC / 本地任务编排 / Dispatcher / EventBus）
- 下部：执行技能、反馈、报告、发布
- 右侧：证据与门禁（AEO、裁决殿、审计）

### 推荐 Mermaid
- `flowchart TB`
- 使用 `subgraph` 划层
- 关键链路加粗或单独配色

---

## 3.2 闭环图模板（Closed Loop Map）

### 适用场景
- 讲“感知 → 判断 → 执行 → 反馈 → 规则/能力进化”
- 讲生产系统不是静态架构，而是自驱闭环

### 固定槽位
1. 感知输入
2. 意图/事件识别
3. 规则治理 / 决策
4. 编排执行
5. 结果生成
6. 反馈采集
7. 规则 / 能力更新
8. 再进入主链路

### 关键要求
- 图中必须把“主路径”和“兜底路径”区分开
- 必须出现“真实事件流”与“Cron补偿”双通道

---

## 3.3 缺口图模板（Gap Map）

### 适用场景
- Day2 已交付 / 未交付
- 现状 / 目标 / 缺口 / 风险
- 适合审计和裁决

### 固定列
- 已完成能力
- 已有证据
- 当前缺口
- 风险影响
- 收尾动作

### 视觉要求
- 已完成：绿色
- 部分完成 / 待接入：黄色
- 缺失 / 阻塞：红色
- 证据块：蓝灰色

---

## 3.4 路线图模板（Roadmap）

### 适用场景
- Day3 完备化计划
- 收尾节奏
- 优先级排序

### 固定泳道
- 止血与修复
- 质量门禁
- 事件驱动重塑
- 可观测与运营
- 生产验证

### 固定字段
- 时间段 / 阶段
- 动作
- 产出物
- 验收标准
- 前置依赖

---

## 4. 颜色 / 语义规范

## 4.1 颜色语义

| 语义 | 颜色 | 用途 |
|---|---|---|
| 核心控制面 | `#DCEBFF` | ISC / 本地任务编排 / Dispatcher / 总控层 |
| 能力执行面 | `#E8F5E9` | 技能、执行器、处理器 |
| 事实证据面 | `#EEF2F7` | 配置、报告、日志、Anchor |
| 反馈闭环面 | `#FFF3D6` | AEO、评测、复盘、告警 |
| 风险 / 缺口 | `#FDE2E1` | 缺失、阻塞、待接入 |
| 路线 / 规划 | `#F3E8FF` | Day3 阶段、演进步骤 |
| 强提醒边框 | `#C0392B` | P0/P1 风险 |
| 成功边框 | `#2E7D32` | 已完成、已验证 |

## 4.2 线条语义

| 线型 | 语义 |
|---|---|
| `-->` | 标准控制流 / 数据流 |
| `-.->` | 补偿 / 兜底 / 回补链路 |
| `==>` | 强主链路 / 关键闭环 |
| `---` | 弱关联 / 说明性关系 |

## 4.3 文案规范
- 节点标题优先中文，必要时括号补英文缩写
- 一行不超过 16 个汉字为宜
- 尽量使用“动作 + 对象”命名，如：`规则触发`, `任务编排`, `事件补扫`
- 不要在图中堆过多文件路径，文件路径放脚注/注释区

---

## 5. 专业出图规范

1. **先定叙事主轴，再画图**，不要边想边堆节点。
2. **每张图只服务一个问题**：
   - 总图回答“系统怎么闭环”
   - 缺口图回答“Day2 还缺什么”
   - 路线图回答“Day3 怎么补齐”
3. 图中必须保留：
   - 关键输入源
   - 核心控制面
   - 执行面
   - 反馈与治理回流
4. 重要结论需在图下注明证据来源。
5. 最终交付必须同时保留：
   - 图源 Markdown / Mermaid
   - PNG 或 SVG 图片
6. Mermaid 渲染参数建议：
   - 白底
   - 宽屏布局
   - themeVariables 统一圆角、描边、正文色

---

## 6. 推荐产出流程

### 步骤 1：盘点事实
- 读取 `openclaw.json`
- 读取 `cron/jobs.json`
- 扫描 `isc-core/rules`
- 抽样 `events.jsonl`
- 读取 `CAPABILITY-ANCHOR.md`

### 步骤 2：抽象 5 个层面
- 配置与能力供给
- 事件与意图感知
- 规则治理与决策
- 执行与调度
- 反馈、审计、评测、进化

### 步骤 3：选择图模板
- 全景 → 架构图 / 闭环图
- 审计 → 缺口图
- 计划 → 路线图

### 步骤 4：渲染真实图片
可选实现：
- `mmdc` 直接渲染 PNG / SVG
- HTML 包裹 Mermaid 后浏览器截图
- Canvas 二次排版

### 步骤 5：审计检查
- 是否中文标注
- 是否白底
- 是否颜色柔和
- 是否存在节点重叠风险
- 是否能回指证据文件
- 是否清晰区分主路径与补偿路径

---

## 7. 本仓库高频图谱建议

### 图 A：OpenClaw 全局闭环总图
推荐引用：
- `openclaw.json`
- `cron/jobs.json`
- `workspace/infrastructure/event-bus/events.jsonl`
- `workspace/CAPABILITY-ANCHOR.md`
- `workspace/skills/isc-core/rules/rule.architecture-diagram-visual-output-001.json`

### 图 B：Day2 完成 / 缺口图
推荐引用：
- `workspace/reports/day2-*.md`
- `workspace/reports/day3-plan.md`
- `workspace/reports/day3-cron-fix-report.md`
- `workspace/reports/day3-test-runner-report.md`

### 图 C：Day3 完备化路线图
推荐引用：
- `workspace/reports/day3-plan.md`
- `workspace/reports/day3-cron-reshape-report.md`
- `workspace/reports/day3-ops-dashboard-v1.md`

---

## 8. 图下审计注释模板

```markdown
**审计注释**
- 主事实源：openclaw.json, cron/jobs.json, events.jsonl, CAPABILITY-ANCHOR.md
- 补充证据：day3-plan.md, day3-cron-reshape-report.md, day3-test-runner-report.md
- 图中绿色=已完成，黄色=部分完成/待接入，红色=缺口/风险
- 虚线表示 Cron 兜底或补偿链路
```

---

## 9. 交付标准

当用户要求“画系统图 / 架构图 / 缺口图 / 路线图”时，默认交付物应包含：
1. 一份图源文档（Markdown，含 Mermaid）
2. 对应 PNG/SVG 图片文件
3. 每张图的审计注释
4. 明确说明数据来源与推断边界

若只给 Mermaid 源码，视为**未完成交付**。
