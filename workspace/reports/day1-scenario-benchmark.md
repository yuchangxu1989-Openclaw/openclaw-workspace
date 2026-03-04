# Day1 场景化Benchmark报告

**生成时间**: 2026-03-04T17:55:40.768Z
**执行耗时**: 0.0s
**基础设施加载**: ✅ 全部正常

## 总览

| 指标 | 值 |
|------|----|
| 场景总数 | 10 |
| ✅ 通过 | 0 |
| ❌ 失败 | 10 |
| ⚠️ 降级执行 | 0 |
| 通过率 | 0.0% |

## 领域覆盖率

| 领域 | 场景数 | 通过 | 覆盖率 |
|------|--------|------|--------|
| analysis | 1 | 0 | 0% |
| content | 2 | 0 | 0% |
| knowledge | 4 | 0 | 0% |
| development | 3 | 0 | 0% |

## 场景详情

### ❌ 金融数据分析软件构建 (scenario-analysis-financial)
- **领域**: analysis
- **结果**: FAIL
- **失败断点**: Step 2
  - 期望: `{"expect":"rule_matched","min_rules":1}`
  - 原因: Expected >= 1 rules, got 0
- **步骤执行**:
  ✅ Step 0: Emitted user.message
  ✅ Step 1: Intent detected: {"category":"IC5","name":"financial_analysis","confidence":0.7,"source":"regex_fallback"}
  ❌ Step 2: Expected >= 1 rules, got 0

### ❌ PDF知识吸收与结构化 (scenario-content-pdf-knowledge)
- **领域**: content
- **结果**: FAIL
- **失败断点**: Step 2
  - 期望: `{"expect":"rule_matched","min_rules":1}`
  - 原因: Expected >= 1 rules, got 0
- **步骤执行**:
  ✅ Step 0: Emitted user.message
  ✅ Step 1: Intent detected: {"category":"IC4","name":"knowledge_extraction","confidence":0.7,"source":"regex_fallback"}
  ❌ Step 2: Expected >= 1 rules, got 0

### ❌ 公众号自媒体运营 (scenario-content-wechat-operation)
- **领域**: content
- **结果**: FAIL
- **失败断点**: Step 2
  - 期望: `{"expect":"rule_matched","min_rules":1}`
  - 原因: Expected >= 1 rules, got 0
- **步骤执行**:
  ✅ Step 0: Emitted user.message
  ✅ Step 1: Intent detected: {"category":"IC4","name":"content_operation","confidence":0.7,"source":"regex_fallback"}
  ❌ Step 2: Expected >= 1 rules, got 0

### ❌ CRAS学术洞察 (scenario-cras-academic-insight)
- **领域**: knowledge
- **结果**: FAIL
- **失败断点**: Step 2
  - 期望: `{"expect":"rule_matched","min_rules":1}`
  - 原因: Expected >= 1 rules, got 0
- **步骤执行**:
  ✅ Step 0: Emitted user.message
  ✅ Step 1: Intent detected: {"category":"IC3","name":"academic_analysis","confidence":0.7,"source":"regex_fallback"}
  ❌ Step 2: Expected >= 1 rules, got 0

### ❌ CRAS竞品分析 (scenario-cras-competitive-analysis)
- **领域**: knowledge
- **结果**: FAIL
- **失败断点**: Step 2
  - 期望: `{"expect":"rule_matched","min_rules":1}`
  - 原因: Expected >= 1 rules, got 0
- **步骤执行**:
  ✅ Step 0: Emitted user.message
  ✅ Step 1: Intent detected: {"category":"IC3","name":"competitive_analysis","confidence":0.7,"source":"regex_fallback"}
  ❌ Step 2: Expected >= 1 rules, got 0

### ❌ CRAS工程缺陷模式识别 (scenario-cras-engineering-defect)
- **领域**: knowledge
- **结果**: FAIL
- **失败断点**: Step 2
  - 期望: `{"expect":"rule_matched","min_rules":1}`
  - 原因: Expected >= 1 rules, got 0
- **步骤执行**:
  ✅ Step 0: Emitted user.message
  ✅ Step 1: Intent detected: {"category":"IC3","name":"engineering_defect","confidence":0.7,"source":"regex_fallback"}
  ❌ Step 2: Expected >= 1 rules, got 0

### ❌ CRAS用户意图洞察 (scenario-cras-user-intent-insight)
- **领域**: knowledge
- **结果**: FAIL
- **失败断点**: Step 1
  - 期望: `{"expect":"intent_detected","intent_category":"IC3","timeout_ms":5000}`
  - 原因: Expected intent IC3, got IC0
- **步骤执行**:
  ✅ Step 0: Emitted user.message
  ❌ Step 1: Expected intent IC3, got IC0

### ❌ 技能开发全流程 (scenario-dev-skill-creation)
- **领域**: development
- **结果**: FAIL
- **失败断点**: Step 2
  - 期望: `{"expect":"rule_matched","min_rules":1}`
  - 原因: Expected >= 1 rules, got 0
- **步骤执行**:
  ✅ Step 0: Emitted user.message
  ✅ Step 1: Intent detected: {"category":"IC2","name":"skill_creation","confidence":0.7,"source":"regex_fallback"}
  ❌ Step 2: Expected >= 1 rules, got 0

### ❌ 多技能编排 (scenario-dev-skill-orchestration)
- **领域**: development
- **结果**: FAIL
- **失败断点**: Step 1
  - 期望: `{"expect":"intent_detected","intent_category":"IC2","timeout_ms":5000}`
  - 原因: Expected intent IC2, got IC3
- **步骤执行**:
  ✅ Step 0: Emitted user.message
  ❌ Step 1: Expected intent IC2, got IC3

### ❌ 网页制作全链路 (scenario-dev-webpage-build)
- **领域**: development
- **结果**: FAIL
- **失败断点**: Step 1
  - 期望: `{"expect":"intent_detected","intent_category":"IC2","timeout_ms":5000}`
  - 原因: Expected intent IC2, got IC3
- **步骤执行**:
  ✅ Step 0: Emitted user.message
  ❌ Step 1: Expected intent IC2, got IC3

