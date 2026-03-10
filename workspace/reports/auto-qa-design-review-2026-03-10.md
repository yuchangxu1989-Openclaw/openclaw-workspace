# Auto-QA on Completion 设计方案审查报告

**审查人**: reviewer  
**日期**: 2026-03-10  
**审查对象**: `skills/public/multi-agent-reporting/completion-handler.sh` 中的 Auto-QA 实现

---

## 一、总体评价

Auto-QA 机制已在 completion-handler.sh 中实现，整体设计思路正确：在子Agent完成时根据 agentId 判断是否需要自动派发质量核查，生成队列文件供后续消费。方案可用，但存在若干健壮性和可扩展性问题需要关注。

**综合评级**: ⚠️ 基本可用，建议改进

---

## 二、逐项审查

### 1. 完成事件识别（coder/writer/researcher）✅ 通过

```bash
case "$AGENT_ID" in
  coder|writer|researcher) NEED_QA="true" ;;
  reviewer|analyst) NEED_QA="false" ;;
esac
```

**优点**:
- 使用 case 语句，逻辑清晰
- 三种产出型Agent均已覆盖
- failed 状态正确跳过 QA（`[ "$STATUS" = "failed" ] && NEED_QA="false"`）

**问题**:
- ⚠️ **未覆盖的 agentId 默认不触发 QA**（隐式 fallthrough）。如果未来新增 `designer`、`devops` 等角色，需要手动更新此处。建议改为白名单显式匹配 + 默认行为可配置化。
- ⚠️ **agentId 来源依赖 task-board 中的 agentId 字段**。如果注册任务时未填写 agentId，则 `$AGENT_ID` 为空，静默跳过 QA，无任何告警日志。

### 2. reviewer/analyst 排除（防无限循环）✅ 通过

```bash
reviewer|analyst) NEED_QA="false" ;;
```

**优点**:
- 明确排除了 reviewer 和 analyst，避免 QA→QA 无限循环
- 注释说明了排除原因

**问题**:
- ⚠️ **排除逻辑仅基于 agentId 字符串匹配**。如果有人注册了 `reviewer-v2` 或 `code-reviewer` 这样的 agentId，不会被排除。建议改为前缀匹配或维护排除列表配置文件。
- ⚠️ **缺少递归深度保护**。虽然当前 reviewer 不触发 QA，但如果未来逻辑变更导致 reviewer 意外匹配，没有兜底的最大递归深度限制。建议在队列文件中加入 `qa_depth` 字段，超过阈值（如2）强制终止。

### 3. 队列文件格式 ⚠️ 部分通过

**文件路径**: `/root/.openclaw/workspace/logs/auto-qa-queue/auto-qa-{label}-{timestamp}.json`

**队列文件结构**:
```json
{
  "original_label": "task-id",
  "original_agent": "coder",
  "status": "pending",
  "qa_type": "code-qa",
  "task_summary": "...",
  "result_summary": "...",
  "created_at": "2026-03-10T..."
}
```

**优点**:
- 每个 QA 任务独立文件，避免并发写入冲突
- 文件名含时间戳，天然有序
- 包含原始任务信息，便于 reviewer 理解上下文

**问题**:
- ❌ **缺少 `artifact_path` 字段**。Step 1.5 已经从 summary 中提取了产出物路径（`$ARTIFACT_PATH`），但未写入队列文件。reviewer 拿到队列后不知道要审查哪个文件。
- ❌ **缺少消费端实现**。队列目录当前只有 `.gitkeep`，没有消费者脚本（如 `process-qa-queue.sh`）来读取 pending 文件、派发 reviewer subagent、更新状态为 processing/done。队列只写不读。
- ⚠️ **缺少 `original_task_id`（taskId）字段**。只有 label，如果 label 和 taskId 不同，溯源困难。
- ⚠️ **status 字段无状态机定义**。pending 之后应该有 processing → done/failed 的流转，但没有文档或代码定义。
- ⚠️ **无过期/清理机制**。队列文件会无限积累。

### 4. 审计 Checklist 模板 ✅ 通过

**code-qa.md** 覆盖 7 项：功能完整性、语法与运行、边界处理、幂等与安全、依赖与路径、日志与输出、向后兼容。

**doc-qa.md** 覆盖 7 项：内容完整性、准确性、结构清晰、格式规范、一致性、可操作性、无遗漏。

**优点**:
- 两套模板分别针对代码和文档，分类合理
- 检查项具体可操作，非泛泛而谈

**问题**:
- ⚠️ **qa_type 映射不够细**。researcher 被映射为 `doc-qa`，但 researcher 的产出可能包含数据分析脚本、爬虫代码等，用 doc-qa 模板不够。建议增加 `research-qa` 模板，增加"数据来源可靠性"、"结论是否有数据支撑"等检查项。
- ⚠️ **code-qa 缺少安全相关检查项**。如：是否有硬编码密钥/token、是否有命令注入风险、文件操作是否使用安全路径。对于 shell 脚本密集的项目尤其重要。
- ⚠️ **缺少通用检查项**：git commit 是否已提交、是否更新了相关文档/CHANGELOG。

---

## 三、架构层面问题

### 3.1 队列生产-消费断裂

当前实现只完成了"生产"侧（生成队列文件），"消费"侧完全缺失。需要：
1. 消费者脚本：扫描 pending 文件 → 派发 reviewer subagent → 更新状态
2. 与 completion-handler 的集成：reviewer 完成后的结果如何回写
3. QA 结果与原任务的关联展示（看板上是否显示 QA 状态）

### 3.2 Shell 脚本中嵌入大量 Node.js 内联代码

completion-handler.sh 中有多处 `node -e "..."` 内联 JavaScript，包括 JSON 读写、数据处理等。这种模式：
- 难以调试和测试
- 引号嵌套容易出错（当 `$SUMMARY` 含特殊字符时）
- 建议将核心逻辑抽取为独立的 `.js` 模块，shell 只做调度

### 3.3 `$SUMMARY` 注入风险

```bash
result_summary: $(printf '%s' "$SUMMARY" | node -e "...")
```

虽然通过 stdin pipe + `JSON.stringify` 做了转义，但如果 `$SUMMARY` 包含单引号或反引号，外层 shell 的 `node -e '...'` 可能在某些边界情况下出问题。建议改用环境变量传递：

```bash
SUMMARY="$SUMMARY" node -e "const s = process.env.SUMMARY; ..."
```

---

## 四、改造建议（优先级排序）

| 优先级 | 建议 | 工作量 |
|--------|------|--------|
| P0 | 将 `artifact_path` 写入队列文件 | 5min |
| P0 | 实现队列消费者脚本 `process-qa-queue.sh` | 2h |
| P1 | agentId 白名单配置化（从 config.json 读取） | 30min |
| P1 | 排除列表支持前缀匹配或正则 | 20min |
| P1 | 增加 `qa_depth` 字段防递归 | 15min |
| P2 | 增加 `research-qa` checklist 模板 | 30min |
| P2 | code-qa 增加安全检查项 | 15min |
| P2 | 队列文件过期清理机制 | 30min |
| P3 | 核心逻辑从内联 node -e 抽取为独立模块 | 2h |

---

## 五、结论

Auto-QA 的触发判断逻辑（谁触发、谁排除）设计正确，checklist 模板覆盖了主要场景。主要短板是：**队列只生产不消费**（消费端未实现）、**artifact_path 未传递给 reviewer**、以及 **agentId 匹配不够灵活**。建议优先补齐 P0 项，使 Auto-QA 形成完整闭环。
