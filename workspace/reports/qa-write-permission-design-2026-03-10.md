# 质量核查报告：主Agent写权限控制方案

> 核查日期：2026-03-10
> 核查人：reviewer (质量仲裁官)
> 被核查文档：`reports/main-agent-write-permission-design-2026-03-10.md`
> 总体结论：**有条件通过** ⚠️

---

## 核查点 1：完整性 — 是否覆盖了所有写入通道？

**结论：有条件通过** ⚠️

### 已正确识别的写入通道（8个）

| 工具 | 方案中是否提及 | deny配置中是否包含 |
|------|---------------|-------------------|
| `write` | ✅ | ✅ |
| `edit` | ✅ | ✅ |
| `apply_patch` | ✅ | ✅ |
| `feishu_bitable_create_record` | ✅ | ✅ |
| `feishu_bitable_update_record` | ✅ | ✅ |
| `feishu_bitable_create_field` | ✅ | ✅ |
| `feishu_bitable_create_app` | ✅ | ✅ |
| `browser` | ✅ | ✅ |
| `canvas` | ✅ | ✅ |
| `exec`（写命令） | ✅ 已识别 | ❌ 未deny（有意为之，认知兜底） |
| `feishu_doc`（写action） | ✅ 已识别 | ❌ 未deny（有意为之，认知兜底） |
| `feishu_wiki`（写action） | ✅ 已识别 | ❌ 未deny（有意为之，认知兜底） |
| `feishu_drive`（写action） | ✅ 已识别 | ❌ 未deny（有意为之，认知兜底） |

### 发现的问题

1. **[minor] `process` 工具遗漏**：方案中方案A提到了deny `process`，但最终推荐的方案C增强版没有deny `process`。`process` 工具的 `write`/`send-keys`/`paste` action 可以向正在运行的exec会话写入数据，理论上可以通过 `exec` 启动一个交互式进程后用 `process` 写入来绕过限制。不过这个攻击路径比较迂回，且依赖exec先启动进程，风险等级较低。建议在方案中明确说明为何不deny `process`。

2. **[minor] `nodes` 工具的 `run` action**：`nodes` 工具支持 `run` action，可以在配对节点上执行命令。如果有配对节点，理论上可以通过 `nodes run` 在远程节点上执行写操作。方案中未提及此通道。当前系统中是否有配对节点需要确认。

3. **[suggestion] `message` 工具的间接写入**：`message` 工具可以发送消息到飞书群/频道，虽然不是直接写文件，但可以通过消息触发其他自动化流程。这属于间接影响，风险极低，仅作记录。

4. **[已正确处理] `tts` 工具**：tts只生成语音回复，不涉及文件写入，方案正确地保留了它。

### 评价

方案对写入通道的梳理相当全面，漏洞清单表格清晰，P0/P1/P2分级合理。对于无法通过tools.deny精确控制的工具（exec、feishu_doc等），方案诚实地标注了限制并给出了认知兜底方案，这种透明度值得肯定。

---

## 核查点 2：可行性 — tools.deny配置是否真的能生效？

**结论：通过** ✅

### 源码验证

通过阅读 OpenClaw 编译后源码（`/usr/lib/node_modules/openclaw/dist/`），确认了以下关键逻辑：

1. **`makeToolPolicyMatcher` 函数**（`pi-tools.policy-SQ828IQ3.js:232-249`）：
   ```javascript
   // deny优先级高于allow
   if (matchesAnyGlobPattern(normalized, deny)) return false;
   if (allow.length === 0) return true;
   if (matchesAnyGlobPattern(normalized, allow)) return true;
   ```
   deny列表中的工具会被直接拒绝，deny优先级高于allow。

2. **`filterToolsByPolicy` 函数**（`pi-tools.policy-SQ828IQ3.js:302`）：在构建工具列表时调用matcher过滤，被deny的工具不会出现在LLM可用工具列表中。

3. **`normalizeToolName` 函数**（`sandbox-D2wbSKUX.js`）：工具名会被normalize（trim + lowercase），并支持别名映射（`bash` → `exec`，`apply-patch` → `apply_patch`）。

4. **`expandToolGroups` 函数**：支持工具组展开，deny列表中可以使用组名。

5. **agent级别的tools配置**（`model-selection-ikt2OC4j.js:3285-3287`）：
   ```javascript
   if (tools.deny === void 0 && agentTools.deny !== void 0) {
       tools.deny = agentTools.deny;
   }
   ```
   agent的tools.deny会被正确传递到工具策略中。

