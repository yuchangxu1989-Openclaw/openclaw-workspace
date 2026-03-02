/**
 * 凌烟阁 Lingyan Tribunal 🏛️
 * 
 * 编排参考逻辑 - 实际执行由主Agent通过sessions_spawn编排
 * 
 * 三轮制：
 * Round 1: 7个Agent并行独立审议
 * Round 2: 交叉质疑（每个Agent看到其他人观点后修正）
 * Round 3: 战略家终审裁决
 */

const SEATS = [
  { id: 'researcher', title: '谋席', role: '技术可行性审视', dimension: '架构影响、技术风险、长期可维护性' },
  { id: 'coder', title: '工席', role: '实现成本审视', dimension: '工时预估、技术债务、实现难度' },
  { id: 'reviewer', title: '审席', role: '质量风险审视', dimension: '边界条件、回归风险、稳定性' },
  { id: 'writer', title: '文席', role: '用户视角审视', dimension: '用户体验、表达清晰度、可理解性' },
  { id: 'analyst', title: '析席', role: '数据论证审视', dimension: '数据支撑、ROI分析、竞品对比' },
  { id: 'scout', title: '探席', role: '外部情报审视', dimension: '行业趋势、竞品动态、技术前沿' },
];

/**
 * Round 1 prompt 模板
 */
function round1Prompt(topic, context, seat) {
  return `【凌烟阁 Round 1 - 独立审议】

你是凌烟阁${seat.title}（${seat.role}），你的审视维度是：${seat.dimension}

## 议题
${topic}

## 背景
${context || '无额外背景'}

## 你的任务
从你的专业维度独立分析此议题，输出以下内容：

### 立场
（支持 / 反对 / 有条件支持）

### 核心论点（最多3条）
1. ...
2. ...
3. ...

### 风险提示
- ...

### 信心度
（1-10，10为完全确信）

### 一句话总结
（你的核心观点，20字以内）

---
注意：这是独立审议，你看不到其他席位的观点。请基于你的专业维度给出真实判断，不要中庸骑墙。`;
}

/**
 * Round 2 prompt 模板
 */
function round2Prompt(topic, seat, allRound1Results) {
  const othersViews = allRound1Results
    .filter(r => r.seat.id !== seat.id)
    .map(r => `【${r.seat.title}】${r.summary}`)
    .join('\n');

  return `【凌烟阁 Round 2 - 对抗质疑】

你是凌烟阁${seat.title}（${seat.role}）。

## 议题
${topic}

## 你在 Round 1 的观点
${allRound1Results.find(r => r.seat.id === seat.id)?.content || ''}

## 其他席位的观点
${othersViews}

## 你的任务
1. 指出其他席位论点中的漏洞或盲区（至少1条）
2. 回应可能对你观点的质疑
3. 修正或坚持你的立场
4. 更新信心度

### 质疑（针对其他席位）
- 对【X席】：...

### 回应质疑
- ...

### 修正后立场
（支持 / 反对 / 有条件支持）

### 更新信心度
（1-10）`;
}

/**
 * Round 3 prompt 模板（给战略家/首席）
 */
function round3Prompt(topic, context, allRound1Results, allRound2Results) {
  return `【凌烟阁 Round 3 - 终审裁决】

你是凌烟阁首席（战略家），现在做最终裁决。

## 议题
${topic}

## 背景
${context || '无额外背景'}

## Round 1 各席位独立审议
${allRound1Results.map(r => `### ${r.seat.title}\n${r.content}`).join('\n\n')}

## Round 2 对抗质疑
${allRound2Results.map(r => `### ${r.seat.title}\n${r.content}`).join('\n\n')}

## 你的任务：终审裁决

### 核心分歧点
列出各方最关键的分歧

### 事实判断
对分歧点逐一给出你的事实判断

### 最终决策
（通过 / 否决 / 有条件通过 / 搁置）

### 决策理由
（综合各方观点的核心推理链）

### 风险缓解
（针对反对方提出的风险，给出具体缓解措施）

### 执行建议
（如果通过，下一步具体怎么做）

### 决策信心度
（1-10）`;
}

module.exports = { SEATS, round1Prompt, round2Prompt, round3Prompt };
