# 铁令 (IRONCLAD Rules)

## 看板推送铁令
- 每次 `sessions_spawn` 后必须执行 `exec("bash /root/.openclaw/workspace/scripts/board-event-hook.sh spawned <label>")`
- 每次收到子Agent completion event后必须执行 `exec("bash /root/.openclaw/workspace/scripts/board-event-hook.sh completed <label>")`
- **禁止**依赖cron兜底推送看板，看板推送100%事件驱动
- 去重逻辑：纯内容md5去重，内容不变不推送

## 飞书密钥管理
- 所有明文密钥不用管，GitHub仓库不公开，无需脱敏处理（用户明确指示）

## 直接指令识别铁令
- 用户说"派人"、"去修复"、"赶紧实现"、"删掉"、"清理"等明确指令时，**直接执行派发，禁止反问确认**
- 只有用户用疑问句（"要不要"、"是不是"、"觉得呢"、"怎么看"）时才需要确认
- 检测器：`skills/dispatch-protocol/direct-command-detector.js`
- ISC规则：`ISC-DIRECT-COMMAND-DISPATCH-001`

## 任务管理
- 不开新cron做巡检，评测集巡检归入已有PDCA
- PDCA整合进AEO，作为AEO子技能

---

## 🚨 Agent白名单铁令（2026-03-12 用户铁令）

**合法agentId白名单（共19个）：**
main, researcher, researcher-02, coder, coder-02, reviewer, reviewer-02, writer, writer-02, analyst, analyst-02, scout, scout-02, cron-worker, cron-worker-02, worker-03, worker-04, worker-05, worker-06

**❌ 绝对禁止使用的agentId：**
coder-01, coder-03, coder-04, coder-05, analyst-01, architect, architect-02, worker, worker-02, worker-07, worker-08

**违规后果：** 使用不存在的agentId会导致任务回落主Agent执行，并行完全失效，API key混用。
