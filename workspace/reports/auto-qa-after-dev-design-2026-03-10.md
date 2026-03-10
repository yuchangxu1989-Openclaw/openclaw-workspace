# 架构设计：开发完成后自动触发质量审计

**设计者**: 📐 系统架构师 (analyst)
**日期**: 2026-03-10
**状态**: 设计完成，待实施

---

## 一、问题定义

### 现状

completion-handler.sh 在检测到 coder/writer/researcher 完成时：
1. ✅ 已实现：生成 auto-qa 队列文件到 `/root/.openclaw/workspace/logs/auto-qa-queue/`
2. ❌ 未实现：队列文件是死文件，无人消费
3. ❌ 未实现：stdout 输出 `🔍 AUTO_QA_REQUIRED` 仅是提示文字，主Agent可以忽略

### 目标

**开发Agent完成 → 程序化自动spawn质量核查Agent → 核查结果写入reports/ → 更新看板**

全链路自动化，零人工介入。

---

## 二、技术调研结论

### 可用的Agent触发机制

| 机制 | 命令/接口 | 是否可从bash调用 | 是否阻塞 | 适用场景 |
|------|-----------|-----------------|---------|---------|
| `openclaw agent` CLI | `openclaw agent --agent <id> --message <text>` | ✅ | ⚠️ 同步等待完成 | 单次agent turn |
| `openclaw system event` | `openclaw system event --text <text> --mode now` | ✅ | ❌ 异步 | 唤醒主Agent处理事件 |
| `sessions_spawn` | 仅Agent内部tool可用 | ❌ bash不可用 | ❌ 异步 | Agent内部派发子任务 |
| 标记文件 + heartbeat | 写文件 → heartbeat扫描 | ✅ | ❌ 异步 | 兜底方案 |

### 选型决策

**主方案：`openclaw agent` CLI + 后台执行**

理由：
1. 唯一能从bash脚本直接spawn指定Agent的方式
2. 不经过主Agent，真正的"程序化自动触发"
3. 后台执行（`&`）不阻塞completion-handler主流程
4. reviewer Agent在自己的turn中可以读文件、写报告、更新看板

**兜底方案：heartbeat扫描未消费的队列文件**

如果CLI spawn失败（网关繁忙、超时等），heartbeat周期性扫描 `auto-qa-queue/` 中 status=pending 且创建超过5分钟的文件，由主Agent补派reviewer。

---

## 三、详细设计

### 3.1 整体流程

```
coder/writer/researcher 完成
        │
        ▼
completion-handler.sh 被调用
        │
        ├─ Step 1: 更新task-board（已有）
        ├─ Step 2: 判断是否需要QA（已有，需增强）
        ├─ Step 3: 生成auto-qa队列文件（已有）
        │
        ├─ Step 4 [新增]: 选择QA Agent（轮询）
        ├─ Step 5 [新增]: 构建QA任务消息
        ├─ Step 6 [新增]: 后台调用 openclaw agent 触发QA
        ├─ Step 7 [新增]: 更新队列文件状态为 dispatched
        │
        ▼
QA Agent (reviewer/reviewer-02/analyst-02) 执行
        │
        ├─ 读取原始产出物
        ├─ 执行质量核查
        ├─ 写入报告到 reports/
        ├─ 更新看板
        │
        ▼
QA Agent 完成 → completion-handler.sh 再次被调用
        │
        ├─ 检测到 agentId 匹配 reviewer*/analyst*
        ├─ NEED_QA = false（循环防护生效）
        ├─ 正常更新看板，不触发新QA
        │
        ▼
流程结束 ✅
```

### 3.2 QA Agent 轮询选择

**状态文件**: `/root/.openclaw/workspace/logs/auto-qa-reviewer-state.json`

```json
{
  "reviewers": ["reviewer", "reviewer-02", "analyst-02"],
  "last_index": 0,
  "dispatch_history": [
    {
      "task_label": "fix-agent-role-remaining",
      "reviewer": "reviewer",
      "dispatched_at": "2026-03-10T15:46:42Z"
    }
  ]
}
```

**选择算法**:
```bash
# 读取上次使用的index，+1 取模
LAST_INDEX=$(jq '.last_index // 0' "$STATE_FILE")
REVIEWERS=("reviewer" "reviewer-02" "analyst-02")
NEXT_INDEX=$(( (LAST_INDEX + 1) % 3 ))
QA_AGENT="${REVIEWERS[$NEXT_INDEX]}"

# 更新状态文件
jq --argjson idx "$NEXT_INDEX" '.last_index = $idx' "$STATE_FILE" > tmp && mv tmp "$STATE_FILE"
```

