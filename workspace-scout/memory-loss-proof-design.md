# 言出法随 E2E — "失忆后稳定复现 / 长期有效" 验证机制设计

**版本**: 1.0.0  
**日期**: 2026-03-07  
**作者**: Scout (情报专家)  
**状态**: PROPOSAL  

---

## 0. 问题定义

**核心问题**：Agent 每次会话都是"失忆重启"。如何保证"言出法随"（P2E）能力不依赖记忆，在任意时间、任意 Agent、任意会话中都能稳定复现？

**关键挑战**：
1. Agent 的行为约束全部存在于上下文窗口中，session 结束即丢失
2. Memory 文件是"建议"而非"强制"——Agent 可以选择不读或忽略
3. 子 Agent 更易失忆——它们连 MEMORY.md 都不应读取
4. 规则/技能的执行质量依赖 Agent "理解"而非"机械执行"
5. 系统演进可能无意中破坏已有约束（回归）

---

## 1. 约束沉淀矩阵

### 1.1 约束层次模型

```
┌──────────────────────────────────────────────────────────────────┐
│  Layer 0: INFRA (平台层 — 无需 Agent 记忆，代码级强制)          │
│  ├── Gateway config / 路由规则                                   │
│  ├── 工具 policy (tool allowlist/denylist)                       │
│  └── 硬编码拦截器 (hooks, validators)                           │
├──────────────────────────────────────────────────────────────────┤
│  Layer 1: AGENTS.md (启动层 — 每次会话必读，注入 system prompt) │
│  ├── 启动自检清单                                                │
│  ├── 防失忆规则（写文件、不只回话）                              │
│  └── 关键行为约束                                                │
├──────────────────────────────────────────────────────────────────┤
│  Layer 2: ISC Rules (机器可读约束 — JSON 规则 + 校验脚本)       │
│  ├── Gate 规则 (block/warn/advisory)                             │
│  ├── 标准草案审查                                                │
│  └── 触发-动作映射                                               │
├──────────────────────────────────────────────────────────────────┤
│  Layer 3: Skills (能力层 — SKILL.md + 脚本)                     │
│  ├── 每个 Skill 的验收标准                                       │
│  ├── 自检脚本                                                    │
│  └── 输入输出 schema                                             │
├──────────────────────────────────────────────────────────────────┤
│  Layer 4: CI / Automated Tests (验证层 — 自动、无人值守)        │
│  ├── 单元测试 / 集成测试                                         │
│  ├── 端到端回归测试                                              │
│  └── 定时巡检 (cron)                                             │
├──────────────────────────────────────────────────────────────────┤
│  Layer 5: Memory (建议层 — 仅在主会话加载)                      │
│  ├── MEMORY.md（长期记忆）                                       │
│  └── memory/YYYY-MM-DD.md（日志）                                │
└──────────────────────────────────────────────────────────────────┘
```

### 1.2 各约束应沉淀的位置

| 约束类型 | 必须沉淀层 | 原因 | 失忆免疫？ |
|----------|-----------|------|-----------|
| **行为禁令**（不可外泄数据、不可随意发消息） | L0 (Gateway) + L1 (AGENTS.md) | 安全约束必须双重保障 | ✅ L0 完全免疫 |
| **输出格式规范**（命名、双语、schema） | L2 (ISC Rules) + L3 (Skills) | 机器可校验，不依赖 Agent 记忆 | ✅ 脚本校验免疫 |
| **质量门禁**（反熵增、测试覆盖率） | L2 (ISC Rules) + L4 (CI) | 自动化 gate 不依赖 Agent 意愿 | ✅ |
| **流程约束**（Sprint 四重门禁） | L2 (ISC Rules) | 事件触发机制自动执行 | ✅ 事件驱动 |
| **架构决策**（模型路由、Agent 职责划分） | L1 (AGENTS.md) | 每次会话注入 system prompt | ⚠️ 依赖 Agent 遵守 |
| **经验教训**（历史 badcase、最佳实践） | L5 (Memory) | 上下文增强，非强制 | ❌ 失忆会丢失 |
| **项目状态**（当前进度、Gap列表） | L5 (Memory) + L4 (Tracker) | 状态查询可自动化 | ⚠️ 需要主动读取 |

