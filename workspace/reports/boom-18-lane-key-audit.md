# boom 18-lane key audit

时间：2026-03-06 19:40 GMT+8

## 结论摘要

- 用户提供了 10 条 boom / GPT-5.4 key。
- 实测结果：10/10 请求均返回 **HTTP 200**。
- 但其中存在 **1 条重复 key**（第 9 条与第 10 条完全相同）。
- 因此真实新增的**唯一可用 key 数**为 **9**。
- 现有 boom provider 为 **8** 个；本次按现有命名规律扩展并接入 **9** 个新增 provider。
- 接入后总 boom / gpt-5.4 并发槽数为 **17**。
- 结论：**尚未达到“18路可发任务”状态**，当前是 **17 路**。

## 现有命名规律检查

现有 8 个 boom provider 命名如下：

1. `boom-main`
2. `boom-researcher`
3. `boom-coder`
4. `boom-reviewer`
5. `boom-analyst`
6. `boom-scout`
7. `boom-writer`
8. `boom-cron-worker`

命名规律：

- 前缀固定为 `boom-`
- 后缀对应 agent 角色名
- 每个 provider 均暴露：
  - `gpt-5.3-codex`
  - `gpt-5.4`

本次新增沿用同一规律，采用“角色名 + 序号后缀”的最小改动方案：

- `boom-main-02`
- `boom-researcher-02`
- `boom-coder-02`
- `boom-reviewer-02`
- `boom-analyst-02`
- `boom-scout-02`
- `boom-writer-02`
- `boom-cron-worker-02`
- `boom-main-03`

说明：因为真实新增唯一 key 只有 9 条，所以只能新增 9 个独立 provider，而不是 10 个。

## 10 条 key 实测结果

探测方式：POST `https://boom.aihuige.com/v1/chat/completions`
模型：`gpt-5.4`
判定标准：HTTP 200 视为可用

| 序号 | key 尾号 | 结果 | 备注 |
|---|---|---:|---|
| 1 | `FrZqQF` | 200 | 可用 |
| 2 | `kdViUw` | 200 | 可用 |
| 3 | `i2UdDM` | 200 | 可用 |
| 4 | `W9OFZo` | 200 | 可用 |
| 5 | `ByXxAy` | 200 | 可用 |
| 6 | `nk5uwX` | 200 | 可用 |
| 7 | `4M4QjE` | 200 | 可用 |
| 8 | `agzniH` | 200 | 可用 |
| 9 | `CDqzzS` | 200 | 可用 |
| 10 | `CDqzzS` | 200 | **与第 9 条重复** |

## 去重结果

重复项：

- 第 10 条 key 与第 9 条 key 完全相同
- 重复尾号：`CDqzzS`

因此：

- 提供数量：10
- 重复数量：1
- 唯一数量：9
- 唯一且 HTTP 200 可用数量：**9**

## 已执行接入

已直接修改：`/root/.openclaw/openclaw.json`

修改内容仅限最小范围：

1. 在 `models.providers` 中新增 9 个 boom provider
2. 在 `agents.defaults.models` 中补充对应的：
   - `*/gpt-5.3-codex`
   - `*/gpt-5.4`

未改动：

- 网关核心逻辑
- 调度核心代码
- 现有主备路由规则

## 新增 provider 清单

| 新 provider | 对应 key 尾号 |
|---|---|
| `boom-main-02` | `FrZqQF` |
| `boom-researcher-02` | `kdViUw` |
| `boom-coder-02` | `i2UdDM` |
| `boom-reviewer-02` | `W9OFZo` |
| `boom-analyst-02` | `ByXxAy` |
| `boom-scout-02` | `nk5uwX` |
| `boom-writer-02` | `4M4QjE` |
| `boom-cron-worker-02` | `agzniH` |
| `boom-main-03` | `CDqzzS` |

## 并发槽统计

- 旧 boom / gpt-5.4 provider 数：8
- 新增唯一可用 provider 数：9
- 当前总 boom / gpt-5.4 并发槽数：**17**

## 是否达到 18 路

**未达到。**

原因：用户提供的 10 条 key 中有 1 条重复，因此真实新增只有 9 条唯一可用 key。

所以：

- 目标：18 路
- 实际：17 路
- 差额：1 路

## 可回滚性

如需回滚，仅需恢复 `/root/.openclaw/openclaw.json` 到本次修改前版本即可。

## 最终回答口径

- 实际新增可用 key 数：**9**
- 总 boom / gpt-5.4 并发槽数：**17**
- 是否已经达到“18路可发任务”的状态：**否**
