# PDCA 超时修复方案 & 策略裁决

**发布时间**: 2026-03-06 18:35 CST
**状态**: 🔴 需立即执行
**根因引用**: [pdca-timeout-root-cause.md](./pdca-timeout-root-cause.md)

---

## 0. 一句话结论

> **`merged-capability-pdca-4h` 必须从 Codex 名单中移除，立刻改 `cron/jobs.json`。**
> 这是一个轻量级同步任务，被塞到了不稳定的 Codex API 上，导致 66% 超时率。它不配占用 Codex 名额。

---

## 1. 裁决：merged-capability-pdca-4h 是否保留在 Codex 名单

### 结论：❌ 不保留。移除。

| 维度 | 分析 | 判定 |
|------|------|------|
| **任务复杂度** | 两个脚本：`isc-capability-anchor-sync`(文件扫描O(n)) + `pdca-engine`(固定5任务循环)。正常10秒内完成 | 🟢 glm-5 绰绰有余 |
| **Codex 能力需求** | 不涉及搜索、推理、创意生成，纯执行型任务 | 🟢 无需 Codex |
| **稳定性记录** | 最近6次运行：4次超时(600s精确超时)，2次成功。**66%失败率** | 🔴 Codex 通道是瓶颈 |
| **业务影响** | 能力锚点不同步 → CAPABILITY-ANCHOR.md 过时；PDCA循环中断 → 质量改进停滞 | 🟡 中等，需要稳定运行 |
| **替代可行性** | 同类任务(lto-aeo, system-monitor)在 glm-5 上 100% 成功，11-22s | 🟢 完全可替 |

**核心理由**：Codex 名额是稀缺资源（boom API 不稳定 + 有配额限制），应留给真正需要高级推理和搜索的任务。PDCA-4h 是运维同步型任务，浪费在 Codex 上是资源错配。

---

## 2. 替换后的 4 个 Codex 候选

### 保留 3 个（理由充分）

| 序号 | Job ID | 任务名 | 保留理由 |
|------|--------|--------|----------|
| 1 | `b76c9b20` | CRAS-A-主动学习引擎 | 需要 tavily-search 搜索3个主题 + 跨源综合分析萃取洞察，glm-5 搜索能力不足 |
| 2 | `d9d8123d` | CRAS-E-自主进化 | 需要遍历知识库做模式识别 + 生成技能优化建议，依赖深度推理能力 |
| 3 | `f6f0ba02` | CRAS-D-战略调研 | 需要搜索5个主题 + 生成战略洞察报告，是最重 LLM 密集的任务 |

### 第 4 个名额：🚫 暂不填补

**理由**：

1. **当前 boom API 稳定性不足**以支撑第 4 个任务。3 个已经够吃力
2. CRAS-A(09:00)、CRAS-D(10:00)、CRAS-E(02:00) 在时间上错开，互不干扰。加第 4 个会增加并发冲突风险
3. **后续如果 boom API 恢复稳定**，优先考虑的候选：
   - `merged-isc-quality-daily`（ISC技能质量管理）——当前用默认模型，但涉及审计 + 评测生成，Codex 可提质
   - `CRAS-洞察复盘-每周`（已禁用）——如果恢复，适合 Codex

### 修改后的 Codex 名单

```
// cron-model-policy.md 更新为：
允许 payload.model = boom-cron-worker/gpt-5.3-codex 的任务 (3个):
1. b76c9b20  CRAS-A-主动学习引擎
2. d9d8123d  CRAS-E-自主进化
3. f6f0ba02  CRAS-D-战略调研

已移除:
- merged-capability-pdca-4h (改用默认模型 zhipu-cron/glm-5)
```

---

## 3. 止血方案（立即执行）

### 3.1 修改 cron/jobs.json

对 `merged-capability-pdca-4h` 做两处修改：

```diff
{
  "id": "merged-capability-pdca-4h",
  "payload": {
    "kind": "agentTurn",
    "message": "...",
-   "model": "boom-cron-worker/gpt-5.3-codex",
-   "timeoutSeconds": 600
+   "timeoutSeconds": 180
  }
}
```

**变更说明**：
- 删除 `model` 字段 → 回落到 cron-worker 默认的 `zhipu-cron/glm-5`
- timeout 从 600s 降到 180s → 脚本本身 <10s，180s 已经是 18x 安全余量

