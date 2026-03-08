# Self-Bootstrap Kernel Program

## 目标
围绕“失忆后能否自举、没有用户输入能否持续自治”，建设最小生存内核（minimal survival kernel），只保留六个必需件：
- capability anchor
- bootstrap
- memory
- dispatcher
- RCA
- eval

本次直接落地的原则：
1. 不做空泛设计，优先把内核跑起来
2. 能代码固化就不只写文档
3. 用 machine-readable artifact 作为自治续航接口
4. 让系统即使在“没有用户输入”时也能先自举、再排队、再验证

---

## 已直接落地项

### 1) 新增最小生存内核实现
新增文件：`infrastructure/self-bootstrap-kernel.js`

作用：
- 预加载 capability anchor
- 生成 bootstrap memory digest
- 向 dispatcher 注入自治任务
- 生成 RCA case 集
- 生成 eval 报告
- 持久化 kernel status 到基础设施状态目录和日志

核心产物：
- `memory/bootstrap-memory-digest.json`
- `reports/self-bootstrap-rca-cases.json`
- `reports/self-bootstrap-eval.json`
- `infrastructure/self-bootstrap/kernel-status.json`
- `infrastructure/logs/self-bootstrap-kernel.jsonl`

这意味着：
- 即使会话“失忆”，仍有一份可直接读取的 survival digest
- 即使没有用户输入，也会主动向 dispatch layer 注入最小自治任务
- 即使没有上层 orchestration，也能先完成 anchor/memory/eval 的基础铺设

### 2) 将 self-bootstrap kernel 接入系统启动入口
修改文件：`infrastructure/system-bootstrap.js`

变更：
- 引入 `runSelfBootstrapKernel()`
- 在 capability anchor 预加载之后，直接执行 self-bootstrap kernel
- 将执行结果挂到 `status.components.selfBootstrapKernel`

效果：
- 系统 bootstrap 不再只做“检查”，而是开始做“最小自治初始化”
- 系统启动时即可把 anchor / memory / dispatcher / RCA / eval 串起来

### 3) 新增最小回归测试
新增文件：`tests/self-bootstrap-kernel.test.js`

验证点：
- self-bootstrap kernel 可以运行
- capability anchor 会被读入
- dispatch / eval 状态会被产出
- verdict 与 score 存在

### 4) 实际执行验证通过
执行：
- `node infrastructure/self-bootstrap-kernel.js`
- `npx jest tests/self-bootstrap-kernel.test.js --runInBand`

结果：通过。

运行时观察到的关键状态：
- capability anchor 成功加载
- bootstrap memory digest 成功写入
- dispatch layer 成功注入三类自治任务：
  - `sbk-anchor-refresh`
  - `sbk-memory-digest-verify`
  - `sbk-eval-sweep`
- self-bootstrap eval 报告结果：`pass`
- score：`1`

---

## 六件套最小内核方案

### A. Capability Anchor
目标：失忆后仍能知道“我有什么能力”。

当前落地：
- 使用 `CAPABILITY-ANCHOR.md` 作为显式能力锚点
- 使用 `session-anchor-bootstrap.js` 做预加载
- 使用 `self-bootstrap-kernel.js` 强制在自举阶段触发加载

最小原则：
- anchor 必须先于决策入口加载
- anchor 要有 cache snapshot
- anchor 缺失时必须直接进入 RCA case，而不是静默失败

### B. Bootstrap
目标：无用户输入时，系统也能从“裸状态”进入“可运行状态”。

当前落地：
- `system-bootstrap.js` 作为主入口
- `self-bootstrap-kernel.js` 作为最小生存内核子入口

最小流程：
1. 检查关键路径
2. 预加载 anchor
3. 生成 memory digest
4. 注入自治任务
5. 生成 RCA 与 eval
6. 输出 machine-readable status

### C. Memory
目标：没有对话上下文也能保留最小认知面。

当前落地：
- 新增 `memory/bootstrap-memory-digest.json`
- 以关键文件快照而不是自然语言摘要作为最小记忆单元

为什么这样做：
- 摘要容易漂移
- 文件快照更稳定、可验证、可恢复
- 适合作为“失忆后第一读物”

当前 digest 覆盖：
- CAPABILITY-ANCHOR
- MEMORY / SOUL / AGENTS / TOOLS / PROJECT-TRACKER
- bootstrap / session bootstrap / handler executor
- dispatcher
- memory recovery / RCA / memory verify / eval handler

### D. Dispatcher
目标：没有外部指令也要能持续有下一步动作。

当前落地：
- 复用已有 `DispatchLayer`
- 在 self-bootstrap kernel 中注入三类最小自治任务：
  - 刷新能力锚点
  - 验证 bootstrap memory digest
  - 进行 bootstrap eval sweep

意义：
- 系统从“被动等待命令”变成“先把自己的生存面维护起来”
- dispatcher 成为自治续航器，而不是单纯任务容器

