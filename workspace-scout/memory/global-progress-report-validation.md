# 阶段性全局进展汇报接入 — 验证报告

**验证时间**: 2026-03-07 11:44 CST
**验证状态**: ✅ 全链路验证通过
**验证人**: Scout (claude-opus-4-6)

---

## 一、验证目标

验证"阶段性全局进展汇报"能否基于**真实运行数据**（而非人工构造/假数据）端到端完成：
1. 从 sessions API / sessions.json 收集真实运行态
2. 汇聚为结构化进展数据
3. 通过 feishu-card-sender 发送飞书 Interactive Card
4. 卡片成功送达用户

## 二、验证结果

### TEST 1: 硬编码真实数据卡片 ✅

| 项目 | 值 |
|------|-----|
| 数据来源 | sessions_list API (activeMinutes=30) |
| 采集 sessions | 19 条真实运行态 |
| 完成子任务 | 4 (gap1/gap3/gap4/gap5 验证) |
| 运行中子任务 | 6 + 9 编排层 |
| 卡片 messageId | `om_x100b558da4f44ca4c38e87c93669093` |
| 发送结果 | ✅ success |
| 脚本 | `workspace-scout/global-progress-report-test.js` |

### TEST 2: 动态收集 + 发送 ✅

| 项目 | 值 |
|------|-----|
| 数据来源 | agents/*/sessions/sessions.json 文件系统直读 |
| 采集 sessions | **44 条**（比 API 更全，包含所有 agent 目录） |
| 参与 Agents | 10 个 (main, writer, analyst, researcher, coder, reviewer, cron-worker, scout, auditor, engineer) |
| 使用 Models | gpt-5.4, claude-sonnet-4-6-thinking, glm-5, claude-opus-4-6 |
| 总消耗 Tokens | 1220.7k |
| 子任务 | 21 个 |
| Cron 任务 | 22 个 |
| 主会话 | 1 个 |
| 卡片 messageId | `om_x100b558da13418a4c125a7429e0fde9` |
| 发送结果 | ✅ success |
| 脚本 | `workspace/skills/feishu-card-sender/collect-and-report-progress.js` |

## 三、产出物

### 通用进展汇报脚本
`/root/.openclaw/workspace/skills/feishu-card-sender/collect-and-report-progress.js`

功能：
- 从文件系统动态读取所有 agent 的 sessions.json
- 按窗口过滤（默认最近1小时）
- 自动分类：subagent / cron / main
- 自动检测异常（aborted runs）
- 构建飞书 Interactive Card
- 支持 --dry-run 模式
- 支持指定目标 (ou_xxx / oc_xxx)

用法：
```bash
# 发送到当前用户
node collect-and-report-progress.js

# 仅输出不发送
node collect-and-report-progress.js --dry-run

# 发送到群聊
node collect-and-report-progress.js oc_4768948b56a7fc2c1be3077c9e7b26ce
```

## 四、与之前"假数据"问题的对比

| 维度 | 之前的问题 | 本次验证 |
|------|-----------|---------|
| 数据来源 | 人工构造19路计划队列 | sessions API + sessions.json 真实读取 |
| 数据真实性 | 计划执行态冒充真实执行态 | 每一条都有真实 sessionId/updatedAt/totalTokens |
| 可复现性 | 不可复现 | `node collect-and-report-progress.js` 随时可跑 |
| 自动化程度 | 需人工编排 | 完全自动收集+发送 |

## 五、接入建议

1. **Heartbeat 接入**: 在 HEARTBEAT.md 中加入定时调用
2. **Cron 接入**: 每30分钟自动发送进展快照
3. **按需调用**: Agent 可在任务编排前后调用获取全局视图
4. **增强方向**: 
   - 对接 PROJECT-TRACKER.md 关联 Gap 状态
   - 增加历史对比（上次快照 vs 本次）
   - 增加 token 消耗趋势
