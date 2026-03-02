# 34条未触发规则整改建议清单

## 执行摘要

本报告详细列出34条未触发规则的整改建议，按优先级和规则类型分类。

---

## 一、高优先级整改（P0 - 核心功能缺失）

### 1.1 规则触发器部署（8条）

| # | 规则ID | 规则名称 | 根因 | 整改建议 | 预估工时 |
|---|--------|----------|------|----------|----------|
| 1 | rule.auto-github-sync-trigger-001 | GitHub自动同步触发器 | 触发器未启用 | 部署GitHub webhook监听器 | 2h |
| 2 | rule.cron-task-model-requirement-001 | Cron模型需求检查 | Cron系统未配置 | 配置cron调度器 | 1h |
| 3 | rule.cron-task-model-selection-002 | Cron模型选择 | Cron系统未配置 | 配置cron调度器 | 1h |
| 4 | rule.dual-channel-message-guarantee-001 | 双通道消息保证 | 双通道系统未部署 | 部署消息冗余系统 | 4h |
| 5 | rule.isc-change-auto-trigger-alignment-001 | 变更自动触发对齐 | 对齐器未启用 | 启用变更检测器 | 2h |
| 6 | rule.isc-skill-index-auto-update-001 | 技能索引自动更新 | 更新器未配置 | 配置索引服务 | 2h |
| 7 | rule.isc-skill-usage-protocol-001 | 技能使用协议监控 | 监控器未部署 | 部署使用追踪器 | 3h |
| 8 | rule.skill-mandatory-skill-md-001 | 强制SKIL.md检查 | 检查器未部署 | 部署文件检查器 | 2h |

### 1.2 AEO规则族激活（5条）

| # | 规则ID | 规则名称 | 根因 | 整改建议 | 预估工时 |
|---|--------|----------|------|----------|----------|
| 9 | N023 | AEO评估标准生成 | 缺少AEO事件源 | 连接AEO评估引擎 | 4h |
| 10 | N024 | 双轨协调编排 | 缺少双轨协调触发 | 部署双轨协调器 | 4h |
| 11 | N025 | 反馈自动收集 | 反馈收集机制未部署 | 部署反馈收集器 | 3h |
| 12 | N026 | Insight转行动 | Insight引擎未初始化 | 初始化Insight引擎 | 4h |
| 13 | rule.aeo-evaluation-set-registry-001 | AEO评估集注册 | 注册器未配置 | 配置评估集注册器 | 2h |

---

## 二、中优先级整改（P1 - 检测规则部署）

### 2.1 Detection规则族（4条）

| # | 规则ID | 规则名称 | 根因 | 整改建议 | 预估工时 |
|---|--------|----------|------|----------|----------|
| 14 | N016 | Pipeline后自动修复循环 | 需要Pipeline失败事件 | 配置Pipeline监控器 | 3h |
| 15 | N017 | CRAS重复模式自动解决 | 需要CRAS重复错误模式 | 部署CRAS模式分析器 | 4h |
| 16 | N018 | 技能重命名全局对齐 | 需要技能重命名事件 | 配置技能变更监听器 | 2h |
| 17 | N022 | 架构设计合规审计 | 需要架构设计评审事件 | 部署设计评审触发器 | 3h |

### 2.2 Decision规则族（3条）

| # | 规则ID | 规则名称 | 根因 | 整改建议 | 预估工时 |
|---|--------|----------|------|----------|----------|
| 18 | R006 | 七人议会决策要求 | 需要七人议会场景 | 配置决策场景触发器 | 2h |
| 19 | R013 | 能力锚点决策 | 需要能力锚点更新 | 部署能力锚点监听器 | 2h |
| 20 | R014 | 主动技能化决策 | 需要技能化决策场景 | 配置技能化评估器 | 3h |

---

## 三、标准优先级整改（P2 - 技能管理规则）

### 3.1 技能管理规则（6条）

| # | 规则ID | 规则名称 | 根因 | 整改建议 | 预估工时 |
|---|--------|----------|------|----------|----------|
| 21 | N006 | 双语命名显示 | 命名规范检查器未部署 | 部署命名检查器 | 2h |
| 22 | N007-v2 | 源文件交付交互 | 文件交付事件未触发 | 配置文件交付触发器 | 2h |
| 23 | N019 | 自动SKIL.md生成 | 生成器未配置 | 配置SKIL.md生成器 | 3h |
| 24 | N028 | 技能变更向量化 | 向量化服务未启动 | 启动变更向量化服务 | 3h |
| 25 | S005 | 飞书卡片报告 | 报告生成器未启用 | 启用飞书卡片生成器 | 2h |
| 26 | rule.pipeline-report-filter-001 | Pipeline报告过滤 | 过滤器未启用 | 启用报告过滤器 | 1h |

### 3.2 多Agent协调规则（3条）

| # | 规则ID | 规则名称 | 根因 | 整改建议 | 预估工时 |
|---|--------|----------|------|----------|----------|
| 27 | rule.multi-agent-communication-priority-001 | 多Agent通信优先级 | 优先级调度器未启用 | 启用优先级调度器 | 3h |
| 28 | rule.parallel-analysis-workflow-001 | 并行分析工作流 | 工作流引擎未初始化 | 初始化工作流引擎 | 4h |
| 29 | rule.parallel-subagent-orchestration-001 | 并行子Agent编排 | 编排器未配置 | 配置子Agent编排器 | 4h |

### 3.3 SEEF编排规则（1条）

