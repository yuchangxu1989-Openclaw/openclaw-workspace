# Day3 Failover 受控故障演练方案

**日期**: 2026-03-06  
**版本**: v1.0  
**编制**: 系统架构师（researcher agent）  
**状态**: 待审批

---

## 1. 演练目标

| # | 目标 | 验证点 |
|---|------|--------|
| G1 | 验证 boom → claude fallback 链路在模型层的自动切换能力 | 当 boom 不可达时，请求是否在合理时间内切到 claude fallback |
| G2 | 验证 L3 Pipeline Feature Flag 降级机制在真实配置下的有效性 | 关闭某个 L3 模块 flag 后，Pipeline 是否正确降级 |
| G3 | 验证恢复路径：故障消除后系统是否自动回到 primary 模型 | boom 恢复后是否恢复为 primary，无需人工干预 |
| G4 | 采集 fallback 切换的可观测数据（延迟、错误日志、事件总线记录） | 告警引擎/metrics 能否捕获切换事件 |
| G5 | 建立故障演练 SOP，为后续常态化演练提供模板 | 本文档即 SOP |

---

## 2. 风险边界

### 2.1 绝对红线（不得触碰）

| # | 红线 | 原因 |
|---|------|------|
| R1 | **不修改生产 openclaw.json 的 provider 配置** | 配置文件是全局共享的，改了影响所有 agent |
| R2 | **不对 boom.aihuige.com 做网络层拦截（iptables/hosts）** | 会影响所有 agent 的所有 session，不可控 |
| R3 | **不在用户活跃会话中执行** | 避免中断正在进行的人机对话 |
| R4 | **不删除/重命名任何 API Key** | Key 变更不可逆，恢复成本高 |
| R5 | **不修改 cron-worker 的模型配置** | cron 任务是后台持续运行的，中断代价大 |

### 2.2 允许操作范围

| 允许项 | 条件 |
|--------|------|
| 在**隔离的测试脚本**中模拟 boom 超时/错误 | 脚本独立运行，不影响 Gateway |
| 修改**测试专用 Feature Flag** | 仅在测试执行期间临时修改，结束即恢复 |
| 读取 metrics/日志 | 只读操作 |
| 使用**空闲 agent**（如 scout/writer）做探针请求 | 非核心 agent，失败不影响主链路 |

### 2.3 爆炸半径控制

```
影响范围: 仅测试脚本进程内
持续时间: 每轮演练 ≤ 5 分钟
涉及 agent: scout（探针角色，非核心链路）
并发影响: 无（串行执行）
```

---

## 3. 最小扰动方案

### 3.1 演练一：模拟 boom 模型层失败（脚本隔离法）

**原理**: 不动生产配置，用独立脚本直接调用 OpenAI-compatible API，注入故障参数。

**步骤**:

```bash
# Step 1: 创建测试脚本 (不修改任何生产文件)
cat > /tmp/failover-drill-boom.sh << 'EOF'
#!/bin/bash
set -e
BOOM_URL="https://boom.aihuige.com/v1/chat/completions"
BOOM_KEY="sk-D0IEFjB37bpDC3TyYECUcyQkoRMElMuIxGNzteHbuUbzXLAp"

echo "=== [DRILL] Phase 1: Verify boom is alive ==="
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BOOM_URL" \
  -H "Authorization: Bearer $BOOM_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-5.4","messages":[{"role":"user","content":"ping"}],"max_tokens":5}' \
  --connect-timeout 5 --max-time 15)
HTTP_CODE=$(echo "$RESP" | tail -1)
echo "boom status: $HTTP_CODE"

echo "=== [DRILL] Phase 2: Simulate boom timeout (connect-timeout=1ms) ==="
START=$(date +%s%N)
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BOOM_URL" \
  -H "Authorization: Bearer $BOOM_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-5.4","messages":[{"role":"user","content":"ping"}],"max_tokens":5}' \
  --connect-timeout 0.001 --max-time 0.001 2>&1 || true)
END=$(date +%s%N)
echo "Simulated timeout response: $(echo $RESP | head -1)"
echo "Duration: $(( (END - START) / 1000000 ))ms"

echo "=== [DRILL] Phase 3: Verify boom still works after simulated failure ==="
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BOOM_URL" \
  -H "Authorization: Bearer $BOOM_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-5.4","messages":[{"role":"user","content":"ping"}],"max_tokens":5}' \
  --connect-timeout 5 --max-time 15)
HTTP_CODE=$(echo "$RESP" | tail -1)
echo "boom recovery status: $HTTP_CODE"
EOF
chmod +x /tmp/failover-drill-boom.sh
```

