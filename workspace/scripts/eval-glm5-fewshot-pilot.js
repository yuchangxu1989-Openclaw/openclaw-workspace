const fs = require('fs');
const https = require('https');
const path = require('path');

// 读取智谱API key
const envContent = fs.readFileSync('/root/.openclaw/.secrets/zhipu-keys.env','utf8');
const keyMatch = envContent.match(/ZHIPU_API_KEY_1="([^"]+)"/);
const apiKey = keyMatch ? keyMatch[1] : '';

// 读10条样本
const dir = '/root/.openclaw/workspace/tests/benchmarks/intent/c2-golden/';
const files = fs.readdirSync(dir).filter(f=>f.startsWith('mined-') && f.endsWith('.json'));
let allCases = [];
for (const f of files) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));
    if (Array.isArray(data)) allCases.push(...data);
  } catch(e) {}
}
const samples = allCases.sort(()=>Math.random()-0.5).slice(0,10);

const SYSTEM = `你是一个AI Agent行为分类器。将以下描述分类到8个类别之一。只输出类别名。

## 类别与示例

### 纠偏类
用户否定、修正、要求重做Agent的输出。
- 示例1："不对，我要的不是这个格式，重新做"
- 示例2："这个分析方向错了，我说的是竞品分析不是市场分析"
- 示例3："你理解错了我的意思，我要的是程序化执行不是写文档"

### 自主性缺失类
Agent该自己发现/处理的问题却等用户指出。
- 示例1："为什么这个bug你没有自己发现？每次都要我来检查"
- 示例2："这种明显的格式错误你应该自己就能判断"
- 示例3："你不应该等我问才去检查状态，应该主动监控"

### 全局未对齐类
局部修复但其他层/模块未同步更新。
- 示例1："你改了规则文件但intent-registry没有同步更新"
- 示例2："代码改了但文档还是旧的，不一致"
- 示例3："这个技能改了名但CAPABILITY-ANCHOR还是旧名字"

### 认知错误类
对需求理解偏差导致方向性错误。
- 示例1："我说的全局自主决策流水线是整个系统，不是DTO的一个模块"
- 示例2："规则化不是写JSON声明，是交付可运行的自动化链条"
- 示例3："意图必须基于LLM泛化，不能依赖关键词正则"

### 连锁跷跷板类
修A导致B坏，修B又影响C。
- 示例1："你修了eval-stats的逻辑但破坏了pre-commit hook"
- 示例2："改了分类器代码导致原有的mock测试全挂了"
- 示例3："升级了依赖但三个技能的API调用都报错了"

### 交付质量类
半成品/残留/格式错误推给用户。
- 示例1："这个飞书文档开头有一段乱码，你没检查就发了"
- 示例2："报告里的数据是编造的，不是真实数据"
- 示例3："代码没测试就提交了，一跑就报错"

### 反复未果类
同一问题修了2次以上仍未解决。
- 示例1："这个评测数据不准的问题昨天修过了今天还是不对"
- 示例2："PDCA报告的格式我已经说了三次了还是不对"
- 示例3："子Agent任务看板这个功能改了好几版还是有bug"

### 头痛医头类
只改症状不改根因，导致问题转移。
- 示例1："你只是把错误信息隐藏了，没有修根本原因"
- 示例2："加了个try-catch吞掉异常，问题没真正解决"
- 示例3："改了脚本但没清理脏数据，下次还会出同样问题"
`;

async function classify(input) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({
      model: 'glm-4-flash',
      messages: [
        {role:'system', content:SYSTEM},
        {role:'user', content: input}
      ],
      max_tokens: 50,
      temperature: 0
    });

    const options = {
      hostname: 'open.bigmodel.cn',
      port: 443,
      path: '/api/paas/v4/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type':'application/json',
        'Authorization': 'Bearer ' + apiKey,
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 30000
    };

    const req = https.request(options, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          const j = JSON.parse(body);
          const content = j.choices?.[0]?.message?.content?.trim() || 'unknown';
          // 提取类别名
          const cats = ['纠偏类','自主性缺失类','全局未对齐类','认知错误类','连锁跷跷板类','交付质量类','反复未果类','头痛医头类'];
          const found = cats.find(c => content.includes(c));
          resolve(found || content);
        } catch(e) { resolve('error'); }
      });
    });
    req.on('error', () => resolve('error'));
    req.on('timeout', () => { req.destroy(); resolve('timeout'); });
    req.write(postData);
    req.end();
  });
}

(async () => {
  let correct = 0;
  const results = [];
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const input = s.context ? s.context + '\n' + s.input : s.input;
    const predicted = await classify(input);
    const actual = s.category;
    const match = predicted === actual;
    if (match) correct++;
    results.push({id: s.id, actual, predicted, match});
    console.log('[' + (i+1) + '/10] ' + (match?'✅':'❌') + ' predicted=' + predicted + ' actual=' + actual);
  }

  const report = '# GLM-5 Few-Shot分类器 Pilot评测（10条）\n' +
    '- 分类器：glm-4-flash (few-shot, 每类3示例)\n' +
    '- 样本数：10\n' +
    '- 准确率：' + correct + '/10 = ' + (correct*10) + '%\n' +
    '- 对比zero-shot基线：27.5%\n\n' +
    '| # | ID | 实际 | 预测 | 结果 |\n|---|-----|------|------|------|\n' +
    results.map((r,i) => '| ' + (i+1) + ' | ' + r.id + ' | ' + r.actual + ' | ' + r.predicted + ' | ' + (r.match?'✅':'❌') + ' |').join('\n') + '\n';

  fs.writeFileSync('/root/.openclaw/workspace/reports/eval-glm5-fewshot-pilot-10.md', report);
  console.log('\n总准确率: ' + correct + '/10 = ' + (correct*10) + '%');
})();
