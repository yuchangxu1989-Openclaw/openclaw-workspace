# boom GPT-5.4 新增2 Key 复测简报

时间：2026-03-06 19:49 GMT+8

## 结论
- 新增 2 个 boom / gpt-5.4 key **均已直接 HTTP 实测 200**。
- 与当前已接入 boom key 池比对后，**2 个都不重复**。
- 更新后，当前 **总唯一可用 boom / gpt-5.4 key = 19 个**。
- 因此当前可按 **19 并发槽** 评估 boom/gpt-5.4 并行上限（按 1 key ≈ 1 独立槽位的当前口径）。

## 新增 Key 测试结果
| 标识 | 指纹(sha256前16) | 掩码 | HTTP | 结果 |
|---|---|---|---:|---|
| boom-plus-18 | `59aa890fa2afa089` | `sk-Hcnow...QK9QMn` | 200 | 可用 |
| boom-plus-19 | `099930ee0c506b6d` | `sk-QDKiS...nat0pV` | 200 | 可用 |

## 去重检查
- 现有 openclaw.json 中 boom provider 数：**17**
- 新增 key 指纹：
  - `59aa890fa2afa089`
  - `099930ee0c506b6d`
- 与现有 17 个已接入 boom key 指纹对比：**均无命中**

## 当前总量判断
- 之前已接入且唯一的 boom key：**17**
- 本次新增且可用：**2**
- 当前总唯一可用 boom/gpt-5.4 key：**19**

## 已执行改动
- 已将 2 个新 key 以最小改动接入 `/root/.openclaw/openclaw.json`
- 新增 provider：
  - `boom-main-04`
  - `boom-main-05`
- 已提交 commit：`eaf72a5` (`chore: add 2 boom gpt-5.4 keys`)

## 说明
- 本次 HTTP 测试使用 endpoint：`POST https://boom.aihuige.com/v1/chat/completions`
- 测试 model：`gpt-5.4`
- 判定标准：返回 **HTTP 200** 视为该 key 当前可直接用于 boom/gpt-5.4
