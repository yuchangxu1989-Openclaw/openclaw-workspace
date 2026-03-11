const fs=require('fs'),path=require('path');
const AGENTS_DIR='/root/.openclaw/agents';
const BLOCKED=['main'];
const ROLE_MAP={code:['coder','coder-02','worker-03'],research:['researcher','researcher-02','analyst','analyst-02'],audit:['reviewer','reviewer-02'],write:['writer','writer-02'],scout:['scout','scout-02'],general:['worker-04','worker-05','worker-06']};

function getRunning(id){try{const d=JSON.parse(fs.readFileSync(path.join(AGENTS_DIR,id,'sessions','sessions.json'),'utf8'));return Object.entries(d).filter(([k,v])=>k.includes(':subagent:')&&v.status==='running').length}catch{return 0}}
function validate(id){if(!id||!id.trim())return{ok:false,error:'agentId不能为空'};if(BLOCKED.includes(id))return{ok:false,error:'禁止派给main'};return{ok:true}}
function pickIdle(role){const c=ROLE_MAP[role]||ROLE_MAP.general;for(const id of c)if(getRunning(id)===0)return id;let min=999,pick=c[0];for(const id of c){const r=getRunning(id);if(r<min){min=r;pick=id}}return pick}

if(require.main===module){const[,,id,label]=process.argv;const r=validate(id);if(!r.ok){console.error('❌',r.error);Object.entries(ROLE_MAP).forEach(([k,v])=>console.log(k+': '+pickIdle(k)));process.exit(1)}console.log('✅',id,'running:'+getRunning(id),'label:'+(label||'N/A'))}
module.exports={validate,pickIdle,getRunning,ROLE_MAP,BLOCKED};
