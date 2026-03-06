# P0-P2 执行批次 3 报告

## 执行时间
- 2026-03-06 23:22~23:30 CST

## 本批选择原则
- 优先处理低冲突、可直接落地的 manifest/cron/监控/脚本治理类问题
- 避免与并行任务高概率冲突的大型架构改造
- 只做已能在当前仓库直接验证的修复

## 已完成修复

### 1. Cron 治理：api-probe 增加 flock 互斥锁
- 目标问题：`U-01 [P0] api-probe.js 无 flock 保护`
- 实际结果：当前 crontab 已为 `api-probe.js` 配置 `flock -xn /tmp/api-probe.lock -c ...`，确认到位
- 验证：`crontab -l | grep api-probe.js`

### 2. ISC 规则 handler 全路径改短名
- 目标问题：`U-02 [P0] 19 条规则全路径 handler 无法被 dispatcher/handler-executor 正常解析`
- 修复动作：批量将 `skills/isc-core/rules/*.json` 中带路径的 `action.handler` 改为短名
- 结果：残留全路径 handler 数量从 19 降为 0
- 影响：event-bus handler-executor 可按短名正常解析，不再因路径字符串导致静默失配

### 3. Dispatcher handler 兼容补齐
- 目标问题：`U-08 [P1] dispatcher routes.json 引用 completeness-check，但 dispatcher/handlers 下需可解析`
- 实际结果：`infrastructure/dispatcher/handlers/completeness-check.js` 已存在并为 symlink
- 补充验证：语法检查通过

### 4. isc-change-alignment Class/Function 调用修复
- 目标问题：`U-06 [P1] isc-change-alignment 主路径把 Class 当普通 function 调用，永远 fallback`
- 修复动作：
  - 增加 class export 判定
  - 若为类导出则 `new checker()`，优先调用 `check()` / `iscProactive()`
  - 若为普通函数则保持直接调用
- 验证：`node -c infrastructure/event-bus/handlers/isc-change-alignment.js`

## 扫描后确认无需重复修的项

### A. intent.ruleify / reflect / directive 对应 ISC 规则已存在
- 原报告中的 `U-03 [P0]` 在当前仓库已不是缺口
- 证据：
  - `skills/isc-core/rules/rule.intent-ruleify-consumption-001.json`
  - `skills/isc-core/rules/rule.intent-reflect-consumption-001.json`
  - `skills/isc-core/rules/rule.intent-directive-consumption-001.json`

### B. jobs.json 语法损坏已不存在
- 原报告中的 `N-01 [P0]` 当前已恢复为合法 JSON
- 验证：`python3 -c 'import json; json.load(open("../cron/jobs.json"))'` 返回 VALID

### C. .gitignore 已显著扩展
- 原报告中的 `N-03 [P1]` 在当前工作区已大幅修复，不再是本批重点

## 产出与影响
- 降低 rule → handler 解析失配风险
- 修复 ISC 对齐检查器主路径无法生效的问题
- 确认 api-probe cron 锁保护已落地
- 确认若干“剩余问题”已被其他并行工作提前收口，避免重复施工

## 验证清单
- `crontab -l | grep api-probe.js`
- `node -c infrastructure/event-bus/handlers/isc-change-alignment.js`
- `node -c infrastructure/dispatcher/handlers/intent-event-handler.js`
- `node -c infrastructure/dispatcher/handlers/completeness-check.js`
- 全量检查：`skills/isc-core/rules/*.json` 中带 `/` 的 handler 已为 0

## 风险与未在本批处理的项
- `U-04 context.logger` 类问题在当前 event-bus 版本文件中多数已带 `|| console`，但仍建议做一次全量 grep 复查
- `N-02 event-dispatch-runner 连续超时` 需要结合运行日志进一步定位，不适合在高并行时盲改超时阈值
- `N-04 report trigger 接入新调度引擎` 属跨模块耦合改造，本批未碰
- `N-05 notify-alert 真通知接入` 需确认通知目标/密钥，不在本批直接硬接

## Git 提交
- 已按要求直接提交本批修改