### 1.3 关键发现：必须从 L5 上提到 L0-L4 的约束

以下约束当前**仅存在于记忆/对话中**，必须沉淀到持久层：

| 约束 | 当前位置 | 应沉淀到 | 具体动作 |
|------|---------|---------|---------|
| "所有子 Agent 产出必须写文件" | AGENTS.md (已沉淀✅) | + ISC Rule + CI 检查 | 增加 `rule.subagent-output-persistence-001.json` |
| "P2E 全链路10阶段定义" | principle-e2e-spec/ (已沉淀✅) | + Gate Schema | 增加可执行 gate checker |
| "ISC 规则命名必须语义化" | ISC SKILL.md (已沉淀✅) | + CI lint | 增加 `isc-rule-lint.sh` |
| "评测结论枚举 SUCCESS/PARTIAL/FAIL" | 01-evaluation-model.md | + JSON Schema | 产出 `verdict-schema.json` |
| "静默失败率 ≤ 1%" | 01-evaluation-model.md | + 自动监控 | 产出 `silent-failure-detector.sh` |

---

## 2. Memory-Loss Proof 验证方案

### 2.1 核心思路：三层防线

```
┌───────────────────────────────────────────────────────────┐
│              Memory-Loss Proof 三层防线                     │
│                                                           │
│  【防线1: 冷启动测试 (Cold Boot Test)】                    │
│   Agent 在零记忆状态下执行标准任务集，                      │
│   验证行为符合所有约束。                                    │
│                                                           │
│  【防线2: 回归哨兵 (Regression Sentinel)】                  │
│   自动化脚本定期检查约束文件完整性 +                        │
│   ISC 规则可执行性 + Gate 通过率。                          │
│                                                           │
│  【防线3: 对抗性注入 (Adversarial Injection)】              │
│   故意注入违反约束的输入，验证系统拦截能力。                │
└───────────────────────────────────────────────────────────┘
```

### 2.2 防线1: Cold Boot Test（冷启动测试）

**目的**：模拟"完全失忆"的 Agent，验证仅靠持久化约束就能正确行为。

**方法**：
```bash
# 1. 创建一个纯净 Agent session（不加载任何 memory/ 文件）
# 2. 注入标准 P2E 意图
# 3. 检查 Agent 输出是否满足约束

cold-boot-test.sh --scenarios p2e-standard-scenarios.json \
                   --no-memory \
                   --check-constraints constraints-checklist.yaml
```

**标准用例集**（至少覆盖）：

| 用例 ID | 意图类型 | 输入 | 预期行为 | 失忆后仍应通过？ |
|---------|---------|------|---------|----------------|
| CB-001 | PRINCIPLE | "所有输出必须有溯源" | 生成 ISC 规则 + 校验脚本 | ✅ 因为 ISC 机制在 SKILL.md 中 |
| CB-002 | VERDICT | "命名规范全自动执行" | 激活已有规则，无需新建 | ✅ 规则已持久化 |
| CB-003 | CONSTRAINT | "LLM 失败率超 10% 告警" | 创建监控规则 + 阈值检查 | ✅ ISC 规则机制不依赖记忆 |
| CB-004 | GOAL | "测试覆盖率达到 80%" | 分解子任务 DAG | ⚠️ 需要 DTO 能力在 Skill 中 |
| CB-005 | 混合 | 同时包含 PRINCIPLE + CONSTRAINT | 正确拆分为两条规则 | ✅ |
| CB-006 | 回归 | 执行新意图后检查旧规则 | 旧规则不被破坏 | ✅ |

**判定标准**：
- ✅ PASS：冷启动 Agent 行为与有记忆 Agent 在**约束遵守维度**上无差异
- ⚠️ DEGRADED：冷启动 Agent 缺少优化（如未引用历史 badcase），但核心约束满足
- ❌ FAIL：冷启动 Agent 违反了应被 L0-L4 层强制的约束