**观测方法**:
- 脚本输出直接显示每个阶段的 HTTP 状态码和延迟
- 对比 Phase 1 和 Phase 3 确认 boom 服务本身未受影响

### 3.2 演练二：OpenClaw 模型 Fallback 机制验证（影子 session 法）

**原理**: 用 `sessions_spawn` 创建一个隔离的子 agent session，通过指定不存在的 model 触发 fallback。

**步骤**:

```bash
# Step 1: 查看 OpenClaw 的 fallback 行为日志
# 在 scout agent 上 spawn 一个子 session，指定一个故意错误的 model
# OpenClaw Gateway 应自动 fallback 到配置的 fallback 模型

# Step 2: 观察 Gateway 日志
tail -f /root/.openclaw/logs/*.log | grep -i "fallback\|retry\|error\|model" &
LOG_PID=$!

# Step 3: spawn 子 session（scout 是非核心 agent）
# 通过 OpenClaw API 或 CLI 触发一次带有故障模型的请求
# 预期：boom-scout/gpt-5.4 失败 → 自动切到 claude-scout/claude-opus-4-6

# Step 4: 停止日志监听
kill $LOG_PID 2>/dev/null
```

**观测指标**:

| 指标 | 预期值 | 采集位置 |
|------|--------|----------|
| fallback 触发次数 | ≥ 1 | Gateway 日志 |
| fallback 延迟 | < 30s | Gateway 日志时间戳差 |
| fallback 后响应质量 | 正常完成 | session 输出 |
| 原 primary 状态 | 未受影响 | 其他 agent 正常工作 |

### 3.3 演练三：L3 Feature Flag 降级验证（已有测试扩展法）

**原理**: Day2 已有 9 场景降级测试全通过（day2-degradation-drill.md），Day3 扩展为在真实 Gateway 运行环境下验证。

**步骤**:

```bash
# Step 1: 记录当前 flags 状态
cp infrastructure/pipeline/flags.json /tmp/flags-backup-$(date +%s).json

# Step 2: 在测试脚本中临时修改单个 flag
node -e "
const flags = require('./infrastructure/pipeline/flags.json');
const original = JSON.parse(JSON.stringify(flags));

// 临时关闭 IntentScanner LLM 路径 → 降级到 regex
flags.L3_INTENTSCANNER_LLM_ENABLED = false;
require('fs').writeFileSync('./infrastructure/pipeline/flags.json', JSON.stringify(flags, null, 2));

// 执行一次 pipeline 处理
const pipeline = require('./infrastructure/pipeline');
pipeline.process({type: 'user.message', data: {text: 'failover-drill-test'}})
  .then(result => {
    console.log('Degraded result:', JSON.stringify(result));
    // 立即恢复
    require('fs').writeFileSync('./infrastructure/pipeline/flags.json', JSON.stringify(original, null, 2));
    console.log('Flags restored.');
  })
  .catch(err => {
    // 出错也要恢复
    require('fs').writeFileSync('./infrastructure/pipeline/flags.json', JSON.stringify(original, null, 2));
    console.error('Error (flags restored):', err.message);
  });
"

# Step 3: 验证恢复
node -e "const f = require('./infrastructure/pipeline/flags.json'); console.log('LLM enabled:', f.L3_INTENTSCANNER_LLM_ENABLED);"
```

