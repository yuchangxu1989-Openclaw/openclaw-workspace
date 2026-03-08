# 事件类型命名治理报告

## 概要

| 指标 | 治理前 | 治理后 |
|------|--------|--------|
| 唯一事件类型 | 203 | 176 |
| 域数量 | 53 | 15 |
| 命名格式 | 混合(冒号/点号/下划线) | 统一 domain.subdomain.action |

## 命名规范

- 格式: `{domain}.{subdomain}.{action}`
- 分隔符: 点号(.)，全小写
- action: 标准化动词

## 域分布（治理后）

| 域 | 事件数 |
|----|--------|
| aeo | 6 |
| architecture | 13 |
| cras | 7 |
| document | 9 |
| lto | 11 |
| event | 8 |
| evomap | 2 |
| isc | 14 |
| knowledge | 9 |
| orchestration | 17 |
| quality | 13 |
| session | 7 |
| skill | 31 |
| system | 23 |
| user | 6 |

## 域合并规则

共合并 38 个旧域：

- `agent` → `system`
- `analysis` → `cras`
- `benchmark` → `quality`
- `capability` → `skill`
- `code` → `skill`
- `complex_task` → `orchestration`
- `council` → `system`
- `cron` → `lto`
- `decision` → `system`
- `delivery` → `orchestration`
- `design` → `document`
- `detection` → `system`
- `evaluation` → `aeo`
- `feature` → `skill`
- `file` → `system`
- `gateway` → `system`
- `git` → `system`
- `image` → `system`
- `intent` → `event`
- `memory` → `knowledge`
- `message` → `session`
- `module` → `skill`
- `naming` → `isc`
- `pipeline` → `orchestration`
- `problem` → `system`
- `provider` → `system`
- `rule` → `isc`
- `schedule` → `lto`
- `scheduled` → `lto`
- `subagent` → `orchestration`
- `test` → `quality`
- `tool` → `system`
- `vectorize` → `knowledge`
- `verification` → `quality`
- `vision` → `system`
- `visual` → `document`
- `workflow` → `orchestration`
- `workspace` → `system`

## 变更统计

- 总映射条目: 203
- 发生变更: 129
- 保持不变: 74

## 完整映射（仅变更项）