**为什么是这三个Agent**:
- `reviewer` — 质量仲裁官，主力QA
- `reviewer-02` — 仲裁官-02，分担负载
- `analyst-02` — 分析师-02，做质量审计（analyst做架构设计，不做质量审计）

### 3.3 QA任务消息构建

传递给QA Agent的消息必须包含足够上下文，使其能独立完成核查：

```
质量核查任务 [自动触发]

原始任务: {original_label}
执行Agent: {original_agent}
任务摘要: {task_summary}
执行结果: {result_summary}
产出物路径: {artifact_path}
核查类型: {qa_type} (code-qa / doc-qa)

请执行以下核查：
1. 读取产出物文件，检查质量
2. 根据核查类型使用对应checklist
3. 将核查报告写入 /root/.openclaw/workspace/reports/qa-{original_label}-{date}.md
4. 报告格式：评级(通过/有条件通过/不通过) + 问题列表 + 改进建议

注意：
- 所有文件路径使用绝对路径
- 核查完成后更新看板
- 这是自动触发的QA任务，不需要等待人工确认
```

### 3.4 无限循环防护（三层防护）

这是本设计最关键的安全机制。reviewer完成后绝不能再触发reviewer。

#### Layer 1: agentId前缀匹配（已有，需增强）

**当前代码**（精确匹配，有漏洞）:
```bash
case "$AGENT_ID" in
  coder*|writer*|researcher*) NEED_QA="true" ;;
  reviewer*|analyst*) NEED_QA="false" ;;
esac
```

当前已经是前缀匹配（`coder*`），这一层OK。但需要确保所有QA Agent的agentId都能被 `reviewer*|analyst*` 匹配到。

验证：
- `reviewer` → 匹配 `reviewer*` ✅
- `reviewer-02` → 匹配 `reviewer*` ✅
- `analyst-02` → 匹配 `analyst*` ✅

**结论：Layer 1 已覆盖，无需修改。**

#### Layer 2: qa_depth 字段（新增）

在队列文件中加入 `qa_depth` 字段：

```json
{
  "original_label": "fix-something",
  "qa_depth": 0,
  "...": "..."
}
```

- 开发Agent完成 → 生成队列文件，`qa_depth = 0`
- 如果QA Agent的完成事件意外触发了QA逻辑（Layer 1失效），检查 `qa_depth`
- `qa_depth >= 1` → 强制跳过，写告警日志

```bash
# 在NEED_QA判断后追加
if [ "$NEED_QA" = "true" ]; then
  # 检查是否是QA任务的QA（防递归）
  QA_DEPTH=$(echo "$SUMMARY" | grep -oP 'qa_depth=\K[0-9]+' || echo "0")
  if [ "$QA_DEPTH" -ge 1 ]; then
    echo "⛔ 循环防护: qa_depth=$QA_DEPTH >= 1，跳过QA触发"
    NEED_QA="false"
  fi
fi
```

#### Layer 3: 任务标签前缀检测（新增）

QA任务的label统一使用 `qa-` 前缀：

```bash
# 如果任务label以qa-开头，绝不触发QA
case "$TASK_ID" in
  qa-*|auto-qa-*) NEED_QA="false"; echo "⛔ 循环防护: QA任务不触发QA" ;;
esac
```

#### 防护总结

| 层级 | 机制 | 防护对象 | 失效条件 |
|------|------|---------|---------|
| L1 | agentId前缀匹配 | reviewer*/analyst* | 新增QA Agent未加入排除列表 |
| L2 | qa_depth字段 | 递归深度 | summary中未携带qa_depth |
| L3 | 任务label前缀 | qa-*/auto-qa-* | label命名不规范 |

三层独立防护，任意一层生效即可阻断循环。三层同时失效的概率极低。

### 3.5 completion-handler.sh 改造点

在现有 `Step 2` 之后、`Step 3` 之前，插入自动派发逻辑：