**观测方法**:
- 降级后 pipeline 是否正常返回结果（regex 路径）
- 恢复后 LLM 路径是否重新生效
- 整个过程耗时（预期 < 2s）

---

## 4. 回滚步骤

### 4.1 即时回滚（每个演练内置）

每个演练脚本都内置 `finally` 块或 trap 信号处理，确保：

```bash
# 通用回滚模板
trap 'echo "[ROLLBACK] Restoring flags..."; cp /tmp/flags-backup-*.json infrastructure/pipeline/flags.json 2>/dev/null; echo "[ROLLBACK] Done."' EXIT ERR INT TERM
```

### 4.2 手动回滚清单

| 步骤 | 命令 | 验证 |
|------|------|------|
| 1. 恢复 Feature Flags | `cp /tmp/flags-backup-*.json infrastructure/pipeline/flags.json` | `cat infrastructure/pipeline/flags.json \| jq .` |
| 2. 重启 Gateway（如有异常） | `openclaw gateway restart` | `openclaw gateway status` |
| 3. 验证所有 agent 可用 | 逐个 agent 发送 ping 请求 | 返回正常响应 |
| 4. 检查 cron 任务状态 | `openclaw cron list` | 无 error 状态 |
| 5. 清理临时文件 | `rm /tmp/failover-drill-* /tmp/flags-backup-*` | `ls /tmp/failover-*` 无输出 |

### 4.3 紧急回滚（演练导致生产异常时）

```bash
# 1. 停止所有演练脚本
pkill -f failover-drill

# 2. 恢复 flags 到 git HEAD
cd /root/.openclaw && git checkout -- infrastructure/pipeline/flags.json

# 3. 重启 Gateway
openclaw gateway restart

# 4. 验证
openclaw gateway status
```

---

## 5. 成功判定标准

### 5.1 必须通过（MUST）

| # | 判定项 | 通过条件 | 验证方法 |
|---|--------|----------|----------|
| M1 | boom 存活确认 | 演练前后 boom API 返回 200 | curl 直接调用 |
| M2 | 模拟故障不影响生产 | 演练期间其他 agent session 正常 | 检查 Gateway 日志无非演练 error |
| M3 | Feature Flag 降级生效 | 关闭 flag 后 pipeline 走降级路径 | 测试脚本输出 |
| M4 | Flag 恢复后功能正常 | 恢复 flag 后 pipeline 走正常路径 | 测试脚本输出 |
| M5 | 无残留配置变更 | `git diff` 演练前后为空 | `git diff --stat` |

### 5.2 应当通过（SHOULD）

| # | 判定项 | 通过条件 | 验证方法 |
|---|--------|----------|----------|
| S1 | Fallback 延迟 < 30s | OpenClaw fallback 切换耗时在可接受范围内 | Gateway 日志时间戳 |
| S2 | 可观测性捕获切换事件 | metrics/alert-engine 记录到降级事件 | 检查 metrics 输出 |
| S3 | 演练全程 < 15min | 三个演练总耗时可控 | 时间记录 |

### 5.3 量化评分

```
总分 = MUST通过数/5 × 70 + SHOULD通过数/3 × 30
≥ 90分: 优秀（failover 机制可信赖）
70-89分: 合格（需补充可观测性）
< 70分: 不合格（需修复 fallback 链路）
```

---

## 6. 不建议做的危险演练方式

### 🚫 绝对禁止

