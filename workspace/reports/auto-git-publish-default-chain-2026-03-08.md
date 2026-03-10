# auto git publish default chain report

- 日期：2026-03-08
- 目标：把 `done -> gate -> release -> git publish` 补成默认主链，并在有效输出后自动进入发布资格判断；满足条件自动触发统一 git 发布链；补最小验证。

## 变更摘要

### 1. 默认主链接入 dev-task-handler
修改文件：`infrastructure/dispatcher/handlers/dev-task-handler.js`

新增能力：
- `buildReleaseQualification()`：基于自动扩列结果和最小验证信号生成发布资格判断。
- `emitDefaultPublishChain()`：在自动扩列场景下按默认主链发出以下事件：
  - `task.status.done`
  - `task.status.completed`
  - `task.output.validated`
  - `release.qualification.requested`
  - 条件满足时追加：
    - `release.qualified`
    - `system.general.modified`

实现效果：
- 有效输出后自动进入 gate/release 判断。
- 资格满足时通过现有 `system.general.modified -> github-sync-trigger` 统一链路触发 git 发布动作，而不是在 handler 中硬编码 shell 提交逻辑。
- 返回结果中新增：`release_qualification`。
- 自动扩列的 `next_steps` 默认升级为：
  - `derived_tasks_enqueued`
  - `workflow_requested`
  - `execute_task`
  - `validate_output`
  - `gate`
  - `release`
  - `git_publish`

### 2. 最小验证补齐
修改文件：`tests/unit/dev-task-handler-basic-op-auto-expand.test.js`

新增断言：
- 验证 `next_steps` 已扩展为默认发布主链。
- 验证 `release_qualification` 为 ready。
- 验证已发出：
  - `release.qualification.requested`
  - `release.qualified`
  - `system.general.modified`

## 发布资格判断规则

当前最小规则：
- `has_effective_output`：自动扩列且派生任务数 > 0。
- `minimal_validation_passed`：存在 validation 派生任务，或原文本显式包含验证/test/validate 信号。
- `release_ready` / `auto_git_publish_eligible`：上述二者同时成立。

偏好性检查：
- `preferred_rule_included`
- `preferred_integration_included`

说明：
- 这是“最小可用发布资格判断”，避免空产物直接发布。
- 真正的 git add/commit/push 仍复用现有统一发布链，避免重复实现和旁路。

## 验证结果

执行命令：

```bash
npx jest tests/unit/dev-task-handler-basic-op-auto-expand.test.js --runInBand
```

结果：通过。

- Test Suites: 1 passed
- Tests: 2 passed

## git 发布说明

已满足“自动触发统一发布动作”的代码链路要求：
- handler 在资格满足时发出 `system.general.modified`
- 现有 `github-sync-trigger` / 相关 rule 负责统一 git 发布动作

本次未直接执行仓库级 `git add/commit/push`，原因：
- 当前仓库存在大量与本任务无关的脏文件和新增文件；直接全量提交会污染提交边界。
- 在该状态下，更安全的做法是仅完成“默认主链自动触发统一发布动作”的代码接入与验证。

若需真正落库提交，建议仅暂存本任务涉及文件：
- `infrastructure/dispatcher/handlers/dev-task-handler.js`
- `tests/unit/dev-task-handler-basic-op-auto-expand.test.js`
- `reports/auto-git-publish-default-chain-2026-03-08.md`

## 结论

已完成：
- 把 `done -> gate -> release -> git publish` 补成自动扩列场景的默认主链。
- 有效输出后自动进入发布资格判断。
- 条件满足时自动触发现有统一 git 发布链。
- 已补最小验证并通过测试。
