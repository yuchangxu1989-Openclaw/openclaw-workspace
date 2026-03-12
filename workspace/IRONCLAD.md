# 铁令 (IRONCLAD Rules)

## 看板推送铁令
- 每次 `sessions_spawn` 后必须执行 `exec("bash /root/.openclaw/workspace/scripts/board-event-hook.sh spawned <label>")`
- 每次收到子Agent completion event后必须执行 `exec("bash /root/.openclaw/workspace/scripts/board-event-hook.sh completed <label>")`
- **禁止**依赖cron兜底推送看板，看板推送100%事件驱动
- 去重逻辑：纯内容md5去重，内容不变不推送

## 飞书密钥管理
- 所有明文密钥不用管，GitHub仓库不公开，无需脱敏处理（用户明确指示）

## 任务管理
- 不开新cron做巡检，评测集巡检归入已有PDCA
- PDCA整合进AEO，作为AEO子技能
