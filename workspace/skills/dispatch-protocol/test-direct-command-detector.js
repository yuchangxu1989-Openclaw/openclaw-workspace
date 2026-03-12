'use strict';

const { detectDirectCommand, toDispatchEvent } = require('./direct-command-detector');

// 基于真实对话的测试用例
const testCases = [
  // ✅ 应该识别为指令
  { input: '派人去修复看板耗时bug', expected: true, desc: '派人+修复' },
  { input: '赶紧派人实现post-creation checklist', expected: true, desc: '紧急派人' },
  { input: '派人分析汇报下AEO代码量', expected: true, desc: '派人+分析' },
  { input: '派人确认下skill-installer有没有', expected: true, desc: '派人+确认' },
  { input: '需要派人去修复', expected: true, desc: '需要派人' },
  { input: '激活3个mcp', expected: true, desc: '动词开头' },
  { input: '删掉stash里31个文件', expected: true, desc: '动词开头-删掉' },
  { input: '派人去clawhub搜一下skill-installer', expected: true, desc: '派人+搜' },
  { input: '派人按照建议清理合并', expected: true, desc: '派人+按照' },
  { input: '立刻处理这个问题', expected: true, desc: '紧急处理' },
  { input: '马上修复这个bug', expected: true, desc: '紧急修复' },
  { input: '清理所有过期的cron job', expected: true, desc: '清理开头' },
  { input: '部署最新版本到生产环境', expected: true, desc: '部署开头' },
  { input: '合并这两个分支', expected: true, desc: '合并开头' },

  // ❌ 不应该识别为指令
  { input: '你觉得要不要升级？', expected: false, desc: '征求意见' },
  { input: 'post-creation checklist是啥？', expected: false, desc: '提问-是啥' },
  { input: '504MB未跟踪目录是用来干啥的？', expected: false, desc: '功能咨询' },
  { input: 'git stash残留是什么概念？', expected: false, desc: '概念提问' },
  { input: '有没有更好的方案？', expected: false, desc: '方案咨询' },
  { input: '如果系统拒绝怎么办？', expected: false, desc: '假设性问题' },
  { input: '为什么看板没更新？', expected: false, desc: '追问原因' },
  { input: '怎么看这个问题？', expected: false, desc: '征求看法' },
  { input: '', expected: false, desc: '空字符串' },
  { input: '嗯', expected: false, desc: '单字回复' },
];

let passed = 0;
let failed = 0;

console.log('=== 直接指令检测器测试 ===\n');

for (const tc of testCases) {
  const result = detectDirectCommand(tc.input);
  const ok = result.isCommand === tc.expected;
  
  if (ok) {
    passed++;
    console.log(`✅ [${tc.desc}] "${tc.input.slice(0, 30)}" → ${result.isCommand ? 'COMMAND' : 'not-command'}`);
  } else {
    failed++;
    console.log(`❌ [${tc.desc}] "${tc.input.slice(0, 30)}" → expected=${tc.expected} got=${result.isCommand} reason=${result.reason || result.action}`);
  }
}

// toDispatchEvent测试
console.log('\n=== 事件生成测试 ===\n');
const evt = toDispatchEvent(detectDirectCommand('赶紧派人修复这个bug'));
console.log('urgent dispatch event:', JSON.stringify(evt, null, 2));
const noEvt = toDispatchEvent(detectDirectCommand('你觉得要不要？'));
console.log('non-command event:', noEvt);

console.log(`\n总计: ${passed} passed, ${failed} failed / ${testCases.length} total`);
process.exit(failed > 0 ? 1 : 0);