```bash
# ===== AUTO-QA 自动派发 [新增] =====
if [ "$NEED_QA" = "true" ] && [ -n "$AUTO_QA_FILE" ] && [ -f "$AUTO_QA_FILE" ]; then

  # --- 循环防护 Layer 3: label前缀检测 ---
  case "$TASK_ID" in
    qa-*|auto-qa-*) NEED_QA="false"; echo "⛔ 循环防护L3: QA任务不触发QA" ;;
  esac
fi

if [ "$NEED_QA" = "true" ] && [ -n "$AUTO_QA_FILE" ] && [ -f "$AUTO_QA_FILE" ]; then

  # --- 选择QA Agent（轮询） ---
  QA_STATE_FILE="/root/.openclaw/workspace/logs/auto-qa-reviewer-state.json"
  QA_REVIEWERS='["reviewer","reviewer-02","analyst-02"]'

  if [ ! -f "$QA_STATE_FILE" ]; then
    echo '{"last_index":-1,"reviewers":["reviewer","reviewer-02","analyst-02"]}' > "$QA_STATE_FILE"
  fi

  LAST_IDX=$(jq '.last_index // -1' "$QA_STATE_FILE" 2>/dev/null || echo "-1")
  NEXT_IDX=$(( (LAST_IDX + 1) % 3 ))
  QA_AGENT=$(echo "$QA_REVIEWERS" | jq -r ".[$NEXT_IDX]")

  # 更新轮询状态
  jq --argjson idx "$NEXT_IDX" '.last_index = $idx' "$QA_STATE_FILE" > "${QA_STATE_FILE}.tmp" \
    && mv "${QA_STATE_FILE}.tmp" "$QA_STATE_FILE"

  # --- 构建QA任务消息 ---
  QA_LABEL="qa-${SAFE_LABEL}"
  QA_TASK_SUMMARY=$(jq -r '.task_summary // ""' "$AUTO_QA_FILE" 2>/dev/null)
  QA_RESULT_SUMMARY=$(jq -r '.result_summary // ""' "$AUTO_QA_FILE" 2>/dev/null)
  QA_ARTIFACT=$(jq -r '.artifact_path // "未知"' "$AUTO_QA_FILE" 2>/dev/null)

  QA_MESSAGE="质量核查任务 [自动触发]

原始任务: ${TASK_ID}
执行Agent: ${AGENT_ID}
任务摘要: ${QA_TASK_SUMMARY}
执行结果: ${QA_RESULT_SUMMARY}
产出物路径: ${QA_ARTIFACT}
核查类型: ${QA_TYPE}
qa_depth=1

请执行以下核查：
1. 读取产出物文件，检查质量
2. 根据核查类型(${QA_TYPE})使用对应checklist
3. 将核查报告写入 /root/.openclaw/workspace/reports/qa-${SAFE_LABEL}-$(date +%Y-%m-%d).md
4. 报告包含：评级(通过/有条件通过/不通过) + 问题列表 + 改进建议
5. 所有文件路径使用绝对路径"

  # --- 后台触发QA Agent ---
  QA_SPAWN_LOG="/root/.openclaw/workspace/logs/auto-qa-spawn.log"
  echo "[$(date -Iseconds)] Dispatching QA: agent=$QA_AGENT label=$QA_LABEL task=$TASK_ID" >> "$QA_SPAWN_LOG"

  nohup openclaw agent \
    --agent "$QA_AGENT" \
    --message "$QA_MESSAGE" \
    --timeout 300 \
    >> "$QA_SPAWN_LOG" 2>&1 &

  QA_PID=$!
  echo "🚀 AUTO_QA已派发: agent=$QA_AGENT pid=$QA_PID label=$QA_LABEL"

  # --- 更新队列文件状态 ---
  jq --arg agent "$QA_AGENT" --arg pid "$QA_PID" \
    '.status = "dispatched" | .qa_agent = $agent | .qa_pid = ($pid|tonumber) | .dispatched_at = (now|todate)' \
    "$AUTO_QA_FILE" > "${AUTO_QA_FILE}.tmp" \
    && mv "${AUTO_QA_FILE}.tmp" "$AUTO_QA_FILE"

fi
# ===== AUTO-QA 自动派发结束 =====
```

### 3.6 结果回收

QA Agent完成后，结果通过两个通道回收：

#### 通道1: QA Agent直接写入（主通道）

QA Agent在执行过程中直接：
- 写报告到 `/root/.openclaw/workspace/reports/qa-{label}-{date}.md`
- 通过 `update-task.sh` 更新看板

这是最可靠的通道，因为QA Agent有完整的文件系统访问权限。

#### 通道2: completion-handler.sh 更新队列状态（辅助通道）

QA Agent完成后，completion-handler.sh 被触发（agentId=reviewer*），此时：
- 正常更新task-board
- 不触发新QA（循环防护）
- 可选：扫描对应的队列文件，将status从 `dispatched` 更新为 `completed`

```bash
# 在completion-handler.sh中，reviewer完成时的额外处理
case "$AGENT_ID" in
  reviewer*|analyst-02)
    # 尝试关闭对应的QA队列文件
    QA_QUEUE_DIR="/root/.openclaw/workspace/logs/auto-qa-queue"
    MATCHING_QA=$(find "$QA_QUEUE_DIR" -name "*.json" -exec grep -l "\"qa_agent\":\"$AGENT_ID\"" {} \; \
      | xargs -I{} jq -r 'select(.status=="dispatched") | input_filename' {} 2>/dev/null | head -1)
    if [ -n "$MATCHING_QA" ]; then
      jq '.status = "completed" | .completed_at = (now|todate)' "$MATCHING_QA" > "${MATCHING_QA}.tmp" \
        && mv "${MATCHING_QA}.tmp" "$MATCHING_QA"
    fi
    ;;
esac
```

