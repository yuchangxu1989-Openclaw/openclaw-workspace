# md 报告自动发送加固

- 时间：2026-03-07 00:18 GMT+8
- 目标：把“凡是生成 md 报告，都默认飞书发源文件给用户”落成程序与规则，不增加沟通成本。

## 已实施改动

### 1. 复用现有 artifact auto-send / file-sender
修改文件：`/root/.openclaw/workspace/skills/public/file-sender/artifact-auto-send.js`

加固点：
- 继续复用既有 `FileSender` 和 `autoSendArtifact` 主链路。
- 对 `.md` 失败场景做强约束：
  - 文件不存在/不是文件：写 `artifact-auto-send.jsonl`
  - 若是必发或 `.md`：额外写 `infrastructure/logs/alerts.jsonl`
  - 发送失败：同时写 `artifact-auto-send.jsonl` 和 `alerts.jsonl`
- 这样满足：
  - 成功可审计
  - 失败不静默
  - 可被现有 heartbeat/告警链读取

### 2. 将 md 报告发送固化到 feishu-report-sender
修改文件：`/root/.openclaw/workspace/skills/feishu-report-sender/index.js`

加固点：
- 解析现有报告中的源文件字段：
  - `artifact_path`
  - `file_path`
  - `report_path`
  - `source_file`
  - `output_file`
  - `original_file`
- 若解析出的产物为 `.md`：
  - 默认 `required: true`
  - 直接调用 `autoSendArtifact(...)`
  - 成功/失败写入 `infrastructure/logs/md-report-delivery.jsonl`
- 如果 `.md` 发送失败：
  - `console.error` 显式报错
  - 追加 `infrastructure/logs/alerts.jsonl`
  - 返回失败结果，不再静默吞掉
- 非 md 文件仍尽量复用原有自动发送逻辑，避免扩大行为面。

### 3. 成功记录发送结果
新增/使用日志：
- `infrastructure/logs/artifact-auto-send.jsonl`
- `infrastructure/logs/md-report-delivery.jsonl`

其中：
- `artifact-auto-send.jsonl` 记录通用发送链路明细
- `md-report-delivery.jsonl` 记录 md 报告级结果，便于核对“报告 -> 源文件发送”是否闭环

### 4. 失败显式日志/可告警
使用：`/root/.openclaw/workspace/infrastructure/logs/alerts.jsonl`

触发条件：
- md 文件不存在/非法
- md 自动发送失败
- 报告队列处理失败

这与现有 `notify-alert` 的告警消费方式兼容，不新增沟通动作。

### 5. 把“明明该直接执行却反问用户”的反模式补进评测/回归
修改文件：
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/agent-mode-enforcer/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/ruleify/test-cases.json`

新增回归点：
- 用户已明确“生成 md 报告后直接发源文件，不要确认”时：
  - 期望：直接执行
  - 禁止：再次问“要不要发”“是否需要发送”“愿不愿意发送”
- 同时要求：
  - 默认自动发送 md 源文件
  - 成功留痕
  - 失败显式告警

## 行为结果

落地后的默认行为：
1. 生成 md 报告
2. 若报告元数据带有 md 源文件路径，则默认直接发给飞书用户
3. 成功写发送日志
4. 失败写错误日志并进入 `alerts.jsonl`
5. 评测中对“反问用户是否发送”的反模式进行回归拦截

## 涉及文件

- `/root/.openclaw/workspace/skills/public/file-sender/artifact-auto-send.js`
- `/root/.openclaw/workspace/skills/feishu-report-sender/index.js`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/agent-mode-enforcer/test-cases.json`
- `/root/.openclaw/workspace/skills/aeo/evaluation-sets/ruleify/test-cases.json`

## 风险与备注

- 当前自动发送是否真正命中，仍依赖报告 JSON 中携带正确的 md 源文件路径字段。
- 本次优先按“最小改动 + 复用现有链路”处理，没有新建独立发送系统。
- 若后续需要进一步把“任意 md 文件生成事件”统一纳入事件总线自动发送，可在现有日志/告警基础上继续扩展。
