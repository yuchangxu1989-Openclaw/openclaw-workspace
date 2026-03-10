# 智谱 / GLM-5 Key 利用率审计

> 审计时间：2026-03-10 18:27 CST
> 审计人：scout-02 (subagent)

---

## 一、总览

| 指标 | 数值 |
|------|------|
| zhipu provider 总数 | 23 |
| 独立 API Key 数量 | 19 |
| 被 agent fallback 引用的 provider | 19 |
| 未被任何 agent 引用的 provider | **4** |

---

## 二、19 个独立 API Key 分布

| API Key（脱敏） | 绑定 Provider | 是否被路由引用 |
|-----------------|---------------|---------------|
| a474ebc9...N8JC | zhipu-embedding, zhipu-researcher | ⚠️ embedding 未引用，researcher 已引用 |
| ce9cf293...JKkz | zhipu-multimodal, zhipu-core, zhipu-coder | ⚠️ multimodal/core 未引用，coder 已引用 |
| d6338644...UXst | zhipu-cron, zhipu-main | ⚠️ cron 未引用，main 已引用 |
| 03d1f574...LEE1 | zhipu-researcher-02 | ✅ |
| 1c08f2e9...sARX | zhipu-worker-04 | ✅ |
| 2255ff70...4pal | zhipu-cron-worker-02 | ✅ |
| 4f505c9e...K3MT | zhipu-analyst | ✅ |
| 61abcaf0...Rk9R | zhipu-cron-worker | ✅ |
| 9183dba9...G5AE | zhipu-analyst-02 | ✅ |
| 938112a2...YFGb | zhipu-scout-02 | ✅ |
| 9560d66f...Oj9T | zhipu-reviewer-02 | ✅ |
| 9c381947...cMnr | zhipu-writer | ✅ |
| a05e19de...IJhi | zhipu-worker-06 | ✅ |
| a4afaecc...prBs | zhipu-coder-02 | ✅ |
| afe940bd...crfi | zhipu-worker-03 | ✅ |
| c803b620...sFoq | zhipu-writer-02 | ✅ |
| c81d7193...HWj0 | zhipu-worker-05 | ✅ |
| d2da4b23...ijCJ | zhipu-reviewer | ✅ |
| dbd5910e...Kypl | zhipu-scout | ✅ |

---

## 三、4 个未引用 Provider 详细分析

### 3.1 zhipu-embedding

| 项目 | 详情 |
|------|------|
| 注册模型 | `embedding-3`（非 GLM-5） |
| API Key | a474ebc9...N8JC |
| 共享 Key 的活跃 Provider | `zhipu-researcher` |
| 状态 | 定义在 `agents.defaults.models` 中，但无任何 agent 在 fallback 链中引用 |
| 用途 | 文本向量化（embedding），与 GLM-5 对话模型用途不同 |
| 可否重新分配 | ⚠️ 谨慎。embedding 是独立能力，未来可能需要。Key 本身已通过 researcher 被使用 |

### 3.2 zhipu-multimodal

| 项目 | 详情 |
|------|------|
| 注册模型 | `glm-4v-plus`（多模态，非 GLM-5） |
| API Key | ce9cf293...JKkz |
| 共享 Key 的活跃 Provider | `zhipu-coder` |
| 状态 | 定义在 `agents.defaults.models` 中，但无任何 agent 在 fallback 链中引用 |
| 用途 | 图像理解/多模态推理，与 GLM-5 纯文本对话用途不同 |
| 可否重新分配 | ⚠️ 谨慎。多模态是独立能力，未来可能需要。Key 本身已通过 coder 被使用 |

### 3.3 zhipu-cron

| 项目 | 详情 |
|------|------|
| 注册模型 | `glm-5` |
| API Key | d6338644...UXst |
| 共享 Key 的活跃 Provider | `zhipu-main` |
| 状态 | 定义在 `agents.defaults.models` 中，但无任何 agent 在 fallback 链中引用 |
| 用途 | 原设计为 cron 任务专用，但实际 cron-worker agent 使用的是 `zhipu-cron-worker`（独立 key） |
| 可否重新分配 | ✅ **可以**。纯冗余别名，与 zhipu-main 共享同一 key，不增加并发容量。可安全移除或重新分配给新 agent |

### 3.4 zhipu-core

| 项目 | 详情 |
|------|------|
| 注册模型 | `glm-5` |
| API Key | ce9cf293...JKkz |
| 共享 Key 的活跃 Provider | `zhipu-coder` |
| 状态 | 定义在 `agents.defaults.models` 中，但无任何 agent 在 fallback 链中引用 |
| 用途 | 原设计为核心任务专用，但实际未被任何 agent 路由 |
| 可否重新分配 | ✅ **可以**。纯冗余别名，与 zhipu-coder 共享同一 key，不增加并发容量。可安全移除或重新分配给新 agent |

---

## 四、API 可用性测试

| 测试项 | 结果 |
|--------|------|
| 测试 Provider | zhipu-core |
| 测试 Key | ce9cf293...JKkz |
| 测试模型 | glm-5 |
| API 端点 | `https://open.bigmodel.cn/api/coding/paas/v4/chat/completions` |
| HTTP 状态码 | **200 ✅** |
| 响应延迟 | **0.97s** |
| Token 消耗 | prompt=8, completion=10, total=18 |
| 备注 | GLM-5 返回 `reasoning_content` 字段，实际 `content` 为空（max_tokens=10 截断）。API 完全可用 |

---

## 五、结论与建议

### 核心发现

1. **19 个独立 API Key 中，没有完全闲置的 key**。4 个未引用的 provider 全部与活跃 provider 共享 key，底层 key 均在使用中。
2. **4 个 provider 别名是冗余配置**，不是"浪费的 key"。
3. **zhipu-embedding 和 zhipu-multimodal** 是特殊模型（embedding-3 / glm-4v-plus），虽然当前未被路由，但保留了未来使用 embedding 和多模态能力的入口。
4. **zhipu-cron 和 zhipu-core** 是纯冗余的 GLM-5 别名，可安全处置。

### 建议操作

| 操作 | Provider | 建议 | 优先级 |
|------|----------|------|--------|
| 保留 | zhipu-embedding | 保留 embedding-3 能力入口，未来 RAG/向量检索可能需要 | 低 |
| 保留 | zhipu-multimodal | 保留 glm-4v-plus 多模态能力入口，未来图像理解可能需要 | 低 |
| 可重新分配 | zhipu-cron | 移除或改绑独立 key 后分配给新 agent | 中 |
| 可重新分配 | zhipu-core | 移除或改绑独立 key 后分配给新 agent | 中 |

### 关于"重新分配"的注意事项

- 当前 zhipu-cron 和 zhipu-core 与其他 provider 共享 key，直接分配给新 agent **不会增加 API 并发容量**
- 如需真正增加容量，应为它们申请**新的独立 API Key**
- 如果只是需要更多路由别名（如新增 agent 需要 GLM-5 fallback），直接引用现有 provider 即可，无需新建

---

## 六、Key 利用率总结

```
总 Key 数:     19 个独立 key
活跃使用:      19 个（100%）— 全部通过至少一个 provider 被 agent 引用
Provider 利用率: 19/23 = 82.6%（4 个 provider 别名冗余）
实际浪费:       0 个 key（底层 key 均在使用）
可优化项:       2 个冗余 GLM-5 别名（zhipu-cron, zhipu-core）可清理或重新分配
```
