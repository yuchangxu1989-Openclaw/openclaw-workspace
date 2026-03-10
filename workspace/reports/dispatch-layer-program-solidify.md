# dispatch-layer-program-solidify

## 目标
把“先发任务、空槽即补位、只汇报进行中”固化为 workspace 内可运行的一层，不改 gateway 核心。

## 已落地实现

### 1. 最小可运行调度层
新增文件：`infrastructure/dispatcher/dispatch-layer.js`

能力覆盖：
- 空槽检测：`detectIdleSlots()`
- 入队：`enqueue()`
- 派发：`dispatchNext()`
- 状态机：`queued -> running -> done/failed/cancelled`
- 进行中总表：`buildProgressBoard()` 并写入 `infrastructure/dispatcher/state/dispatch-progress-board.json`

状态持久化：
- `infrastructure/dispatcher/state/dispatch-layer-state.json`
- `infrastructure/dispatcher/state/dispatch-progress-board.json`

### 2. 可直接执行的 CLI
新增文件：`infrastructure/dispatcher/dispatch-layer-cli.js`

支持：
- `enqueue`
- `dispatch`
- `mark`
- `tick`

示例：
```bash
node infrastructure/dispatcher/dispatch-layer-cli.js enqueue '{"taskId":"t1","title":"任务1"}'
node infrastructure/dispatcher/dispatch-layer-cli.js tick
node infrastructure/dispatcher/dispatch-layer-cli.js mark t1 '{"status":"done"}'
```

### 3. 接入现有 dispatcher，但不改 gateway 核心
修改文件：`infrastructure/dispatcher/dispatcher.js`

接入方式：
- 无路由时：入调度层队列，避免只落 manual queue
- handler 不可执行时：入调度层队列并立即尝试补空槽
- 正常执行路径：先入运行队列，成功/失败后更新状态并补位

这意味着现有 dispatcher 已具备：
- 任务先进入统一调度层
- 有空槽就补位
- progress board 只保留 running

## 验证
新增测试：`tests/unit/dispatch-layer.test.js`

覆盖：
1. 入队后空槽立即补位
2. 任务完成后下一个排队任务自动补位
3. 总表只汇报进行中任务

本地执行结果：
```bash
npx jest tests/unit/dispatch-layer.test.js --runInBand
PASS tests/unit/dispatch-layer.test.js
```

## 当前实现边界
这是最小可运行版，故意未扩展：
- 未做跨进程文件锁
- 未做优先级抢占
- 未做超时回收/僵尸任务清理
- 未替换现有 manual queue，只是在其上补了一层程序化调度

## 产出文件清单
- `infrastructure/dispatcher/dispatch-layer.js`
- `infrastructure/dispatcher/dispatch-layer-cli.js`
- `tests/unit/dispatch-layer.test.js`
- `reports/dispatch-layer-program-solidify.md`

## 结论
目标已完成：
- 已程序化固化调度原则
- 已提供最小可运行版本
- 已落测试
- 未改 gateway 核心