| # | 规则ID | 规则名称 | 根因 | 整改建议 | 预估工时 |
|---|--------|----------|------|----------|----------|
| 30 | rule.seef-subskill-orchestration-001 | SEEF子技能编排 | 编排器未初始化 | 初始化SEEF编排器 | 4h |

---

## 四、低优先级整改（P3 - 基础设施规则）

### 4.1 安全与权限规则（3条）

| # | 规则ID | 规则名称 | 根因 | 整改建议 | 预估工时 |
|---|--------|----------|------|----------|----------|
| 31 | isc-evomap-mandatory-security-scan-032 | EvoMap强制安全扫描 | 安全扫描调度器未启动 | 启动安全扫描调度器 | 3h |
| 32 | isc-skill-permission-classification-031 | 技能权限分类 | 权限分类引擎未初始化 | 初始化权限引擎 | 4h |
| 33 | isc-skill-security-gate-030 | 技能安全门 | 安全门控制器未配置 | 配置安全门控制器 | 3h |

### 4.2 其他基础设施（2条）

| # | 规则ID | 规则名称 | 根因 | 整改建议 | 预估工时 |
|---|--------|----------|------|----------|----------|
| 34 | N020 | 通用根因分析 | URCA引擎未初始化 | 初始化URCA引擎 | 5h |
| 35 | N029 | API密钥池管理 | 密钥池管理器未配置 | 配置密钥池管理器 | 3h |

### 4.3 技能套件规则（3条）

| # | 规则ID | 规则名称 | 根因 | 整改建议 | 预估工时 |
|---|--------|----------|------|----------|----------|
| 36 | rule.github-api-skill-001 | GitHub API技能 | 技能未激活 | 激活GitHub API技能 | 2h |
| 37 | rule.glm-vision-priority-001 | GLM视觉优先级 | 优先级调度器未配置 | 配置视觉调度器 | 2h |
| 38 | rule.http-skills-suite-001 | HTTP技能套件 | 技能套件未激活 | 激活HTTP技能套件 | 2h |

---

## 五、快速修复脚本

### 5.1 批量检查脚本

```bash
#!/bin/bash
# check-rule-triggers.sh - 批量检查规则触发状态

RULE_DIR="/root/.openclaw/workspace/skills/isc-core/rules"
EVENT_LOG="/root/.openclaw/workspace/skills/dto-core/events/isc-rule-created.jsonl"

# 获取已触发规则
TRIGGERED=$(cat "$EVENT_LOG" 2>/dev/null | jq -r '.data.ruleId' | sort | uniq)

echo "=== 规则触发状态检查 ==="
echo ""

for rule_file in "$RULE_DIR"/*.json; do
    rule_id=$(jq -r '.id // .ruleId // .name // empty' "$rule_file" 2>/dev/null)
    if [ -z "$rule_id" ]; then
        rule_id=$(basename "$rule_file" .json)
    fi
    
    if echo "$TRIGGERED" | grep -q "^${rule_id}$"; then
        echo "✅ $rule_id"
    else
        echo "❌ $rule_id (未触发)"
    fi
done
```

### 5.2 规则对齐检查脚本

```bash
#!/bin/bash
# check-rule-subscription-alignment.sh - 检查规则-订阅对齐

RULE_DIR="/root/.openclaw/workspace/skills/isc-core/rules"
SUB_DIR="/root/.openclaw/workspace/skills/dto-core/subscriptions"

echo "=== 规则-订阅对齐检查 ==="
echo ""

# 提取所有规则ID
declare -A RULE_IDS
for rule_file in "$RULE_DIR"/*.json; do
    rule_id=$(jq -r '.id // .ruleId // .name // empty' "$rule_file" 2>/dev/null)
    if [ -n "$rule_id" ]; then
        RULE_IDS["$rule_id"]=$(basename "$rule_file")
    fi
done

# 检查订阅
for rule_id in "${!RULE_IDS[@]}"; do
    sub_file="$SUB_DIR/isc-${rule_id}.json"
    if [ -f "$sub_file" ]; then
        echo "✅ $rule_id - 已订阅"
    else
        echo "❌ $rule_id - 未订阅 (${RULE_IDS[$rule_id]})"
    fi
done
```

---

## 六、整改路线图

### 第一阶段（1-2周）：核心触发器
- [ ] 部署Cron调度器
- [ ] 启用GitHub同步触发器
- [ ] 配置技能索引自动更新
- [ ] 部署强制SKIL.md检查器

### 第二阶段（2-4周）：AEO和检测规则
- [ ] 连接AEO评估引擎
- [ ] 部署双轨协调器
- [ ] 配置Pipeline监控器
- [ ] 部署CRAS模式分析器

### 第三阶段（4-6周）：多Agent协调
- [ ] 启用多Agent优先级调度器
- [ ] 初始化工作流引擎
- [ ] 配置子Agent编排器
- [ ] 初始化SEEF编排器

### 第四阶段（6-8周）：安全和基础设施
- [ ] 启动安全扫描调度器
- [ ] 初始化权限引擎
- [ ] 初始化URCA引擎
- [ ] 配置密钥池管理器

---

## 七、预期效果

| 阶段 | 预计新增触发规则 | 累计触发率 |
|------|------------------|------------|
| 整改前 | 27条 | 44.3% |
| 第一阶段后 | +8条 = 35条 | 57.4% |
| 第二阶段后 | +9条 = 44条 | 72.1% |
| 第三阶段后 | +10条 = 54条 | 88.5% |
| 第四阶段后 | +7条 = 61条 | 100% |

---

*报告生成时间: 2026-02-28*
