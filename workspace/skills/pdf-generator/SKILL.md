# PDF Generator 技能

高质量PDF文档生成器。Markdown → 排版精良的PDF，对标 `designs/isc-event-dto-binding-design-v5-final.pdf` 标准。

## 使用方法

```bash
# 基本用法
node /root/.openclaw/workspace/skills/pdf-generator/generate.js input.md output.pdf

# 带架构图（mermaid代码块自动渲染）
node /root/.openclaw/workspace/skills/pdf-generator/generate.js input.md output.pdf --with-diagrams
```

## 输入规范

Markdown文件必须遵循以下结构：

```markdown
# 文档标题

## 第一章：xxx
### 1.1 xxx
### 1.2 xxx

## 第二章：xxx

## 附录
### 附录 A：xxx
### 代码清单
#### C-01：xxx
```

### 规则
1. **正文**只讲设计思想（为什么+是什么）
2. **代码**全部放附录，正文用 `→ 见附录 C-XX` 引用
3. **图表**用 mermaid 代码块，自动渲染为PNG嵌入
4. 图表必须有编号和标题：`图 1.1：xxx` 格式
5. 章节不超过3级（章→节→小节）

## 输出质量标准

- 自动生成目录（含页码）
- 中文排版：Noto Serif CJK SC
- 代码块：等宽字体、浅灰背景
- 页边距适中、段间距合理
- 页眉含文档标题，页脚含页码
- Mermaid图自动渲染为高清PNG
