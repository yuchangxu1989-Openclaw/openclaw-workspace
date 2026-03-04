// ============================================================
// daily-ops-report/generate.cjs
// 系统运营日报生成器 — Node.js CommonJS
// ============================================================

var fs = require('fs');
var path = require('path');
var execSync = require('child_process').execSync;

var OPENCLAW_ROOT = '/root/.openclaw';
var RUNS_DIR = path.join(OPENCLAW_ROOT, 'cron/runs');
var JOBS_FILE = path.join(OPENCLAW_ROOT, 'cron/jobs.json');
var SUBAGENTS_FILE = path.join(OPENCLAW_ROOT, 'subagents/runs.json');
var STATE_FILE = path.join(OPENCLAW_ROOT, 'workspace/reports/.daily-report-state.json');

function safeExec(cmd) {
  try { return execSync(cmd, { encoding: 'utf8', timeout: 10000 }).trim(); }
  catch (e) { return ''; }
}

function safeReadJson(fp) {
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); }
  catch (e) { return null; }
}

function loadLastState() { return safeReadJson(STATE_FILE); }

function saveState(state) {
  var dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function loadJobNames() {
  var data = safeReadJson(JOBS_FILE);
  if (!data) return {};
  var jobs = Array.isArray(data.jobs) ? data.jobs : (Array.isArray(data) ? data : []);
  var map = {};
  for (var i = 0; i < jobs.length; i++) map[jobs[i].id] = jobs[i].name || jobs[i].label || jobs[i].id;
  return map;
}

function collectSystemHealth() {
  var r = { uptimeRaw:'', uptimeHrs:0, memTotal:0, memUsed:0, memPct:0,
    diskTotal:'', diskUsed:'', diskAvail:'', diskPct:0,
    load1m:0, load5m:0, load15m:0, gwProcesses:[], gwProcessCount:0 };

  var uptimeRaw = safeExec('uptime');
  r.uptimeRaw = uptimeRaw;
  if (uptimeRaw) {
    var um = uptimeRaw.match(/up\s+(?:(\d+)\s+days?,?\s*)?(?:(\d+):(\d+))?(?:(\d+)\s+min)?/i);
    if (um) r.uptimeHrs = parseInt(um[1]||'0')*24 + parseInt(um[2]||'0') + parseInt(um[3]||um[4]||'0')/60;
    var lm = uptimeRaw.match(/load average:\s*([\d.]+),?\s*([\d.]+),?\s*([\d.]+)/);
    if (lm) { r.load1m=parseFloat(lm[1]); r.load5m=parseFloat(lm[2]); r.load15m=parseFloat(lm[3]); }
  }

  var memRaw = safeExec('free -m');
  if (memRaw) {
    var mm = memRaw.match(/Mem:\s+(\d+)\s+(\d+)\s+(\d+)/);
    if (mm) { r.memTotal=parseInt(mm[1]); r.memUsed=parseInt(mm[2]); r.memPct=r.memTotal>0?Math.round(r.memUsed/r.memTotal*100):0; }
  }

  var diskRaw = safeExec('df -h /');
  if (diskRaw) {
    var dl = diskRaw.split('\n');
    for (var i=0;i<dl.length;i++) {
      var dm = dl[i].match(/\S+\s+(\S+)\s+(\S+)\s+(\S+)\s+(\d+)%/);
      if (dm) { r.diskTotal=dm[1]; r.diskUsed=dm[2]; r.diskAvail=dm[3]; r.diskPct=parseInt(dm[4]); break; }
    }
  }

  var psRaw = safeExec("ps aux | grep -i openclaw | grep -v grep");
  if (psRaw) {
    var pl = psRaw.split('\n').filter(Boolean);
    r.gwProcessCount = pl.length;
    for (var i=0;i<pl.length;i++) {
      var pp = pl[i].split(/\s+/);
      if (pp.length>=11) r.gwProcesses.push({ pid:pp[1], cpuPct:parseFloat(pp[2])||0, memPct:parseFloat(pp[3])||0, rss:pp[5], command:pp.slice(10).join(' ').slice(0,80) });
    }
  }
  return r;
}

function collectCronStats(windowHours) {
  windowHours = windowHours || 24;
  var cutoff = Date.now() - windowHours*3600000;
  var jobs = {};
  var files;
  try { files = fs.readdirSync(RUNS_DIR).filter(function(f){return f.endsWith('.jsonl');}); }
  catch(e) { return jobs; }

  for (var fi=0; fi<files.length; fi++) {
    var jobId = files[fi].replace('.jsonl','');
    var rawLines;
    try { rawLines = fs.readFileSync(path.join(RUNS_DIR, files[fi]), 'utf8').split('\n').filter(Boolean); }
    catch(e) { continue; }

    var ok=0, fail=0, skip=0, totalDuration=0, lastRun=null, errors=[];
    for (var li=0; li<rawLines.length; li++) {
      var rec;
      try { rec = JSON.parse(rawLines[li]); } catch(e) { continue; }
      if (rec.action && rec.action!=='finished') continue;
      if (rec.ts < cutoff) continue;
      if (rec.status==='ok') ok++;
      else if (rec.status==='error') { fail++; if(rec.summary||rec.error) errors.push((rec.summary||rec.error).slice(0,150)); }
      else if (rec.status==='skipped') skip++;
      if (rec.durationMs) totalDuration += rec.durationMs;
      if (!lastRun || rec.ts > lastRun.ts) lastRun = rec;
    }

    var tailFail = 0;
    for (var ti=rawLines.length-1; ti>=0; ti--) {
      var tr; try { tr = JSON.parse(rawLines[ti]); } catch(e) { continue; }
      if (tr.action && tr.action!=='finished') continue;
      if (tr.status==='error') tailFail++; else break;
    }

    if (ok+fail+skip > 0) {
      jobs[jobId] = { ok:ok, fail:fail, skip:skip, totalRuns:ok+fail+skip,
        avgDurationMs:(ok+fail)>0?Math.round(totalDuration/(ok+fail)):0,
        lastStatus:lastRun?lastRun.status:null, lastSummary:lastRun?(lastRun.summary||'').slice(0,150):'',
        lastError:lastRun&&lastRun.status==='error'?(lastRun.error||lastRun.summary||'').slice(0,150):'',
        lastTs:lastRun?lastRun.ts:null, errors:errors.slice(-3), consecutiveFailures:tailFail };
    }
  }
  return jobs;
}

function collectSubagentStats(windowHours) {
  windowHours = windowHours || 24;
  var cutoff = Date.now() - windowHours*3600000;
  var result = { total:0, ok:0, fail:0, pending:0, tasks:[] };
  var data = safeReadJson(SUBAGENTS_FILE);
  if (!data) return result;
  var runs = data.runs || {};
  var keys = Object.keys(runs);
  for (var i=0; i<keys.length; i++) {
    var run = runs[keys[i]];
    var createdAt = run.createdAt || run.startedAt || 0;
    if (createdAt < cutoff) continue;
    result.total++;
    var status = run.outcome ? run.outcome.status : (run.endedAt ? 'unknown' : 'pending');
    if (status==='ok') result.ok++;
    else if (status==='error'||status==='failed') result.fail++;
    else result.pending++;
    var agent='unknown';
    if (run.childSessionKey) { var sp=run.childSessionKey.split(':'); agent=sp[1]||'unknown'; }
    var dur = (run.endedAt&&run.startedAt) ? Math.round((run.endedAt-run.startedAt)/1000) : null;
    result.tasks.push({ runId:keys[i], label:run.label||null, task:(run.task||'').slice(0,100), status:status, agent:agent, model:run.model||null, durationSec:dur });
  }
  result.tasks.sort(function(a,b){ return (b.durationSec||0)-(a.durationSec||0); });
  return result;
}

function collectGitChanges(sinceHours) {
  sinceHours = sinceHours || 24;
  var result = { total:0, categorized:{}, lines:[] };
  var log = safeExec('cd '+OPENCLAW_ROOT+' && git log --oneline --since="'+sinceHours+' hours ago" 2>/dev/null');
  if (!log) return result;
  var lines = log.split('\n').filter(Boolean);
  result.total = lines.length; result.lines = lines;
  var cat = {};
  for (var i=0; i<lines.length; i++) {
    var tm = lines[i].match(/\[(\w+)\]/); var tag = tm?tm[1]:'OTHER';
    if (!cat[tag]) cat[tag]=[]; cat[tag].push(lines[i]);
  }
  result.categorized = cat;
  return result;
}

function detectRisks(health, cronJobs, subagents, jobNames) {
  var risks = [];
  if (health.gwProcessCount===0) risks.push({level:'\u{1F534} CRITICAL',msg:'Gateway \u8fdb\u7a0b\u4e0d\u5b58\u5728\uff01\u670d\u52a1\u53ef\u80fd\u5df2\u505c\u6b62',category:'gateway'});
  if (health.memPct>80) risks.push({level:'\u{1F534} HIGH',msg:'\u5185\u5b58\u4f7f\u7528\u7387 '+health.memPct+'%\uff08'+health.memUsed+'MB/'+health.memTotal+'MB\uff09\uff0c\u8d85\u8fc7 80% \u9608\u503c',category:'memory'});
  else if (health.memPct>60) risks.push({level:'\u{1F7E1} WARN',msg:'\u5185\u5b58\u4f7f\u7528\u7387 '+health.memPct+'%\uff08'+health.memUsed+'MB/'+health.memTotal+'MB\uff09\uff0c\u6301\u7eed\u5173\u6ce8',category:'memory'});
  if (health.diskPct>85) risks.push({level:'\u{1F534} HIGH',msg:'\u78c1\u76d8\u4f7f\u7528\u7387 '+health.diskPct+'%\uff0c\u5269\u4f59 '+health.diskAvail+'\uff0c\u7a7a\u95f4\u4e25\u91cd\u4e0d\u8db3',category:'disk'});
  else if (health.diskPct>70) risks.push({level:'\u{1F7E1} WARN',msg:'\u78c1\u76d8\u4f7f\u7528\u7387 '+health.diskPct+'%\uff0c\u5269\u4f59 '+health.diskAvail,category:'disk'});
  if (health.load1m>4.0) risks.push({level:'\u{1F7E1} WARN',msg:'\u7cfb\u7edf\u8d1f\u8f7d '+health.load1m+'\uff081\u5206\u949f\u5747\u503c\uff09\uff0c\u9ad8\u4e8e\u6b63\u5e38\u6c34\u5e73',category:'load'});

  var ck = Object.keys(cronJobs);
  for (var i=0; i<ck.length; i++) {
    var jid=ck[i], st=cronJobs[jid], nm=jobNames[jid]||jid;
    if (st.consecutiveFailures>=3) risks.push({level:'\u{1F534} HIGH',msg:'Cron \u4efb\u52a1\u300c'+nm+'\u300d\u8fde\u7eed\u5931\u8d25 '+st.consecutiveFailures+' \u6b21',category:'cron',detail:st.errors.length?st.errors[st.errors.length-1]:''});
    else if (st.fail>0) risks.push({level:'\u{1F7E1} WARN',msg:'Cron \u4efb\u52a1\u300c'+nm+'\u300d\u4eca\u65e5\u5931\u8d25 '+st.fail+' \u6b21\uff08\u5171 '+st.totalRuns+' \u6b21\uff09',category:'cron'});
    if (st.skip>0 && st.ok===0 && st.fail===0) risks.push({level:'\u{1F7E1} WARN',msg:'Cron \u4efb\u52a1\u300c'+nm+'\u300d\u6301\u7eed\u88ab\u8df3\u8fc7\uff08'+st.skip+' \u6b21\uff09',category:'cron'});
  }

  if (subagents.fail>0) {
    var fn=subagents.tasks.filter(function(t){return t.status==='error'||t.status==='failed';}).map(function(t){return t.label||t.task;}).slice(0,3);
    risks.push({level:'\u{1F7E1} WARN',msg:'\u5b50 Agent \u4eca\u65e5 '+subagents.fail+' \u6b21\u6267\u884c\u5931\u8d25'+(fn.length?'\uff1a'+fn.join('\u3001'):''),category:'subagent'});
  }
  return risks;
}

function computeDelta(curr, last) {
  if (!last) return { isFirst:true };
  var d = {};
  d.memPctChange = curr.health.memPct - (last.health?last.health.memPct:0);
  d.diskPctChange = curr.health.diskPct - (last.health?last.health.diskPct:0);
  d.cronJobCountChange = Object.keys(curr.cronJobs).length - Object.keys(last.cronJobs||{}).length;
  d.newFailures = [];
  var ck = Object.keys(curr.cronJobs);
  for (var i=0;i<ck.length;i++) {
    if (curr.cronJobs[ck[i]].fail>0 && !(last.cronJobs&&last.cronJobs[ck[i]]&&last.cronJobs[ck[i]].fail>0))
      d.newFailures.push(ck[i]);
  }
  var lrm = {};
  if (last.risks) for (var i=0;i<last.risks.length;i++) lrm[last.risks[i].msg]=true;
  d.newRisks = curr.risks.filter(function(r){return !lrm[r.msg];});
  var crm = {};
  for (var i=0;i<curr.risks.length;i++) crm[curr.risks[i].msg]=true;
  d.resolvedRisks = (last.risks||[]).filter(function(r){return !crm[r.msg];});
  if (last.ts) d.hoursSinceLast = Math.round((Date.now()-last.ts)/3600000*10)/10;
  return d;
}

function generateRecommendations(health, cronJobs, subagents, risks, delta, jobNames) {
  var recs = [];
  if (risks.some(function(r){return r.category==='gateway';}))
    recs.push({priority:'P0',action:'\u7acb\u5373\u68c0\u67e5 Gateway \u8fdb\u7a0b\u72b6\u6001\u5e76\u91cd\u542f\uff1a`openclaw gateway restart`'});

  var ck = Object.keys(cronJobs);
  for (var i=0;i<ck.length;i++) {
    var st=cronJobs[ck[i]], nm=jobNames[ck[i]]||ck[i];
    if (st.consecutiveFailures>=3) {
      var le=st.errors.length?st.errors[st.errors.length-1]:'(\u65e0\u8be6\u60c5)';
      recs.push({priority:'P1',action:'\u4fee\u590d Cron \u4efb\u52a1\u300c'+nm+'\u300d\u8fde\u7eed\u5931\u8d25\u95ee\u9898\u3002\u6700\u8fd1\u9519\u8bef\uff1a'+le.slice(0,100)});
    }
  }

  var skNames=[];
  for (var i=0;i<ck.length;i++) { var s2=cronJobs[ck[i]]; if(s2.skip>0&&s2.ok===0&&s2.fail===0) skNames.push(jobNames[ck[i]]||ck[i]); }
  if (skNames.length) recs.push({priority:'P2',action:'\u68c0\u67e5\u6301\u7eed\u88ab\u8df3\u8fc7\u7684 Cron \u4efb\u52a1\uff1a'+skNames.join('\u3001')+'\u3002\u786e\u8ba4\u662f\u5426\u5e94\u7981\u7528\u6216\u4fee\u590d\u524d\u7f6e\u6761\u4ef6'});

  if (health.diskPct>70) recs.push({priority:'P2',action:'\u78c1\u76d8\u4f7f\u7528\u7387 '+health.diskPct+'%\uff0c\u5efa\u8bae\u6e05\u7406\u65e7\u5907\u4efd\u548c\u65e5\u5fd7\u6587\u4ef6'});
  if (health.memPct>80) recs.push({priority:'P1',action:'\u5185\u5b58\u4f7f\u7528\u7387 '+health.memPct+'%\uff0c\u68c0\u67e5\u662f\u5426\u6709\u5185\u5b58\u6cc4\u6f0f'});
  if (subagents.fail>0) recs.push({priority:'P2',action:subagents.fail+' \u4e2a\u5b50 Agent \u6267\u884c\u5931\u8d25\uff0c\u68c0\u67e5\u4efb\u52a1\u914d\u7f6e\u548c\u6a21\u578b\u53ef\u7528\u6027'});

  if (recs.length===0) {
    if (delta&&!delta.isFirst&&(!delta.newRisks||delta.newRisks.length===0))
      recs.push({priority:'INFO',action:'\u7cfb\u7edf\u8fd0\u884c\u7a33\u5b9a\uff0c\u4e0e\u4e0a\u6b21\u62a5\u544a\u76f8\u6bd4\u65e0\u663e\u8457\u5f02\u5e38'});
    else if (delta&&delta.isFirst)
      recs.push({priority:'INFO',action:'\u9996\u6b21\u751f\u6210\u65e5\u62a5\uff0c\u540e\u7eed\u5c06\u81ea\u52a8\u5bf9\u6bd4\u53d8\u5316\u8d8b\u52bf'});
  }
  return recs;
}

function renderReport(data) {
  var health=data.health, cronJobs=data.cronJobs, subagents=data.subagents;
  var gitChanges=data.gitChanges, risks=data.risks, delta=data.delta;
  var recommendations=data.recommendations, jobNames=data.jobNames;
  var dateStr = new Date(data.ts).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  var o = [];

  o.push('# \u{1F4CA} \u7cfb\u7edf\u8fd0\u8425\u65e5\u62a5');
  o.push('> ' + dateStr);
  o.push('');

  o.push('## \u{1F5A5}\uFE0F \u7cfb\u7edf\u5065\u5eb7');
  o.push('');
  o.push('| \u6307\u6807 | \u5f53\u524d\u503c | \u72b6\u6001 |');
  o.push('|------|--------|------|');
  var ud = health.uptimeHrs>=24 ? Math.floor(health.uptimeHrs/24)+'\u5929'+Math.round(health.uptimeHrs%24)+'\u5c0f\u65f6' : health.uptimeHrs.toFixed(1)+'\u5c0f\u65f6';
  o.push('| \u8fd0\u884c\u65f6\u957f | '+ud+' | '+(health.uptimeHrs>1?'\u2705':'\u{1F504} \u521a\u542f\u52a8')+' |');
  o.push('| \u5185\u5b58\u4f7f\u7528 | '+health.memUsed+'MB / '+health.memTotal+'MB ('+health.memPct+'%) | '+(health.memPct>80?'\u{1F534}':health.memPct>60?'\u{1F7E1}':'\u2705')+' |');
  o.push('| \u78c1\u76d8\u4f7f\u7528 | '+health.diskUsed+' / '+health.diskTotal+' ('+health.diskPct+'%) | '+(health.diskPct>85?'\u{1F534}':health.diskPct>70?'\u{1F7E1}':'\u2705')+' |');
  o.push('| \u7cfb\u7edf\u8d1f\u8f7d | '+health.load1m+' / '+health.load5m+' / '+health.load15m+' | '+(health.load1m>4?'\u{1F7E1}':'\u2705')+' |');
  o.push('| Gateway | '+health.gwProcessCount+' \u4e2a\u8fdb\u7a0b | '+(health.gwProcessCount>0?'\u2705':'\u{1F534} \u4e0d\u5b58\u5728')+' |');
  o.push('');

  for (var i=0;i<health.gwProcesses.length;i++) {
    var p=health.gwProcesses[i];
    o.push('> Gateway PID '+p.pid+' \u2014 CPU '+p.cpuPct+'%, MEM '+p.memPct+'%, RSS '+p.rss+'KB');
  }
  if (health.gwProcesses.length) o.push('');

  if (delta && !delta.isFirst) {
    var ch=[];
    if (delta.memPctChange!==0) ch.push('\u5185\u5b58 '+(delta.memPctChange>0?'+':'')+delta.memPctChange+'%');
    if (delta.diskPctChange!==0) ch.push('\u78c1\u76d8 '+(delta.diskPctChange>0?'+':'')+delta.diskPctChange+'%');
    if (delta.hoursSinceLast) ch.push('\u8ddd\u4e0a\u6b21\u62a5\u544a '+delta.hoursSinceLast+'h');
    if (ch.length) { o.push('> \u{1F4C8} \u53d8\u5316\uff1a'+ch.join(' | ')); o.push(''); }
  }

  o.push('## \u23F1\uFE0F Cron \u4efb\u52a1\u6267\u884c\uff08\u8fc7\u53bb24\u5c0f\u65f6\uff09');
  o.push('');
  var ce=Object.entries(cronJobs);
  var tR=0,tO=0,tF=0,tS=0;
  for(var i=0;i<ce.length;i++){tR+=ce[i][1].totalRuns;tO+=ce[i][1].ok;tF+=ce[i][1].fail;tS+=ce[i][1].skip;}
  o.push('**\u603b\u8ba1** '+tR+' \u6b21\u6267\u884c\uff08'+ce.length+' \u4e2a\u4efb\u52a1\uff09 | \u2705 '+tO+' \u6210\u529f | \u274C '+tF+' \u5931\u8d25 | \u23ED\uFE0F '+tS+' \u8df3\u8fc7');
  o.push('');

  var pj=ce.filter(function(e){return e[1].fail>0||(e[1].skip>0&&e[1].ok===0);});
  if (pj.length) {
    o.push('**\u9700\u5173\u6ce8\u7684\u4efb\u52a1\uff1a**');
    o.push('');
    for (var i=0;i<pj.length;i++){
      var jid=pj[i][0], s=pj[i][1], jn=jobNames[jid]||jid;
      var si=[];
      if(s.fail>0) si.push('\u274C \u5931\u8d25 '+s.fail+' \u6b21');
      if(s.skip>0) si.push('\u23ED\uFE0F \u8df3\u8fc7 '+s.skip+' \u6b21');
      if(s.ok>0) si.push('\u2705 \u6210\u529f '+s.ok+' \u6b21');
      if(s.consecutiveFailures>=2) si.push('\u{1F525} \u8fde\u7eed\u5931\u8d25 '+s.consecutiveFailures+' \u6b21');
      o.push('- `'+jn+'`\uff1a'+si.join(' | '));
      if(s.lastError) o.push('  > \u6700\u8fd1\u9519\u8bef\uff1a'+s.lastError.slice(0,120));
      else if(s.lastSummary) o.push('  > \u6458\u8981\uff1a'+s.lastSummary.slice(0,120));
    }
    o.push('');
  } else {
    o.push('\u6240\u6709\u4efb\u52a1\u8fd0\u884c\u6b63\u5e38\uff0c\u65e0\u5931\u8d25\u8bb0\u5f55\u3002 \u2705');
    o.push('');
  }

  var tj=ce.filter(function(e){return e[1].ok>0;}).sort(function(a,b){return b[1].totalRuns-a[1].totalRuns;}).slice(0,5);
  if (tj.length) {
    o.push('<details><summary>\u6d3b\u8dc3\u4efb\u52a1 Top '+tj.length+'</summary>');
    o.push('');
    for(var i=0;i<tj.length;i++){
      var tn=jobNames[tj[i][0]]||tj[i][0];
      var as2=tj[i][1].avgDurationMs>0?(tj[i][1].avgDurationMs/1000).toFixed(1)+'s':'-';
      o.push('- `'+tn+'`\uff1a'+tj[i][1].totalRuns+' \u6b21\uff0c\u5e73\u5747 '+as2);
    }
    o.push('');
    o.push('</details>');
    o.push('');
  }

  o.push('## \u{1F916} \u5b50 Agent \u6267\u884c\uff08\u8fc7\u53bb24\u5c0f\u65f6\uff09');
  o.push('');
  if (subagents.total===0) { o.push('\u65e0\u5b50 Agent \u6267\u884c\u8bb0\u5f55\u3002'); o.push(''); }
  else {
    o.push('\u5171 '+subagents.total+' \u4e2a\u4efb\u52a1\uff1a\u2705 '+subagents.ok+' \u6210\u529f | \u274C '+subagents.fail+' \u5931\u8d25 | \u{1F504} '+subagents.pending+' \u8fdb\u884c\u4e2d');
    o.push('');
    var sl=subagents.tasks.slice(0,8);
    for(var i=0;i<sl.length;i++){
      var t=sl[i];
      var ic=t.status==='ok'?'\u2705':(t.status==='error'||t.status==='failed')?'\u274C':'\u{1F504}';
      var du=t.durationSec!=null?' ('+t.durationSec+'s)':'';
      var mo=t.model?' ['+t.model.split('/').pop()+']':'';
      o.push('- '+ic+' `'+t.agent+'` \u2014 '+(t.label||t.task)+du+mo);
    }
    o.push('');
  }

  o.push('## \u{1F4DD} \u4ee3\u7801\u53d8\u66f4\uff08\u8fc7\u53bb24\u5c0f\u65f6\uff09');
  o.push('');
  if (gitChanges.total===0) { o.push('\u65e0\u4ee3\u7801\u63d0\u4ea4\u3002'); o.push(''); }
  else {
    o.push('\u5171 '+gitChanges.total+' \u6b21\u63d0\u4ea4');
    o.push('');
    var catLabels={FIX:'\u{1F41B} Bug\u4fee\u590d',FEAT:'\u2728 \u65b0\u529f\u80fd',CONFIG:'\u2699\uFE0F \u914d\u7f6e\u53d8\u66f4',AUTO:'\u{1F916} \u81ea\u52a8\u7248\u672c\u66f4\u65b0',OTHER:'\u{1F4E6} \u5176\u4ed6'};
    var catOrder=['FIX','FEAT','CONFIG','AUTO','OTHER'];
    for(var ci=0;ci<catOrder.length;ci++){
      var cat=catOrder[ci], items=gitChanges.categorized[cat];
      if(!items||!items.length) continue;
      var cl=catLabels[cat]||cat;
      if(cat==='AUTO'&&items.length>3){
        o.push('**'+cl+' ('+items.length+')**\uff1a'+items.slice(0,3).map(function(l){return l.replace(/^[a-f0-9]+ /,'');}).join(', ')+' \u7b49');
      } else {
        o.push('**'+cl+' ('+items.length+')**\uff1a');
        for(var ii=0;ii<items.length;ii++) o.push('- '+items[ii].replace(/^[a-f0-9]+ /,''));
      }
    }
    o.push('');
  }

  o.push('## \u26A0\uFE0F \u5f02\u5e38\u4e0e\u98ce\u9669');
  o.push('');
  if (risks.length===0) { o.push('\u65e0\u5f02\u5e38\uff0c\u7cfb\u7edf\u8fd0\u884c\u6b63\u5e38\u3002 \u2705'); o.push(''); }
  else {
    for(var i=0;i<risks.length;i++){
      o.push('- '+risks[i].level+': '+risks[i].msg);
      if(risks[i].detail) o.push('  > '+risks[i].detail.slice(0,120));
    }
    o.push('');
  }

  if (delta && !delta.isFirst) {
    if (delta.newRisks&&delta.newRisks.length) o.push('> \u{1F195} \u65b0\u589e\u98ce\u9669\uff1a'+delta.newRisks.map(function(r){return r.msg;}).join('; '));
    if (delta.resolvedRisks&&delta.resolvedRisks.length) o.push('> \u2705 \u5df2\u89e3\u51b3\u98ce\u9669\uff1a'+delta.resolvedRisks.map(function(r){return r.msg;}).join('; '));
    if ((delta.newRisks&&delta.newRisks.length)||(delta.resolvedRisks&&delta.resolvedRisks.length)) o.push('');
  }

  o.push('## \u{1F4A1} \u4e3b\u52a8\u5efa\u8bae');
  o.push('');
  if (recommendations.length===0) { o.push('\u65e0\u5efa\u8bae\uff0c\u7cfb\u7edf\u72b6\u6001\u826f\u597d\u3002'); o.push(''); }
  else {
    for(var i=0;i<recommendations.length;i++)
      o.push('- **['+recommendations[i].priority+']** '+recommendations[i].action);
    o.push('');
  }

  o.push('---');
  o.push('_\u62a5\u544a\u751f\u6210\u65f6\u95f4\uff1a'+dateStr+' | \u6570\u636e\u7a97\u53e3\uff1a\u8fc7\u53bb24\u5c0f\u65f6_');
  return o.join('\n');
}

// ========== MAIN ==========

function main() {
  var lastState = loadLastState();
  var jobNames = loadJobNames();
  var health = collectSystemHealth();
  var cronJobs = collectCronStats(24);
  var subagents = collectSubagentStats(24);
  var gitChanges = collectGitChanges(24);
  var currentState = { ts:Date.now(), health:health, cronJobs:cronJobs, gitChanges:gitChanges };
  var risks = detectRisks(health, cronJobs, subagents, jobNames);
  currentState.risks = risks;
  var delta = computeDelta(currentState, lastState);
  var recommendations = generateRecommendations(health, cronJobs, subagents, risks, delta, jobNames);
  var report = renderReport({ ts:currentState.ts, health:health, cronJobs:cronJobs, subagents:subagents,
    gitChanges:gitChanges, risks:risks, delta:delta, recommendations:recommendations, jobNames:jobNames });

  // Save state for next delta
  saveState(currentState);

  // Output to stdout
  console.log(report);
}

main();
