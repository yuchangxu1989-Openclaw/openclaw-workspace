# EvoMap 发布流程对接规范

## 概述

定义 SEEF 向 EvoMap 进化网络推荐优质技能的流程。所有推荐需经人工确认后方可发布。

## 核心原则

> **SEEF 负责筛选和推荐，人工负责最终确认**

```
┌─────────┐    ┌─────────────┐    ┌─────────┐    ┌─────────┐
│  SEEF   │───→│  推荐队列   │───→│  人工   │───→│ EvoMap  │
│         │    │  (待确认)   │    │  确认   │    │  网络   │
└─────────┘    └─────────────┘    └─────────┘    └─────────┘
```

## 推荐标准

### 自动推荐条件（满足任一）

| 条件 | 阈值 | 说明 |
|:-----|:----:|:-----|
| 使用频率 | >= 10次/天 | 高频使用 |
| 用户满意度 | >= 0.85 | 高满意度 |
| 成功率 | >= 0.95 | 稳定可靠 |
| 独特价值 | 无替代技能 | 填补能力空白 |

### 推荐评分算法

```python
def calculate_recommendation_score(skill_metrics):
    score = (
        skill_metrics['usage_frequency'] * 0.3 +
        skill_metrics['user_satisfaction'] * 0.25 +
        skill_metrics['success_rate'] * 0.25 +
        skill_metrics['uniqueness_score'] * 0.2
    )
    return score

# 推荐阈值
RECOMMENDATION_THRESHOLD = 0.80
```

## 数据模型

### 技能推荐包 (SkillRecommendationPackage)

```json
{
  "package_id": "seef_rec_20260223_001",
  "generated_by": "seef",
  "generated_at": "2026-02-23T19:15:00+08:00",
  "skill": {
    "id": "isc-core",
    "name": "ISC智能标准中心",
    "version": "3.0.0",
    "capsule_id": "sha256:...",
    "repository": "https://github.com/...",
    "documentation": "..."
  },
  "metrics": {
    "usage_frequency": 15,
    "user_satisfaction": 0.92,
    "success_rate": 0.98,
    "uniqueness_score": 0.95,
    "overall_score": 0.91
  },
  "evidence": {
    "cras_reports": ["cras_20260223_190000"],
    "user_testimonials": [...],
    "performance_benchmarks": {...}
  },
  "recommendation_reason": "高频使用、高满意度、独特价值",
  "suggested_gene_tags": ["infrastructure", "standard", "governance"],
  "status": "pending_confirmation"
}
```

## 发布流程

### 阶段 1: SEEF 筛选推荐

```python
# SEEF 自动执行
class EvoMapRecommender:
    def run(self):
        # 1. 收集所有技能指标
        skills = self.collect_skill_metrics()
        
        # 2. 计算推荐分数
        for skill in skills:
            skill['recommendation_score'] = calculate_recommendation_score(skill)
        
        # 3. 筛选高价值技能
        candidates = [s for s in skills if s['recommendation_score'] >= 0.80]
        
        # 4. 生成推荐包
        for candidate in candidates:
            package = self.create_recommendation_package(candidate)
            self.submit_to_queue(package)
```

### 阶段 2: 人工确认队列

```
推荐队列状态:
┌─────────────────────────────────────────────────────────┐
│ 待确认推荐 (3)                                          │
├─────────────────────────────────────────────────────────┤
│ 1. isc-core v3.0.0  [评分: 0.91]  [推荐时间: 2小时前]   │
│    [查看详情] [确认发布] [拒绝] [暂缓]                  │
│                                                         │
│ 2. seef v3.0.3      [评分: 0.88]  [推荐时间: 5小时前]   │
│    [查看详情] [确认发布] [拒绝] [暂缓]                  │
│                                                         │
│ 3. cras v1.0.0      [评分: 0.85]  [推荐时间: 1天前]     │
│    [查看详情] [确认发布] [拒绝] [暂缓]                  │
└─────────────────────────────────────────────────────────┘
```

### 阶段 3: 人工确认操作

```python
# 人工确认接口
class EvoMapPublisher:
    def confirm_and_publish(self, package_id):
        package = self.get_recommendation_package(package_id)
        
        # 1. 生成 Gene 格式
        gene = self.convert_to_gene_format(package)
        
        # 2. 发布到 EvoMap
        evomap_response = self.publish_to_evomap(gene)
        
        # 3. 更新状态
        package['status'] = 'published'
        package['evomap_gene_id'] = evomap_response['gene_id']
        
        return package
    
    def reject(self, package_id, reason):
        package = self.get_recommendation_package(package_id)
        package['status'] = 'rejected'
        package['rejection_reason'] = reason
        
        # 通知 SEEF
        self.notify_seef(package)
        
        return package
```

## 与 ClawHub 的区别

| 维度 | EvoMap | ClawHub |
|:-----|:-------|:--------|
| **目标** | 进化网络，技能基因交换 | 技能市场，安装分发 |
| **内容** | 优质、高频、经过验证的技能 | 所有可用技能 |
| **审核** | 人工确认 + 自动评分 | 自动审核 |
| **发布者** | SEEF 推荐 + 人工确认 | 任意开发者 |
| **消费者** | 云端大模型、进化系统 | 终端用户 |
| **格式** | Gene + Capsule | npm/源码 |

## API 接口

### 提交推荐

```http
POST /api/seef/v1/evomap/recommendations
Authorization: Bearer {token}
Content-Type: application/json

{
  "package": SkillRecommendationPackage
}

Response:
{
  "package_id": "seef_rec_20260223_001",
  "status": "queued",
  "queue_position": 3,
  "estimated_review_time": "24h"
}
```

### 查询推荐状态

```http
GET /api/seef/v1/evomap/recommendations/{package_id}
Authorization: Bearer {token}

Response:
{
  "package_id": "seef_rec_20260223_001",
  "status": "pending_confirmation",
  "submitted_at": "2026-02-23T19:15:00+08:00",
  "review_history": [...]
}
```

### 人工确认回调

```http
POST /api/seef/v1/evomap/recommendations/{package_id}/confirm
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "action": "confirm",  // or "reject", "defer"
  "reviewer": "admin@openclaw.ai",
  "notes": "高质量技能，确认发布"
}
```

## 通知机制

### SEEF → 人工

```json
{
  "notification_type": "evomap_recommendation_pending",
  "package_id": "seef_rec_20260223_001",
  "skill_name": "ISC智能标准中心",
  "recommendation_score": 0.91,
  "action_required": "请确认是否发布到 EvoMap",
  "review_url": "https://admin.openclaw.ai/evomap/queue/seef_rec_20260223_001"
}
```

### 人工 → SEEF

```json
{
  "notification_type": "evomap_publication_result",
  "package_id": "seef_rec_20260223_001",
  "result": "published",  // or "rejected", "deferred"
  "evomap_gene_id": "gene_abc123...",
  "published_at": "2026-02-23T20:00:00+08:00"
}
```

## 存储结构

```
/root/.openclaw/workspace/skills/seef/evomap/
├── recommendations/
│   ├── pending/           # 待确认
│   ├── approved/          # 已确认待发布
│   ├── published/         # 已发布
│   └── rejected/          # 已拒绝
├── genes/                 # Gene 格式缓存
└── logs/
    └── publication_history.json
```

## 版本历史

| 版本 | 时间 | 变更 |
|:-----|:-----|:-----|
| 1.0.0 | 2026-02-23 | 初始版本，定义推荐流程 |
