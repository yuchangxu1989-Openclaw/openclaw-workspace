# 分层端到端架构检查器（Layered Architecture Checker）

## 能力说明

对技能目录、ISC 规则 JSON、设计文档进行自动检查，确保满足“分层端到端 + 分层解耦”原则：

- 感知层（Perception）：谁负责探测/捕获信号
- 认知层（Cognition）：谁负责理解/决策
- 执行层（Execution）：谁负责行动
- 解耦方式：三层应通过事件总线进行协作，避免层间直接硬耦合

## 输入

支持以下任一输入路径：

1. 技能目录路径（例如 `skills/xxx`）
2. ISC 规则 JSON 路径（例如 `skills/isc-core/rules/rule.xxx.json`）
3. 设计文档路径（Markdown/文本/JSON）

CLI 用法：

```bash
node skills/layered-architecture-checker/index.js <targetPath> [--strict] [--json]
```

- `--strict`：若存在违规则以非 0 退出（用于 CI / git hook）
- `--json`：输出 JSON 报告

## 检查项

1. 三层归属是否明确：
   - 感知层
   - 认知层
   - 执行层
2. 三层之间是否通过事件总线解耦（是否出现 event bus / pub-sub / event-driven 等证据）
3. 是否存在直接耦合迹象（如 direct call / 紧耦合 / bypass event bus）

## 输出报告

报告包含：

- `target`：检查目标
- `kind`：目标类型（skill_dir / isc_rule_json / design_doc）
- `layers`：每层是否明确
- `decoupling`：是否解耦、是否存在直接耦合迹象
- `violations`：违规点清单
- `pass`：是否通过

## 集成方式

### Git Hook

`.git/hooks/pre-commit` 示例：

```bash
#!/usr/bin/env bash
node skills/layered-architecture-checker/index.js skills/isc-core/rules/rule.layered-decoupling-architecture-001.json --strict
```

### CI

```bash
node skills/layered-architecture-checker/index.js designs/xxx.md --strict --json
```

---

该技能用于将“分层端到端架构原则 / 分层解耦原则”从记忆约束转为可执行检查器。