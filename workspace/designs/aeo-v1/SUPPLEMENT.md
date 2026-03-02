# AEO架构设计补充 - 核心能力详细设计
## 针对关键问题的补充方案

---

## 1. 自动生成评测标准体系

### 1.1 评测标准自动生成（ISC N023驱动）

```
技能创建/更新
      │
      ▼
┌─────────────────────────────────────────┐
│ ISC N023: 自动生成评测标准              │
├─────────────────────────────────────────┤
│ 1. 分析SKILL.md → 识别能力维度          │
│ 2. 检索历史数据 → 提取成功模式          │
│ 3. 分析用户反馈 → 识别痛点              │
│ 4. 生成评测维度 → 定义评分标准          │
│ 5. 构建黄金标准 → 定义期望输出          │
│ 6. 生成测试用例 → 覆盖边界情况          │
└─────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────┐
│ AEO中央评测库                           │
├─────────────────────────────────────────┤
│ aeo/                                    │
│ ├── evaluation-sets/                    │
│ │   └── {skill-name}/                   │
│ │       ├── standard.json       ★评测标准│
│ │       ├── test-cases.json     ★测试用例│
│ │       └── golden-standard.json ★黄金标准│
│ └── reports/                            │
│     └── {skill-name}/                   │
│         └── {timestamp}-report.json ★报告│
└─────────────────────────────────────────┘
```

### 1.2 评测标准Schema

```json
{
  "skill_name": "model-router",
  "version": "2.0.0",
  "generated_at": "2026-02-26T02:50:00Z",
  "generated_by": "N023",
  
  "evaluation_dimensions": [
    {
      "id": "intent_accuracy",
      "name": "意图识别准确率",
      "weight": 0.4,
      "threshold": 0.75,
      "description": "正确识别任务意图类型的比例"
    },
    {
      "id": "model_selection_correctness",
      "name": "模型选择正确性",
      "weight": 0.3,
      "threshold": 0.95,
      "description": "选择最优模型的正确率"
    },
    {
      "id": "fallback_effectiveness",
      "name": "降级有效性",
      "weight": 0.2,
      "threshold": 0.99,
      "description": "故障时成功降级的比例"
    },
    {
      "id": "response_latency",
      "name": "响应延迟",
      "weight": 0.1,
      "threshold": 2000,
      "unit": "ms",
      "description": "端到端响应时间"
    }
  ],
  
  "auto_update": {
    "enabled": true,
    "trigger": "feedback_threshold_exceeded",
    "min_samples": 100
  }
}
```

---

## 2. 中央用例库与黄金标准

### 2.1 统一用例获取接口

```typescript
// AEO中央用例库API
interface AEOCentralLibrary {
  // 获取测试用例
  getTestCases(query: TestCaseQuery): Promise<TestCase[]>;
  
  // 获取黄金标准
  getGoldenStandard(testCaseId: string): Promise<GoldenStandard>;
  
  // 提交用例执行结果
  submitResult(result: TestResult): Promise<void>;
  
  // 获取评测标准
  getEvaluationStandard(skillName: string): Promise<EvaluationStandard>;
}

// 用例查询接口
interface TestCaseQuery {
  skillName?: string;      // 技能名称
  scenario?: string;       // 场景类型
  difficulty?: 'easy' | 'medium' | 'hard';
  limit?: number;          // 返回数量
  random?: boolean;        // 随机采样
}
```

### 2.2 黄金标准生成与维护

```
黄金标准来源:
├─ 30% 专家标注 (初始)
├─ 40% 历史成功案例 (自动抽取)
├─ 20% 用户反馈精选 (高评分案例)
└─ 10% 对抗生成 (边界情况)

黄金标准更新流程:
用户反馈收集 → 质量筛选 → 专家审核 → 纳入标准 → 版本更新
```

### 2.3 用例自动扩充

```python
# 基于技能描述自动生成测试用例
def auto_generate_test_cases(skill_md: str) -> List[TestCase]:
    # 1. 解析技能功能
    capabilities = parse_capabilities(skill_md)
    
    # 2. 生成正向用例
    positive_cases = generate_positive_cases(capabilities)
    
    # 3. 生成边界用例
    boundary_cases = generate_boundary_cases(capabilities)
    
    # 4. 生成异常用例
    error_cases = generate_error_cases(capabilities)
    
    return positive_cases + boundary_cases + error_cases
```

---

## 3. 三层沙盒化测试体系

### 3.1 架构层沙盒（Architecture Sandbox）

```
架构变更测试:
├─ 配置变更沙盒
│  └─ 验证配置格式
│  └─ 验证配置依赖
│  └─ 模拟配置加载
│
├─ 依赖变更沙盒
│  └─ 验证依赖版本兼容
│  └─ 检查循环依赖
│  └─ 模拟依赖注入
│
└─ 接口变更沙盒
   └─ 验证接口兼容性
   └─ 检查破坏性变更
   └─ 模拟接口调用
```

### 3.2 模型层沙盒（Model Sandbox）

