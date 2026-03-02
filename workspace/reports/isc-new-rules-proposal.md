# ISC规则新增建议

## 概述

基于DTO规则识别缺陷分析，建议ISC新增3条核心治理规则，以系统性解决规则管理问题。

---

## 建议新增规则清单

### 规则1：规则识别准确性规则

```json
{
  "id": "ISC-RULE-IDENTITY-001",
  "name": "rule_identity_accuracy_validation",
  "domain": "governance",
  "type": "standard",
  "scope": "system",
  "description": "规则识别准确性验证 - 确保规则ID、文件名、内部标识一致",
  "rationale": "防止DTO将类别数误认为总数，确保规则识别准确",
  "version": "1.0.0",
  "created_at": "2026-02-28T00:00:00+08:00",
  
  "validation_rules": {
    "id_consistency": {
      "description": "规则文件名必须与内部ID一致",
      "check": "filename_stem == rule.id || filename_stem == rule.ruleId",
      "severity": "error"
    },
    "id_format": {
      "description": "规则ID必须符合标准格式",
      "pattern": "^(rule\\.[a-z0-9-]+-[0-9]{3}|[NRST][0-9]{3}|isc-[a-z0-9-]+)$",
      "severity": "warning"
    },
    "category_mandatory": {
      "description": "规则必须指定类别",
      "check": "rule.category != null || rule.domain != null",
      "severity": "error"
    }
  },
  
  "auto_fix": {
    "enabled": true,
    "actions": [
      {
        "condition": "id_mismatch",
        "action": "suggest_rename",
        "message": "建议将文件名改为与规则ID一致"
      }
    ]
  },
  
  "trigger": {
    "on": ["rule_created", "rule_modified"],
    "frequency": "immediate"
  },
  
  "alert": {
    "conditions": [
      {
        "type": "id_mismatch_count",
        "threshold": "> 0",
        "action": "notify_dto_and_isc"
      }
    ]
  }
}
```

### 规则2：规则触发完整性检查规则

```json
{
  "id": "ISC-RULE-TRIGGER-CHECK-001",
  "name": "rule_trigger_completeness_monitor",
  "domain": "monitoring",
  "type": "detection",
  "scope": "system",
  "description": "规则触发完整性监控 - 检测规则触发率低于阈值的异常情况",
  "rationale": "确保所有规则都能正常触发，及时发现未触发规则",
  "version": "1.0.0",
  "created_at": "2026-02-28T00:00:00+08:00",
  
  "monitoring_config": {
    "scan_interval": "30m",
    "check_type": "trigger_completeness",
    
    "metrics": {
      "total_rules": {
        "source": "filesystem_scan",
        "path": "/root/.openclaw/workspace/skills/isc-core/rules"
      },
      "triggered_rules": {
        "source": "event_log",
        "path": "/root/.openclaw/workspace/skills/dto-core/events/isc-rule-created.jsonl"
      }
    },
    
    "thresholds": {
      "min_trigger_rate": "90%",
      "warning_trigger_rate": "80%",
      "critical_trigger_rate": "50%"
    }
  },
  
  "detection_logic": {
    "untriggered_rules": {
      "calculation": "total_rules - triggered_rules",
      "alert_when": "> 0"
    },
    "trigger_rate": {
      "calculation": "triggered_rules / total_rules * 100",
      "alert_when": "< 90%"
    }
  },
  
  "alert_actions": {
    "warning": {
      "condition": "trigger_rate < 90% && trigger_rate >= 80%",
      "channels": ["feishu", "log"],
      "message_template": "⚠️ 规则触发率警告: {trigger_rate}% ({triggered}/{total})"
    },
    "critical": {
      "condition": "trigger_rate < 80%",
      "channels": ["feishu", "log", "email"],
      "message_template": "🚨 规则触发率严重: {trigger_rate}% ({triggered}/{total})\n未触发规则: {untriggered_list}",
      "auto_action": "generate_remediation_report"
    }
  },
  
  "remediation": {
    "auto_generate_report": true,
    "report_path": "/root/.openclaw/workspace/reports/rule-trigger-gaps.json",
    "include_untriggered_details": true
  },
  
  "integration": {
    "dto_handshake": {
      "enabled": true,
      "sync_trigger_status": true
    }
  }
}
```

### 规则3：记忆丢失后自恢复规则

