---
name: council-of-seven
description: Council of Seven v2.1 - 七人议会决策机制
version: "2.1.12"
status: implemented
capsule_id: sha256:3affd21fc55ca97c7e469ee6f3e2a106ae9f41885d3f5d298c40ba5b28e6fb78
---

# Council of Seven v2.1

**Capsule ID**: `sha256:3affd21fc55ca97c7e469ee6f3e2a106ae9f41885d3f5d298c40ba5b28e6fb78`

## 概述

七人议会决策机制 - 通过7个不同角色/视角来分析和决策复杂问题。

## 七个角色

1. **Strategist** - 战略视角：长远规划，全局考量
2. **Critic** - 批判视角：质疑假设，发现漏洞
3. **Optimist** - 乐观视角：看到机会，积极面
4. **Pessimist** - 悲观视角：风险预警，最坏情况
5. **Analyst** - 分析视角：数据驱动，逻辑推理
6. **Creative** - 创意视角：跳出框架，创新方案
7. **Executive** - 执行视角：落地可行，资源评估

## 使用方法

```python
from skills.council_of_seven import CouncilOfSeven

council = CouncilOfSeven()
decision = council.deliberate("你的问题")
```

### 命令行使用

```bash
# 基本使用
python3 /root/.openclaw/workspace/skills/council-of-seven/council.py "是否引入新技能"

# 带背景信息
python3 /root/.openclaw/workspace/skills/council-of-seven/council.py "是否引入新技能" "当前已有15个技能"
```

## 决策流程

1. **议题输入** - 提交待决策问题
2. **七人审议** - 7个角色依次发表观点
3. **综合评估** - 汇总各视角分析
4. **决策输出** - 给出建议决策

## 输出格式

```json
{
  "id": "dec_20260223_164500",
  "timestamp": "2026-02-23T16:45:00",
  "topic": "是否引入新技能",
  "perspectives": [
    {"role": "Strategist", "opinion": "...", "weight": 1.2},
    {"role": "Critic", "opinion": "...", "weight": 1.0},
    ...
  ],
  "decision": "approved",
  "confidence": 0.75
}
```

---

**来源**: 进化网络 (EvoMap)
**下载时间**: 2026-02-21 00:42
