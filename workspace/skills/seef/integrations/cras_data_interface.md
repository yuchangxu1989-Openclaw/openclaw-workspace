# CRAS 数据接口标准化规范

## 概述

定义 CRAS 与 SEEF 之间的数据交换格式，确保用户洞察报告可被 SEEF 无缝消费。

## 数据流向

```
┌─────────┐    ┌─────────────────┐    ┌─────────┐
│  CRAS   │───→│ 标准化数据接口  │───→│  SEEF   │
│         │    │ (JSON Schema)   │    │         │
└─────────┘    └─────────────────┘    └─────────┘
```

## 核心数据模型

### 1. 用户意图洞察报告 (IntentInsightReport)

```json
{
  "schema_version": "1.0.0",
  "report_id": "cras_20260223_190000",
  "generated_at": "2026-02-23T19:00:00+08:00",
  "period": {
    "start": "2026-02-23T18:00:00+08:00",
    "end": "2026-02-23T19:00:00+08:00"
  },
  "user_profile": {
    "primary_intent": "command",
    "emotion_state": "neutral",
    "interaction_pattern": "recurring-theme",
    "total_interactions": 12,
    "session_duration_avg": 360
  },
  "skill_interactions": [
    {
      "skill_id": "isc-core",
      "skill_name": "ISC智能标准中心",
      "invocation_count": 5,
      "success_rate": 1.0,
      "avg_response_time_ms": 1200,
      "user_satisfaction": 0.85,
      "pain_points": [
        {
          "type": "understanding_gap",
          "description": "用户对变更识别概念理解有偏差",
          "frequency": 2,
          "severity": "medium"
        }
      ],
      "workarounds": []
    }
  ],
  "system_health": {
    "cron_jobs_status": "healthy",
    "active_skills": 17,
    "error_rate": 0.0
  }
}
```

### 2. 技能使用行为数据 (SkillUsageBehavior)

```json
{
  "skill_id": "seef",
  "behavior_patterns": [
    {
      "pattern_type": "frequent_combination",
      "description": "用户常将 evaluator + discoverer 组合使用",
      "skills_involved": ["evaluator", "discoverer"],
      "frequency": 8,
      "suggested_action": "考虑合并为单一工作流"
    },
    {
      "pattern_type": "manual_bypass",
      "description": "用户手动跳过 validator 步骤",
      "frequency": 3,
      "severity": "high",
      "suggested_action": "检查 validator 是否过于严格"
    }
  ],
  "performance_metrics": {
    "avg_execution_time_ms": 45000,
    "success_rate": 0.92,
    "rollback_rate": 0.08
  }
}
```

### 3. 进化建议 (EvolutionSuggestion)

```json
{
  "suggestion_id": "evo_20260223_001",
  "source": "cras_behavior_analysis",
  "target_skill": "seef",
  "suggestion_type": "workflow_optimization",
  "priority": "high",
  "description": "基于用户使用模式，建议将 evaluator 和 discoverer 合并为单一命令",
  "expected_impact": {
    "user_efficiency": "+30%",
    "error_rate": "-15%"
  },
  "confidence": 0.85
}
```

## API 接口

### 获取最新洞察报告

```http
GET /api/cras/v1/reports/latest
Authorization: Bearer {token}

Response:
{
  "report": IntentInsightReport,
  "timestamp": "2026-02-23T19:00:00+08:00"
}
```

### 获取技能行为数据

```http
GET /api/cras/v1/skills/{skill_id}/behavior
Authorization: Bearer {token}

Response:
{
  "skill_id": "seef",
  "behavior": SkillUsageBehavior
}
```

### 订阅进化建议

```http
POST /api/cras/v1/subscriptions/evolution-suggestions
Authorization: Bearer {token}
Content-Type: application/json

{
  "subscriber_id": "seef",
  "callback_url": "https://seef.internal/api/suggestions",
  "filters": {
    "min_priority": "high",
    "target_skills": ["seef", "isc-core"]
  }
}
```

## SEEF 消费方式

### 1. 直接调用（同步）

```python
from cras_client import CRASClient

cras = CRASClient()
report = cras.get_latest_report()

# 传递给 evaluator
evaluator.evaluate(skill_path, cras_report=report)
```

### 2. 事件订阅（异步）

```python
from cras_client import CRASClient

cras = CRASClient()

def on_new_suggestion(suggestion):
    if suggestion['target_skill'] == 'seef':
        # 触发 SEEF 进化流程
        seef.trigger_evolution(suggestion)

cras.subscribe_evolution_suggestions(on_new_suggestion)
```

### 3. 定时拉取（Cron）

```bash
# 每小时拉取一次
0 * * * * /root/.openclaw/workspace/skills/seef/scripts/fetch_cras_data.py
```

## 数据存储

CRAS 报告存储路径：
```
/root/.openclaw/workspace/skills/cras/reports/
├── intent_insight/
│   └── {YYYY-MM-DD}/
│       └── report_{HHMMSS}.json
├── behavior_patterns/
│   └── {skill_id}/
│       └── patterns.json
└── evolution_suggestions/
    └── pending/
        └── suggestion_{id}.json
```

## 版本历史

| 版本 | 时间 | 变更 |
|:-----|:-----|:-----|
| 1.0.0 | 2026-02-23 | 初始版本，定义核心数据模型 |
