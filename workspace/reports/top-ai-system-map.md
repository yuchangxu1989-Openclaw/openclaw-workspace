# Top AI System Map — 图源说明

> **图片目录**：`/root/.openclaw/workspace/reports/diagrams/`  
> **生成时间**：2026-03-06  
> **制作方式**：SVG 手写 → wkhtmltoimage 转 PNG

---

## 图一：全局闭环总图

**文件名**：`diagram1-global-loop.png` / `diagram1-global-loop.svg`  
**尺寸**：900 × 680 px  
**内容说明**：

展示 OpenClaw 四层架构的全局闭环：

| 层次 | 内容 |
|------|------|
| L1 感知与输入层 | 用户输入、意图识别、EventBus、openclaw.json 配置、ISC Rules、Cron 调度 |
| L2 治理与决策层 | ISC 治理门禁、本地任务编排 编排、Dispatcher 分发、AEO 质量门禁、Failover 降级 |
| L3 执行与能力层 | Handlers/Pipeline、Skills 执行面（CRAS/SEEF/LEP）、Monitor 观测、日报/审计、EvoMap 外部发布 |
| L4 反馈与进化层 | 执行结果/指标、PDCA 复盘、规则修正回写、能力锚点更新 |

**闭环路径**：L1→L2→L3→L4→（AEO 质量反馈回 L2，规则修正回 L1）

---

## 图二：Day2 完成/缺口图

**文件名**：`diagram2-day2-gaps.png` / `diagram2-day2-gaps.svg`  
**尺寸**：900 × 620 px  
**内容说明**：

按维度展示 Day2 Agent 运行效率与质量的完成状态与缺口：

| 维度 | 状态 | 核心缺口 |
|------|------|---------|
| 执行链 | 🔴 P0 | 链路编排/步骤级回滚/可解释性缺失 |
| Failover | 🔴 P0 | 备选模型路径/超时切换条件未硬编码 |
| 业务级E2E | 🔴 P0 | 全链路业务验收缺失，假阳性风险高 |
| 稳定性 | 🔴 P0 | 超时/重试风暴/状态漂移未治理 |
| 意图识别 | 🔶 partial | 多意图/歧义/失败重判未标准化 |
| 事件驱动 | 🔶 partial | 语义标准化/去重/优先级不够硬 |
| Cron模型治理 | 🟡 P1 | 模型分层/成本控制未固化 |

**硬结论**：暂无项目可硬性判定为完全收口（done）

---

## 图三：Day3 完备化路线图

**文件名**：`diagram3-day3-roadmap.png` / `diagram3-day3-roadmap.svg`  
**尺寸**：900 × 660 px  
**内容说明**：

Day3 三段式推进路径：

- **D3-AM1（07:30–10:30）Day2 收尾**：Gap-1 Cron 止血 → Gap-5 统一 test-runner → Gap-3 AEO 评测 + 裁决殿裁决 Day2
- **D3-PM1（10:30–13:00）Cron 重塑**：Gap-2 三个核心 Cron 事件驱动化 → Gap-4 五层运营仪表盘首版
- **D3-PM2（14:00–18:00）L3 生产化**：Pipeline shadow→active 切换 → E2E 全链路验证 → Day3 AEO + 裁决殿裁决

**6 项验收标准**：0 error Cron / AEO+裁决殿 Day2 通过 / 3个Cron重塑 / 五层仪表盘首版 / L3 E2E至少1个真实事件 / npm test 一键回归

---

## 说明

- SVG 源文件已同步保留，可在浏览器直接预览或用 Inkscape/rsvg-convert 重新渲染
- PNG 由 `wkhtmltoimage 0.12.6` 生成，白底，适合 Feishu 文档直接插入
- 颜色语义：🔵 L1感知输入 / 🟢 L2治理决策 / 🟡 L3执行能力 / 🟣 L4反馈进化 / 🔴 P0缺口 / 🟠 partial
