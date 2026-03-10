# `能力同步与PDCA-每4小时` Cron 超时根因分析报告

**分析时间**: 2026-03-06 18:31
**任务ID**: `merged-capability-pdca-4h`
**问题状态**: 已识别根因，建议修复方案

---

## 1. 任务入口与调用链

### 1.1 Cron 配置
```json
{
  "id": "merged-capability-pdca-4h",
  "name": "能力同步与PDCA-每4小时",
  "schedule": "5 */4 * * *",  // 每4小时第5分钟
  "agentId": "cron-worker",
  "timeoutSeconds": 600,       // 10分钟超时
  "model": "boom-cron-worker/gpt-5.3-codex"  // ⚠️ 强制指定模型
}
```

### 1.2 调用链
```
Cron触发
  → Agent(cron-worker)执行
    → 调用 boom-cron-worker/gpt-5.3-codex 模型
      → 执行脚本1: node skills/isc-capability-anchor-sync/index.js
        → 扫描 skills/ 目录
        → 读取 ISC rules
        → 生成 CAPABILITY-ANCHOR.md
      → 执行脚本2: node skills/pdca-engine/index.js
        → 执行 PDCA 单轮循环
        → 写入 memory/pdca-execution-log.jsonl
    → 返回结果 / 超时
```

### 1.3 脚本特性分析

| 脚本 | 复杂度 | 预期耗时 | IO密集 | CPU密集 |
|------|--------|----------|--------|---------|
| `isc-capability-anchor-sync` | O(n) 文件扫描 | <3s | ✅ | ❌ |
| `pdca-engine` | 固定5个任务 | <5s | ✅ | ❌ |

**结论**: 两个脚本本身轻量，正常执行应在 **10秒内完成**。

---

## 2. 超时证据与模式

### 2.1 运行记录摘录 (cron/runs/merged-capability-pdca-4h.jsonl)

| 时间戳 | 状态 | 耗时 | 备注 |
|--------|------|------|------|
| 1772727010852 | **error** | 300018ms | 刚好=300秒(timeoutSeconds旧值) |
| 1772741414815 | **error** | 300017ms | 刚好=300秒 |
| 1772752802989 | ok | 12969ms | 正常完成 |
| 1772756116800 | **error** | 600017ms | 刚好=600秒(timeoutSeconds新值) |
| 1772770532597 | **error** | 600016ms | 刚好=600秒 |
| 1772784397646 | ok | 19178ms | 正常完成 |

### 2.2 超时模式特征

```
超时时长 = timeoutSeconds (精确到毫秒级)
          ↓
说明: Agent 调用 LLM API 后未收到响应，等待至超时
          ↓
根因: API 层面问题，非脚本执行慢
```

### 2.3 对比数据

**使用 `zhipu-cron/glm-5` 的任务**（cron-worker 默认模型）:
- `merged-lto-aeo-hourly`: 全部成功，耗时 11-18s
- `merged-system-monitor-hourly`: 全部成功，耗时 9-13s
- `memory-summary-6h`: 全部成功，耗时 18-22s

**使用 `boom-cron-worker/gpt-5.3-codex` 的任务**:
- `merged-capability-pdca-4h`: 4次超时，2次成功
- `CRAS-A-主动学习引擎`: 成功但使用 fallback

---

## 3. 根因定位

### 3.1 直接原因

**Boom API 不稳定**，证据：
```
// 来自 new-isc-change-detector 错误日志
All models failed (2): 
  claude-cron-worker/claude-sonnet-4-6: HTTP 403 用户额度不足
  boom-cron-worker/gpt-5.3-codex: 500 未接收到上游响应内容 (timeout)
```

### 3.2 配置问题

**模型强制指定冲突**:
```
cron-worker agent 默认配置:
  primary: zhipu-cron/glm-5
  fallbacks: [boom-cron-worker/gpt-5.3-codex]

merged-capability-pdca-4h 任务配置:
  model: "boom-cron-worker/gpt-5.3-codex"  // 跳过主模型，直接用 fallback
```