### 2.3 防线2: Regression Sentinel（回归哨兵）

**目的**：持续监控约束文件和规则的完整性、一致性。

**实现**：定时 cron 任务 + Git hook。

```yaml
# regression-sentinel.yaml
name: P2E Regression Sentinel
schedule: "0 */4 * * *"  # 每4小时
checks:
  # 文件完整性
  - id: file-integrity
    description: "关键文件必须存在且内容完整"
    files:
      - path: AGENTS.md
        must_contain:
          - "启动自检"
          - "防失忆规则"
          - "子Agent任务必须将结果写入文件"
      - path: CAPABILITY-ANCHOR.md
        must_exist: true
      - path: skills/isc-core/SKILL.md
        must_exist: true
      - path: skills/isc-core/rules/
        min_files: 10
    
  # ISC 规则健康
  - id: isc-rules-health
    description: "所有 ISC 规则 JSON 可解析且 schema 合规"
    script: |
      for f in skills/isc-core/rules/rule.*.json; do
        node -e "JSON.parse(require('fs').readFileSync('$f','utf8'))" || exit 1
        # 检查必须字段
        node -e "
          const r = JSON.parse(require('fs').readFileSync('$f','utf8'));
          if (!r.id || !r.severity || !r.trigger) process.exit(1);
        " || exit 1
      done
    
  # Gate 可执行性
  - id: gate-executability
    description: "Gate 脚本可运行且返回有效结论"
    script: |
      for gate in scripts/gates/*.sh; do
        bash "$gate" --dry-run || exit 1
      done
    
  # 约束覆盖率
  - id: constraint-coverage
    description: "L1-L4 约束覆盖率不低于基线"
    script: |
      # 统计已沉淀约束数量
      RULES=$(ls skills/isc-core/rules/rule.*.json | wc -l)
      GATES=$(ls scripts/gates/*.sh 2>/dev/null | wc -l)
      TESTS=$(find tests/ -name '*.test.*' 2>/dev/null | wc -l)
      echo "Rules: $RULES, Gates: $GATES, Tests: $TESTS"
      # 基线校验
      [ "$RULES" -ge 10 ] || exit 1
```

### 2.4 防线3: Adversarial Injection（对抗性注入）

**目的**：主动测试约束的拦截能力。

**用例设计**：

| 注入 ID | 攻击向量 | 预期拦截层 | 通过条件 |
|---------|---------|-----------|---------|
| ADV-001 | 子 Agent 尝试只回话不写文件 | L1 (AGENTS.md 规则) | Agent 自行纠正并写文件 |
| ADV-002 | 提交不符合命名规范的 ISC 规则 | L2 (ISC lint) | lint 脚本拦截 |
| ADV-003 | 提交熵增设计（不可扩展） | L2 (反熵增 Gate) | gate-check 阻断 |
| ADV-004 | 新规则与旧规则语义冲突 | L2 (ISC 冲突检测) | 冲突检测报告 |
| ADV-005 | 删除 CAPABILITY-ANCHOR.md 后启动 | L1 (启动自检) | Agent 报错并尝试恢复 |
| ADV-006 | P2E 意图执行后不发布变更通知 | L2 (RELEASE Gate) | Gate NO-GO |
| ADV-007 | 发送 P2E_SCORE < 0.6 的用例尝试发布 | L4 (Gate 脚本) | 被自动阻断 |

---

## 3. 程序化检查建议

### 3.1 检查脚本清单

