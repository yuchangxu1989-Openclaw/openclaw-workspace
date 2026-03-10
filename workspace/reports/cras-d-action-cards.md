# CRAS-D 高置信行动卡

- 来源: reports/cras-d-research-strategy-summary.json
- 生成时间: 2026-03-08T01:58:01.365Z
- 根任务: CRAS-D研究策略执行化闭环

## 行动卡列表

### A1. 把研究源从二手社区文扩展到学术/官方优先采样
- 优先级: P1
- Owner: cras/research
- 本地缺口: 现有 research-*.json 以 Medium/LinkedIn/博客聚合为主，学术与官方文档占比偏低。
- 验证: 下一版 research 输出中 academic+docs 命中数 > community。
- memory/tasks: `memory/tasks/cras_d_a1_把研究源从二手社区文扩展到学术-官方优先采样.json`
- lto task: `skills/lto-core/tasks/cras_d_a1_把研究源从二手社区文扩展到学术-官方优先采样.json`
- close-loop: `infrastructure/close-loop-tasks/close-loop-cras_d_a1_把研究源从二手社区文扩展到学术-官方优先采样.json`
- 验证命令:
  - `node scripts/cras-d-research-report.js`
  - `node scripts/cras-d-refresh-research.js`

### A2. 将研究结论绑定本地执行压力与积压
- 优先级: P0
- Owner: ops/governance
- 本地缺口: 现有洞察文件偏外部趋势总结，缺少对 manual-queue、DTO任务、tracker 遗留的直接映射。
- 验证: 报告中每条建议必须含本地缺口字段与验证命令。
- memory/tasks: `memory/tasks/cras_d_a2_将研究结论绑定本地执行压力与积压.json`
- lto task: `skills/lto-core/tasks/cras_d_a2_将研究结论绑定本地执行压力与积压.json`
- close-loop: `infrastructure/close-loop-tasks/close-loop-cras_d_a2_将研究结论绑定本地执行压力与积压.json`
- 验证命令:
  - `node scripts/cras-d-research-report.js`
  - `node scripts/cras-d-materialize-action-cards.js`

### A3. 生成 Feishu Doc 友好的结构化材料
- 优先级: P1
- Owner: cras/reporting
- 本地缺口: 缺少统一 Markdown/Doc 模板、关键指标表、任务卡片和执行清单。
- 验证: 生成 report markdown，可直接写入 Feishu Doc。
- memory/tasks: `memory/tasks/cras_d_a3_生成-feishu-doc-友好的结构化材料.json`
- lto task: `skills/lto-core/tasks/cras_d_a3_生成-feishu-doc-友好的结构化材料.json`
- close-loop: `infrastructure/close-loop-tasks/close-loop-cras_d_a3_生成-feishu-doc-友好的结构化材料.json`
- 验证命令:
  - `node scripts/cras-d-research-report.js`
  - `test -f reports/cras-d-action-cards.md`

### A4. 把研究结论接入 Tracker / todo / 本地任务编排 任务树
- 优先级: P0
- Owner: project-mgmt/lto
- 本地缺口: 研究模块未持续把战略建议沉淀成项目管理对象。
- 验证: summary.json 中 actions 数组可被脚本化读取。
- memory/tasks: `memory/tasks/cras_d_a4_把研究结论接入-tracker-todo-lto-任务树.json`
- lto task: `skills/lto-core/tasks/cras_d_a4_把研究结论接入-tracker-todo-lto-任务树.json`
- close-loop: `infrastructure/close-loop-tasks/close-loop-cras_d_a4_把研究结论接入-tracker-todo-lto-任务树.json`
- 验证命令:
  - `node scripts/cras-d-research-report.js`
  - `node scripts/cras-d-materialize-action-cards.js --check`
