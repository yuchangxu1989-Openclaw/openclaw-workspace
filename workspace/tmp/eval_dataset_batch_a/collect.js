const fs = require('fs');
const path = require('path');
const base = '/root/.openclaw/agents/main/sessions';
const outDir = '/root/.openclaw/workspace/tmp/eval_dataset_batch_a';
const startMs = Date.parse('2026-03-05T17:00:00.000Z'); // 2026-03-06 01:00 CST
const files = fs.readdirSync(base).filter(f=>f.endsWith('.jsonl')).map(f=>path.join(base,f));
function safeJson(line){ try{return JSON.parse(line)}catch{return null} }
const sessions=[];
for(const f of files){
  const txt = fs.readFileSync(f,'utf8');
  const lines = txt.split('\n').filter(Boolean);
  let msgs=[];
  let key='';
  for(const line of lines){ const o=safeJson(line); if(!o) continue; if(o.type==='message' && o.message) msgs.push(o.message); }
  const firstUser = msgs.find(m=>m.role==='user');
  if(firstUser && firstUser.timestamp>=startMs){ sessions.push({file:f,msgs}); }
  else {
    const anyInRange = msgs.some(m=>m.timestamp>=startMs && (m.role==='user'||m.role==='assistant'));
    if(anyInRange) sessions.push({file:f,msgs});
  }
}
const picked=[];
for(const s of sessions){
  const convo = s.msgs.filter(m=>['user','assistant'].includes(m.role)).map(m=>({role:m.role,text:(m.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('\n').trim(),timestamp:m.timestamp})).filter(x=>x.text);
  const userCount = convo.filter(x=>x.role==='user').length;
  if(userCount < 2) continue;
  const textAll = convo.map(x=>x.text).join('\n');
  const tags=[];
  if(/另外|还有|同时|顺手|然后|以及|补上|再/.test(textAll)) tags.push('multi_task');
  if(/不是|不要|应该|纠偏|修正|不对|你说得对|我不认/.test(textAll)) tags.push('correction');
  if(/怎么|为什么|懂了么|教学|原则|准则/.test(textAll)) tags.push('teaching');
  if(/切换|回到|另外|之前提到/.test(textAll)) tags.push('switch');
  if(/真实对话|评测集|benchmark|评测/.test(textAll)) tags.push('meta_eval');
  if(tags.length===0) continue;
  picked.push({
    source_session_file:s.file,
    source_evidence:s.file,
    start_timestamp:new Date(convo[0].timestamp).toISOString(),
    end_timestamp:new Date(convo[convo.length-1].timestamp).toISOString(),
    user_turns:userCount,
    tags:[...new Set(tags)],
    messages:convo
  });
}
picked.sort((a,b)=>a.start_timestamp.localeCompare(b.start_timestamp));
const batch = {
  batch_name:'real-dialog-dataset-batch-a',
  generated_at:new Date().toISOString(),
  time_range:{start:'2026-03-06T01:00:00+08:00', end:new Date().toISOString(), timezone:'Asia/Shanghai'},
  source_scope:'真实主会话 agent:main:main transcript jsonl；仅抽取时间窗内真实对话；未合成',
  batch_boundary:'第一批，仅纳入主会话中可直接定位且满足复合意图/多轮上下文/切换/纠偏/教学/多任务并行特征的样本；后续批次可继续扩展到更多会话与截图证据。',
  item_count:picked.length,
  items:picked
};
fs.writeFileSync(path.join(outDir,'real-dialog-dataset-batch-a.json'), JSON.stringify(batch,null,2));
fs.writeFileSync(path.join(outDir,'README.md'), `# Real Dialog Dataset Batch A\n\n- generated_at: ${batch.generated_at}\n- time_range: ${batch.time_range.start} ~ ${batch.time_range.end}\n- item_count: ${batch.item_count}\n- source_scope: ${batch.source_scope}\n- batch_boundary: ${batch.batch_boundary}\n`);
console.log(JSON.stringify({count:picked.length, out:path.join(outDir,'real-dialog-dataset-batch-a.json')},null,2));
