# GLM-5 模型路由方案

> 日期：2026-03-10
> 状态：设计稿

## 一、现状分析

### 基础设施

| 项目 | 详情 |
|------|------|
| GLM-5 provider 数量 | 22个（zhipu-main, zhipu-core, zhipu-researcher, zhipu-coder 等） |
| API 端点 | `https://open.bigmodel.cn/api/coding/paas/v4` |
| 协议 | OpenAI-compatible (`openai-completions`) |
| 上下文窗口 | 128K tokens（cron 配置为 200K） |
| 最大输出 | 128K tokens |
| API Key | 每个 provider 独立 key，共约 11 个不同 key |

### 当前模型分配

| Agent | Primary | Fallback 1 | Fallback 2 |
|-------|---------|------------|------------|
| main/researcher/coder/... | claude-opus-4-6-thinking | gpt-5.3-codex | **glm-5**（从未触发） |
| cron-worker | **glm-5**（唯一主用） | gpt-5.3-codex | claude-opus-4-6-thinking |

**问题**：GLM-5 仅作为第三级 fallback，实际从未被主动调用（cron-worker 除外）。11 个 key 的配额完全浪费。

### 可用性验证

```
测试时间：2026-03-10 17:38 CST
测试 key：zhipu-main, zhipu-core
测试模型：glm-5
HTTP 状态：200 ✅
响应延迟：正常
功能测试：JSON 格式修复 ✅（能正确识别并修复畸形 JSON）
结论：GLM-5 API 完全可用
```

---

## 二、路由策略设计

### 核心原则

```
成本优先：能用 GLM-5 解决的任务不走 Opus
质量兜底：复杂推理任务必须走 Opus
渐进迁移：先迁移低风险任务，验证稳定后扩大范围
```

### 2.1 适合 GLM-5 的任务类型（Tier 1 - 立即迁移）

| 任务类型 | 说明 | 典型场景 |
|----------|------|----------|
| **格式修复** | JSON/YAML/TOML 语法修复、格式化 | 畸形配置文件修复、字段类型纠正 |
| **字段补全** | 根据模板补全缺失字段 | Bitable 记录补全、表单数据填充 |
| **批量改造** | 重复性文本/代码变换 | 批量重命名、正则替换、模板渲染 |
| **简单 code fix** | 语法错误修复、lint 修复 | 缺少分号、括号不匹配、import 缺失 |
| **文本翻译/润色** | 中英互译、文案改写 | 文档翻译、commit message 生成 |
| **数据提取** | 从文本中提取结构化数据 | 解析日志、提取表格数据 |
| **摘要生成** | 简单文本摘要 | 会议纪要摘要、文章概述 |
| **模板填充** | 按模板生成内容 | 报告模板、邮件模板 |

### 2.2 必须走 Opus 的任务类型（Tier 3 - 不迁移）

| 任务类型 | 说明 | 原因 |
|----------|------|------|
| **架构设计** | 系统设计、方案规划 | 需要深度推理和全局视野 |
| **复杂分析** | 多维度数据分析、根因分析 | 需要长链推理 |
| **裁决殿** | 方案评审、技术决策 | 需要高质量判断力 |
| **深度推理** | 数学证明、逻辑推导 | GLM-5 推理能力不足 |
| **多步编排** | 复杂 agent 编排、工作流设计 | 需要精确的指令遵循 |
| **安全审计** | 代码安全审查、权限分析 | 不能容忍误判 |
| **主会话对话** | 与用户直接交互 | 需要最高质量的理解和表达 |

### 2.3 可选迁移的任务类型（Tier 2 - 观察后决定）

| 任务类型 | 条件 | 建议 |
|----------|------|------|
| **Web 搜索摘要** | 搜索结果简单时 | 先用 GLM-5 试跑，质量不达标回退 |
| **代码审查** | 简单 PR、格式检查 | 仅限 lint 级别审查 |
| **文档生成** | 结构化文档 | 模板化文档可以，创意性文档不行 |
| **Feishu 文档操作** | 读写、格式化 | 纯操作类可以，内容生成看复杂度 |

---

## 三、spawn 时指定模型的方法

### 3.1 model 参数格式

```
格式：{provider}/{model-id}
```

在 `sessions_spawn` 中通过 `model` 参数指定：