```json
{
  "id": "ISC-MEMORY-RECOVERY-001",
  "name": "memory_loss_self_recovery",
  "domain": "resilience",
  "type": "recovery",
  "scope": "system",
  "description": "记忆丢失后自恢复 - 从文件系统自动重建规则清单和状态",
  "rationale": "确保MEMORY.md丢失后系统仍能自主决策",
  "version": "1.0.0",
  "created_at": "2026-02-28T00:00:00+08:00",
  
  "recovery_triggers": {
    "memory_file_missing": {
      "check": "!exists('/root/.openclaw/workspace/MEMORY.md')",
      "severity": "critical"
    },
    "registry_corrupted": {
      "check": "!valid_json('/root/.openclaw/workspace/.rule-registry.json')",
      "severity": "high"
    },
    "bootstrap_required": {
      "check": "rule_registry_empty || rule_count == 0",
      "severity": "high"
    }
  },
  
  "recovery_steps": [
    {
      "step": 1,
      "name": "filesystem_scan",
      "description": "扫描文件系统发现所有规则文件",
      "action": "recursive_scan",
      "target_path": "/root/.openclaw/workspace/skills/isc-core/rules",
      "output": "discovered_rules"
    },
    {
      "step": 2,
      "name": "rule_parsing",
      "description": "解析规则文件提取元数据",
      "action": "parse_json_files",
      "extract_fields": ["id", "name", "category", "domain", "triggers", "auto_execute"],
      "output": "parsed_rules"
    },
    {
      "step": 3,
      "name": "subscription_alignment",
      "description": "验证并重建订阅关系",
      "action": "check_and_create_subscriptions",
      "subscription_dir": "/root/.openclaw/workspace/skills/dto-core/subscriptions",
      "auto_create_missing": true
    },
    {
      "step": 4,
      "name": "registry_rebuild",
      "description": "重建规则注册表",
      "action": "write_registry",
      "registry_path": "/root/.openclaw/workspace/.rule-registry.json",
      "include_categories": true,
      "include_trigger_history": false
    },
    {
      "step": 5,
      "name": "state_validation",
      "description": "验证恢复后的状态",
      "action": "validate",
      "checks": [
        "rule_count > 0",
        "all_rules_have_id",
        "categories_populated"
      ]
    },
    {
      "step": 6,
      "name": "notification",
      "description": "通知管理员恢复完成",
      "action": "send_notification",
      "channels": ["feishu", "log"],
      "message_template": "🔄 系统自恢复完成\n恢复规则数: {rule_count}\n恢复类别数: {category_count}\n时间: {timestamp}"
    }
  ],
  
  "bootstrap_mode": {
    "enabled": true,
    "description": "首次启动或完全重置时的自举模式",
    "steps": [
      "discover_all_rules",
      "categorize_rules",
      "create_default_subscriptions",
      "initialize_trigger_log",
      "generate_baseline_report"
    ]
  },
  
  "fallback_strategies": {
    "partial_recovery": {
      "condition": "some_rules_unparsable",
      "action": "skip_invalid_continue",
      "log_errors": true
    },
    "empty_rules_dir": {
      "condition": "rules_dir_empty",
      "action": "alert_and_wait",
      "message": "规则目录为空，无法自恢复"
    }
  },
  
  "verification": {
    "post_recovery_check": {
      "enabled": true,
      "interval": "5m",
      "check_registry_integrity": true,
      "check_subscription_alignment": true
    }
  }
}
```

---

## 规则部署建议

### 部署顺序

| 顺序 | 规则ID | 优先级 | 原因 |
|------|--------|--------|------|
| 1 | ISC-MEMORY-RECOVERY-001 | P0 | 基础恢复能力，必须先有 |
| 2 | ISC-RULE-IDENTITY-001 | P0 | 防止规则识别错误 |
| 3 | ISC-RULE-TRIGGER-CHECK-001 | P1 | 监控和告警能力 |

### 部署文件位置

```
/root/.openclaw/workspace/skills/isc-core/rules/
├── rule.isc-memory-recovery-001.json       # 新增
├── rule.isc-rule-identity-001.json         # 新增
├── rule.isc-rule-trigger-check-001.json    # 新增
└── [其他现有规则...]
```

### 订阅创建

```bash
# 为新增规则创建DTO订阅
for rule in isc-memory-recovery-001 isc-rule-identity-001 isc-rule-trigger-check-001; do
    cat > "/root/.openclaw/workspace/skills/dto-core/subscriptions/isc-${rule}.json" << 'EOF'
{
  "subscription_id": "sub_isc_${rule}",
  "subscriber": "DTO-Declarative-Orchestrator",
  "rule_id": "rule.${rule}",
  "auto_execute": true,
  "subscribed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "source": "auto_deployment"
}
EOF
done
```

---

## 与现有规则的协调

### 与 rule.isc-dto-handshake-001 的关系

```
┌────────────────────────────────────────────────────────────┐
│                     规则关系图                              │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  rule.isc-dto-handshake-001 (现有)                         │
│         │                                                  │
│         ├──▶ 触发: rule.isc-rule-identity-001 (新增)       │
│         │         检查规则ID一致性                          │
│         │                                                  │
│         ├──▶ 触发: rule.isc-rule-trigger-check-001 (新增)  │
│         │         检查触发完整性                            │
│         │                                                  │
│         └──▶ 触发: rule.isc-memory-recovery-001 (新增)     │
│                   恢复丢失的记忆                            │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### 触发时序

1. **ISC-DTO握手** (每30分钟)
2. **规则身份验证** (每次握手时)
3. **触发完整性检查** (每次握手时)
4. **记忆恢复检查** (检测到异常时)

---

## 预期效果

| 指标 | 当前 | 新增规则后 |
|------|------|------------|
| 规则识别准确率 | 低（混淆类别与总数） | 高（精确识别） |
| 未触发规则发现 | 手动检查 | 自动监控 |
| 记忆丢失恢复 | 无法恢复 | 自动自举 |
| 规则治理覆盖 | 无 | 完整覆盖 |

---

*建议生成时间: 2026-02-28*
