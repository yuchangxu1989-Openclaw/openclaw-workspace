# Anti-Entropy Checker（反熵增自动检查器）

## 目标
将“反熵增原则”从记忆/信条转为可执行技能与自动检查器，面向设计文档、ISC规则、技能定义（SKILL.md）进行四维质量门控。

## 输入
- 设计文档（Markdown / 文本）
- ISC 规则（JSON）
- 技能文档（SKILL.md）

调用参数（建议）：
- `text`：待检查文本内容（优先）
- `path`：待检查文件路径（二选一）
- `type`：`design | rule | skill | auto`
- `strict`：是否严格模式（默认 `true`）

## 四维检查
1. **可扩展性（10x）**
   - 核心问题：10倍规模下是否仍成立？
   - 重点检测：硬编码阈值/路径、枚举式分支、单点瓶颈、线性不可控增长。

2. **可泛化性（一类问题）**
   - 核心问题：是解“一个点”，还是“一类问题”？
   - 重点检测：过度场景绑定、一次性补丁、缺少抽象接口与复用边界。

3. **可生长性（代码化）**
   - 核心问题：知识是否沉淀为规则/代码/自动化？
   - 重点检测：仅口头策略、无落地步骤、无可执行产物、不可验证。

4. **熵方向（更有序）**
   - 核心问题：变更后系统更有序还是更混乱？
   - 重点检测：重复代码、命名不一致、职责耦合、目录混乱、规则冲突。

## 输出
- `score`：0-100 反熵增评分
- `pass`：是否通过门控
- `dimensionScores`：四维分项分
- `violations`：违规点（含严重度、证据、建议）
- `summary`：简要结论

## 事件绑定（ISC Handler）
建议绑定事件：
- `design.document.created`
- `design.document.modified`
- `architecture.decision.made`
- `isc.rule.created`
- `skill.created`
- `dto.task.created`

可由事件总线直接调用 `skills/anti-entropy-checker/index.js` 导出的 `handler(event)`。

## 使用示例
```bash
node skills/anti-entropy-checker/index.js --path designs/xxx.md --type design
node skills/anti-entropy-checker/index.js --path skills/isc-core/rules/rule.xxx.json --type rule
node skills/anti-entropy-checker/index.js --path skills/foo/SKILL.md --type skill
```