### 结论

tools.deny机制是**硬限制**，被deny的工具不会出现在LLM的可用工具列表中，LLM无法调用不存在的工具。这比认知规则可靠得多。方案中"必须通过openclaw.json的tools配置做硬限制"的判断完全正确。

### 额外发现

- **`tools.allow` 白名单模式确实可用**：源码确认agent级别支持 `tools.allow`，方案D的白名单方案技术上可行。
- **支持glob模式**：deny/allow列表支持glob匹配（通过 `compileGlobPatterns`），可以用 `feishu_bitable_*` 这样的模式。方案中没有利用这一点，建议考虑用 `feishu_bitable_create*` 或 `feishu_bitable_update*` 简化配置。

---

## 核查点 3：安全性 — exec写入漏洞的兜底方案是否可靠？

**结论：有条件通过** ⚠️

### 分析

方案正确识别了exec是最大的安全漏洞，并诚实地承认：

> "OpenClaw的tools.deny机制只能deny整个工具，不能deny工具的某些参数/用法。因此exec不能简单deny。"

这个判断经源码验证是**正确的**。tools.deny按工具名匹配，无法区分exec的只读和写入用法。

### 兜底方案评估

| 方案 | 可靠性 | 方案中的评估 | 核查意见 |
|------|--------|-------------|---------|
| 方案A：deny exec | 高 | 太影响效率 | 同意，主Agent需要ls/cat/grep |
| 方案B：sandbox | 高 | 需要Docker | 技术上最优，但增加运维复杂度 |
| 方案C：认知规则兜底 | 中低 | 推荐 | 见下方分析 |
| 方案D：allow白名单 | 中 | 备选 | 不解决exec问题 |

### 认知规则兜底的风险

方案选择了方案C（认知规则兜底），这是一个**务实但有风险**的选择：

1. **[major] 认知规则不可靠**：方案自己在"为什么认知规则不够"一节中论证了认知规则的不可靠性（LLM不稳定遵守、上下文长了容易遗忘、子Agent不继承），然后又在exec问题上依赖认知规则，存在逻辑矛盾。

2. **[major] 缺少监控/审计机制**：方案在"未来演进"中提到了"审计机制"，但没有给出具体实施方案。建议至少提供一个简单的审计脚本或cron任务，定期检查主Agent的exec历史中是否有写操作。

3. **[suggestion] exec的`security`参数**：当前系统prompt中exec工具有 `security` 参数（`deny|allowlist|full`），方案中的sandbox方案B提到了 `exec-approvals.json` 的allowlist模式。建议在方案中明确说明：即使不启用sandbox，是否可以通过全局或per-agent的exec security配置来限制exec？这需要进一步验证。

### 评价

方案对exec漏洞的分析深入且诚实，没有回避问题。推荐方案C是一个合理的短期折中，但应该更强调这是**临时方案**，并给出明确的升级时间表。

---

## 核查点 4：副作用 — deny写工具后读取是否正常？

**结论：通过** ✅

### 飞书Bitable读写分离验证

通过对照系统prompt中的工具列表，确认飞书Bitable的读和写是**不同的工具名**：

| 操作 | 工具名 | 是否被deny |
|------|--------|-----------|
| 读取元数据 | `feishu_bitable_get_meta` | ❌ 不受影响 |
| 列出字段 | `feishu_bitable_list_fields` | ❌ 不受影响 |
| 列出记录 | `feishu_bitable_list_records` | ❌ 不受影响 |
| 获取单条记录 | `feishu_bitable_get_record` | ❌ 不受影响 |
| 创建记录 | `feishu_bitable_create_record` | ✅ 被deny |
| 更新记录 | `feishu_bitable_update_record` | ✅ 被deny |
| 创建字段 | `feishu_bitable_create_field` | ✅ 被deny |
| 创建应用 | `feishu_bitable_create_app` | ✅ 被deny |

**结论：Bitable读写完全分离，deny写工具不影响读取。方案的分析完全正确。**

### 飞书Doc/Wiki/Drive读写不可分离

方案正确指出 `feishu_doc`、`feishu_wiki`、`feishu_drive` 这三个工具的读写操作混在同一个工具名下：