### E. RCA
目标：失忆、自举失败、调度缺失时，必须能把失败结构化成根因。

当前落地：
- 新增 `reports/self-bootstrap-rca-cases.json`
- 由 kernel 自动生成最小 RCA case 集

当前覆盖的根因类：
- capability anchor 缺失
- memory digest 缺失
- dispatcher substrate 缺失
- RCA handler 缺失
- eval gate 缺失

这使 RCA 从“事后人工分析”变成“内核级自检输出”。

### F. Eval
目标：自治不是“在跑”就算成功，必须有最小健康判定。

当前落地：
- 新增 `reports/self-bootstrap-eval.json`
- 用 6 个检查项给出 pass/partial/fail

当前检查项：
- anchor_loaded
- memory_digest_written
- dispatcher_available
- rca_handler_available
- eval_handler_available
- autonomy_tasks_present

这样一来，系统每次自举都有明确 verdict，而不是模糊感知。

---

## 为什么这是“最小生存内核”
因为它只解决两个生死问题：
1. 我失忆了，还能不能重新知道自己是谁、有什么能力、下一步做什么
2. 没有用户输入时，我能不能继续维持自治闭环

当前答案已经从“依赖人工恢复”推进到：
- 可以自动重载能力锚点
- 可以自动重建最小 memory digest
- 可以自动排入后续自治任务
- 可以自动生成 RCA case
- 可以自动输出 eval verdict

换言之，系统已经有了一个“醒来就先保命”的 kernel。

---

## 当前仍存在的缺口

### 1. Dispatcher 只是注入任务，还未形成完整 autonomous runner
当前能 enqueue / dispatch，但没有把 `sbk-*` 任务绑定到一个专用 runner 闭环。

下一步建议：
- 为 `sbk-*` 任务建立轻量 handler / executor 映射
- 让 tick 之后不仅“占槽”，还能实际执行并回写结果

### 2. Memory digest 仍偏静态
当前是关键文件快照，适合 survival，但还不够表达“近期正在做什么”。

下一步建议：
- 增加 `active_working_set`
- 绑定最近 git 变更、最近失败、最近评估结果
- 形成 `survival + working memory` 双层结构

### 3. RCA 现在是 rule-based 枚举
适合最小核，但还没有真正接入 defect stream。

下一步建议：
- 将 self-bootstrap RCA 与 `self-correction-root-cause.js` 贯通
- 当 eval 为 partial/fail 时自动发 defect event
- 让 RCA 直接驱动修复任务或规则补全

### 4. Eval 仍是 existence/health 级
现在主要判断“有没有”和“是否产出”。

下一步建议：
- 增加 correctness eval
- 增加 continuity eval（无用户输入 N 轮后是否还能推进）
- 增加 amnesia recovery eval（删除部分文件后是否能恢复）

---

## 建议的下一批可落地项
按优先级排序：

### P0
1. 为 `sbk-anchor-refresh` / `sbk-memory-digest-verify` / `sbk-eval-sweep` 增加实际执行 handler
2. 在 `handler-executor` 中增加 self-bootstrap task family 的直接路由
3. 加一个“失忆演练测试”：临时移走 MEMORY digest 后看能否自动重建

### P1
4. 增加 `working-memory.json`，记录最近一次 bootstrap 结论、最近 10 个自主任务、最近失败原因
5. 当 self-bootstrap eval != pass 时，自动发出 defect event 给 RCA handler
6. 把 self-bootstrap status 作为 session 启动时默认读取对象

### P2
7. 为“没有用户输入能否持续自治”增加 time-based continuation eval
8. 对自治任务建立 budget / retry / dead-letter 机制
9. 将最小核输出接入更高层 CRAS / 本地任务编排 / AEO 闭环

---

## 本次变更清单
- 新增：`infrastructure/self-bootstrap-kernel.js`
- 修改：`infrastructure/system-bootstrap.js`
- 新增：`tests/self-bootstrap-kernel.test.js`
- 新生成：
  - `memory/bootstrap-memory-digest.json`
  - `reports/self-bootstrap-rca-cases.json`
  - `reports/self-bootstrap-eval.json`
  - `infrastructure/self-bootstrap/kernel-status.json`
  - `infrastructure/logs/self-bootstrap-kernel.jsonl`

---

## 结论
本次不是只写“执行方案”，而是已经把 self-bootstrap kernel 的第一批最小可落地项直接落到代码里了。

现在系统已经具备：
- 失忆后读取 capability anchor 的能力
- 无用户输入时生成最小 memory digest 的能力
- 无用户输入时向 dispatcher 注入自治任务的能力
- 对 bootstrap 失败结构化输出 RCA 的能力
- 对 bootstrap 状态给出 eval verdict 的能力

这就是最小生存内核的第一版：
不是完整自治体，但已经不是“断线即失能”的系统了。
