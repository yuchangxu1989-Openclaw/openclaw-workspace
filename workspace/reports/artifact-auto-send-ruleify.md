# artifact auto-send ruleify

## 目标
把“产出报告/文件后默认发送原文件给用户”固化到 workspace 内，不改 gateway 核心。

## 已落地最小闭环

### 1) 复用点
- 现有发送能力：`skills/public/file-sender/index.js`
- 现有报告汇报路径：`skills/feishu-report-sender/index.js`

### 2) 新增调度层固化
- `skills/public/file-sender/artifact-auto-send.js`
  - 统一自动发送入口
  - 默认支持：`.md` `.png` `.json` `.pdf`
  - 自动推断 `receive_id_type`
  - 缺目标、文件不存在、发送失败均显式写日志
- `scripts/report-with-auto-send.js`
  - 供脚本/技能在产出文件后直接调用

### 3) 已接入现有报告发送路径
- `skills/feishu-report-sender/index.js`
  - 在处理报告 queue 时，如果报告 JSON 内存在：
    - `artifact_path`
    - `file_path`
    - `report_path`
    - `source_file`
    - `output_file`
    - `original_file`
  - 则自动尝试发送原文件
  - 失败显式 `console.error`
  - 详细记录写入：`infrastructure/logs/artifact-auto-send.jsonl`

## 调用示例

```bash
node /root/.openclaw/workspace/scripts/report-with-auto-send.js /root/.openclaw/workspace/reports/foo.md ou_xxx open_id
```

或在报告 queue JSON 中附带：

```json
{
  "card": {},
  "artifact_path": "/root/.openclaw/workspace/reports/foo.md",
  "target": "ou_xxx",
  "receive_id_type": "open_id"
}
```

## 失败日志
- 文件：`/root/.openclaw/workspace/infrastructure/logs/artifact-auto-send.jsonl`
- 约束：不允许静默失败

## 当前边界
- 目前默认目标仍优先取显式传入值，否则回退环境变量：
  - `ARTIFACT_AUTO_SEND_TARGET`
  - `ARTIFACT_AUTO_SEND_TARGET_TYPE`
  - `FEISHU_TARGET_USER`
- 最小闭环已覆盖 md/png/json/pdf 常见产物
