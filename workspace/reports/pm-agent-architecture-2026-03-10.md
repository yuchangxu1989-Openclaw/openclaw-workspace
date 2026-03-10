# 项目经理Agent 24h常驻方案 — 架构设计

> 作者: researcher (系统架构师角色)
> 日期: 2026-03-10
> 状态: 设计稿 v1.0

---

## 一、问题定义

### 1.1 现状痛点

当前系统的质量闭环存在一个**认知断裂缺陷**：

```
coder完成 → completion-handler.sh输出"🔍 需要质量核查"
                     ↓
           主Agent"记得"去派QA ← 这里断了
                     ↓
              QA结果 → 主Agent"记得"去看 ← 这里也断了
                     ↓
           不通过 → 主Agent"记得"去派修复 ← 这里更断了
```

**根因**：completion-handler.sh只做了"信号输出"，没有做"信号驱动"。把"记住要做什么"的责任交给了一个每次都会忘记的主Agent（历史遗忘率100%）。

### 1.2 目标状态

```
coder完成 → completion-handler.sh自动触发QA → QA不通过自动派修复 → 修复后自动重QA
                                                                      ↓
                                                              全程无需主Agent介入
                                                              关键节点自动汇报
```

---

## 二、核心架构决策

### 2.1 PM不是一个"常驻进程"，是一个"事件驱动状态机"

**关键洞察**：OpenClaw的agent通过`sessions_spawn`调用，不是长期进程。试图让一个agent"24h常驻"违背了runtime的设计。

**正确做法**："PM"是一套**嵌入在completion pipeline中的自动化逻辑** + **一个按需唤醒的agent session** + **一个兜底sentinel cron**。

```
┌─────────────────────────────────────────────────────────┐
│                    PM 三层架构                           │
│                                                         │
│  L1: completion-handler.sh (事件触发层)                  │
│      → 检测QA需求 → 直接派发QA任务                      │
│      → 检测QA结果 → 通过/不通过自动流转                 │
│      → 100%可靠，每个completion event必经                │
│                                                         │
│  L2: PM Agent Session (决策层)                          │
│      → 处理复杂决策（多次QA失败、跨任务依赖）            │
│      → 通过 openclaw agent 按需唤醒                     │
│      → 管理QA pipeline状态，生成进度报告                 │
│                                                         │
│  L3: PM Sentinel Cron (兜底层)                          │
│      → 每5分钟扫描一次，捕捉任何被遗漏的QA请求          │
│      → 检测stuck任务（QA超时未返回）                     │
│      → 确保零遗漏                                       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 2.2 三层的职责划分

| 层 | 触发方式 | 职责 | 延迟 |
|---|---|---|---|
| L1 completion-handler | 每个agent完成时自动调用 | 简单QA派发、结果路由 | 0（实时） |
| L2 PM Agent | `openclaw agent`按需调用 | 复杂决策、报告生成、升级处理 | 5-30秒 |
| L3 Sentinel Cron | 每5分钟 | 兜底检查、stuck检测、遗漏修复 | ≤5分钟 |

---

## 三、开发→QA→修复 自动流转链路

### 3.1 任务生命周期状态机

```
                                    ┌─────────────────────┐
                                    │                     │
 ┌────────┐   完成    ┌──────────┐  │  通过   ┌─────────┐ │
 │running │ ───────→ │qa_pending│──┼──────→ │qa_passed│ │
 └────────┘          └──────────┘  │        └─────────┘ │
                          │        │                     │
                          │ 派QA   │                     │
                          ↓        │                     │
                     ┌──────────┐  │                     │
                     │qa_running│  │                     │
                     └──────────┘  │                     │
                          │        │                     │
                     QA完成│        │                     │
                          ↓        │                     │
                    ┌──────────┐   │  ┌───────────────┐  │
                    │qa_review │───┘  │fix_running    │  │
                    └──────────┘      └───────────────┘  │
                          │ 不通过          ↑             │
                          ↓                │             │
                    ┌──────────┐      修复完成           │
                    │fix_needed│──────────┘              │
                    └──────────┘                         │
                          │ 重试≥3次                     │
                          ↓                              │
                    ┌──────────┐                         │
                    │escalated │─────────────────────────┘
                    └──────────┘   升级给主Agent