```javascript
// 使用 GLM-5
sessions_spawn({
  task: "修复这个 JSON 文件的格式错误",
  model: "zhipu-main/glm-5"
})

// 使用 Claude Opus（默认，可不指定）
sessions_spawn({
  task: "设计微服务架构方案",
  model: "claude-main/claude-opus-4-6-thinking"
})
```

### 3.2 可用的 GLM-5 provider 映射

| 用途 | Provider 名称 | model 参数值 |
|------|--------------|-------------|
| 通用/主会话 | zhipu-main | `zhipu-main/glm-5` |
| 核心任务 | zhipu-core | `zhipu-core/glm-5` |
| 研究类 | zhipu-researcher | `zhipu-researcher/glm-5` |
| 编码类 | zhipu-coder | `zhipu-coder/glm-5` |
| 审查类 | zhipu-reviewer | `zhipu-reviewer/glm-5` |
| 写作类 | zhipu-writer | `zhipu-writer/glm-5` |
| 分析类 | zhipu-analyst | `zhipu-analyst/glm-5` |
| 侦察类 | zhipu-scout | `zhipu-scout/glm-5` |
| 定时任务 | zhipu-cron-worker | `zhipu-cron-worker/glm-5` |
| Worker 03-06 | zhipu-worker-{03-06} | `zhipu-worker-03/glm-5` 等 |

### 3.3 路由决策伪代码

```python
def choose_model(task_type, complexity):
    """
    路由决策逻辑
    """
    # Tier 1: 直接走 GLM-5
    tier1_tasks = [
        "format_fix",      # 格式修复
        "field_complete",   # 字段补全
        "batch_transform",  # 批量改造
        "simple_code_fix",  # 简单代码修复
        "translation",      # 翻译润色
        "data_extraction",  # 数据提取
        "summary",          # 摘要生成
        "template_fill",    # 模板填充
    ]
    
    # Tier 3: 必须走 Opus
    tier3_tasks = [
        "architecture",     # 架构设计
        "deep_analysis",    # 复杂分析
        "adjudication",     # 裁决殿
        "deep_reasoning",   # 深度推理
        "orchestration",    # 多步编排
        "security_audit",   # 安全审计
        "user_dialogue",    # 主会话对话
    ]
    
    if task_type in tier1_tasks:
        return "zhipu-{agent}/glm-5"
    elif task_type in tier3_tasks:
        return "claude-{agent}/claude-opus-4-6-thinking"
    else:
        # Tier 2: 根据复杂度决定
        if complexity <= "medium":
            return "zhipu-{agent}/glm-5"
        else:
            return "claude-{agent}/claude-opus-4-6-thinking"
```

---

## 四、实施计划

### Phase 1：立即生效（本周）

1. **cron 任务全部走 GLM-5**（已配置，确认运行正常）
2. **批量数据处理 subagent 指定 GLM-5**
   - 格式修复类 spawn 加 `model: "zhipu-worker-XX/glm-5"`
   - 字段补全类 spawn 加 `model: "zhipu-worker-XX/glm-5"`

### Phase 2：一周后

3. **简单 code fix subagent 迁移**
   - lint 修复、import 补全等
4. **翻译/摘要类任务迁移**

### Phase 3：两周后评估

5. 收集 GLM-5 任务的成功率和质量数据
6. 决定 Tier 2 任务是否迁移
7. 调整路由策略

### 成本预估

| 场景 | 当前（全 Opus） | 迁移后 |
|------|----------------|--------|
| Tier 1 任务占比 | ~40% 的 subagent 调用 | 迁移至 GLM-5 |
| 预计节省 | - | Opus 调用量减少 ~35-40% |
| GLM-5 成本 | 几乎为零（配额内） | 极低 |

---

## 五、注意事项

1. **GLM-5 的 reasoning_content**：GLM-5 返回中有 `reasoning_content` 字段（类似 thinking），实际 content 可能为空或在 reasoning 中。需确认 OpenClaw 的 openai-completions adapter 能正确处理。
2. **max_tokens 设置**：GLM-5 的 128K max_tokens 配置偏大，实际任务建议按需设置以控制成本。
3. **并发限制**：11 个不同 key 可以并行调用，天然支持高并发 subagent 场景。
4. **回退机制**：当前 fallback 链已配置 `glm-5 → gpt-5.3 → opus`（cron-worker），其他 agent 为 `opus → gpt-5.3 → glm-5`。主动路由到 GLM-5 时，如果失败应自动 fallback 到 Opus。
5. **中文优势**：GLM-5 在中文任务上表现良好，中文相关任务优先考虑路由到 GLM-5。
