#!/usr/bin/env node
/**
 * 感知层探针：检测用户在对话中反复强调同一概念
 * 输入：对话历史文本（stdin或文件参数）
 * 输出：检测到的重复强调概念及出现次数
 */
const fs = require('fs');
const EMPHASIS_SIGNALS = ['重要','必须','都说了','强调','说过','提过','反复','怎么还','多少次了','我说的','铁律','红线','绝对','永久生效','最高优先级','宪法','不可违反'];

let input = '';
if (process.argv[2]) input = fs.readFileSync(process.argv[2], 'utf8');
else { try { input = fs.readFileSync('/dev/stdin', 'utf8'); } catch(e) { process.exit(0); } }

const lines = input.split('\n').filter(l => l.trim());
const concepts = {};
const pat = /[《「]([^》」]+)[》」]|"([^"]+)"|"([^"]+)"/g;
for (const line of lines) {
  let m;
  while ((m = pat.exec(line)) !== null) {
    const c = m[1]||m[2]||m[3];
    if (c && c.length > 1 && c.length < 30) concepts[c] = (concepts[c]||0)+1;
  }
}
const hasEmphasis = lines.some(l => EMPHASIS_SIGNALS.some(s => l.includes(s)));
const repeated = Object.entries(concepts).filter(([_,c])=>c>=2).sort((a,b)=>b[1]-a[1]);

if (repeated.length > 0 && hasEmphasis) {
  console.log('🚨 检测到用户反复强调的概念：');
  for (const [concept, count] of repeated) {
    console.log('  - "' + concept + '" 出现 ' + count + ' 次');
    console.log(count >= 3 ? '    → 建议：直接写入代码hook层（level_3）' : '    → 建议：写入AGENTS.md启动清单（level_2）');
  }
  process.exit(1);
} else {
  console.log('✅ 未检测到重复强调');
  process.exit(0);
}