```

### 3.2 任务元数据扩展

在 task-board 的每个任务记录中增加QA相关字段：

```json
{
  "taskId": "xxx",
  "label": "feature-login-api",
  "agentId": "coder",
  "status": "done",
  "qa_status": "qa_pending",     // 新增：QA流程状态
  "qa_task_id": null,            // 新增：关联的QA任务ID  
  "qa_attempts": 0,              // 新增：QA尝试次数
  "qa_max_attempts": 3,          // 新增：最大QA次数
  "qa_history": [],              // 新增：QA历史记录
  "fix_task_id": null,           // 新增：关联的修复任务ID
  "artifact_path": "/path/to/output.md",  // 产出物路径
  "original_task": "实现登录API"   // 原始任务描述
}
```

### 3.3 自动流转的具体实现

#### Step 1: completion-handler.sh 检测并派发QA

当 coder/writer/researcher 完成任务时，completion-handler.sh 已经能检测到 `NEED_QA="true"`。

**现在**：只输出 `🔍 需要质量核查`（靠人记住）

**改为**：直接调用 `pm-dispatch-qa.sh` 自动派发

```bash
# 在 completion-handler.sh 中，NEED_QA="true" 分支改为：
if [ "$NEED_QA" = "true" ]; then
  echo "🔍 自动派发质量核查：$TASK_ID (by $AGENT_ID)"
  bash /root/.openclaw/workspace/skills/pm-agent/pm-dispatch-qa.sh \
    "$TASK_ID" "$AGENT_ID" "$SUMMARY"
fi
```

#### Step 2: pm-dispatch-qa.sh 核心逻辑

```bash
#!/bin/bash
# pm-dispatch-qa.sh - PM自动派发QA
# 用法: pm-dispatch-qa.sh <原任务label> <原agent_id> <任务摘要>

TASK_LABEL="$1"
ORIGINAL_AGENT="$2"
SUMMARY="$3"
BOARD_FILE="/root/.openclaw/workspace/logs/subagent-task-board.json"
PM_STATE="/root/.openclaw/workspace/logs/pm-qa-pipeline.json"

# 1. 确定QA角色（不能是原执行者）
QA_AGENTS=("analyst" "reviewer")
QA_AGENT="${QA_AGENTS[0]}"
if [ "$ORIGINAL_AGENT" = "analyst" ]; then
  QA_AGENT="reviewer"
elif [ "$ORIGINAL_AGENT" = "reviewer" ]; then
  QA_AGENT="analyst"
fi