| 脚本名 | 类型 | 触发方式 | 检查内容 | 优先级 |
|--------|------|---------|---------|--------|
| `p2e-cold-boot-test.sh` | E2E | 手动/CI | 冷启动 P2E 能力验证 | P0 |
| `isc-rule-lint.sh` | Lint | Git hook / cron | ISC 规则 JSON 格式+schema | P0 |
| `constraint-file-integrity.sh` | 完整性 | cron 4h | 关键约束文件存在性+内容 | P0 |
| `agents-md-constraint-check.sh` | 完整性 | Git hook | AGENTS.md 包含必要约束关键词 | P0 |
| `gate-dry-run.sh` | Gate | cron daily | 所有 Gate 脚本 dry-run | P1 |
| `regression-suite.sh` | 回归 | CI | 旧规则不被新变更破坏 | P1 |
| `adversarial-injection.sh` | 对抗 | weekly cron | 执行对抗性注入用例 | P2 |
| `silent-failure-detector.sh` | 监控 | cron 1h | 检测意图无响应的静默失败 | P1 |
| `memory-dependency-audit.sh` | 审计 | monthly | 扫描约束中对 memory 的不当依赖 | P2 |

### 3.2 核心检查脚本设计

#### 3.2.1 `p2e-cold-boot-test.sh`

```bash
#!/usr/bin/env bash
# P2E Cold Boot Test - 冷启动验证
# 目的：验证失忆 Agent 仍能正确执行 P2E 全链路
set -euo pipefail

WORKSPACE="/root/.openclaw/workspace"
RESULTS_DIR="$WORKSPACE/test-results/cold-boot/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$RESULTS_DIR"

PASS=0; FAIL=0; DEGRADE=0

# --- Check 1: AGENTS.md 包含防失忆关键约束 ---
check_agents_md() {
  local f="$WORKSPACE/AGENTS.md"
  local required_keywords=(
    "防失忆规则"
    "子Agent任务必须将结果写入文件"
    "启动自检"
    "CAPABILITY-ANCHOR"
  )
  for kw in "${required_keywords[@]}"; do
    if ! grep -q "$kw" "$f" 2>/dev/null; then
      echo "❌ AGENTS.md 缺少关键约束: $kw"
      return 1
    fi
  done
  echo "✅ AGENTS.md 关键约束完整"
  return 0
}

# --- Check 2: ISC 规则全部可解析 ---
check_isc_rules() {
  local rule_dir="$WORKSPACE/skills/isc-core/rules"
  local total=0; local ok=0
  for f in "$rule_dir"/rule.*.json; do
    total=$((total + 1))
    if node -e "JSON.parse(require('fs').readFileSync('$f','utf8'))" 2>/dev/null; then
      ok=$((ok + 1))
    else
      echo "❌ ISC 规则解析失败: $(basename $f)"
    fi
  done
  echo "✅ ISC 规则健康: $ok/$total 可解析"
  [ "$ok" -eq "$total" ]
}

# --- Check 3: Gate 规则有强制阻断能力 ---
check_gate_enforcement() {
  local rule_dir="$WORKSPACE/skills/isc-core/rules"
  local has_block=false
  for f in "$rule_dir"/rule.*.json; do
    if grep -q '"block' "$f" 2>/dev/null; then
      has_block=true
      break
    fi
  done
  if $has_block; then
    echo "✅ Gate 规则包含阻断能力"
    return 0
  else
    echo "❌ 无任何 Gate 规则有阻断能力"
    return 1
  fi
}

# --- Check 4: CAPABILITY-ANCHOR 存在 ---
check_capability_anchor() {
  if [ -f "$WORKSPACE/CAPABILITY-ANCHOR.md" ]; then
    echo "✅ CAPABILITY-ANCHOR.md 存在"
    return 0
  else
    echo "❌ CAPABILITY-ANCHOR.md 缺失"
    return 1
  fi
}

# --- Check 5: P2E 评测规范存在 ---
check_p2e_spec() {
  local spec_dir
  # 检查多个可能位置
  for d in "$WORKSPACE/../workspace-analyst/principle-e2e-spec" \
           "$WORKSPACE/principle-e2e-spec"; do
    if [ -d "$d" ] && [ -f "$d/01-evaluation-model.md" ]; then
      echo "✅ P2E 评测规范存在: $d"
      return 0
    fi
  done
  echo "❌ P2E 评测规范缺失"
  return 1
}

# --- Check 6: 验证 ISC 规则必须字段完整性 ---
check_isc_schema() {
  local rule_dir="$WORKSPACE/skills/isc-core/rules"
  local required_fields=("id" "severity" "description")
  local total=0; local ok=0
  for f in "$rule_dir"/rule.*.json; do
    total=$((total + 1))
    local pass=true
    for field in "${required_fields[@]}"; do
      if ! node -e "
        const r=JSON.parse(require('fs').readFileSync('$f','utf8'));
        if(!r['$field']) process.exit(1);
      " 2>/dev/null; then
        echo "⚠️  $(basename $f) 缺少字段: $field"
        pass=false
      fi
    done
    $pass && ok=$((ok + 1))
  done
  echo "✅ ISC Schema 检查: $ok/$total 合规"
  [ "$ok" -eq "$total" ]
}

# --- 执行所有检查 ---
echo "═══════════════════════════════════════"
echo "  P2E Cold Boot Test — $(date)"
echo "═══════════════════════════════════════"

for check in check_agents_md check_isc_rules check_gate_enforcement \
             check_capability_anchor check_p2e_spec check_isc_schema; do
  if $check; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
  fi
  echo "---"
done

# --- 汇总 ---
TOTAL=$((PASS + FAIL + DEGRADE))
echo ""
echo "═══════════════════════════════════════"
echo "  结果: PASS=$PASS FAIL=$FAIL TOTAL=$TOTAL"
if [ "$FAIL" -eq 0 ]; then
  echo "  结论: ✅ COLD BOOT PROOF — 失忆后约束仍然有效"
else
  echo "  结论: ❌ MEMORY-DEPENDENT — 存在 $FAIL 项失忆后会丢失的约束"
fi
echo "═══════════════════════════════════════"

# 写入结果文件
cat > "$RESULTS_DIR/result.json" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "pass": $PASS,
  "fail": $FAIL,
  "total": $TOTAL,
  "verdict": "$([ $FAIL -eq 0 ] && echo 'MEMORY_LOSS_PROOF' || echo 'MEMORY_DEPENDENT')"
}
EOF

echo "结果已写入: $RESULTS_DIR/result.json"
exit $FAIL
```

