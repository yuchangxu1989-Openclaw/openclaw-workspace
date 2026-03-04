#!/usr/bin/env python3
"""
Day 2 ISC Enforcement Patcher
Patches all P0 and P1 rules to have proper trigger.events and trigger.actions.
The verifier requires trigger.actions to be a non-empty array.
"""

import json
import os
import sys
from pathlib import Path

RULES_DIR = Path("/root/.openclaw/workspace/skills/isc-core/rules")

# ============================================================
# RULE-SPECIFIC PATCHES
# Maps filename -> {events: [...], actions: [...]} to add/replace
# Only for rules that need fixing
# ============================================================

P0_PATCHES = {
    "gateway-config-protection-N033.json": {
        "events": [
            "file.config.modified",
            "file.config.created",
            "file.config.deleted",
            "gateway.config.change_requested"
        ],
        "actions": [
            {
                "type": "gate_check",
                "description": "检测到敏感配置修改操作时，阻塞执行并要求用户人工确认",
                "behavior": "block_until_user_approval"
            },
            {
                "type": "auto_backup",
                "description": "配置修改前自动创建带时间戳的备份文件",
                "behavior": "create_timestamped_backup"
            }
        ]
    },
    "model-api-key-pool-management-029.json": {
        "actions": [
            {
                "type": "auto_trigger",
                "description": "API Key失效或限流时自动切换到备用Key，执行负载均衡调度",
                "behavior": "auto_failover_and_balance"
            },
            {
                "type": "health_check",
                "description": "定期检查所有Key池状态，标记失效Key并更新路由表",
                "behavior": "periodic_key_health_scan"
            }
        ]
    },
    "N034-rule-identity-accuracy.json": {
        "events": [
            "dto.rule.statistics_requested",
            "isc.rule.created",
            "isc.rule.deleted",
            "scheduled.rule_count_validation"
        ],
        "actions": [
            {
                "type": "gate_check",
                "description": "从文件系统实际扫描规则文件计数，与注册表交叉验证，禁止推断或缓存",
                "behavior": "filesystem_scan_and_crosscheck"
            },
            {
                "type": "auto_sync",
                "description": "发现计数不匹配时，自动同步注册表（差异≤5条时）",
                "behavior": "auto_sync_on_mismatch"
            }
        ]
    },
    "rule.anti-entropy-design-principle-001.json": {
        "actions": [
            {
                "type": "gate_check",
                "description": "验证设计产出是否满足四项反熵增检查：可扩展性、可泛化性、可生长性、有序度方向",
                "behavior": "block_on_entropy_increase"
            },
            {
                "type": "quality_gate",
                "description": "不通过任一反熵增检查项时，阻塞交付并要求重新设计",
                "behavior": "block_and_redesign"
            }
        ]
    },
    "rule.architecture-review-pipeline-001.json": {
        "actions": [
            {
                "type": "gate_check",
                "description": "架构方案必须经过标准化评审流水线：架构师出方案→工程师验证→质量分析师验证→凌霄阁终审",
                "behavior": "enforce_review_pipeline"
            },
            {
                "type": "block_on_fail",
                "description": "跳过任何评审阶段的架构方案不得进入实施阶段",
                "behavior": "block_unreviewed_architecture"
            }
        ]
    },
    "rule.cron-task-model-requirement-001.json": {
        "events": [
            "cron.task.created",
            "cron.task.updated",
            "cron.task.validated"
        ],
        "actions": [
            {
                "type": "gate_check",
                "description": "定时任务创建/更新时验证必须指定model字段，未指定则拒绝创建",
                "behavior": "reject_cron_without_model"
            },
            {
                "type": "auto_fix",
                "description": "缺少model字段时，自动填入默认模型claude/claude-sonnet-4-6并警告",
                "behavior": "apply_default_model"
            }
        ]
    },
    "rule.interactive-card-context-inference-001.json": {
        "actions": [
            {
                "type": "auto_trigger",
                "description": "收到引用[Interactive Card]的回复时，自动回溯最近5条消息推断卡片内容并直接响应",
                "behavior": "infer_card_context_and_respond"
            },
            {
                "type": "block_on_fail",
                "description": "禁止向用户反问卡片内容，必须自行推断",
                "behavior": "block_user_query_about_card"
            }
        ]
    },
    "rule.layered-decoupling-architecture-001.json": {
        "actions": [
            {
                "type": "gate_check",
                "description": "验证设计文档是否明确三层归属（感知层/认知层/执行层）及事件总线解耦",
                "behavior": "validate_three_layer_attribution"
            },
            {
                "type": "block_on_fail",
                "description": "任一层归属不清晰时标注设计缺陷，打回补充后方可通过",
                "behavior": "block_incomplete_layering"
            }
        ]
    },
    "rule.self-correction-to-rule-001.json": {
        "actions": [
            {
                "type": "auto_trigger",
                "description": "检测到Agent承认行为缺陷并表达纠偏意图时，自动将纠偏固化为ISC规则或技能更新",
                "behavior": "auto_codify_correction"
            },
            {
                "type": "gate_check",
                "description": "纠偏规则必须泛化——解决一类问题而非单个case，不通过则要求重写",
                "behavior": "require_generalized_rule"
            }
        ]
    },
    "rule.interaction-source-file-delivery-007.json": {
        # This rule has trigger as a string, need full replacement
        "events": [
            "user.request.source_file",
            "message.received.file_request"
        ],
        "actions": [
            {
                "type": "auto_trigger",
                "description": "用户请求源文件时，通过message工具直接发送文件本身；通道不支持时输出完整内容",
                "behavior": "direct_file_delivery"
            },
            {
                "type": "block_on_fail",
                "description": "禁止只返回文件路径或使用飞书文件上传工具，必须直接传输",
                "behavior": "block_path_only_response"
            }
        ]
    }
}

