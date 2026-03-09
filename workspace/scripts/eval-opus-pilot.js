const fs = require('fs');
const https = require('https');
const path = require('path');

const config = JSON.parse(fs.readFileSync('/root/.openclaw/openclaw.json','utf8'));
const provider = config.models.providers['claude-main'];
const apiKey = provider.apiKey;
const baseUrl = provider.baseUrl; // 注意是baseUrl不是baseURL

const dir = '/root/.openclaw/workspace/tests/benchmarks/intent/c2-golden/';
const files = fs.readdirSync(dir).filter(f=>f.startsWith('mined-') && f.endsWith('.json'));
let allCases = [];
for (const f of files) {
  try { const d=JSON.parse(fs.readFileSync(path.join(dir,f),'utf8')); if(Array.isArray(d)) allCases.push(...d); } catch(e){}
}
const samples = allCases.sort(()=>Math.random()-0.5).slice(0,10);

const SYSTEM = '你是一个AI Agent行为分类器。将以下描述分类到8个类别之一：纠偏类、自主性缺失类、全局未对齐类、认知错误类、连锁跷跷板类、交付质量类、反复未果类、头痛医头类。只输出类别名，不要解释。';

async function classify(input) {
  return new Promise((resolve) => {
    const url = new URL(baseUrl);
    const postData = JSON.stringify({
      model: 'claude-opus-4-6',
      max_tokens: 50,
      system: SYSTEM,
      messages: [{role:'user', content: input}]
    });
    const options = {
      hostname: url.hostname,
      port: 443,
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type':'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 60000
    };
    const req = https.request(options, res => {
      let body='';
      res.on('data', d=>body+=d);
      res.on('end', ()=>{
        try {
          const j=JSON.parse(body);
          const content = j.content?.[0]?.text?.trim() || j.error?.message || 'unknown';
          const cats = ['纠偏类','自主性缺失类','全局未对齐类','认知错误类','连锁跷跷板类','交付质量类','反复未果类','头痛医头类'];
          resolve(cats.find(c=>content.includes(c)) || content);
        } catch(e) { resolve('parse-error:'+body.substring(0,100)); }
      });
    });
    req.on('error', e=>resolve('error:'+e.message));
    req.on('timeout', ()=>{req.destroy();resolve('timeout');});
    req.write(postData);
    req.end();
  });
}

(async()=>{
  let correct=0;
  const results=[];
  for(let i=0;i<samples.length;i++){
    const s=samples[i];
    const input = s.context ? s.context+'\n'+s.input : s.input;
    const predicted = await classify(input);
    const match = predicted===s.category;
    if(match) correct++;
    results.push({id:s.id, actual:s.category, predicted, match});
    console.log('['+(i+1)+'/10] '+(match?'✅':'❌')+' pred='+predicted+' actual='+s.category);
  }
  const report = '# Opus分类器 Pilot评测（10条）\n- 分类器：claude-opus-4-6\n- 样本数：10\n- 准确率：'+correct+'/10 = '+(correct*10)+'%\n\n| # | ID | 实际 | 预测 | 结果 |\n|---|-----|------|------|------|\n'+results.map((r,i)=>'| '+(i+1)+' | '+r.id+' | '+r.actual+' | '+r.predicted+' | '+(r.match?'✅':'❌')+' |').join('\n')+'\n';
  fs.writeFileSync('/root/.openclaw/workspace/reports/eval-opus-pilot-10.md', report);
  console.log('\n总准确率: '+correct+'/10 = '+(correct*10)+'%');
})();
