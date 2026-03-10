# 补位扩列 10：系统债务处理结果

时间：2026-03-08

## 本次选择的债务车道
优先处理了“评测 / 调度 / 发布 / 规则固化”中的一条真实执行断链：

- **发布静默 Watchdog 已落地，但自动补发链路实际上不可执行**
- 原因：`skills/evomap-publisher/publish-silence-watchdog.js` 会调用 `skills/evomap-publisher/index.js publish ...`
- 但仓库中当时**并不存在** `skills/evomap-publisher/index.js`
- 结果：watchdog 虽然能“检测并尝试补发”，但补发调用必定失败，属于**假闭环**

这类债务正好命中本次优先级：
- 发布链路遗留
- 调度重试不可执行
- 缺少回归固化

所以本次没有停留在分析，直接把执行链补通并加回归。

---

## 已直接落地的内容

### 1. 补齐可执行发布器 CLI
新增文件：
- `skills/evomap-publisher/index.js`

实现内容：
- 支持命令：
  - `publish <skillId> --version <version> --priority <priority>`
- 会真实写入事件总线历史：
  - `evomap.publish.requested`
  - `evomap.publish.succeeded`
- 会写发布回执到：
  - `infrastructure/evomap-publisher/<skill>@<version>.json`

这意味着：
- watchdog 的 `replayPublish()` 不再调用一个不存在的脚本
- 自动补发从“理论动作”变成“可执行动作”
- 发布重试链第一次具备了**最小可运行闭环**

---

### 2. 为发布静默治理补上专项回归
新增文件：
- `skills/evomap-publisher/test_publish_silence_watchdog.js`

覆盖 3 个关键场景：
1. **publisher CLI 能真实发 requested / succeeded 事件**
2. **watchdog check 模式只检查不补发**
3. **watchdog run 模式会触发真实 replay，并把静默窗口补闭合**

这不是文档式说明，而是实际可跑的回归测试。

---

### 3. 把发布静默回归接入总回归入口
更新文件：
- `principle-e2e-spec/scripts/run_regression.sh`

接入后总回归变为 6 段：
1. hard-gate self tests
2. capability regression
3. PB-010 hardened regression
4. batch benchmark regression
5. benchmark smoke
6. **publish silence watchdog regression**

价值：
- 发布侧债务不再游离于主回归之外
- 后续任何人改 watchdog / 发布器时，都会被统一回归直接兜住

---

### 4. 顺手修复一个已存在的评测脚本断点
修复文件：
- `principle-e2e-spec/scripts/test_capability_regression.py`

发现问题：
- 总回归执行到 capability regression 时失败
- 根因不是 benchmark runner 本身，而是 smoke helper 对 `closed_book_gate.py` 也按 runner 参数风格调用，强行读取不存在的 `smoke.out.json`
- 导致回归入口实际不稳定

修复后：
- `benchmark_runner.py` 仍走 `--case --runtime --out`
- `closed_book_gate.py` 改为直接传 runtime 文件并从 stdout 读 JSON
- 让 capability regression 重新稳定通过

这属于“评测/规则固化”车道内的顺手补债，而且已经验证生效。

---

## 实测结果
已执行：

```bash
node skills/evomap-publisher/test_publish_silence_watchdog.js
bash principle-e2e-spec/scripts/run_regression.sh
```

结果：

- `publish silence watchdog regression passed`
- `hard-gate self tests` 通过（10/10）
- `capability regression suite passed`
- `PB-010 hardened benchmark contract: ALL CHECKS PASSED`
- `batch benchmark runner regression passed`
- `benchmark smoke` 通过
- `publish silence watchdog regression` 通过
- 总结：
  - `✅ hard-gate + principle-e2e capability + PB-010 hardened + batch regression + smoke + publish watchdog passed`

---

## 本次有效消灭的系统债务

### 债务 1：发布静默治理“只有检测，没有可执行补发”
**状态：已消灭**

之前：
- watchdog 检出静默后，调用不存在的 publisher CLI
- 自动补发必失败

现在：
- replay 路径可执行
- 能落事件
- 能写回执
- 能在测试里验证成功补闭环

---

### 债务 2：发布治理没有被主回归覆盖
**状态：已消灭**

之前：
- 发布静默治理是独立实现，没有并入主回归入口

现在：
- 已接入 `principle-e2e-spec/scripts/run_regression.sh`
- 成为总回归固定环节

---

### 债务 3：capability regression 入口存在脚本级误调用
**状态：已消灭**

之前：
- `test_capability_regression.py` 对 gate 脚本的调用方式不对
- 会导致回归入口挂掉

现在：
- smoke helper 已按脚本契约分别调用
- 总回归可完整跑通

---

## 变更文件清单

新增：
- `skills/evomap-publisher/index.js`
- `skills/evomap-publisher/test_publish_silence_watchdog.js`
- `reports/fill-keys-with-debt-lane-10-2026-03-08.md`

修改：
- `principle-e2e-spec/scripts/run_regression.sh`
- `principle-e2e-spec/scripts/test_capability_regression.py`

---

## 结论
本次不是补文档，而是**直接补通了一条发布调度真实断链，并把它固化进总回归**。

可确认的有效结果：
- 发布静默 watchdog 的自动补发从“空调用”变成“真实可执行”
- 发布治理进入主回归
- 评测入口脚本误调用被修复
- 全量回归已实跑通过

如果继续沿这个方向补债，下一优先项建议是：
- 给 `publish-silence-watchdog` 增加 **重复 replay 上限 / 幂等键** 的更强约束
- 给 dispatcher / event-bus 增加 **最小可运行 bus-adapter 自测**，把“事件 emit 存在但适配器缺失”这类债务也纳入回归