P1_PATCHES = {
    "aeo-dual-track-orchestration-024.json": {
        "actions": [
            {
                "type": "auto_trigger",
                "description": "收到评测请求时，自动区分AI效果运营和功能质量运营双轨道，分别执行评测并合并报告"
            }
        ]
    },
    "aeo-feedback-auto-collection-025.json": {
        "actions": [
            {
                "type": "auto_trigger",
                "description": "自动收集AEO反馈数据，汇总评测结果并归档到反馈库"
            }
        ]
    },
    "aeo-insight-to-action-026.json": {
        "actions": [
            {
                "type": "auto_trigger",
                "description": "将AEO洞察自动转化为可执行的改进行动项，分配到相关技能owner"
            }
        ]
    },
    "auto-aeo-evaluation-standard-generation-023.json": {
        "actions": [
            {
                "type": "auto_trigger",
                "description": "技能变更时自动生成或更新AEO评测标准，确保评测覆盖新功能"
            }
        ]
    },
    "auto-skill-change-vectorization-028.json": {
        "actions": [
            {
                "type": "auto_trigger",
                "description": "技能文件变更时自动触发向量化处理，更新知识库索引"
            }
        ]
    },
    "auto-skill-md-generation-019.json": {
        "actions": [
            {
                "type": "auto_trigger",
                "description": "技能创建或重大更新时自动生成/更新SKILL.md文档"
            }
        ]
    },
    "auto-universal-root-cause-analysis-020.json": {
        "actions": [
            {
                "type": "auto_trigger",
                "description": "检测到系统故障或badcase时自动执行根因分析，输出结构化诊断报告"
            }
        ]
    },
    "decision-auto-repair-loop-post-pipeline-016.json": {
        "events": [
            "pipeline.execution.completed",
            "pipeline.stage.failed",
            "decision.repair.needed"
        ],
        "actions": [
            {
                "type": "auto_trigger",
                "description": "流水线执行后自动检测决策修复需求，启动修复循环直到通过"
            }
        ]
    },
    "detection-architecture-design-isc-compliance-audit-022.json": {
        "actions": [
            {
                "type": "auto_trigger",
                "description": "架构设计产出后自动执行ISC合规审计，检查是否符合所有适用规则"
            }
        ]
    },
    "detection-cras-recurring-pattern-auto-resolve-017.json": {
        "events": [
            "cras.pattern.detected",
            "cras.recurring.issue_identified",
            "detection.recurring.threshold_exceeded"
        ],
        "actions": [
            {
                "type": "auto_trigger",
                "description": "CRAS检测到重复模式时自动触发解决方案生成并执行"
            }
        ]
    },
    "detection-skill-rename-global-alignment-018.json": {
        "actions": [
            {
                "type": "auto_trigger",
                "description": "技能重命名后自动扫描全局引用并执行对齐更新"
            }
        ]
    },
    "N035-rule-trigger-completeness.json": {
        "events": [
            "isc.rule.created",
            "isc.rule.updated",
            "isc.enforcement.audit_requested"
        ],
        "actions": [
            {
                "type": "auto_trigger",
                "description": "规则创建/更新时验证trigger字段完整性，缺失则标记为unenforced"
            }
        ]
    },
    "N036-memory-loss-recovery.json": {
        "events": [
            "session.started",
            "agent.memory.loss_detected",
            "session.context.incomplete"
        ],
        "actions": [
            {
                "type": "auto_trigger",
                "description": "检测到记忆丢失时自动触发恢复流程，从文件系统重建关键上下文"
            }
        ]
    },
    "rule.architecture-diagram-visual-output-001.json": {
        "actions": [
            {
                "type": "auto_trigger",
                "description": "架构文档产出时自动检查是否需要可视化图表输出，缺少则提示补充"
            }
        ]
    },
    "rule.auto-evomap-sync-trigger-001.json": {
        # trigger is a string "skill_lifecycle", need full replacement
        "events": [
            "skill.published",
            "skill.version.updated",
            "skill.lifecycle.status_changed"
        ],
        "actions": [
            {
                "type": "auto_trigger",
                "description": "技能生命周期变更时自动触发EvoMap同步，确保网络中的技能信息一致"
            }
        ]
    },
    "rule.auto-github-sync-trigger-001.json": {
        # trigger is a string "file_change", need full replacement
        "events": [
            "file.changed",
            "git.commit.created",
            "workspace.file.modified"
        ],
        "actions": [
            {
                "type": "auto_trigger",
                "description": "工作区文件变更时自动触发GitHub同步，保持远程仓库与本地一致"
            }
        ]
    },
    "rule.capability-anchor-auto-register-001.json": {
        "actions": [
            {
                "type": "auto_trigger",
                "description": "新能力创建或更新时自动注册到CAPABILITY-ANCHOR.md，保持能力清单最新"
            }
        ]
    },
    "rule.glm-vision-priority-001.json": {
        "events": [
            "image.analysis.requested",
            "vision.task.created",
            "message.image.received"
        ],
        "actions": [
            {
                "type": "auto_trigger",
                "description": "图像分析任务优先使用GLM视觉模型，不可用时降级到备选模型"
            }
        ]
    },
    "rule.isc-skill-index-auto-update-001.json": {
        # trigger is a list, need full replacement
        "events": [
            "skill.created",
            "skill.updated",
            "skill.deleted",
            "isc.skill.index.refresh_requested"
        ],
        "actions": [
            {
                "type": "auto_trigger",
                "description": "技能变更时自动更新ISC技能索引，保持索引与实际技能一致"
            }
        ]
    },
    "rule.parallel-subagent-orchestration-001.json": {
        "actions": [
            {
                "type": "auto_trigger",
                "description": "复杂任务自动拆分为并行子Agent执行，协调结果汇总并处理冲突"
            }
        ]
    },
    "rule.skill.evolution.auto-trigger.json": {
        "events": [
            "skill.usage.pattern_detected",
            "skill.performance.degraded",
            "skill.evolution.scheduled"
        ],
        "actions": [
            {
                "type": "auto_trigger",
                "description": "技能使用模式变化或性能下降时自动触发技能进化流程"
            }
        ]
    },
    "rule.visual-output-style-001.json": {
        "actions": [
            {
                "type": "auto_trigger",
                "description": "可视化输出时自动应用个性化设计风格，拒绝通用AI审美"
            }
        ]
    }
}