#### 3.2.2 `constraint-file-integrity.sh`

```bash
#!/usr/bin/env bash
# Constraint File Integrity Check
# 检查所有约束承载文件的存在性和关键内容
set -euo pipefail

WORKSPACE="/root/.openclaw/workspace"
ERRORS=0

# 关键文件清单（约束的持久载体）
declare -A CRITICAL_FILES=(
  ["$WORKSPACE/AGENTS.md"]="启动自检|防失忆规则|CAPABILITY-ANCHOR"
  ["$WORKSPACE/SOUL.md"]="反熵增|批判性思维"
  ["$WORKSPACE/skills/isc-core/SKILL.md"]="ISC|标准中心"
)

for filepath in "${!CRITICAL_FILES[@]}"; do
  if [ ! -f "$filepath" ]; then
    echo "❌ MISSING: $filepath"
    ERRORS=$((ERRORS + 1))
    continue
  fi
  
  IFS='|' read -ra keywords <<< "${CRITICAL_FILES[$filepath]}"
  for kw in "${keywords[@]}"; do
    if ! grep -qi "$kw" "$filepath"; then
      echo "⚠️  $filepath 缺少关键内容: $kw"
      ERRORS=$((ERRORS + 1))
    fi
  done
done

# ISC 规则最低数量
RULE_COUNT=$(ls "$WORKSPACE/skills/isc-core/rules/rule."*.json 2>/dev/null | wc -l)
if [ "$RULE_COUNT" -lt 10 ]; then
  echo "⚠️  ISC 规则数量不足: $RULE_COUNT (最低 10)"
  ERRORS=$((ERRORS + 1))
fi

# Git 状态检查（约束文件不应有未提交的删除）
cd "$WORKSPACE"
DELETED=$(git diff --name-only --diff-filter=D 2>/dev/null | grep -E '(AGENTS|SOUL|CAPABILITY|isc-core)' || true)
if [ -n "$DELETED" ]; then
  echo "🚨 约束文件被删除但未提交: $DELETED"
  ERRORS=$((ERRORS + 1))
fi

if [ "$ERRORS" -eq 0 ]; then
  echo "✅ 约束文件完整性检查通过"
else
  echo "❌ 发现 $ERRORS 个问题"
fi
exit $ERRORS
```