- `feishu_doc`：read/list_blocks/get_block（读） vs write/append/insert/create/update_block/delete_block（写）
- `feishu_wiki`：spaces/nodes/get/search（读） vs create/move/rename（写）
- `feishu_drive`：list/info（读） vs create_folder/move/delete（写）

deny这三个工具会同时阻断读和写。方案选择保留这三个工具并用认知规则兜底，理由充分（主Agent频繁需要读飞书文档）。

### 评价

方案对副作用的分析准确，验证矩阵（3.4节）清晰列出了每个功能是否受影响，便于实施后验证。

---

## 核查点 5：实操验证 — config set命令语法是否正确？

**结论：有条件通过** ⚠️

### 命令语法验证

方案给出的命令：
```bash
openclaw config set 'agents.list[0].tools.deny' '["write","edit","apply_patch","feishu_bitable_create_record","feishu_bitable_update_record","feishu_bitable_create_field","feishu_bitable_create_app","browser","canvas"]'
```

通过 `openclaw config set --help` 确认：
- 语法格式：`openclaw config set <path> <value>`
- path支持dot和bracket notation ✅
- value支持JSON5格式 ✅

### 发现的问题

1. **[major] `agents.list[0]` 硬编码索引风险**：命令假设main agent是 `agents.list[0]`。经验证当前配置中main确实是第一个agent（index 0），但如果未来agents顺序变化，这个命令会改错agent。建议改用更安全的方式，或在命令前加验证步骤：
   ```bash
   # 先验证index 0确实是main
   openclaw config get 'agents.list[0].id'
   ```

2. **[minor] 未验证命令是否真的能写入数组**：`openclaw config set` 的value参数接受JSON5，但未实际测试写入JSON数组是否正常工作。建议在方案中加入dry-run验证步骤。

3. **[suggestion] 缺少 `openclaw config validate` 步骤**：修改配置后应运行 `openclaw config validate` 确认配置合法，方案中Step 2直接跳到了 `gateway restart`。

---

## 核查点 6：回滚方案

**结论：不通过** ❌

### 发现的问题

1. **[blocker] 方案中没有回滚步骤**：整个文档没有提供任何回滚方案。如果配置改错导致主Agent无法正常工作（例如误deny了关键工具），没有文档化的恢复步骤。

2. **[blocker] 没有备份步骤**：Step 1直接修改openclaw.json，没有要求先备份当前配置。

### 建议补充

方案应在Step 1之前增加：

```bash
# Step 0：备份当前配置
cp ~/.openclaw/openclaw.json ~/.openclaw/openclaw.json.bak.$(date +%Y%m%d%H%M%S)

# 回滚命令（如果出问题）：
openclaw config set 'agents.list[0].tools.deny' '["write","edit"]'
openclaw gateway restart
```

---

## 总体评价

### 优点

1. **问题分析深入**：对写入通道的梳理非常全面，P0/P1/P2分级合理
2. **方案对比充分**：列出了A/B/C/D四个方案并做了优劣对比，决策过程透明
3. **诚实标注限制**：没有回避exec漏洞和feishu_doc读写不可分离的问题，"已知限制与风险"一节很有价值
4. **验证矩阵实用**：3.4节的功能影响矩阵便于实施后验证
5. **未来演进清晰**：给出了明确的功能请求方向

### 问题汇总

| 级别 | 问题 | 核查点 |
|------|------|--------|
| blocker | 缺少回滚方案和备份步骤 | #6 |
| major | 认知规则兜底与前文论证矛盾（exec漏洞） | #3 |
| major | 缺少exec写操作的监控/审计具体方案 | #3 |
| major | config set命令硬编码agents.list[0]有风险 | #5 |
| minor | `process` 工具写入通道未评估 | #1 |
| minor | `nodes run` 远程执行通道未评估 | #1 |
| minor | 未加入config validate验证步骤 | #5 |
| suggestion | 可利用glob模式简化deny列表（如 `feishu_bitable_create*`） | #2 |
| suggestion | 应明确认知规则兜底是临时方案并给出升级时间表 | #3 |

### 最终判定

**有条件通过** ⚠️

方案整体设计合理，技术分析准确，但存在1个blocker（缺少回滚方案）和3个major问题需要修复后才能实施。建议：

1. **必须修复**：补充回滚方案和备份步骤（blocker）
2. **建议修复**：补充exec审计方案、修复config set硬编码风险、正视认知规则兜底的矛盾
3. **可选优化**：评估process/nodes工具、利用glob简化配置

修复blocker后可进入实施阶段。