| 旧事件类型 | 新事件类型 |
|------------|------------|
| `aeo.eval.auto_collect` | `aeo.eval.triggered` |
| `agent.behavior.defect_acknowledged` | `system.behavior.defect_acknowledged` |
| `agent.memory.loss_detected` | `system.memory.loss_detected` |
| `analysis.requested` | `cras.general.requested` |
| `architecture.decision.made` | `architecture.decision.completed` |
| `architecture.layered_check` | `architecture.general.layered_check` |
| `benchmark.completed` | `quality.general.completed` |
| `benchmark.created` | `quality.general.created` |
| `capability.changed` | `skill.general.modified` |
| `code.module.core.modified` | `skill.module_core.modified` |
| `complex_task.detected` | `orchestration.general.detected` |
| `council.caijuedian.convene` | `system.caijuedian.requested` |
| `cras.channel.validate` | `cras.channel.requested` |
| `cron.task.created` | `lto.task.created` |
| `cron.task.updated` | `lto.task.updated` |
| `cron.task.validated` | `lto.task.validated` |
| `cron:create` | `lto.general.create` |
| `cron:update` | `lto.general.update` |
| `cron:validate` | `lto.general.requested` |
| `decision.repair.needed` | `system.repair.needed` |
| `delivery.review_requested` | `orchestration.general.review_requested` |
| `design.architecture.created` | `document.architecture.created` |
| `design.architecture.updated` | `document.architecture.updated` |
| `design.conflict.detected` | `document.conflict.detected` |
| `design.document.created` | `document.document.created` |
| `design.document.modified` | `document.document.modified` |
| `detection.recurring.threshold_exceeded` | `system.recurring.threshold_exceeded` |
| `document.design.delivery_requested` | `document.design.requested` |
| `document.design.pdf_generated` | `document.design.created` |
| `lto.task.auto_bind` | `lto.task.triggered` |
| `evaluation.submitted` | `aeo.general.completed` |
| `event.emitted` | `event.general.emitted` |
| `event.layer_classification_check` | `event.general.layer_classification_check` |
| `event.registered` | `event.general.created` |
| `event.semantic_intent.emit` | `event.semantic_intent.triggered` |
| `evomap.skill.upload` | `evomap.skill.requested` |
| `evomap.sync.request` | `evomap.sync.requested` |
| `feature.developed` | `skill.general.created` |
| `file.changed` | `system.general.modified` |
| `file.config.created` | `system.config.created` |
| `file.config.deleted` | `system.config.deleted` |
| `file.config.modified` | `system.config.modified` |
| `gateway.config.change_requested` | `system.config.change_requested` |
| `git.commit.created` | `system.commit.created` |
| `image.analysis.requested` | `system.analysis.requested` |
| `intent.classified` | `event.general.classified` |
| `intent.system.changed` | `event.system.modified` |
| `intent.type.registered` | `event.type.created` |
| `intent.type.registration_requested` | `event.type.registration_requested` |
| `isc.enforcement.rate.threshold_crossed` | `isc.enforcement_rate.threshold_crossed` |
| `isc.rule.auto_decompose` | `isc.rule.triggered` |
| `isc.skill.index.refresh_requested` | `isc.skill_index.refresh_requested` |
| `isc:category:automation` | `isc.category.matched` |
| `isc:category:capability` | `isc.category.matched` |
| `isc:category:general` | `isc.category.matched` |
| `isc:category:governance` | `isc.category.matched` |
| `isc:category:naming` | `isc.category.matched` |
| `isc:category:orchestration` | `isc.category.matched` |
| `isc:category:output_format` | `isc.category.matched` |
| `isc:category:process` | `isc.category.matched` |
| `isc:category:quality` | `isc.category.matched` |
| `isc:category:remediation` | `isc.category.matched` |
| `isc:category:standardization` | `isc.category.matched` |
| `isc:category:standards` | `isc.category.matched` |
| `isc:category:user_experience` | `isc.category.matched` |
| `isc:category:vectorization` | `isc.category.matched` |
| `isc:rule:matched` | `isc.rule.matched` |
| `knowledge.created` | `knowledge.general.created` |
| `knowledge.deleted` | `knowledge.general.deleted` |
| `knowledge.fixed` | `knowledge.general.modified` |
| `knowledge.learned` | `knowledge.general.created` |
| `knowledge.merged` | `knowledge.general.completed` |
| `knowledge.updated` | `knowledge.general.updated` |
| `memory.created` | `knowledge.general.created` |
| `memory.deleted` | `knowledge.general.deleted` |
| `memory.fixed` | `knowledge.general.modified` |
| `memory.merged` | `knowledge.general.completed` |
| `memory.updated` | `knowledge.general.updated` |
| `message.image.received` | `session.image.received` |
| `message.received.file_request` | `session.received.file_request` |
| `message.reply.received` | `session.reply.received` |
| `module.created` | `skill.general.created` |
| `module.released` | `skill.general.completed` |
| `module.restructure.proposed` | `skill.restructure.proposed` |
| `naming.skill.display` | `isc.skill.requested` |
| `orchestration.subagent.spawned` | `orchestration.subagent.created` |
| `orchestration.task.decomposed` | `orchestration.task.completed` |
| `pipeline.completed` | `orchestration.general.completed` |
| `pipeline.document.delivery_execute` | `orchestration.document.triggered` |
| `pipeline.execution.completed` | `orchestration.execution.completed` |
| `pipeline.stage.failed` | `orchestration.stage.failed` |
| `pipeline.trigger` | `orchestration.general.trigger` |
| `problem.unresolved.detected` | `system.unresolved.detected` |
| `provider.added` | `system.general.added` |
| `rule.created` | `isc.general.created` |
| `rule.updated` | `isc.general.updated` |
| `schedule.monthly` | `lto.general.monthly` |
| `schedule.weekly` | `lto.general.weekly` |
| `scheduled.rule_count_validation` | `lto.general.rule_count_validation` |
| `session.ended` | `session.general.completed` |
| `session.started` | `session.general.started` |
| `skill.changed` | `skill.general.modified` |
| `skill.created` | `skill.general.created` |
| `skill.deleted` | `skill.general.deleted` |
| `skill.distribution` | `skill.general.distribution` |
| `skill.evomap.upload` | `skill.evomap.requested` |
| `skill.fixed` | `skill.general.modified` |
| `skill.merged` | `skill.general.completed` |
| `skill.publish` | `skill.general.publish` |
| `skill.publish_requested` | `skill.general.publish_requested` |
| `skill.published` | `skill.general.published` |
| `skill.registered` | `skill.general.created` |
| `skill.sandbox_compatible` | `skill.general.sandbox_compatible` |
| `skill.sync` | `skill.general.sync` |
| `skill.updated` | `skill.general.updated` |
| `subagent.task.created` | `orchestration.task.created` |
| `subagent.task.timeout` | `orchestration.task.timeout` |
| `subagent.task.truncated` | `orchestration.task.truncated` |
| `system.built` | `system.general.created` |
| `test.failed` | `quality.general.failed` |
| `tool.discovered` | `system.general.discovered` |
| `user.message` | `user.general.message` |
| `vectorize.sh` | `knowledge.general.sh` |
| `verification.disk_check` | `quality.general.disk_check` |
| `verification.executable_artifact_check` | `quality.general.executable_artifact_check` |
| `vision.task.created` | `system.task.created` |
| `visual.diagram.generating` | `document.diagram.created` |
| `workflow.requested` | `orchestration.general.requested` |
| `workspace.file.modified` | `system.file.modified` |

---
生成时间: 2026-03-06
