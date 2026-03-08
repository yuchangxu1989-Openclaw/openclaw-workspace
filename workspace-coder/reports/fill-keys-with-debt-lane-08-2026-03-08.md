# 补位扩列 08：系统债务清理执行报告

时间：2026-03-08

## 本次直接落地内容

围绕“评测 / 调度 / 发布 / 规则固化”剩余债务，已直接执行并产出有效结果，避免只做分析。

### 1. 固化回归总入口：把 hard-gate 自测纳入 regression 主链

**修改文件**：`principle-e2e-spec/scripts/run_regression.sh`

**落地动作**：
- 原脚本仅覆盖：
  - capability regression
  - PB-010 hardened regression
  - benchmark smoke
- 现已新增第 1 步：`hard-gate self tests`
- 直接调用：`bash "$ROOT/../.openclaw/tests/run_tests.sh"`

**价值**：
- 规则固化从“有脚本”升级为“回归总入口强制执行”
- 闭卷 / intent 两个 fail-closed gate 不再游离于主回归之外
- 后续跑一遍 `run_regression.sh` 即可覆盖：规则门、能力回归、PB-010、smoke

**更新后的回归顺序**：
1. hard-gate self tests
2. capability regression
3. pb010 hardened regression
4. benchmark smoke

---

### 2. 补齐发布静默 watchdog 的 cron 配置落地文件

**新增文件**：`skills/dto-core/config/cron/evomap-publish-silence-watchdog.yaml`

**背景**：
- 先前报告 `reports/publish-silence-watchdog-2026-03-08.md` 中声明已有 cron 接入；
- 但仓库内实际缺少对应配置文件，属于“文档先行、配置未落地”的发布/调度债务。

**本次补齐**：
- 新增 EventBus 主路径 + Cron 兜底补扫配置
- 关键字段包括：
  - `primary_event: evomap.publish.silence.check`
  - `spec: "*/15 * * * *"`
  - fallback sweep 参数：72h 回看、180min 阈值、20 次自动补发上限
  - workflow handler：`publish-silence-watchdog`
  - telemetry 指标：
    - `publish_silence_pending_windows`
    - `publish_silence_auto_replay_count`
    - `publish_silence_replay_failed_count`
    - `publish_silence_scan_duration_ms`

**价值**：
- 让发布静默治理从“代码 + 报告”升级为“可调度配置已落仓”
- 补齐调度层债务，避免只有 handler 没有 cron 配置

---

## 实际验证结果

### A. hard-gate 自测执行成功
执行：
```bash
bash /root/.openclaw/workspace-coder/.openclaw/tests/run_tests.sh
```

结果：
- 10 passed, 0 failed
- 结论：`All hard gate tests passed — fail-closed enforcement is active`

覆盖内容：
- closed-book gate pass/fail 分支
- intent-eval gate pass/fail 分支
- 非法输入 / gate_status 非 PASS / 证据缺失等失败闭锁路径

### B. regression 主链执行成功
执行：
```bash
bash /root/.openclaw/workspace-coder/principle-e2e-spec/scripts/run_regression.sh
```

结果：
- hard-gate self tests：通过
- capability regression：通过
- PB-010 hardened regression：10/10 通过
- benchmark smoke：通过

最终输出：
```text
✅ hard-gate + principle-e2e capability + PB-010 hardened regression + smoke passed
```

---

## 本次补债的实际收益

### 规则固化
- 把 `.openclaw/tests/run_tests.sh` 正式并入 `run_regression.sh`
- 防止后续只跑 capability / PB-010，却漏掉闭卷与 intent 的 fail-closed 规则自检

### 调度补齐
- 补上 `skills/dto-core/config/cron/evomap-publish-silence-watchdog.yaml`
- 让发布静默 watchdog 有真实调度入口，不再停留在报告描述层

### 发布治理链路更完整
当前链路已形成：
- dispatcher route：`infrastructure/dispatcher/routes.json`
- event handler：`infrastructure/event-bus/handlers/publish-silence-watchdog.js`
- watchdog 实现：`skills/evomap-publisher/publish-silence-watchdog.js`
- cron 配置：`skills/dto-core/config/cron/evomap-publish-silence-watchdog.yaml`
- 落地报告：`reports/publish-silence-watchdog-2026-03-08.md`

---

## 仍可继续追的后续债务（未在本次扩写）

1. 给 `publish-silence-watchdog` 增加独立 regression / fixture，覆盖：
   - 检测静默窗口
   - 冷却去重
   - replay fail / replay success
2. 将 cron 配置接入统一 cron loader / 订阅索引，形成“配置存在即被发现”的机制
3. 让 `skills/evomap-publisher/index.js` 原生补齐 publish requested/succeeded/failed 事件发射，减少静默识别误差
4. 为 `run_regression.sh` 增加 CI 退出摘要/产物归档

---

## 结论

本次“补位扩列 08”已直接完成两项有效补债：
- **规则固化**：hard-gate 自测并入主回归入口
- **调度/发布补齐**：发布静默 watchdog 的 cron 配置正式落地

并已完成实际执行验证，当前结果为：
- hard-gate：通过
- capability regression：通过
- PB-010 hardened：通过
- smoke：通过

属于已执行、已验证、可继续复用的有效结果，而非停留在分析层。
