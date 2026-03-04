# Cron 任务健康检查报告

**日期**: 2026-03-04 14:17 CST  
**检查人**: coder (subagent)

---

## 📊 总览

| 指标 | 数量 |
|------|------|
| 总任务数 | 21 |
| 已启用 (enabled=true) | 17 |
| 已禁用 (enabled=false) | 4 |
| 脚本路径缺失 | 1 |
| 使用 opus 模型 | 0 |

---

## ❌ 脚本路径缺失的任务

| 任务名 | ID | 缺失脚本 | 原状态 | 操作 |
|--------|-----|----------|--------|------|
| CRAS-洞察复盘-每周 | `23b6618c-...` | `/root/.openclaw/workspace/skills/cras/modules/insight-enhancer.js` | enabled=true | **已禁用** ✅ |

---

## ✅ 脚本路径存在的任务 (20/21)

所有其他任务引用的脚本路径均已验证存在。

---

## 🔍 已禁用任务清单 (修改后共4个)

| 任务名 | ID | 禁用原因 |
|--------|-----|----------|
| ClawHub-Skills-批量安装 | `5f7cc02f-...` | 原已禁用 |
| 飞书会话实时备份-每30分钟 | `dd8f4da9-...` | 原已禁用 |
| EvoMap-Evolver-自动进化 | `1c3f0f9a-...` | 原已禁用（上次执行超时） |
| CRAS-洞察复盘-每周 | `23b6618c-...` | **本次禁用** - 脚本不存在 |

---

## ⚠️ 近期有错误的任务

| 任务名 | 错误 | 连续错误数 |
|--------|------|-----------|
| CRAS-B-用户洞察分析-每日 | `cron announce delivery failed` | 1 |
| ISC-技能质量管理-每日 | `cron announce delivery failed` | 1 |

> 注：这两个任务的脚本路径存在，错误原因是消息投递失败，非脚本问题。

---

## 📝 模型使用统计

| 模型 | 任务数 |
|------|--------|
| claude/claude-sonnet-4-6-thinking | 11 |
| claude/claude-sonnet-4-6 | 5 |
| 未指定模型 | 2 |
| claude/claude-opus-* | **0** |

---

## 🔧 本次执行的修改

1. **禁用 `CRAS-洞察复盘-每周`** — 引用脚本 `insight-enhancer.js` 不存在
2. 更新 `/root/.openclaw/cron/jobs.json`

---

## 📋 DTO 拼写检查 (关联任务)

- `/root/.openclaw/workspace/skills/dto-core/index.js` — 未发现 `construdtor` 拼写错误 ✅
- `/root/.openclaw/workspace/skills/dto-core/platform-v3.js` — 未发现 `construdtor` 拼写错误 ✅
- 注：`core/platform-v3.js` 路径不存在，实际文件位于 `platform-v3.js`（根目录），已在该文件中确认无拼写错误

> 结论：DTO constructor 拼写问题已在之前修复，本次检查确认无残留。