```
模型变更测试:
├─ 影子测试 (Shadow Test)
│  └─ 同输入并行执行新旧模型
│  └─ 对比输出差异
│  └─ 量化效果变化
│
├─ 回滚测试 (Rollback Test)
│  └─ 验证模型回滚能力
│  └─ 测试降级链有效性
│  └─ 检查状态一致性
│
└─ A/B测试 (AB Test)
   └─ 流量分割对比
   └─ 统计显著性检验
   └─ 用户满意度对比
```

### 3.3 通信层沙盒（Communication Sandbox）

```
通信变更测试:
├─ 协议兼容性测试
│  └─ 新旧协议互通
│  └─ 协议版本协商
│  └─ 错误码兼容性
│
├─ 超时熔断测试
│  └─ 模拟网络延迟
│  └─ 验证超时处理
│  └─ 熔断器触发验证
│
└─ 负载压力测试
   └─ 并发连接测试
   └─ 吞吐量测试
   └─ 资源泄漏检测
```

### 3.4 沙盒测试集成到AEO

```
AEO沙盒测试流程:

技能提交
   │
   ▼
┌─────────────────────┐
│ 架构层沙盒测试       │ ◄── ISC N022 规则验证
│ - 配置格式           │
│ - 依赖检查           │
└──────────┬──────────┘
           │ 通过
           ▼
┌─────────────────────┐
│ 模型层沙盒测试       │ ◄── MR 三层沙盒
│ - 影子测试           │
│ - 回滚测试           │
└──────────┬──────────┘
           │ 通过
           ▼
┌─────────────────────┐
│ 通信层沙盒测试       │ ◄── LEP 韧性测试
│ - 协议兼容           │
│ - 超时熔断           │
└──────────┬──────────┘
           │ 全部通过
           ▼
      准入通过 → 发布
```

---

## 4. 自动报告生成体系

### 4.1 报告类型

```
AEO自动报告:
├─ 评测报告 (Evaluation Report)
│  └─ 单技能评测结果
│  └─ 多技能对比
│  └─ 趋势分析
│
├─ 准入报告 (Gate Report)
│  └─ 上线前检查清单
│  └─ 风险评级
│  └─ 建议措施
│
├─ 回归报告 (Regression Report)
│  └─ 变更影响分析
│  └─ 性能对比
│  └─ 问题定位
│
└─ 周报/月报 (Periodic Report)
   └─ 整体质量趋势
   └─ 问题TOP10
   └─ 改进建议
```

### 4.2 报告自动生成触发

```json
{
  "report_triggers": [
    {
      "type": "post_evaluation",
      "description": "评测完成后自动生成评测报告"
    },
    {
      "type": "pre_release",
      "description": "发布前自动生成准入报告"
    },
    {
      "type": "schedule",
      "cron": "0 9 * * 1",
      "description": "每周一上午9点生成周报"
    },
    {
      "type": "threshold",
      "condition": "error_rate > 5%",
      "description": "错误率超阈值时生成告警报告"
    }
  ]
}
```

### 4.3 报告输出格式（飞书卡片）

```json
{
  "card_type": "aeo_evaluation_report",
  "title": "MR模型路由 v2.0 评测报告",
  "summary": {
    "overall_score": 85,
    "status": "passed",
    "test_cases": 50,
    "passed": 47,
    "failed": 3
  },
  "dimensions": [
    {"name": "意图准确率", "score": 90, "threshold": 75, "status": "pass"},
    {"name": "模型选择", "score": 95, "threshold": 95, "status": "pass"},
    {"name": "降级有效性", "score": 98, "threshold": 99, "status": "warning"}
  ],
  "recommendations": [
    "建议优化边缘场景的分类准确度",
    "降级链可增加更多fallback选项"
  ],
  "auto_generated": true,
  "generated_at": "2026-02-26T02:50:00Z"
}
```

---

## 5. 补充ISC规则清单

| 规则ID | 名称 | 功能 | 状态 |
|:---:|:---|:---|:---:|
| **N023** | auto-aeo-evaluation-standard-generation | 自动生成评测标准 | ✅ 已创建 |
| N024 | aeo-sandbox-orchestration | AEO沙盒编排（三层） | ⏳ 待创建 |
| N025 | aeo-auto-report-generation | 自动报告生成 | ⏳ 待创建 |
| N026 | aeo-golden-standard-maintenance | 黄金标准维护 | ⏳ 待创建 |

---

## 6. 关键问题回答

### Q1: 自动生成评测标准、评测集、测试用例库和自动报告？
**A**: ✅ 已设计完整方案
- ISC N023 驱动自动生成
- 中央用例库统一存储
- 多触发器自动报告

### Q2: 自动化统一到这边拿用例、黄金标准？
**A**: ✅ 已设计统一接口
- `getTestCases()` 获取测试用例
- `getGoldenStandard()` 获取黄金标准
- `getEvaluationStandard()` 获取评测标准

### Q3: 架构变更、模型层、通信层有沙盒化测试？
**A**: ✅ 已设计三层沙盒
- 架构层：配置/依赖/接口变更沙盒
- 模型层：影子测试/回滚测试/A-B测试
- 通信层：协议/超时/负载沙盒

### Q4: ISC规则增加评测标准？
**A**: ✅ 已创建N023
- 自动生成评测标准
- 自动生成测试用例
- 自动生成黄金标准

---

*补充设计版本: 1.1.0*  
*状态: 待用户确认*