#### 3.2.3 `memory-dependency-audit.sh`

```bash
#!/usr/bin/env bash
# Memory Dependency Audit
# 扫描约束中是否有不当的 memory 依赖（应沉淀到 L0-L4 的约束不应只存在于 L5）
set -euo pipefail

WORKSPACE="/root/.openclaw/workspace"
ISSUES=0

echo "══════════════════════════════════════════"
echo "  Memory Dependency Audit — $(date)"
echo "══════════════════════════════════════════"

# 检查1: AGENTS.md 中引用 memory/ 的约束
echo ""
echo "--- 检查 AGENTS.md 中的 memory 依赖 ---"
# 约束性语句如果只在 memory/ 中定义，就是问题
if grep -n 'memory/' "$WORKSPACE/AGENTS.md" | grep -i '必须\|禁止\|强制\|不允许\|不得'; then
  echo "⚠️  AGENTS.md 中存在引用 memory 的强制约束 — 这些约束应有 L2-L4 层保障"
  ISSUES=$((ISSUES + 1))
fi

# 检查2: ISC 规则中是否依赖 memory 文件
echo ""
echo "--- 检查 ISC 规则中的 memory 依赖 ---"
for f in "$WORKSPACE/skills/isc-core/rules/rule."*.json; do
  if grep -q 'memory/' "$f" 2>/dev/null; then
    echo "⚠️  $(basename $f) 引用了 memory/ — ISC 规则不应依赖会话记忆"
    ISSUES=$((ISSUES + 1))
  fi
done

# 检查3: 关键约束是否仅存在于 memory 中
echo ""
echo "--- 扫描 memory 中的未沉淀约束 ---"
if [ -d "$WORKSPACE/memory" ]; then
  # 在 memory 文件中查找看起来像约束的内容
  grep -rn '必须\|禁止\|强制\|门禁\|Gate\|block' "$WORKSPACE/memory/" 2>/dev/null | \
    grep -v '已沉淀\|已写入\|已创建' | head -20
  echo "(以上为 memory 中疑似未沉淀的约束，需人工确认)"
fi

echo ""
echo "══════════════════════════════════════════"
if [ "$ISSUES" -eq 0 ]; then
  echo "  ✅ 未发现不当 memory 依赖"
else
  echo "  ⚠️  发现 $ISSUES 个潜在 memory 依赖问题"
fi
echo "══════════════════════════════════════════"
exit $ISSUES
```

---

## 4. 沉淀到 AGENTS.md / ISC / Skills / CI 的具体建议

### 4.1 AGENTS.md 增补项

在 AGENTS.md 中增加以下**失忆免疫**段落：

```markdown
## 🧊 失忆免疫约束 (Memory-Loss Proof Constraints)

以下约束**不依赖任何记忆文件**，纯粹通过持久化机制保障：

### 硬约束（任何会话、任何 Agent 都必须遵守）
1. **子 Agent 产出必须写文件** — 仅回话不写文件 = 任务失败
2. **启动时必须运行自检脚本** — 缺少关键文件时停止执行
3. **ISC 规则变更必须通过 lint** — JSON schema 不合规 = 拒绝
4. **P2E 意图执行必须经过 Gate** — 无 Gate 通过 = 不发布
5. **反熵增 Gate 不可绕过** — 设计不可扩展 = 阻断

### 自动验证
- **冷启动测试**: `scripts/p2e-cold-boot-test.sh`（验证失忆后约束仍有效）
- **文件完整性**: `scripts/constraint-file-integrity.sh`（每4h cron）
- **回归哨兵**: `scripts/regression-sentinel.sh`（每日 cron）
- **记忆依赖审计**: `scripts/memory-dependency-audit.sh`（每月）
```

### 4.2 新增 ISC 规则

```json
{
  "id": "rule.memory-loss-proof-gate-001",
  "rule_name": "失