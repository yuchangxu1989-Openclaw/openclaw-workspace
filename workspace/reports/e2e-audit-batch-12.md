# E2E 全链路审计 Batch-12（规则 111-120）

审计时间：2026-03-10 10:00 GMT+8  
审计范围：
- rule.n018-detection-skill-rename-global-alignment-018.json
- rule.n019-auto-skill-md-generation-019.json
- rule.n020-auto-universal-root-cause-analysis-020.json
- rule.n022-detection-architecture-design-isc-compliance-audit-022.json
- rule.n023-auto-aeo-evaluation-standard-generation-023.json
- rule.n024-aeo-dual-track-orchestration-024.json
- rule.n025-aeo-feedback-auto-collection-025.json
- rule.n026-aeo-insight-to-action-026.json
- rule.n029-model-api-key-pool-management-029.json
- rule.n033-gateway-config-protection.json

参考：`/root/.openclaw/workspace/reports/e2e-audit-reference-data.txt`

---

## 审计结果总览

| # | 规则ID | 意图注册 | 事件注册 | 感知层探针(Trigger) | 执行层Handler |
|---|---|---|---|---|---|
|111|rule.n018-detection-skill-rename-global-alignment-018|⚠️ 未在参考清单直接命中|❌ 未命中（snake_case）|✅ 已定义：`skill_renamed/skill_moved/module_refactored`|⚠️ 配置路径在`skills/isc-core`下缺失；参考清单存在同名`.sh`|
|112|rule.n019-auto-skill-md-generation-019|⚠️ 未在参考清单直接命中|❌ 未命中（snake_case）|✅ 已定义4类技能文档相关事件|⚠️ 配置路径在`skills/isc-core`下缺失；参考清单存在同名`.sh`|
|113|rule.n020-auto-universal-root-cause-analysis-020|⚠️ 未在参考清单直接命中|❌ 未命中（snake_case）|✅ 已定义9类故障/合规事件|⚠️ handler为绝对路径，但文件缺失（`/root/.openclaw/workspace/scripts/...`）|
|114|rule.n022-detection-architecture-design-isc-compliance-audit-022|⚠️ 未在参考清单直接命中|❌ 未命中（snake_case）|✅ 已定义3类架构设计事件|✅ 存在：`handlers/n022-isc-compliance-audit.js`（87行）|
|115|rule.n023-auto-aeo-evaluation-standard-generation-023|⚠️ 未在参考清单直接命中|❌ 未命中（snake_case）|✅ 已定义4类AEO标准事件|✅ 存在：`handlers/n023-aeo-eval-standard-generation.js`（105行）|
|116|rule.n024-aeo-dual-track-orchestration-024|⚠️ 未在参考清单直接命中|❌ 未命中（snake_case）|✅ 已定义2类双轨触发事件|✅ 存在：`handlers/n024-aeo-dual-track-orchestration.js`（96行）|
|117|rule.n025-aeo-feedback-auto-collection-025|⚠️ 未在参考清单直接命中|❌ 未命中（snake_case）|✅ 已定义2类会话反馈事件|✅ 存在：`handlers/n025-aeo-feedback-auto-collection.js`（95行）|
|118|rule.n026-aeo-insight-to-action-026|⚠️ 未在参考清单直接命中|❌ 未命中（snake_case）|✅ 已定义2类洞察转行动事件|✅ 存在：`handlers/n026-aeo-insight-to-action.js`（119行）|
|119|rule.n029-model-api-key-pool-management-029|⚠️ 未在参考清单直接命中|❌ 未命中（snake_case）|✅ 已定义4类API Key池事件|⚠️ 配置路径在`skills/isc-core`下缺失；参考清单存在同名`.sh`|
|120|rule.n033-gateway-config-protection|⚠️ 未在参考清单直接命中|❌ 未命中（点号命名）|✅ 已定义4类`system.config.*`事件|⚠️ handler为绝对路径，但文件缺失（`/root/.openclaw/workspace/scripts/...`）|

---

## 逐条证据

### 111) rule.n018-detection-skill-rename-global-alignment-018
- rule摘要：
```json
{"id":"rule.n018-detection-skill-rename-global-alignment-018","trigger_events":["skill_renamed","skill_moved","module_refactored"],"handler":"scripts/isc-hooks/rule.n018-detection-skill-rename-global-alignment-018.sh"}
```
- handler检查：`skills/isc-core/scripts/isc-hooks/...`未找到；参考数据`HANDLER_FILES`存在`rule.n018-detection-skill-rename-global-alignment-018.sh`。

### 112) rule.n019-auto-skill-md-generation-019
- rule摘要：
```json
{"id":"rule.n019-auto-skill-md-generation-019","trigger_events":["skill_code_created","skill_code_major_update","skill_md_missing","skill_md_quality_low"],"handler":"scripts/isc-hooks/rule.n019-auto-skill-md-generation-019.sh"}
```
- handler检查：`skills/isc-core/scripts/isc-hooks/...`未找到；参考数据存在同名`.sh`。

