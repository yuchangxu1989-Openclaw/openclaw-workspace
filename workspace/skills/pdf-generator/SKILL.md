# PDF Generator 技能 v2.0

高质量PDF文档生成器，完整对齐ISC规则标准。

## 对齐规则

| 规则ID | 名称 | 对齐方式 |
|--------|------|----------|
| rule.design-document-structure-001 | 结构标准7项 | generate.js `checkStructure()` 自动检查 |
| rule.design-document-narrative-review-001 | 模拟演讲门禁 | generate.js 输出审查prompt，由调用方LLM执行 |
| rule.architecture-diagram-visual-output-001 | 视觉标准10项 | `checkVisualStandards()` + mermaid白底渲染 |
| rule.design-document-delivery-pipeline-001 | 9步交付流水线 | `runPipeline()` + `--step N` 分步执行 |

## 使用方法

```bash
# 完整9步流水线
node generate.js input.md output.pdf --with-diagrams

# 执行到第N步暂停
node generate.js input.md output.pdf --step 6

# 仅结构检查
node generate.js input.md output.pdf --check-only

# 仅输出模拟演讲prompt
node generate.js input.md output.pdf --narrative-prompt
```

## 9步交付流水线（不许跳步）

| 步骤 | 名称 | 负责方 | 验收标准 |
|------|------|--------|----------|
| 1 | 结构审查 | generate.js自动 | 7项结构检查全部通过（S1-S7 + 层级≤3 + 图表编号） |
| 2 | 内容瘦身 | generate.js自动 | 无>5行代码块在正文，无PM内容 |
| 3 | MECE校验 | Agent/LLM | 同层级命名无重叠 |
| 4 | 质量扫描 | isc-document-quality技能 | 评分≥8.0 |
| 5 | 架构图标准化 | generate.js自动 | 10项视觉标准无error |
| 6 | MD模拟演讲 | Agent/LLM（使用生成的prompt） | P0问题数=0 |
| 7 | PDF生成 | generate.js自动 | Pandoc+XeLaTeX成功 |
| 8 | PDF模拟演讲 | Agent/LLM（使用生成的prompt） | P0问题数=0 |
| 9 | 交付 | Agent | PDF+MD源文件双份发送 |

**规则：任何一步不过必须打回，不允许跳步。**

## 结构检查项（自动执行）

| ID | 检查项 | 严重度 |
|----|--------|--------|
| S1 | 一级目录不超过5章（不含附录） | error |
| S2 | 文档有叙事脉络（至少有h1标题） | error |
| S3 | >5行代码块必须在附录区域 | error |
| S4 | TL;DR不超过150字 | error |
| S5 | 禁止PM内容（Day/Sprint/工时） | error |
| S6 | 章节编号连续 | error |
| S7 | 交叉引用有效（无悬空引用） | error |
| DEPTH | 标题层级≤3级 | error |
| FIG | 图片有编号标题 | warning |

## 模拟演讲审查

generate.js在Step 6和Step 8自动生成审查prompt，包含：
- 每章节的承上启下过渡检查
- 孤立技术术语检测
- 叙事连贯性评估
- 评审者追问预测
- 卡壳风险标注
- P0/P1问题分级

**调用方需要将prompt发给LLM执行审查，不在技能内直接调LLM。**

## 架构图视觉标准（10项）

| ID | 标准 | 检查方式 |
|----|------|----------|
| VS01 | 浅色背景（白色/浅灰） | mermaid渲染强制白底 |
| VS02 | 中文标注 | 自动检测纯英文标注 |
| VS03 | 颜色柔和 | 人工审查 |
| VS04 | 文字不交叠 | 人工审查 |
| VS05 | 命名MECE | Agent/LLM |
| VS06 | 标题间距合理 | 人工审查 |
| VS07 | 风格统一 | 人工审查 |
| VS08 | 三层框间距 | 人工审查 |
| VS09 | emoji去除/替换 | 自动检测 |
| VS10 | 底部注释可读 | 人工审查 |

## 输入规范

```markdown
# 文档标题

> TL;DR: 不超过150字的摘要

## 第一章：xxx
### 1.1 xxx

## 第二章：xxx

## 附录
### 附录 A：代码清单
```

**规则：**
1. 正文只讲设计思想（为什么+是什么）
2. 代码全部放附录，正文用 `→ 见附录 C-XX` 引用
3. 图表用mermaid代码块，自动渲染为白底PNG
4. 图表必须有编号和标题：`图 1.1：xxx` 格式
5. 章节不超过3级（章→节→小节）

## 编程接口

```javascript
const { checkStructure, generateNarrativeReviewPrompt, runPipeline } = require('./generate.js');

// 结构检查
const result = checkStructure(markdown);
// => { passed: boolean, violations: [...] }

// 演讲审查prompt
const prompt = generateNarrativeReviewPrompt(markdown, false);

// 完整流水线
const results = runPipeline('input.md', 'output.pdf', { step: 6, withDiagrams: true });
```