**问题**: 任务绕过了稳定的主模型(glm-5)，直接使用不稳定的服务。

### 3.3 根因总结

| 层级 | 问题 | 影响 |
|------|------|------|
| **配置层** | cron job 强制指定 boom 模型 | 绕过稳定的 glm-5 |
| **服务层** | boom API 偶发 500/超时 | Agent 等待至 timeoutSeconds |
| **设计层** | 无请求级超时 + 重试机制 | 单次失败 = 整个任务失败 |

---

## 4. 修复方案

### 4.1 止血方案（低风险，立即可执行）

**移除强制模型指定**，让任务使用 agent 默认的稳定模型:

```json
// 修改 cron/jobs.json 中 merged-capability-pdca-4h 的 payload
{
  "payload": {
    "kind": "agentTurn",
    "message": "...",
    // 删除这行: "model": "boom-cron-worker/gpt-5.3-codex",
    "timeoutSeconds": 300  // 可适当降低
  }
}
```

**预期效果**: 任务使用 `zhipu-cron/glm-5`，稳定性大幅提升。

### 4.2 根治方案（需评估风险）

#### 方案A: 模型选择策略优化

```json
// cron-worker agent 配置优化
{
  "model": {
    "primary": "zhipu-cron/glm-5",
    "fallbacks": ["boom-cron-worker/gpt-5.3-codex"],
    "fallbackOnTimeout": true,  // 新增：超时时自动切换
    "requestTimeoutMs": 30000   // 新增：单次请求超时
  }
}
```

#### 方案B: Cron 任务超时配置规范

```json
// 建立 cron 任务 timeoutSeconds 设置标准
{
  "simple_script": 60,      // 单脚本执行
  "multi_script": 180,      // 多脚本串联
  "llm_intensive": 300,     // LLM 密集操作
  "external_api": 120       // 涉及外部 API
}
```

#### 方案C: API 健康检查前置

```javascript
// 在 cron 执行前检查 API 可用性
async function checkModelHealth(modelId) {
  // 快速 ping 测试
  const start = Date.now();
  try {
    await model.chat("ping", { timeout: 5000 });
    return { ok: true, latency: Date.now() - start };
  } catch {
    return { ok: false };
  }
}
```

---

## 5. 推荐行动

### 立即执行（止血）

1. **修改 `cron/jobs.json`**:
   ```bash
   # 移除 merged-capability-pdca-4h 的 model 字段
   jq '(.jobs[] | select(.id == "merged-capability-pdca-4h") | .payload) |= del(.model)' \
      cron/jobs.json > cron/jobs.json.tmp && mv cron/jobs.json.tmp cron/jobs.json
   ```

2. **降低 timeoutSeconds**:
   ```bash
   # 从 600 秒降到 180 秒
   jq '(.jobs[] | select(.id == "merged-capability-pdca-4h") | .payload.timeoutSeconds) = 180' \
      cron/jobs.json > cron/jobs.json.tmp && mv cron/jobs.json.tmp cron/jobs.json
   ```

### 后续优化

1. **审计所有 cron 任务**，移除不必要的强制模型指定
2. **为 boom API 添加请求级超时**，避免无限等待
3. **考虑 API 健康检查机制**，故障时自动切换

---

## 6. 风险评估

| 方案 | 风险等级 | 影响范围 | 回滚难度 |
|------|----------|----------|----------|
| 止血方案（移除 model） | 🟢 低 | 单任务 | 极易 |
| 降低 timeoutSeconds | 🟢 低 | 单任务 | 极易 |
| 模型选择策略优化 | 🟡 中 | 所有 cron | 需重启 |
| API 健康检查 | 🟡 中 | 所有任务 | 需代码变更 |

---

## 附录: 相关日志路径

- 任务运行记录: `/root/.openclaw/cron/runs/merged-capability-pdca-4h.jsonl`
- Cron 配置: `/root/.openclaw/cron/jobs.json`
- Agent 配置: `/root/.openclaw/openclaw.json`
- API 探测日志: `/root/.openclaw/workspace/scripts/logs/api-probe.log`