# Bundle file (array of rules)
BUNDLE_FILE = "rule-bundle-intent-system-001.json"

def patch_rule(rule, patches):
    """Patch a single rule's trigger field."""
    trigger = rule.get("trigger")
    
    # Case 1: trigger is a string → convert to dict
    if isinstance(trigger, str):
        rule["trigger"] = {
            "events": patches.get("events", [trigger + ".triggered"]),
            "actions": patches.get("actions", [{"type": "auto_trigger", "description": f"Auto-triggered on {trigger}"}])
        }
        return True
    
    # Case 2: trigger is a list → convert to dict
    if isinstance(trigger, list):
        rule["trigger"] = {
            "events": patches.get("events", [str(t) for t in trigger if isinstance(t, str)]),
            "actions": patches.get("actions", [{"type": "auto_trigger", "description": "Auto-triggered on matched event"}])
        }
        return True
    
    # Case 3: trigger is a dict
    if isinstance(trigger, dict):
        changed = False
        if "events" not in trigger and "events" in patches:
            trigger["events"] = patches["events"]
            changed = True
        if "actions" not in trigger and "actions" in patches:
            trigger["actions"] = patches["actions"]
            changed = True
        # Some rules have trigger.conditions but no trigger.events
        if "events" not in trigger and "events" not in patches:
            # Derive from conditions if available
            if "conditions" in trigger:
                trigger["events"] = [f"trigger.condition.{c.get('type', 'unknown')}" for c in trigger["conditions"] if isinstance(c, dict)]
            elif "type" in trigger:
                trigger["events"] = [f"{trigger['type']}.triggered"]
            if "events" in trigger:
                changed = True
        if "actions" not in trigger and "actions" not in patches:
            # This shouldn't happen if all rules are in patches, but just in case
            tier = rule.get("enforcement_tier", "P1_process")
            if tier == "P0_gate":
                trigger["actions"] = [{"type": "gate_check", "description": rule.get("description", "Gate check")[:100]}]
            else:
                trigger["actions"] = [{"type": "auto_trigger", "description": rule.get("description", "Auto trigger")[:100]}]
            changed = True
        return changed
    
    # Case 4: trigger is missing entirely
    if trigger is None:
        tier = rule.get("enforcement_tier", "P1_process")
        domain = rule.get("domain", "general")
        rule["trigger"] = {
            "events": patches.get("events", [f"{domain}.event.triggered"]),
            "actions": patches.get("actions", [
                {"type": "gate_check" if tier == "P0_gate" else "auto_trigger",
                 "description": rule.get("description", "Enforcement action")[:100]}
            ])
        }
        return True
    
    return False


