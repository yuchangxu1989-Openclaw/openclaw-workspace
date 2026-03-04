/**
 * 凌霄阁-7人裁决神殿 ⚡🏛️
 * 
 * 通用深度决策机制 - 7个独立视角三轮对抗
 * 可独立使用，不绑定特定流水线
 */

const SEATS = [
  { id: 'dao',    title: '道席', emoji: '🏛️', role: '第一性原理守护者', dimension: '本质与边界', question: '这个方案的第一性原理是什么？有没有在根基上就错了？' },
  { id: 'zhan',   title: '战席', emoji: '⚔️', role: '战略决策者',       dimension: '方向与取舍', question: '该不该做？优先级对吗？资源投入值得吗？' },
  { id: 'gong',   title: '工席', emoji: '🔧', role: '工程实现者',       dimension: '可落地性',   question: '能实现吗？成本多大？技术债多少？' },
  { id: 'dun',    title: '盾席', emoji: '🛡️', role: '质量与安全守护者', dimension: '风险与韧性', question: '最坏情况是什么？怎么回滚？安全边界在哪？' },
  { id: 'yan',    title: '眼席', emoji: '👁️', role: '用户与市场洞察者', dimension: '用户价值与体验', question: '用户真的需要吗？体验如何？市场怎么看？' },
  { id: 'yuan',   title: '远席', emoji: '🔮', role: '未来与进化预判者', dimension: '可扩展性与成长', question: '3年后还适用吗？技术趋势如何？进化空间在哪？' },
  { id: 'heng',   title: '衡席', emoji: '⚖️', role: '综合仲裁者',       dimension: '平衡与整合', question: '各方分歧的根因是什么？最优平衡点在哪？' },
];

// 降级模式
const DEGRADED_5 = ['dao', 'zhan', 'gong_dun', 'yan_yuan', 'heng']; // 合并工+盾、眼+远
const DEGRADED_3 = ['dao', 'zhan', 'heng']; // 极限精简

/**
 * Round 1 Prompt - 独立审议
 */
function round1Prompt(topic, context, seat) {
  return `【凌霄阁-7人裁决神殿 · Round 1 · 独立审议】

你是${seat.emoji} ${seat.title}（${seat.role}）。
你的审视维度：${seat.dimension}
你的核心问题：${seat.question}

前提：你的一切分析必须以"断层式领先的全球最顶级AI"为目标。

## 议题
${topic}

## 背景材料
${context || '无额外背景'}

## 输出格式（严格遵守，限800 token）

【立场】支持 / 反对 / 有条件支持
【核心论点】（最多3条，每条一句话）
1. 
2. 
3. 
【关键风险】（从${seat.dimension}维度看到的最大风险）

【信心度】X/10
【一句话结论】`;
}

/**
 * Round 2 Prompt - 交叉Battle
 */
function round2Prompt(topic, round1AllResults, seat) {
  const othersViews = round1AllResults
    .filter(r => r.seat.id !== seat.id)
    .map(r => `${r.seat.emoji} ${r.seat.title}：${r.result}`)
    .join('\n\n---\n\n');

  return `【凌霄阁-7人裁决神殿 · Round 2 · 交叉Battle】

你是${seat.emoji} ${seat.title}（${seat.role}）。

## 议题
${topic}

## 其他神官的观点
${othersViews}

## 你的Round 1立场
（回顾你的原始观点）

## 输出格式（严格遵守，限600 token）

【挑战】（指出其他神官论点的最大漏洞，至少2个）
1. 对X席：
2. 对Y席：
【回应】（回应对你的质疑）

【立场修正】修正 / 坚持，理由：
【信心度变化】从X到Y，原因：`;
}

/**
 * Round 3 Prompt - 综合裁决（衡席主笔，道席审核）
 */
function round3Prompt(topic, round1AllResults, round2AllResults) {
  const r1Summary = round1AllResults.map(r => `${r.seat.emoji} ${r.seat.title}：${r.result}`).join('\n\n');
  const r2Summary = round2AllResults.map(r => `${r.seat.emoji} ${r.seat.title}：${r.result}`).join('\n\n');

  return `【凌霄阁-7人裁决神殿 · Round 3 · 终审裁决】

你是⚖️ 衡席（综合仲裁者）+ 🏛️ 道席（第一性原理审核）。

## 议题
${topic}

## Round 1 各方独立观点
${r1Summary}

## Round 2 交叉Battle结果
${r2Summary}

## 输出格式（限1500 token）

【核心分歧】各方最根本的分歧是什么
【事实判断】哪些争议可以用事实解决
【价值判断】哪些争议是价值取向不同
【裁决】最终建议（含条件和边界）
【风险缓解】针对反对方最强论点的应对措施
【执行建议】下一步怎么做
【第一性原理检验】（道席审核）裁决是否偏离了根基？`;
}

module.exports = { SEATS, DEGRADED_5, DEGRADED_3, round1Prompt, round2Prompt, round3Prompt };