### 113) rule.n020-auto-universal-root-cause-analysis-020
- rule摘要：
```json
{"id":"rule.n020-auto-universal-root-cause-analysis-020","trigger_events":["execution_failed","pipeline_error","sync_failure","health_check_failed","user_reported_issue","design_compliance_failure","architecture_audit_failed","hardcode_detected","isc_non_compliance_detected"],"handler":"/root/.openclaw/workspace/scripts/isc-hooks/rule.n020-auto-universal-root-cause-analysis-020.sh"}
```
- handler检查：绝对路径目标文件缺失；参考数据存在同名`.sh`。

### 114) rule.n022-detection-architecture-design-isc-compliance-audit-022
- rule摘要：
```json
{"id":"rule.n022-detection-architecture-design-isc-compliance-audit-022","trigger_events":["design_document_created","architecture_design_completed","mr_design_generated"],"handler":"handlers/n022-isc-compliance-audit.js"}
```
- handler检查：存在，`wc -l`=87。
- `head -20`显示为Node handler，使用`handler-utils`，输出`reports/n022-isc-compliance-audit-report.json`。

### 115) rule.n023-auto-aeo-evaluation-standard-generation-023
- rule摘要：
```json
{"id":"rule.n023-auto-aeo-evaluation-standard-generation-023","trigger_events":["skill_created","skill_major_update","aeo_evaluation_required","user_feedback_collected"],"handler":"handlers/n023-aeo-eval-standard-generation.js"}
```
- handler检查：存在，`wc -l`=105。
- `head -20`显示会写入`reports/n023-aeo-eval-standard-report.json`，依赖`handler-utils`。

### 116) rule.n024-aeo-dual-track-orchestration-024
- rule摘要：
```json
{"id":"rule.n024-aeo-dual-track-orchestration-024","trigger_events":["aeo_evaluation_required","skill_test_triggered"],"handler":"handlers/n024-aeo-dual-track-orchestration.js"}
```
- handler检查：存在，`wc -l`=96。
- `head -20`显示双轨评估编排并汇总报告。

### 117) rule.n025-aeo-feedback-auto-collection-025
- rule摘要：
```json
{"id":"rule.n025-aeo-feedback-auto-collection-025","trigger_events":["user_message_received","conversation_turn_completed"],"handler":"handlers/n025-aeo-feedback-auto-collection.js"}
```
- handler检查：存在，`wc -l`=95。
- `head -20`显示将反馈归档到`data/aeo-feedback-store.json`。

### 118) rule.n026-aeo-insight-to-action-026
- rule摘要：
```json
{"id":"rule.n026-aeo-insight-to-action-026","trigger_events":["aeo_issue_frequency_threshold_exceeded","n020_analysis_completed"],"handler":"handlers/n026-aeo-insight-to-action.js"}
```
- handler检查：存在，`wc -l`=119。
- `head -20`显示生成行动项到`data/aeo-action-items.json`。

### 119) rule.n029-model-api-key-pool-management-029
- rule摘要：
```json
{"id":"rule.n029-model-api-key-pool-management-029","trigger_events":["api_key_rate_limit","api_key_invalid","api_key_expired","model_request_initiated"],"handler":"scripts/isc-hooks/rule.n029-model-api-key-pool-management-029.sh"}
```
- handler检查：`skills/isc-core/scripts/isc-hooks/...`未找到；参考数据存在同名`.sh`。

### 120) rule.n033-gateway-config-protection
- rule摘要：
```json
{"id":"rule.n033-gateway-config-protection","trigger_events":["system.config.modified","system.config.created","system.config.deleted","system.config.change_requested"],"handler":"/root/.openclaw/workspace/scripts/isc-hooks/rule.n033-gateway-config-protection.sh"}
```
- handler检查：绝对路径目标文件缺失；参考数据存在同名`.sh`。

---

## 结论

- **感知层（Trigger）**：10/10 均已配置触发事件。  
- **执行层（Handler）**：5/10 在 `skills/isc-core/handlers` 可直接核验（n022~n026）；其余5条指向的 shell handler 在当前核验路径/绝对路径缺失，但参考清单显示存在同名脚本，疑似**路径基准不一致或注册路径漂移**。  
- **意图注册 / 事件注册**：参考清单中未直接命中这些规则ID及其 snake_case/点号事件名，建议补齐 eventbus 注册映射（或建立命名转换表）。

## 建议修复

1. 统一 handler 路径基准：
   - 相对路径统一相对 `skills/isc-core` 或统一改为仓库根绝对路径；避免混用。  
2. 对 n018/n019/n029/n020/n033 做一次 `realpath` 校验并回写规则文件。  
3. 为 snake_case 与点号事件建立标准化映射（如 `skill_renamed` ↔ `skill.renamed`），并补注册测试。  
4. 增加 CI 检查：规则文件中的 handler 必须可达且可执行（sh）/可加载（js）。