| # | 危险操作 | 为什么危险 | 安全替代 |
|---|----------|------------|----------|
| D1 | **直接修改 openclaw.json 的 provider baseUrl** | 全局生效，所有 agent 立即受影响，恢复需重启 | 用独立 curl 脚本模拟 |
| D2 | **用 iptables 封禁 boom.aihuige.com** | 影响所有进程（不只 OpenClaw），恢复可能遗漏 | 用 curl --connect-timeout 模拟 |
| D3 | **修改 /etc/hosts 将 boom 域名指向 127.0.0.1** | 全局 DNS 污染，影响所有服务，容易忘记恢复 | 同 D2 |
| D4 | **在 main agent 的活跃 session 中测试** | 直接中断用户对话 | 用 scout/writer 等非核心 agent |
| D5 | **删除或轮换 API Key 来模拟认证失败** | Key 变更可能有 provider 侧延迟，恢复不确定 | 用错误 Key 的独立请求测试 |
| D6 | **同时关闭多个 L3 Feature Flag** | 组合效应不可预测，可能触发未测试的边界条件 | 单个 flag 逐一测试 |
| D7 | **在 cron 任务执行窗口内演练** | cron 任务使用不同模型链路（zhipu→boom），干扰信号难以区分 | 选择 cron 间歇期执行 |
| D8 | **修改 Gateway 源码注入故障** | 代码级变更影响面不可控，回滚需要重新部署 | 通过配置/flag 层面操作 |

### ⚠️ 不推荐但非绝对禁止

| # | 操作 | 风险 | 条件 |
|---|------|------|------|
| W1 | 在 reviewer agent 上测试 | reviewer 可能被其他流程调用 | 确认无活跃 review session |
| W2 | 长时间（>5min）保持降级状态 | 增加被真实请求命中的概率 | 仅在深夜低流量时段 |
| W3 | 同时测试模型 fallback + L3 flag 降级 | 两个维度叠加，问题定位困难 | 分开独立执行 |

---

## 附录 A: 演练执行 Checklist

```markdown
## 演练前
- [ ] 确认当前无活跃用户会话
- [ ] 确认 cron 任务不在执行窗口
- [ ] 备份 flags.json → /tmp/
- [ ] 记录 `git status` 和 `git diff`（应为空）
- [ ] 确认 boom API 可用（curl ping）

## 演练中
- [ ] 演练一：boom 模拟超时（脚本隔离）
- [ ] 演练二：OpenClaw fallback 验证（影子 session）
- [ ] 演练三：L3 Feature Flag 降级（单 flag 测试）
- [ ] 每步骤后检查生产链路无异常

## 演练后
- [ ] 恢复 flags.json
- [ ] `git diff --stat` 确认无残留变更
- [ ] 验证 boom API 正常
- [ ] 验证 main agent 正常响应
- [ ] 清理 /tmp 临时文件
- [ ] 记录演练结果到 reports/day3-failover-drill-result.md
```

## 附录 B: 当前模型路由拓扑

```
Agent          Primary                    Fallback
─────────────  ─────────────────────────  ──────────────────────────────────
main           boom-main/gpt-5.4          claude-main/claude-opus-4-6-thinking
researcher     boom-researcher/gpt-5.4    claude-researcher/claude-opus-4-6-thinking
coder          boom-coder/gpt-5.4         claude-coder/claude-opus-4-6
reviewer       boom-reviewer/gpt-5.4      claude-reviewer/claude-sonnet-4-6-thinking
writer         boom-writer/gpt-5.4        claude-writer/claude-sonnet-4-6
analyst        boom-analyst/gpt-5.4       claude-analyst/claude-sonnet-4-6-thinking
scout          boom-scout/gpt-5.4         claude-scout/claude-opus-4-6
cron-worker    zhipu-cron/glm-5           boom-cron-worker/gpt-5.3-codex
```

**关键观察**:
- 7/8 agents 以 boom 为 primary，claude 为 fallback
- cron-worker 特殊：zhipu 为 primary，boom 为 fallback
- 演练应优先覆盖 boom→claude 这条主要 fallback 链路
- scout 是最安全的演练目标（非核心 agent，fallback 为 opus 级别）

---

*文档结束。演练执行后请输出结果到 `reports/day3-failover-drill-result.md`*