def main():
    stats = {"p0_fixed": 0, "p1_fixed": 0, "bundle_fixed": 0, "already_ok": 0, "errors": []}
    
    # Process all JSON files
    for fname in sorted(os.listdir(RULES_DIR)):
        if not fname.endswith(".json"):
            continue
        fpath = RULES_DIR / fname
        
        try:
            with open(fpath, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except Exception as e:
            stats["errors"].append(f"{fname}: {e}")
            continue
        
        # Handle bundle file (array of rules)
        if isinstance(data, list):
            changed = False
            for i, rule in enumerate(data):
                if not isinstance(rule, dict):
                    continue
                tier = rule.get("enforcement_tier", "P1_process")
                # Check if needs patching
                trigger = rule.get("trigger")
                needs_patch = False
                if trigger is None:
                    needs_patch = True
                elif isinstance(trigger, (str, list)):
                    needs_patch = True
                elif isinstance(trigger, dict) and not trigger.get("actions"):
                    needs_patch = True
                
                if needs_patch:
                    # Generate generic patch for bundle rules
                    desc = rule.get("description", "Bundle rule action")
                    action_str = rule.get("action", "")
                    if isinstance(action_str, str) and action_str:
                        desc = action_str[:120]
                    patch = {
                        "actions": [{"type": "auto_trigger", "description": desc[:120]}]
                    }
                    if not (isinstance(trigger, dict) and trigger.get("events")):
                        patch["events"] = [f"intent.system.triggered"]
                    
                    if patch_rule(rule, patch):
                        changed = True
            
            if changed:
                with open(fpath, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=4)
                stats["bundle_fixed"] += 1
                print(f"  ✅ [BUNDLE] {fname} — patched")
            else:
                stats["already_ok"] += 1
            continue
        
        if not isinstance(data, dict):
            continue
        
        tier = data.get("enforcement_tier", "")
        
        # Check if already enforced
        trigger = data.get("trigger")
        if isinstance(trigger, dict) and trigger.get("actions") and trigger.get("events"):
            stats["already_ok"] += 1
            continue
        
        # Find appropriate patch
        patches = {}
        if fname in P0_PATCHES:
            patches = P0_PATCHES[fname]
        elif fname in P1_PATCHES:
            patches = P1_PATCHES[fname]
        else:
            # Unknown rule needing patch - generate generic
            if isinstance(trigger, dict) and trigger.get("actions"):
                stats["already_ok"] += 1
                continue
            desc = data.get("description", "Rule enforcement action")
            if tier == "P0_gate":
                patches = {"actions": [{"type": "gate_check", "description": desc[:120]}]}
            else:
                patches = {"actions": [{"type": "auto_trigger", "description": desc[:120]}]}
            if not (isinstance(trigger, dict) and trigger.get("events")):
                domain = data.get("domain", "general")
                patches["events"] = [f"{domain}.rule.triggered"]
        
        if patch_rule(data, patches):
            with open(fpath, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=4)
            if tier == "P0_gate":
                stats["p0_fixed"] += 1
                print(f"  ✅ [P0] {fname} — patched")
            else:
                stats["p1_fixed"] += 1
                print(f"  ✅ [P1] {fname} — patched")
        else:
            stats["already_ok"] += 1
    
    # Summary
    print(f"\n{'='*50}")
    print(f"  Day 2 Enforcement Patcher — Summary")
    print(f"{'='*50}")
    print(f"  P0 rules fixed:    {stats['p0_fixed']}")
    print(f"  P1 rules fixed:    {stats['p1_fixed']}")
    print(f"  Bundle rules fixed: {stats['bundle_fixed']}")
    print(f"  Already OK:        {stats['already_ok']}")
    if stats["errors"]:
        print(f"  Errors:            {len(stats['errors'])}")
        for e in stats["errors"]:
            print(f"    ⚠️  {e}")
    
    return 0 if not stats["errors"] else 1


if __name__ == "__main__":
    sys.exit(main())
