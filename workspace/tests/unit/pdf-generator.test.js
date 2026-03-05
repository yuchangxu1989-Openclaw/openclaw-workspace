const { checkStructure, checkVisualStandards, generateNarrativeReviewPrompt, parseMarkdownStructure } = require('../../skills/pdf-generator/generate.js');

// ============================================================
// 结构检查测试
// ============================================================

describe('checkStructure', () => {
  test('正常文档通过所有检查', () => {
    const md = `# 文档标题

> TL;DR: 这是摘要

## 第1章：概述
### 1.1 背景

## 第2章：设计

## 第3章：实现

## 附录
### 附录 A：代码

\`\`\`javascript
const a = 1;
const b = 2;
const c = 3;
const d = 4;
const e = 5;
const f = 6;
const g = 7;
\`\`\`
`;
    const result = checkStructure(md);
    expect(result.passed).toBe(true);
  });

  test('S1: 一级目录超过5章报错', () => {
    const md = `# 标题
## 第1章
## 第2章
## 第3章
## 第4章
## 第5章
## 第6章
`;
    // h1只有1个(#标题)，h2有6个但S1检查h1
    // 实际S1检查level===1的heading
    const md2 = `# 章一
# 章二
# 章三
# 章四
# 章五
# 章六
`;
    const result = checkStructure(md2);
    expect(result.passed).toBe(false);
    expect(result.violations.some(v => v.id === 'S1')).toBe(true);
  });

  test('S3: 正文中>5行代码块报错', () => {
    const md = `# 标题

## 第1章

\`\`\`javascript
line1
line2
line3
line4
line5
line6
\`\`\`

## 附录
`;
    const result = checkStructure(md);
    expect(result.passed).toBe(false);
    expect(result.violations.some(v => v.id === 'S3')).toBe(true);
  });

  test('S3: 附录中的长代码块不报错', () => {
    const md = `# 标题

## 第1章
简短正文

## 附录

\`\`\`javascript
line1
line2
line3
line4
line5
line6
\`\`\`
`;
    const result = checkStructure(md);
    const s3 = result.violations.filter(v => v.id === 'S3');
    expect(s3.length).toBe(0);
  });

  test('S4: TL;DR超过150字报错', () => {
    const long = '这是一段很长的TL;DR摘要文本。'.repeat(20);
    const md = `# 标题

> TL;DR: ${long}

## 第1章
`;
    const result = checkStructure(md);
    expect(result.violations.some(v => v.id === 'S4')).toBe(true);
  });

  test('S5: PM内容报错', () => {
    const md = `# 标题
## 第1章
预计工时估算3人天
`;
    const result = checkStructure(md);
    expect(result.violations.some(v => v.id === 'S5')).toBe(true);
  });

  test('DEPTH: 超过3级标题报错', () => {
    const md = `# 标题
## 第1章
### 1.1 节
#### 1.1.1 太深了
`;
    const result = checkStructure(md);
    expect(result.violations.some(v => v.id === 'DEPTH')).toBe(true);
  });

  test('FIG: 图片无编号产生warning', () => {
    const md = `# 标题
## 第1章
![无编号图](test.png)
`;
    const result = checkStructure(md);
    expect(result.violations.some(v => v.id === 'FIG')).toBe(true);
  });

  test('FIG: 图片有编号不产生warning', () => {
    const md = `# 标题
## 第1章
![图 1：系统架构](test.png)
`;
    const result = checkStructure(md);
    expect(result.violations.some(v => v.id === 'FIG')).toBe(false);
  });

  test('S7: 悬空引用报错', () => {
    const md = `# 标题
## 第1章
详情见附录 B-01

## 附录
### 附录 A：代码
`;
    const result = checkStructure(md);
    expect(result.violations.some(v => v.id === 'S7')).toBe(true);
  });
});

// ============================================================
// 视觉标准检查
// ============================================================

describe('checkVisualStandards', () => {
  test('纯英文mermaid标注产生警告', () => {
    const md = "```mermaid\ngraph TD\nA[Start] --> B[End]\n```";
    const warnings = checkVisualStandards(md);
    expect(warnings.some(w => w.id === 'VS02')).toBe(true);
  });

  test('含emoji的mermaid产生警告', () => {
    const md = "```mermaid\ngraph TD\nA[🚀启动] --> B[完成]\n```";
    const warnings = checkVisualStandards(md);
    expect(warnings.some(w => w.id === 'VS09')).toBe(true);
  });
});

// ============================================================
// 演讲审查prompt生成
// ============================================================

describe('generateNarrativeReviewPrompt', () => {
  test('生成MD层审查prompt', () => {
    const md = `# 标题
## 第1章：概述
## 第2章：设计
`;
    const prompt = generateNarrativeReviewPrompt(md, false);
    expect(prompt).toContain('模拟演讲审查 (MD层)');
    expect(prompt).toContain('承上启下过渡');
    expect(prompt).toContain('孤立技术术语');
    expect(prompt).toContain('叙事连贯性');
    expect(prompt).toContain('P0');
  });

  test('生成PDF层审查prompt', () => {
    const md = `# 标题\n## 第1章\n`;
    const prompt = generateNarrativeReviewPrompt(md, true);
    expect(prompt).toContain('PDF层');
  });

  test('包含所有章节', () => {
    const md = `# 标题\n## A章\n## B章\n## C章\n`;
    const prompt = generateNarrativeReviewPrompt(md, false);
    expect(prompt).toContain('A章');
    expect(prompt).toContain('B章');
    expect(prompt).toContain('C章');
  });
});