### 3.2 更新 cron-model-policy.md

将 Codex 名单从 4 个改为 3 个，移除 `merged-capability-pdca-4h`。

### 3.3 执行命令

```bash
# Step 1: 备份
cp /root/.openclaw/cron/jobs.json /root/.openclaw/cron/jobs.json.bak-$(date +%Y%m%d%H%M)

# Step 2: 修改 jobs.json (移除 model 字段 + 降低 timeout)
jq '(.jobs[] | select(.id == "merged-capability-pdca-4h") | .payload) |= (del(.model) | .timeoutSeconds = 180)' \
   /root/.openclaw/cron/jobs.json > /tmp/jobs-fixed.json && \
   mv /tmp/jobs-fixed.json /root/.openclaw/cron/jobs.json

# Step 3: 验证
node /root/.openclaw/workspace/scripts/audit-cron-model-policy.js
```

### 3.4 预期效果

| 指标 | 修改前 | 修改后 |
|------|--------|--------|
| 成功率 | ~33% (2/6) | ~99% (参照同类任务) |
| 平均耗时 | 19s(成功) / 600s(超时) | ~15-20s |
| 模型 | boom-codex (不稳定) | glm-5 (稳定) |
| 超时上限 | 600s | 180s |

---

## 4. 根治方案（后续迭代）

### 4.1 为所有 Codex 任务加 fallback 策略

当前 CRAS-A/D/E 也在用 boom-codex，如果 boom 挂了它们也会超时。建议：

```
策略: 如果 boom-codex 连续失败 ≥ 2 次，自动降级到 glm-5
实现: 在 cron-worker agent 层面加 circuit breaker
触发条件: consecutiveErrors >= 2
降级行为: 临时移除 payload.model，让默认模型接管
恢复条件: 每小时探测一次 boom API 可用性
```

### 4.2 建立 Codex 名额准入标准

一个 cron 任务要进入 Codex 名单，必须同时满足：

| 条件 | 说明 |
|------|------|
| **需要搜索** | 任务包含 tavily-search 或 web_search 调用 |
| **需要深度推理** | 涉及跨源综合分析、模式识别、创意生成 |
| **glm-5 不可替代** | 在 glm-5 上执行过，输出质量明显低于 Codex |
| **容忍间歇性失败** | 任务失败不影响系统核心功能（否则不应依赖不稳定通道） |

`merged-capability-pdca-4h` 在 4 个条件中 **全部不满足**。

### 4.3 Codex 通道健康度仪表盘

将 boom API 的成功率、延迟、错误类型纳入系统监控：

```
指标:
- boom_api_success_rate (过去24h)
- boom_api_p50_latency
- boom_api_p99_latency  
- boom_api_timeout_count

告警:
- success_rate < 80% → 发飞书告警
- timeout_count > 3/day → 考虑暂停 Codex 任务
```

---

## 5. 行动指令

| 优先级 | 行动 | 执行人 | 时间 |
|--------|------|--------|------|
| 🔴 P0 | 修改 jobs.json (移除 model + 降 timeout) | **立即** | <5min |
| 🔴 P0 | 更新 cron-model-policy.md (4→3) | **立即** | <2min |
| 🟡 P1 | 验证下一次 PDCA cron 运行正常 | 等待下一个 */4 触发 | 自动 |
| 🟡 P1 | 审计其他 3 个 Codex 任务的超时记录 | 本周内 | ~30min |
| 🟢 P2 | 设计 circuit breaker 降级策略 | 下周 | ~2h |
| 🟢 P2 | 建立 Codex 通道健康度监控 | 下周 | ~1h |

---

## 6. 是否立刻改 cron/jobs.json？

### **是。立刻改。**

理由：
1. 这是一个**纯配置变更**，不涉及代码修改，回滚只需还原 JSON
2. 风险为 **零**——glm-5 已被证明能处理同等复杂度的任务（参照 lto-aeo、system-monitor 的 100% 成功率）
3. 不改的代价：每 4 小时有 66% 概率超时，能力锚点和 PDCA 循环持续中断
4. 下一次触发在 `*/4` 整点后第 5 分钟，越早改越早止血

**不需要等待任何额外验证或审批。这不是架构变更，这是修一个配错了的配置。**