### 3.7 Heartbeat兜底扫描

在 HEARTBEAT.md 中添加检查项，作为CLI spawn失败时的安全网：

```bash
# 扫描超过5分钟仍为pending的QA队列文件
QA_QUEUE_DIR="/root/.openclaw/workspace/logs/auto-qa-queue"
STALE_QA=$(find "$QA_QUEUE_DIR" -name "*.json" -mmin +5 \
  -exec jq -r 'select(.status=="pending") | .original_label' {} \; 2>/dev/null)

if [ -n "$STALE_QA" ]; then
  echo "⚠️ 发现未消费的QA队列文件（>5min）:"
  echo "$STALE_QA"
  echo "请手动派发reviewer核查，或检查auto-qa-spawn.log排查失败原因"
fi
```

---

## 四、文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `skills/public/multi-agent-reporting/completion-handler.sh` | 修改 | 在NEED_QA=true分支后插入自动派发逻辑 |
| `logs/auto-qa-reviewer-state.json` | 新增 | QA Agent轮询状态文件 |
| `logs/auto-qa-spawn.log` | 新增 | QA派发日志 |
| `HEARTBEAT.md` | 修改 | 添加QA队列兜底扫描项 |

**不需要修改的文件**:
- ⛔ `/root/.openclaw/openclaw.json` — 绝不修改
- `scripts/completion-handler.sh` — 薄封装层，无需改动
- `skills/isc-core/handlers/completion-handler.js` — JS层仅调用bash脚本，无需改动

---

## 五、风险评估

### 风险1: `openclaw agent` CLI 阻塞或失败

**概率**: 中
**影响**: QA任务未触发
**缓解**: 
- 后台执行（`nohup ... &`）确保不阻塞主流程
- `--timeout 300` 限制最长执行时间
- heartbeat兜底扫描捕获失败case

### 风险2: QA Agent无法访问产出物文件

**概率**: 低
**影响**: QA报告质量差
**缓解**: 
- 所有路径使用绝对路径
- 所有Agent在同一台机器上，文件系统共享
- QA消息中明确包含产出物路径

### 风险3: 并发QA任务过多导致资源争抢

**概率**: 低（当前开发Agent并发量有限）
**影响**: 系统变慢
**缓解**: 
- QA Agent timeout=300s，不会无限运行
- 轮询三个Agent分散负载
- 可在队列文件中加入并发限制（未来扩展）

### 风险4: 无限循环（最严重风险）

**概率**: 极低（三层防护）
**影响**: 系统雪崩
**缓解**: 三层独立防护（见3.4节），任意一层生效即阻断

---

## 六、实施步骤

### Phase 1: 基础设施（预计30分钟）

1. 创建 `logs/auto-qa-reviewer-state.json` 初始状态文件
2. 在 completion-handler.sh 中插入自动派发代码块（3.5节）
3. 添加循环防护 Layer 2 和 Layer 3

### Phase 2: 验证（预计20分钟）

1. 手动模拟：`bash completion-handler.sh test-task done "测试QA自动触发"`
2. 验证队列文件状态变为 `dispatched`
3. 验证 `auto-qa-spawn.log` 有派发记录
4. 验证reviewer Agent被正确触发
5. 验证reviewer完成后不触发新QA（循环防护）

### Phase 3: 兜底机制（预计10分钟）

1. 更新 HEARTBEAT.md 添加QA队列扫描项
2. 验证heartbeat能检测到stale队列文件

---

## 七、未来扩展

1. **QA checklist模板化**: 根据 `qa_type` 加载不同的checklist模板文件
2. **QA结果自动反馈**: 如果QA不通过，自动创建修复任务派给原开发Agent
3. **QA指标看板**: 统计QA通过率、常见问题类型、各Agent质量趋势
4. **并发控制**: 限制同时运行的QA任务数量
5. **智能选择**: 根据QA类型选择最合适的reviewer（而非简单轮询）

---

## 八、决策记录 (ADR)

**ADR-2026-03-10-001: 选择 `openclaw agent` CLI 作为QA触发机制**

- **背景**: 需要从bash脚本中程序化触发Agent执行
- **备选方案**: system event（仍需主Agent中转）、sessions_spawn（bash不可用）、标记文件+heartbeat（延迟高）
- **决策**: 使用 `openclaw agent --agent <id> --message <text>` 后台执行
- **理由**: 唯一能从bash直接触发指定Agent且不经过主Agent的方式
- **风险**: CLI可能阻塞或失败，通过后台执行+heartbeat兜底缓解
