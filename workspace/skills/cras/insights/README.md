# CRAS Insights Directory

## 目录说明

此目录存储CRAS-B用户洞察分析中枢生成的洞察数据，供Evaluator和其他模块读取。

## 文件命名规范

```
user-insight-YYYY-MM-DD.json       # 每日用户洞察分析
capability-gap-YYYY-MM-DD.json     # 能力缺口识别
optimization-rec-YYYY-MM-DD.json   # 优化建议
```

## 数据结构

### user-insight-*.json

```json
{
  "insight_id": "insight_YYYYMMDD_HHMMSS",
  "generated_at": "ISO8601时间戳",
  "analysis_period": "分析周期",
  "user_profile": {
    "total_interactions": "累计交互次数",
    "primary_intent": "主要意图",
    "emotional_state": "情绪状态",
    "interaction_pattern": "交互模式"
  },
  "intent_distribution": {},
  "high_frequency_operations": [],
  "capability_gaps": [],
  "optimization_recommendations": []
}
```

## 使用方式

### Evaluator读取洞察数据

```javascript
const fs = require('fs');
const path = require('path');

// 读取最新洞察
const insightsDir = '/root/.openclaw/workspace/skills/cras/insights';
const files = fs.readdirSync(insightsDir)
  .filter(f => f.startsWith('user-insight-'))
  .sort()
  .reverse();

const latestInsight = JSON.parse(
  fs.readFileSync(path.join(insightsDir, files[0]), 'utf-8')
);

console.log('能力缺口:', latestInsight.capability_gaps);
console.log('优化建议:', latestInsight.optimization_recommendations);
```

### CRAS-B保存洞察数据

```javascript
const insight = {
  insight_id: `insight_${Date.now()}`,
  generated_at: new Date().toISOString(),
  // ... 其他字段
};

const filename = `user-insight-${new Date().toISOString().split('T')[0]}.json`;
fs.writeFileSync(
  path.join('/root/.openclaw/workspace/skills/cras/insights', filename),
  JSON.stringify(insight, null, 2)
);
```

## 数据保留策略

- 保留最近30天的洞察数据
- 每月1日自动归档上月数据到 `insights/archive/YYYY-MM/`
- 归档数据保留6个月

## 版本历史

- 2026-03-01: 初始化insights目录结构
