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

## 任务管理：复用调度，禁止cron膨胀
- **禁止为每个新需求单独开cron** — 巡检类需求（如评测集巡检、质量检查）必须归入已有的PDCA定期检查循环，不另开独立cron job
- **PDCA是AEO的子模块**，代码位于 `skills/aeo/pdca/`，由AEO统一调度，不是独立技能或独立pipeline
- **核心原则**：复用已有调度机制，不重复造轮子。新的检查项加入PDCA的Check维度，不单独建cron/pipeline

---

## 🚨 Agent白名单铁令（2026-03-12 用户铁令）

**合法agentId白名单（共19个）：**
main, researcher, researcher-02, coder, coder-02, reviewer, reviewer-02, writer, writer-02, analyst, analyst-02, scout, scout-02, cron-worker, cron-worker-02, worker-03, worker-04, worker-05, worker-06

**❌ 绝对禁止使用的agentId：**
coder-01, coder-03, coder-04, coder-05, analyst-01, architect, architect-02, worker, worker-02, worker-07, worker-08

**违规后果：** 使用不存在的agentId会导致任务回落主Agent执行，并行完全失效，API key混用。

## 铁令六：禁止手动指定model参数
- `sessions_spawn` 时**禁止**传 `model` 参数
- 让每个agent走自己在 `openclaw.json` 中配置的 provider 链路由（primary → fallback）
- 这样每个agent用自己的独立令牌，实现真并行
- 手动指定model会导致所有任务走同一个令牌，无法并行