# 2. 提取产出物路径
ARTIFACT=$(node -e "
const b=JSON.parse(require('fs').readFileSync('$BOARD_FILE','utf8'));
const t=b.filter(t=>t.label==='$TASK_LABEL').pop();
console.log(t?.artifact_path || t?.result_summary || '');
" 2>/dev/null)

# 3. 构造QA任务指令
QA_LABEL="qa-${TASK_LABEL}"
QA_TASK="质量核查任务 — 核查 ${TASK_LABEL} (by ${ORIGINAL_AGENT}) 的产出。
摘要: ${SUMMARY}
产出物: ${ARTIFACT}

核查要求:
1. 检查产出是否符合任务要求
2. 检查代码/文档质量
3. 检查是否有遗漏或错误
4. 输出核查报告到 /root/.openclaw/workspace/logs/qa-reports/${QA_LABEL}.json

报告格式:
{
  \"task_label\": \"${TASK_LABEL}\",
  \"verdict\": \"pass\" 或 \"fail\",
  \"score\": 0-100,
  \"issues\": [\"问题1\", \"问题2\"],
  \"suggestions\": [\"建议1\"],
  \"summary\": \"一句话结论\"
}

verdict=pass 当且仅当 score≥70 且无P0级问题。"

# 4. 通过 openclaw agent 触发主Agent的spawning能力
#    （因为bash无法直接调sessions_spawn，通过消息驱动主Agent）
openclaw agent \
  --session-id "agent:main:main" \
  --message "[PM-AUTO-QA] 请立即派发质量核查任务:
agent: ${QA_AGENT}
label: ${QA_LABEL}
task: ${QA_TASK}
描述: 自动QA-${TASK_LABEL}

⚠️ 这是PM自动派发的QA任务，无需确认，直接spawn。" \
  --timeout 30 2>/dev/null &

# 5. 更新task board中原任务的QA状态
node -e "
const fs=require('fs');
const b=JSON.parse(fs.readFileSync('$BOARD_FILE','utf8'));
const t=b.find(t=>t.label==='$TASK_LABEL');
if(t){
  t.qa_status='qa_pending';
  t.qa_task_id='$QA_LABEL';
  t.qa_attempts=(t.qa_attempts||0)+1;
  fs.writeFileSync('$BOARD_FILE',JSON.stringify(b,null,2));
}
" 2>/dev/null

# 6. 记录PM流水线状态
mkdir -p /root/.openclaw/workspace/logs/qa-reports
node -e "
const fs=require('fs');
const path='$PM_STATE';
let state=[];
try{state=JSON.parse(fs.readFileSync(path,'utf8'));}catch(e){}
state.push({
  original_task:'$TASK_LABEL',
  original_agent:'$ORIGINAL_AGENT',
  qa_agent:'$QA_AGENT',
  qa_label:'$QA_LABEL',
  qa_dispatched_at:new Date().toISOString(),
  status:'qa_running',
  attempt:1
});
fs.writeFileSync(path,JSON.stringify(state,null,2));
" 2>/dev/null

echo "✅ PM已自动派发QA: ${QA_LABEL} → ${QA_AGENT}"
```

#### Step 3: QA结果自动处理

QA agent完成后，completion-handler.sh再次运行。这次需要识别这是一个QA任务，并处理结果：

```bash
# 在 completion-handler.sh 中增加QA结果处理逻辑
# 检测是否为QA任务完成
if [[ "$TASK_ID" == qa-* ]]; then
  echo "📋 QA任务完成: $TASK_ID"
  bash /root/.openclaw/workspace/skills/pm-agent/pm-handle-qa-result.sh \
    "$TASK_ID" "$STATUS" "$SUMMARY"
fi
```

#### Step 4: pm-handle-qa-result.sh

```bash
#!/bin/bash
# QA结果处理 - 通过则标记完成，不通过则派修复
QA_LABEL="$1"
STATUS="$2"
SUMMARY="$3"
ORIGINAL_LABEL="${QA_LABEL#qa-}"  # 去掉 qa- 前缀得到原任务label
BOARD_FILE="/root/.openclaw/workspace/logs/subagent-task-board.json"
QA_REPORT="/root/.openclaw/workspace/logs/qa-reports/${QA_LABEL}.json"
PM_STATE="/root/.openclaw/workspace/logs/pm-qa-pipeline.json"
MAX_QA_ATTEMPTS=3

# 读取QA报告
VERDICT="unknown"
if [ -f "$QA_REPORT" ]; then
  VERDICT=$(jq -r '.verdict // "unknown"' "$QA_REPORT" 2>/dev/null)
fi

# 从summary中推断verdict（备用）
if [ "$VERDICT" = "unknown" ]; then
  if echo "$SUMMARY" | grep -qiE "pass|通过|合格"; then
    VERDICT="pass"
  elif echo "$SUMMARY" | grep -qiE "fail|不通过|不合格|问题"; then
    VERDICT="fail"
  fi
fi

# 获取当前QA尝试次数
QA_ATTEMPTS=$(node -e "
const b=JSON.parse(require('fs').readFileSync('$BOARD_FILE','utf8'));
const t=b.find(t=>t.label==='$ORIGINAL_LABEL');
console.log(t?.qa_attempts||0);
" 2>/dev/null)

if [ "$VERDICT" = "pass" ]; then
  echo "✅ QA通过: $ORIGINAL_LABEL"
  # 更新原任务状态
  node -e "
  const fs=require('fs');
  const b=JSON.parse(fs.readFileSync('$BOARD_FILE','utf8'));
  const t=b.find(t=>t.label==='$ORIGINAL_LABEL');
  if(t){
    t.qa_status='qa_passed';
    t.qa_history=(t.qa_history||[]);
    t.qa_history.push({attempt:$QA_ATTEMPTS,verdict:'pass',time:new Date().toISOString()});
    fs.writeFileSync('$BOARD_FILE',JSON.stringify(b,null,2));
  }
  " 2>/dev/null
  
  # 汇报给主Agent（关键节点通知）
  openclaw agent \
    --session-id "agent:main:main" \
    --message "[PM-QA-PASS] ✅ ${ORIGINAL_LABEL} 质量核查通过 (第${QA_ATTEMPTS}次)" \
    --timeout 15 2>/dev/null &

elif [ "$VERDICT" = "fail" ] && [ "$QA_ATTEMPTS" -lt "$MAX_QA_ATTEMPTS" ]; then
  echo "❌ QA不通过: $ORIGINAL_LABEL (第${QA_ATTEMPTS}/${MAX_QA_ATTEMPTS}次)"
  
  # 提取QA发现的问题
  ISSUES=""
  if [ -f "$QA_REPORT" ]; then
    ISSUES=$(jq -r '.issues // [] | join("; ")' "$QA_REPORT" 2>/dev/null)
  fi
  [ -z "$ISSUES" ] && ISSUES="$SUMMARY"
  
  # 自动派修复任务
  FIX_LABEL="fix-${ORIGINAL_LABEL}-r${QA_ATTEMPTS}"
  bash /root/.openclaw/workspace/skills/pm-agent/pm-dispatch-fix.sh \
    "$ORIGINAL_LABEL" "$FIX_LABEL" "$ISSUES" "$QA_ATTEMPTS"

else
  echo "🚨 QA多次不通过，升级: $ORIGINAL_LABEL (${QA_ATTEMPTS}/${MAX_QA_ATTEMPTS}次)"
  
  # 升级给主Agent决策
  node -e "
  const fs=require('fs');
  const b=JSON.parse(fs.readFileSync('$BOARD_FILE','utf8'));
  const t=b.find(t=>t.label==='$ORIGINAL_LABEL');
  if(t){
    t.qa_status='escalated';
    fs.writeFileSync('$BOARD_FILE',JSON.stringify(b,null,2));
  }
  " 2>/dev/null
  
  openclaw agent \
    --session-id "agent:main:main" \
    --message "[PM-ESCALATE] 🚨 ${ORIGINAL_LABEL} 经${QA_ATTEMPTS}次QA仍不通过，需主Agent裁决。
问题摘要: ${SUMMARY}
请决定: 1.放弃 2.手动介入 3.换模型重做" \
    --timeout 30 2>/dev/null &
fi
```

#### Step 5: pm-dispatch-fix.sh — 派修复任务

```bash
#!/bin/bash
# 自动派修复任务
ORIGINAL_LABEL="$1"
FIX_LABEL="$2"
ISSUES="$3"
ATTEMPT="$4"
BOARD_FILE="/root/.openclaw/workspace/logs/subagent-task-board.json"

# 获取原任务信息
ORIGINAL_INFO=$(node -e "
const b=JSON.parse(require('fs').readFileSync('$BOARD_FILE','utf8'));
const t=b.find(t=>t.label==='$ORIGINAL_LABEL');
console.log(JSON.stringify({agentId:t?.agentId,task:t?.original_task||t?.description}));
" 2>/dev/null)

ORIGINAL_AGENT=$(echo "$ORIGINAL_INFO" | jq -r '.agentId')
ORIGINAL_TASK=$(echo "$ORIGINAL_INFO" | jq -r '.task')

# 派修复任务（用原agent修复自己的问题）
FIX_TASK="修复任务 — 修复 ${ORIGINAL_LABEL} 的QA问题（第${ATTEMPT}次修复）。

原任务: ${ORIGINAL_TASK}
QA发现的问题: ${ISSUES}

要求:
1. 逐一修复上述问题
2. 修复后自验一遍
3. 输出修复报告说明改了什么"

# 更新原任务状态
node -e "
const fs=require('fs');
const b=JSON.parse(fs.readFileSync('$BOARD_FILE','utf8'));
const t=b.find(t=>t.label==='$ORIGINAL_LABEL');
if(t){
  t.qa_status='fix_running';
  t.fix_task_id='$FIX_LABEL';
  fs.writeFileSync('$BOARD_FILE',JSON.stringify(b,null,2));
}
" 2>/dev/null

# 通过主Agent派发（因为只有Agent session能调sessions_spawn）
openclaw agent \
  --session-id "agent:main:main" \
  --message "[PM-AUTO-FIX] 请立即派发修复任务:
agent: ${ORIGINAL_AGENT}
label: ${FIX_LABEL}
task: ${FIX_TASK}
描述: 自动修复-${ORIGINAL_LABEL}-第${ATTEMPT}次

⚠️ 这是PM自动派发的修复任务，无需确认，直接spawn。" \
  --timeout 30 2>/dev/null &

echo "🔧 PM已自动派发修复: ${FIX_LABEL} → ${ORIGINAL_AGENT}"
```

---

## 四、PM感知任务完成事件的机制

### 4.1 事件流

```
┌──────────────────────────────────────────────────────────────────┐
│                        事件流                                     │
│                                                                  │
│  Agent完成 ──→ OpenClaw Runtime ──→ 主Agent收到completion event  │
│                                          │                       │
│                                          ↓                       │
│                                  completion-handler.sh           │
│                                          │                       │
│                                    ┌─────┼─────┐                │
│                                    │     │     │                 │
│                                    ↓     ↓     ↓                 │
│                              普通完成  QA完成  修复完成           │
│                                │       │       │                 │
│                                ↓       ↓       ↓                 │
│                          pm-dispatch pm-handle pm-dispatch        │
│                          -qa.sh    -qa-result  -qa.sh            │
│                                    .sh        (重新QA)           │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 4.2 任务类型识别

completion-handler.sh通过**label前缀**识别任务类型：

| 前缀 | 类型 | 处理方式 |
|---|---|---|
| `qa-*` | QA核查任务 | 调用 pm-handle-qa-result.sh |
| `fix-*-r*` | 修复任务 | 修复完成后自动重新派QA |
| 其他 | 普通开发任务 | 检查agentId决定是否需要QA |

### 4.3 修复任务完成后的自动重QA

```bash
# 在 completion-handler.sh 中增加
# 修复任务完成 → 自动重新QA
if [[ "$TASK_ID" == fix-* ]]; then
  # 提取原任务label: fix-feature-login-api-r1 → feature-login-api
  ORIGINAL_LABEL=$(echo "$TASK_ID" | sed 's/^fix-//; s/-r[0-9]*$//')
  echo "🔄 修复完成，自动重新QA: $ORIGINAL_LABEL"
  bash /root/.openclaw/workspace/skills/pm-agent/pm-dispatch-qa.sh \
    "$ORIGINAL_LABEL" "$AGENT_ID" "修复完成: $SUMMARY"
fi
```

---

## 五、PM报告机制

### 5.1 自动报告触发时机

| 事件 | 报告内容 | 推送目标 |
|---|---|---|
| QA通过 | `✅ {task} 质量核查通过` | 主Agent session |
| QA不通过+已派修复 | `❌ {task} QA不通过，已自动派修复（第N次）` | 主Agent session |
| QA多次不通过→升级 | `🚨 {task} 需主Agent裁决` | 主Agent session + 飞书 |
| 每日汇总 | PM日报（通过率、修复率、升级数） | 飞书 |

### 5.2 PM日报 (cron 每天22:00)

```bash
#!/bin/bash
# pm-daily-report.sh
PM_STATE="/root/.openclaw/workspace/logs/pm-qa-pipeline.json"
DATE=$(TZ=Asia/Shanghai date +%Y-%m-%d)

# 统计今日QA数据
node -e "
const fs=require('fs');
const state=JSON.parse(fs.readFileSync('$PM_STATE','utf8'));
const today=state.filter(s=>s.qa_dispatched_at?.startsWith('$DATE'));
const passed=today.filter(s=>s.status==='qa_passed').length;
const failed=today.filter(s=>s.status==='fix_needed').length;
const escalated=today.filter(s=>s.status==='escalated').length;
const total=today.length;

console.log('📊 PM日报 $DATE');
console.log('QA总数: ' + total);
console.log('通过: ' + passed + ' (' + (total?Math.round(passed/total*100):0) + '%)');
console.log('修复后通过: ' + failed);
console.log('升级: ' + escalated);
console.log('首次通过率: ' + (total?Math.round(passed/total*100):0) + '%');
" 2>/dev/null
```

### 5.3 飞书推送集成

PM的关键通知（升级、日报）通过已有的飞书推送基础设施发送：

```bash
# 复用 push-feishu-board.sh 的feishu API调用模式
bash /root/.openclaw/workspace/skills/pm-agent/pm-push-feishu.sh "$MESSAGE"
```

---

## 六、与主Agent的协作边界

### 6.1 职责划分

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│  主Agent（战略层）                                    │
│  ├── 接收用户需求，做战略判断                          │
│  ├── 决定做什么、不做什么                              │
│  ├── 分派开发/写作/研究任务                            │
│  ├── 处理PM的升级请求                                 │
│  └── 最终决策权                                      │
│                                                      │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│                                                      │
│  PM（执行质量层）                                     │
│  ├── 自动派发QA（不问主Agent）                        │
│  ├── 自动派修复（不问主Agent）                        │
│  ├── 管理QA pipeline状态                             │
│  ├── 关键节点通知主Agent                              │
│  ├── QA多次不通过时升级给主Agent                      │
│  └── 生成质量报告                                    │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### 6.2 PM的权限边界

**PM可以自主做的事**：
- 派发QA任务（analyst/reviewer）
- 派发修复任务（回到原agent）
- 更新task board的QA状态
- 发送通知/报告

**PM不能做的事（必须升级给主Agent）**：
- 决定是否放弃某个任务
- 更换agent类型（如coder→researcher）
- 创建新的开发任务
- 修改SOUL.md/AGENTS.md等核心文件

### 6.3 主Agent对PM消息的处理协议

主Agent需要识别PM的消息前缀并相应处理：

| 前缀 | 含义 | 主Agent应做 |
|---|---|---|
| `[PM-AUTO-QA]` | PM请求派发QA | 直接执行sessions_spawn，不问用户 |
| `[PM-AUTO-FIX]` | PM请求派发修复 | 直接执行sessions_spawn，不问用户 |
| `[PM-QA-PASS]` | QA通过通知 | 记录，无需行动 |
| `[PM-ESCALATE]` | PM升级请求 | 需要决策，考虑是否通知用户 |
| `[PM-DAILY]` | PM日报 | 转发给用户或存档 |

**关键**：`[PM-AUTO-QA]` 和 `[PM-AUTO-FIX]` 消息必须被主Agent无条件执行。这是PM架构的核心保证——如果主Agent还是"选择性遗忘"，整个方案就失效了。

**程序化保证**：在主Agent的SOUL.md中增加ISC规则，检测到`[PM-AUTO-*]`前缀时强制执行spawn，不经过意图分析。

---

## 七、L3兜底: PM Sentinel Cron

### 7.1 sentinel的职责

每5分钟运行一次，检查：

1. **遗漏检测**：task board上有 `status=done` + `qa_status` 未设置 + `agentId` 为 coder/writer/researcher → 应该有QA但没派
2. **stuck检测**：`qa_status=qa_running` 超过30分钟未完成 → QA agent可能挂了
3. **pipeline完整性**：`qa_status=fix_running` 超过30分钟 → 修复可能挂了

### 7.2 sentinel脚本

```bash
#!/bin/bash
# pm-sentinel.sh - 每5分钟运行，确保QA pipeline无遗漏
BOARD_FILE="/root/.openclaw/workspace/logs/subagent-task-board.json"
NOW=$(date +%s)
STUCK_THRESHOLD=1800  # 30分钟

[ ! -f "$BOARD_FILE" ] && exit 0

# 检查1: 已完成但未派QA的任务
node -e "
const fs=require('fs');
const b=JSON.parse(fs.readFileSync('$BOARD_FILE','utf8'));
const missed=b.filter(t=>
  t.status==='done' && 
  !t.qa_status &&
  ['coder','writer','researcher'].includes(t.agentId) &&
  !t.label.startsWith('qa-') &&
  !t.label.startsWith('fix-')
);
if(missed.length>0){
  console.log('MISSED:'+missed.map(t=>t.label).join(','));
}
" 2>/dev/null | while read -r line; do
  if [[ "$line" == MISSED:* ]]; then
    LABELS="${line#MISSED:}"
    IFS=',' read -ra ARR <<< "$LABELS"
    for label in "${ARR[@]}"; do
      echo "🚨 Sentinel: 发现遗漏QA: $label"
      # 获取agentId和summary
      INFO=$(node -e "
      const b=JSON.parse(require('fs').readFileSync('$BOARD_FILE','utf8'));
      const t=b.find(t=>t.label==='$label');
      console.log((t?.agentId||'unknown')+'|'+(t?.result_summary||''));
      " 2>/dev/null)
      AGENT_ID="${INFO%%|*}"
      SUMMARY="${INFO#*|}"
      bash /root/.openclaw/workspace/skills/pm-agent/pm-dispatch-qa.sh \
        "$label" "$AGENT_ID" "$SUMMARY"
    done
  fi
done

# 检查2: QA超时
node -e "
const fs=require('fs');
const b=JSON.parse(fs.readFileSync('$BOARD_FILE','utf8'));
const now=Date.now();
const stuck=b.filter(t=>
  t.qa_status==='qa_running' && 
  t.qa_dispatched_at &&
  (now - new Date(t.qa_dispatched_at).getTime()) > $STUCK_THRESHOLD*1000
);
if(stuck.length>0){
  console.log('STUCK:'+stuck.map(t=>t.label).join(','));
}
" 2>/dev/null | while read -r line; do
  if [[ "$line" == STUCK:* ]]; then
    echo "⏰ Sentinel: QA超时，需检查: ${line#STUCK:}"
  fi
done
```

### 7.3 cron配置

```
*/5 * * * * flock -xn /tmp/pm-sentinel.lock bash /root/.openclaw/workspace/skills/pm-agent/pm-sentinel.sh >> /root/.openclaw/workspace/logs/pm-sentinel.log 2>&1
0 22 * * * bash /root/.openclaw/workspace/skills/pm-agent/pm-daily-report.sh >> /root/.openclaw/workspace/logs/pm-daily-report.log 2>&1
```

---

## 八、Agent Slot资源管理

### 8.1 Slot分配策略

总共19个slot，主Agent占1个。PM不占固定slot（因为PM逻辑在bash脚本中）。

QA和修复任务使用普通slot：
- 一般QA任务1个slot（analyst或reviewer）
- 修复任务1个slot（原agent类型）
- 同时最多N个QA在跑（建议限制≤3，避免QA占满slot影响新开发任务）

### 8.2 QA并发控制

```bash
# 在 pm-dispatch-qa.sh 中增加并发控制
RUNNING_QA=$(node -e "
const b=JSON.parse(require('fs').readFileSync('$BOARD_FILE','utf8'));
console.log(b.filter(t=>t.label.startsWith('qa-')&&t.status==='running').length);
" 2>/dev/null)

MAX_QA_CONCURRENT=3
if [ "$RUNNING_QA" -ge "$MAX_QA_CONCURRENT" ]; then
  echo "⏸️ QA并发已满(${RUNNING_QA}/${MAX_QA_CONCURRENT})，加入等待队列"
  # 写入QA等待队列，sentinel会定期检查并派发
  exit 0
fi
```

---

## 九、实现步骤

### Phase 1: 基础骨架（~2小时）

**Step 1.1**: 创建 `skills/pm-agent/` 技能目录
- `SKILL.md` - 技能文档
- `pm-dispatch-qa.sh` - QA派发脚本
- `pm-handle-qa-result.sh` - QA结果处理脚本
- `pm-dispatch-fix.sh` - 修复派发脚本
- `pm-sentinel.sh` - 兜底sentinel
- `pm-daily-report.sh` - 日报生成

**Step 1.2**: 修改 `completion-handler.sh`
- 在 `NEED_QA="true"` 分支调用 `pm-dispatch-qa.sh`
- 增加 `qa-*` 前缀识别和路由
- 增加 `fix-*` 前缀识别和重QA触发

**Step 1.3**: task board schema扩展
- 增加 `qa_status`, `qa_task_id`, `qa_attempts`, `qa_history` 字段
- 更新 `show-task-board-feishu.sh` 展示QA状态

### Phase 2: 主Agent集成（~1小时）

**Step 2.1**: 在主Agent的 `SOUL.md` 增加PM协议
- 识别 `[PM-AUTO-QA]`, `[PM-AUTO-FIX]` 消息
- ISC规则强制执行PM的spawn请求

**Step 2.2**: 在主Agent的 `AGENTS.md` 增加PM集成说明
- PM消息处理协议
- spawn模板

### Phase 3: 兜底和报告（~1小时）

**Step 3.1**: 配置sentinel cron
**Step 3.2**: 配置日报cron
**Step 3.3**: 飞书推送集成

### Phase 4: 测试验证（~1小时）

**Step 4.1**: 手动触发一个coder任务，观察QA是否自动派发
**Step 4.2**: 模拟QA失败，观察修复是否自动派发
**Step 4.3**: 模拟3次QA失败，观察是否升级
**Step 4.4**: 测试sentinel能否捕捉遗漏

---

## 十、方案对比与决策依据

### 10.1 三个备选方案

| 方案 | 描述 | 优势 | 劣势 |
|---|---|---|---|
| **A: 纯Agent常驻** | PM作为一个持久session，心跳保活 | 可做复杂决策 | 违背runtime设计，心跳成本高，session会超时 |
| **B: 纯脚本自动化** | completion-handler.sh自带全部PM逻辑 | 100%可靠，零额外成本 | 复杂决策能力有限 |
| **C: 脚本+按需Agent（推荐）** | L1脚本自动化 + L2 Agent按需唤醒 + L3 cron兜底 | 兼具可靠性和智能性 | 略复杂 |

**选择方案C**，因为：
1. 95%的QA流转是机械性的（派QA→看结果→通过/不通过），用脚本100%可靠
2. 5%的情况需要判断力（如QA报告模糊、多个任务有关联），用Agent处理
3. cron兜底确保即使L1有bug也不会彻底遗漏

### 10.2 不用方案A（纯Agent常驻）的原因

1. **sessions_spawn的session会超时** — 没有永不超时的session机制
2. **心跳保活成本** — 每次心跳都是一次agent turn（≈一次API调用），24h不间断 = 大量无效消耗
3. **PM的95%工作是机械性的** — 不需要LLM来决定"coder完成了→派QA"，bash脚本更可靠
4. **session重启后上下文丢失** — agent session重启后会丢失PM的内部状态（除非持久化到文件，但那就回到了方案C）

---

## 十一、风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| 主Agent忽略PM的spawn请求 | 中 | QA不会执行 | ISC规则强制执行 + sentinel兜底 |
| QA agent产出不标准（没写报告文件） | 高 | 无法判断pass/fail | summary关键词推断作为fallback |
| 修复agent没修好又说"已修复" | 中 | 死循环 | qa_max_attempts=3硬上限 + 升级机制 |
| completion-handler.sh被改坏 | 低 | 整个PM失效 | pre-commit hook保护 + sentinel独立检查 |
| slot被QA任务占满 | 中 | 无法接新开发任务 | QA并发上限=3 |

---

## 十二、未来演进

### Phase 5（中期）: PM智能化
- PM Agent学习历史QA数据，预测哪些任务容易QA不通过
- 对高风险任务预设更严格的QA标准
- 自动调整QA agent选择（哪个reviewer对哪类任务更靠谱）

### Phase 6（长期）: 去主Agent化
- 当PM的spawn请求模式稳定后，让completion-handler.sh直接调用gateway API spawn agent，完全绕过主Agent
- 这需要gateway暴露REST/CLI spawn API（当前不支持，需要向OpenClaw提feature request）

---

## 附录：关键文件清单

```
skills/pm-agent/
├── SKILL.md                    # PM技能文档
├── pm-dispatch-qa.sh           # QA派发
├── pm-handle-qa-result.sh      # QA结果处理
├── pm-dispatch-fix.sh          # 修复派发
├── pm-sentinel.sh              # 兜底sentinel
├── pm-daily-report.sh          # 日报
└── pm-push-feishu.sh           # 飞书通知

scripts/completion-handler.sh    # 需修改：增加QA/Fix路由
logs/
├── pm-qa-pipeline.json          # PM pipeline状态
├── qa-reports/                  # QA报告目录
│   ├── qa-feature-login-api.json
│   └── ...
└── pm-sentinel.log              # sentinel日志
```

---

*方案设计完成。核心思想：PM不是一个"人"，是一套自动化规则。用bash脚本保证机械性流转的100%可靠性，用Agent处理需要判断力的边缘情况，用cron兜底确保零遗漏。*
