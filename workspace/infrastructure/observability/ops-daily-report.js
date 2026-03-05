'use strict';

/**
 * Agent 运营五层仪表盘日报生成器
 * 
 * 从"监控代码流水线"升级为"监控认知-决策-执行闭环"。
 * 五层: L1意图 → L2决策 → L3执行 → L4效果(AEO) → L5系统健康
 * 
 * @module infrastructure/observability/ops-daily-report
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const INFRA_DIR = path.resolve(__dirname, '..');
const EVENTS_FILE = path.join(INFRA_DIR, 'event-bus', 'events.jsonl');
const DECISIONS_FILE = path.join(INFRA_DIR, 'decision-log', 'decisions.jsonl');
const PIPELINE_RUN_LOG = path.join(INFRA_DIR, 'pipeline', 'run-log.jsonl');
const FLAGS_FILE = path.join(INFRA_DIR, 'feature-flags', 'flags.json');
const CRON_JOBS_FILE = path.join(INFRA_DIR, 'cron', 'jobs.json');
const REPORTS_DIR = path.resolve(INFRA_DIR, '..', 'reports');

function _loadMetrics() { try { return require('./metrics'); } catch (_) { return null; } }
function _loadHealth() { try { return require('./health'); } catch (_) { return null; } }
function _loadDecisionLogger() { try { return require('../decision-log/decision-logger'); } catch (_) { return null; } }

function readJsonl(fp, opts = {}) {
  if (!fs.existsSync(fp)) return [];
  try {
    const c = fs.readFileSync(fp, 'utf8').trim();
    if (!c) return [];
    let entries = c.split('\n').filter(l => l.trim()).map(l => { try { return JSON.parse(l); } catch(_) { return null; } }).filter(Boolean);
    if (opts.since) {
      const sm = typeof opts.since === 'number' ? opts.since : new Date(opts.since).getTime();
      entries = entries.filter(e => { const ts = e.timestamp ? (typeof e.timestamp==='number'?e.timestamp:new Date(e.timestamp).getTime()) : 0; return ts >= sm; });
    }
    return entries;
  } catch (_) { return []; }
}

function readJsonFile(fp) { try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch(_) { return null; } }
function pct(n, d, dec=1) { if (!d||d===0) return 'N/A'; return (n/d*100).toFixed(dec)+'%'; }
function sparkBar(v, mx, w=10) { if (!mx||mx===0) return '░'.repeat(w); const f=Math.round((v/mx)*w); return '█'.repeat(Math.min(f,w))+'░'.repeat(Math.max(w-f,0)); }
function formatBytes(b) { if (b<1024) return b+' B'; if (b<1048576) return (b/1024).toFixed(1)+' KB'; return (b/1048576).toFixed(1)+' MB'; }

// ═══ L1: 意图层 ═══
function generateL1Intent(metrics, events24h) {
  const L = ['## 🧠 L1 意图层 — 认知入口\n'];
  const hasM = metrics && metrics.intent_requests_total > 0;
  const hitsByCat = (metrics && metrics.intent_hits_by_category) || {};
  const totalHits = Object.values(hitsByCat).reduce((a,b)=>a+b, 0);
  const icCats = ['IC1','IC2','IC3','IC4','IC5'];

  L.push('### 意图分类命中分布 (IC1-IC5)\n');
  if (hasM && totalHits > 0) {
    L.push('| 意图级别 | 命中数 | 占比 | 分布 |');
    L.push('|---------|-------|------|------|');
    for (const ic of icCats) { const c=hitsByCat[ic]||0; L.push(`| ${ic} | ${c} | ${pct(c,totalHits)} | ${sparkBar(c,totalHits)} |`); }
    for (const cat of Object.keys(hitsByCat).filter(k=>!icCats.includes(k))) L.push(`| ${cat} | ${hitsByCat[cat]} | ${pct(hitsByCat[cat],totalHits)} | ${sparkBar(hitsByCat[cat],totalHits)} |`);
  } else {
    L.push('> 📊 '+(hasM?'当前周期内无IC命中记录':'**待接入** — metrics.intent_hits_by_category 尚无数据'));
  }
  L.push('');

  L.push('### 意图识别总览\n');
  if (hasM) {
    const tr=metrics.intent_requests_total;
    L.push('| 指标 | 值 |'); L.push('|------|-----|');
    L.push(`| 意图请求总数 | ${tr} |`);
    L.push(`| 命中率 | ${pct(tr-metrics.intent_no_match_total, tr)} |`);
    L.push(`| 未识别率 | ${(metrics.intent_no_match_rate||0).toFixed(1)}% |`);
    L.push(`| 无匹配总数 | ${metrics.intent_no_match_total} |`);
    L.push(`| 平均延迟 | ${metrics.intent_latency_avg_ms}ms |`);
    L.push(`| P95延迟 | ${metrics.intent_latency_p95_ms}ms |`);
  } else { L.push('> **待接入** — 意图识别模块未产生运行时指标'); }
  L.push('');

  L.push('### 意图模式变化趋势\n');
  const iEvts = events24h.filter(e => e.type && (e.type.includes('intent')||e.type.includes('user.message')));
  if (iEvts.length > 0) {
    const td={}; for (const e of iEvts) td[e.type]=(td[e.type]||0)+1;
    L.push('意图相关事件:');
    for (const [t,c] of Object.entries(td).sort((a,b)=>b[1]-a[1])) L.push(`- \`${t}\`: ${c}`);
  } else {
    L.push('> **待接入** — 需要从会话日志采集意图模式变化趋势');
    L.push('> 建议: 接入 hourly IC分布对比');
  }
  L.push(''); return L.join('\n');
}

// ═══ L2: 决策层 ═══
function detectAnomalies(decisions, summary) {
  const A=[];
  if (summary.degradation_count>0 && summary.total>0) {
    const r=summary.degradation_count/summary.total;
    if (r>0.3) A.push(`🔴 高降级率: ${(r*100).toFixed(1)}% 置信度<0.5`);
    else if (r>0.1) A.push(`🟡 中等降级率: ${(r*100).toFixed(1)}% 置信度<0.5`);
  }
  if (summary.by_component) {
    const tot=Object.values(summary.by_component).reduce((a,b)=>a+b,0);
    for (const [c,n] of Object.entries(summary.by_component)) if (tot>10&&n/tot>0.8) A.push(`🟡 决策集中于 \`${c}\` (${pct(n,tot)})`);
  }
  if (summary.by_method) { const ms=Object.keys(summary.by_method); if (ms.length===1&&summary.total>5) A.push(`ℹ️ 单一决策方法 \`${ms[0]}\``); }
  return A;
}

function generateL2Decision(metrics, decSummary, decisions24h) {
  const L = ['## ⚖️ L2 决策层 — 规则与推理\n'];

  L.push('### 规则匹配覆盖率\n');
  if (metrics && metrics.rules_evaluated_total > 0) {
    L.push('| 指标 | 值 | 状态 |'); L.push('|------|-----|------|');
    L.push(`| 规则评估总数 | ${metrics.rules_evaluated_total} | - |`);
    L.push(`| 有规则兜底 | ${metrics.rules_matched_total} (${metrics.rules_match_rate.toFixed(1)}%) | ✅ |`);
    L.push(`| 裸奔场景 | ${metrics.rules_no_match_total} (${pct(metrics.rules_no_match_total,metrics.rules_evaluated_total)}) | ${metrics.rules_no_match_total>0?'⚠️':'✅'} |`);
  } else { L.push('> **待接入** — rules_evaluated_total = 0'); }
  L.push('');

  L.push('### 决策日志分析\n');
  if (decSummary && decSummary.total > 0) {
    L.push('| 指标 | 值 |'); L.push('|------|-----|');
    L.push(`| 决策记录总数 | ${decSummary.total} |`);
    L.push(`| 平均置信度 | ${decSummary.avg_confidence!==null?decSummary.avg_confidence.toFixed(3):'N/A'} |`);
    L.push(`| 降级次数 (置信度<0.5) | ${decSummary.degradation_count} |`);
    L.push('');
    const pe={sensing:'👁️',cognition:'🧠',execution:'⚡'};
    if (decSummary.by_phase && Object.keys(decSummary.by_phase).length>0) {
      L.push('**按阶段:**\n');
      L.push('| 阶段 | 记录数 | 置信度 |'); L.push('|------|-------|--------|');
      for (const [p,s] of Object.entries(decSummary.by_phase)) L.push(`| ${pe[p]||'📌'} ${p} | ${s.count} | ${s.avg_confidence!==null?s.avg_confidence.toFixed(3):'N/A'} |`);
      L.push('');
    }
    if (decSummary.by_method && Object.keys(decSummary.by_method).length>0) {
      L.push('**决策方法:**');
      for (const [m,c] of Object.entries(decSummary.by_method).sort((a,b)=>b[1]-a[1])) L.push(`- \`${m}\`: ${c} (${pct(c,decSummary.total)})`);
      L.push('');
    }
    const anomalies = detectAnomalies(decisions24h, decSummary);
    if (anomalies.length>0) { L.push('**⚠️ 异常模式:**'); for (const a of anomalies) L.push(`- ${a}`); L.push(''); }
  } else { L.push('> 24h内无决策记录'); L.push(''); }

  L.push('### 熔断器状态\n');
  if (metrics) {
    const trips=metrics.pipeline_breaker_trips||0;
    L.push(`- ${trips===0?'🟢':trips<3?'🟡':'🔴'} 熔断触发: **${trips}** 次`);
    if (trips>0) L.push('  - ⚠️ 建议排查触发时段');
  } else { L.push('> **待接入**'); }
  L.push(''); return L.join('\n');
}

// ═══ L3: 执行层 ═══
function generateL3Execution(metrics, pipelineRuns) {
  const L = ['## ⚡ L3 执行层 — 任务调度与资源\n'];

  L.push('### 分发任务统计\n');
  if (metrics && metrics.dispatch_total > 0) {
    const t=metrics.dispatch_total;
    L.push('| 指标 | 数量 | 占比 | 状态 |'); L.push('|------|------|------|------|');
    L.push(`| ✅ 成功 | ${metrics.dispatch_success} | ${pct(metrics.dispatch_success,t)} | ${sparkBar(metrics.dispatch_success,t)} |`);
    L.push(`| ❌ 失败 | ${metrics.dispatch_failed||0} | ${pct(metrics.dispatch_failed||0,t)} | - |`);
    L.push(`| ⏱️ 超时 | ${metrics.dispatch_timeout} | ${pct(metrics.dispatch_timeout,t)} | ${metrics.dispatch_timeout>0?'⚠️':'-'} |`);
    L.push(`| 🔄 重试 | ${metrics.dispatch_retry} | ${pct(metrics.dispatch_retry,t)} | - |`);
    L.push(`| **合计** | **${t}** | **100%** | - |`);
    L.push('');
    L.push('**延迟:** 分发 avg=' + metrics.dispatch_latency_avg_ms + 'ms P95=' + metrics.dispatch_latency_p95_ms + 'ms | 流水线 avg=' + metrics.pipeline_avg_latency_ms + 'ms P95=' + metrics.pipeline_p95_latency_ms + 'ms');
  } else { L.push('> **待接入** — 分发任务无运行时数据'); }
  L.push('');

  L.push('### 并行调度效率\n');
  if (pipelineRuns.length > 0) {
    const wd=pipelineRuns.filter(r=>r.dispatched_actions>0);
    const avgD=wd.length>0?(wd.reduce((s,r)=>s+r.dispatched_actions,0)/wd.length).toFixed(1):'0';
    const avgT=(pipelineRuns.reduce((s,r)=>s+(r.duration_ms||0),0)/pipelineRuns.length).toFixed(0);
    const errR=pipelineRuns.filter(r=>(r.errors||[]).length>0);
    L.push('| 指标 | 值 |'); L.push('|------|-----|');
    L.push(`| 流水线运行次数 | ${pipelineRuns.length} |`);
    L.push(`| 有分发动作的运行 | ${wd.length} |`);
    L.push(`| 平均每次分发数 | ${avgD} |`);
    L.push(`| 平均耗时 | ${avgT}ms |`);
    L.push(`| 含错误运行 | ${errR.length} |`);
  } else { L.push('> **待接入** — run-log.jsonl 无记录'); }
  L.push('');

  L.push('### Token 消耗热力图\n');
  L.push('> **待接入** — 需接入 LLM token 计量');
  L.push('> 目标: hour × IC分类 的 token 消耗矩阵');
  L.push(''); return L.join('\n');
}

// ═══ L4: 效果层 (AEO) ═══
function generateL4Effect(metrics, events24h, decSummary) {
  const L = ['## 🎯 L4 效果层 (AEO) — 质量与满意度\n'];

  L.push('### 端到端响应质量评分\n');
  const scores = {};
  if (metrics) {
    if (metrics.intent_requests_total>0) scores['意图命中']=Math.round((1-(metrics.intent_no_match_rate||0)/100)*100);
    if (metrics.dispatch_total>0) scores['分发成功']=Math.round(metrics.dispatch_success/metrics.dispatch_total*100);
    scores['熔断安全']=(metrics.pipeline_breaker_trips||0)===0?100:Math.max(0,100-metrics.pipeline_breaker_trips*20);
  }
  if (decSummary && decSummary.avg_confidence!==null) scores['决策置信度']=Math.round(decSummary.avg_confidence*100);

  if (Object.keys(scores).length > 0) {
    const overall=Math.round(Object.values(scores).reduce((a,b)=>a+b,0)/Object.keys(scores).length);
    L.push(`**${overall>=80?'🟢':overall>=60?'🟡':'🔴'} 综合评分: ${overall}/100**\n`);
    L.push('| 维度 | 评分 | 条形 |'); L.push('|------|------|------|');
    for (const [d,s] of Object.entries(scores)) L.push(`| ${d} | ${s>=80?'🟢':s>=60?'🟡':'🔴'} ${s} | ${sparkBar(s,100,15)} |`);
  } else { L.push('> **待接入** — 需要运行数据计算综合评分'); }
  L.push('');

  L.push('### 用户满意度信号\n');
  const cEvts=events24h.filter(e=>e.type&&(e.type.includes('correction')||e.type.includes('feedback')||e.type.includes('rework')));
  if (cEvts.length>0) {
    L.push(`- 纠偏/反馈事件: **${cEvts.length}** 次`);
    const ct={}; for (const e of cEvts) ct[e.type]=(ct[e.type]||0)+1;
    for (const [t,c] of Object.entries(ct)) L.push(`  - \`${t}\`: ${c}`);
  } else {
    L.push('- 纠偏频次: **待接入** — 需要交互层纠偏信号埋点');
  }
  L.push('- 重复指令率: **待接入** — 需要会话级去重检测');
  L.push('');

  L.push('### 能力覆盖缺口\n');
  let hasGap=false;
  if (metrics&&metrics.intent_no_match_total>0) { L.push(`- 🔴 未识别意图: ${metrics.intent_no_match_total} 次`); hasGap=true; }
  if (metrics&&metrics.rules_no_match_total>0) { L.push(`- 🟡 规则未覆盖: ${metrics.rules_no_match_total} 次`); hasGap=true; }
  if (!hasGap) L.push('> **待接入** — 需充分运行数据分析能力缺口');
  L.push(''); return L.join('\n');
}

// ═══ L5: 系统健康 ═══
function generateL5Health(metrics, events24h, healthCheck) {
  const L = ['## 🏥 L5 系统健康 — 基础设施\n'];

  L.push('### EventBus 吞吐与积压\n');
  if (metrics) {
    const em=metrics.events_emitted_total||0, pr=metrics.events_processed_total||0, dr=metrics.events_dropped_total||0;
    const bl=Math.max(0,em-pr-dr);
    L.push('| 指标 | 值 | 状态 |'); L.push('|------|-----|------|');
    L.push(`| 事件发射 | ${em} | - |`);
    L.push(`| 事件处理 | ${pr} | - |`);
    L.push(`| 事件丢弃 | ${dr} | ${dr>0?'⚠️':'✅'} |`);
    L.push(`| 积压估算 | ${bl} | ${bl>10?'🔴':bl>0?'🟡':'🟢'} |`);
    L.push('');
  }

  if (events24h.length > 0) {
    const td={}, sd={};
    for (const e of events24h) { td[e.type||'?']=(td[e.type||'?']||0)+1; sd[e.source||'?']=(sd[e.source||'?']||0)+1; }
    L.push(`**事件文件 (24h): ${events24h.length} 条**\n`);
    L.push('Top 5 事件类型:');
    for (const [t,c] of Object.entries(td).sort((a,b)=>b[1]-a[1]).slice(0,5)) L.push(`- \`${t}\`: ${c}`);
    L.push('');
    L.push('按来源:');
    for (const [s,c] of Object.entries(sd).sort((a,b)=>b[1]-a[1])) L.push(`- \`${s}\`: ${c}`);
    L.push('');
  }

  L.push('### FeatureFlag 变更审计\n');
  const flags = readJsonFile(FLAGS_FILE);
  if (flags && typeof flags === 'object') {
    const entries=Object.entries(flags).filter(([_,v])=>typeof v==='boolean');
    const on=entries.filter(([_,v])=>v).length;
    L.push('| Flag | 状态 |'); L.push('|------|------|');
    for (const [n,v] of entries) L.push(`| \`${n}\` | ${v?'✅ ON':'❌ OFF'} |`);
    L.push('');
    L.push(`> 统计: ${on} ON / ${entries.length-on} OFF — 变更时间线: **待接入**`);
  } else { L.push('> **待接入** — flags.json 不可读'); }
  L.push('');

  L.push('### Cron 任务状态\n');
  const cronData = readJsonFile(CRON_JOBS_FILE);
  if (cronData && cronData.jobs && Array.isArray(cronData.jobs)) {
    L.push('| 任务 | 频率 | 状态 |'); L.push('|------|------|------|');
    for (const j of cronData.jobs) L.push(`| ${j.name} | ${j.schedule_human||j.schedule} | ${j.enabled?'✅':'❌'} |`);
  } else { L.push('> **待接入** — cron/jobs.json 不可读'); }
  L.push('');

  L.push('### 内存 / 进程健康度\n');
  try {
    const mem=process.memoryUsage(), sysMem=os.totalmem(), freeMem=os.freemem();
    L.push('| 指标 | 值 |'); L.push('|------|-----|');
    L.push(`| Node RSS | ${formatBytes(mem.rss)} |`);
    L.push(`| Heap Used | ${formatBytes(mem.heapUsed)} / ${formatBytes(mem.heapTotal)} |`);
    L.push(`| 系统总内存 | ${formatBytes(sysMem)} |`);
    L.push(`| 可用内存 | ${formatBytes(freeMem)} (${pct(freeMem,sysMem)}) |`);
    L.push(`| 负载 (1/5/15m) | ${os.loadavg().map(v=>v.toFixed(2)).join(' / ')} |`);
    L.push(`| 运行时长 | ${metrics?metrics.uptime_human||'N/A':'N/A'} |`);
  } catch(_) { L.push('> 无法获取进程内存信息'); }
  L.push('');

  if (healthCheck) {
    const si=healthCheck.status==='healthy'?'🟢':healthCheck.status==='degraded'?'🟡':'🔴';
    L.push(`### 组件健康: ${si} ${(healthCheck.status||'unknown').toUpperCase()}\n`);
    if (healthCheck.components) {
      L.push('| 组件 | 状态 | 详情 |'); L.push('|------|------|------|');
      for (const [n,c] of Object.entries(healthCheck.components)) {
        const ci=c.status==='up'?'✅':c.status==='degraded'?'⚠️':'❌';
        const d=c.details?(c.details.error||c.details.warning||'-'):'-';
        L.push(`| ${n} | ${ci} ${c.status} | ${d} |`);
      }
    }
  } else { L.push('### 组件健康\n> **待接入** — health.js 加载失败'); }
  L.push('');

  L.push('### 数据文件体检\n');
  const dfs = [
    { l: 'events.jsonl', p: EVENTS_FILE },
    { l: 'decisions.jsonl', p: DECISIONS_FILE },
    { l: 'metrics.jsonl', p: path.join(__dirname, 'metrics.jsonl') },
    { l: 'run-log.jsonl', p: PIPELINE_RUN_LOG },
  ];
  L.push('| 文件 | 大小 | 状态 |'); L.push('|------|------|------|');
  for (const f of dfs) {
    try {
      if (fs.existsSync(f.p)) {
        const st=fs.statSync(f.p);
        const warn=st.size>5*1048576?'⚠️ >5MB':st.size>1048576?'🟡 >1MB':'✅';
        L.push(`| ${f.l} | ${formatBytes(st.size)} | ${warn} |`);
      } else { L.push(`| ${f.l} | - | ❌ 不存在 |`); }
    } catch(_) { L.push(`| ${f.l} | - | ❌ 读取失败 |`); }
  }
  L.push(''); return L.join('\n');
}

// ═══ Main: 日报生成 ═══

function generateOpsDailyReport(options = {}) {
  const now = new Date();
  const since24h = new Date(now.getTime() - 24*60*60*1000);
  const dateStr = now.toISOString().slice(0, 10);

  // ─── Collect data ───
  const metricsModule = _loadMetrics();
  const metrics = metricsModule ? metricsModule.getMetrics() : null;

  const decLogger = _loadDecisionLogger();
  const decSummary = decLogger ? decLogger.summarize({ since: since24h.toISOString() }) : null;
  const decisions24h = decLogger ? decLogger.query({ since: since24h.toISOString(), limit: 500 }) : [];

  const events24h = readJsonl(EVENTS_FILE, { since: since24h.getTime() });
  const pipelineRuns = readJsonl(PIPELINE_RUN_LOG);

  let healthCheck = null;
  const healthModule = _loadHealth();
  if (healthModule) { try { healthCheck = healthModule.checkHealth(); } catch(_) {} }

  // ─── Build report ───
  const sections = [];

  sections.push(`# 📊 Agent 运营日报 — 五层仪表盘`);
  sections.push(`> 📅 日期: ${dateStr} | ⏰ 生成: ${now.toISOString()} | 窗口: 24h`);
  sections.push('');

  // Summary card
  sections.push('## 📋 总览\n');
  const summaryItems = [];
  if (metrics) {
    summaryItems.push(`- 🧠 意图请求: **${metrics.intent_requests_total}** (命中率: ${metrics.intent_requests_total>0?pct(metrics.intent_requests_total-metrics.intent_no_match_total,metrics.intent_requests_total):'N/A'})`);
    summaryItems.push(`- ⚖️ 规则评估: **${metrics.rules_evaluated_total}** (匹配率: ${metrics.rules_evaluated_total>0?metrics.rules_match_rate.toFixed(1)+'%':'N/A'})`);
    summaryItems.push(`- ⚡ 分发任务: **${metrics.dispatch_total}** (成功率: ${metrics.dispatch_total>0?pct(metrics.dispatch_success,metrics.dispatch_total):'N/A'})`);
    summaryItems.push(`- 🔄 流水线: **${metrics.pipeline_runs_total}** 次运行 | 熔断: ${metrics.pipeline_breaker_trips}`);
    summaryItems.push(`- 📨 事件: 发射 ${metrics.events_emitted_total} / 处理 ${metrics.events_processed_total} / 丢弃 ${metrics.events_dropped_total}`);
  } else {
    summaryItems.push('- ⚠️ 运行时指标不可用 (metrics.js 未加载)');
  }
  if (decSummary) summaryItems.push(`- 📝 决策记录: **${decSummary.total}** (24h) | 置信度: ${decSummary.avg_confidence!==null?decSummary.avg_confidence.toFixed(3):'N/A'}`);
  summaryItems.push(`- 📄 事件文件(24h): **${events24h.length}** 条`);
  sections.push(summaryItems.join('\n'));
  sections.push('');

  // Five layers
  sections.push(generateL1Intent(metrics, events24h));
  sections.push(generateL2Decision(metrics, decSummary, decisions24h));
  sections.push(generateL3Execution(metrics, pipelineRuns));
  sections.push(generateL4Effect(metrics, events24h, decSummary));
  sections.push(generateL5Health(metrics, events24h, healthCheck));

  // Pending items summary
  sections.push('## 📝 待接入指标汇总\n');
  sections.push('以下指标标记为"待接入"，需后续迭代补齐数据源:\n');
  sections.push('| 层级 | 待接入指标 | 建议数据源 |');
  sections.push('|------|----------|-----------|');
  sections.push('| L1 意图 | IC分布趋势(hourly) | 意图滑窗统计模块 |');
  sections.push('| L3 执行 | Token消耗热力图 | LLM调用层token计量 |');
  sections.push('| L4 效果 | 纠偏频次 | 用户交互埋点 |');
  sections.push('| L4 效果 | 重复指令率 | 会话级去重检测 |');
  sections.push('| L5 系统 | FeatureFlag变更时间线 | flags.json变更事件 |');
  sections.push('| L5 系统 | 会话/连接数 | OpenClaw运行时状态API |');
  sections.push('');

  sections.push('---');
  sections.push(`*Generated by ops-daily-report.js | ${now.toISOString()}*`);

  return sections.join('\n');
}

// ─── CLI ─────────────────────────────────────────────────────────

if (require.main === module) {
  const report = generateOpsDailyReport();

  // Ensure reports dir
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

  // Determine output file
  const outFile = process.argv[2] || path.join(REPORTS_DIR, `ops-dashboard-${new Date().toISOString().slice(0,10)}.md`);
  fs.writeFileSync(outFile, report, 'utf8');
  console.log(`[ops-daily-report] Written to ${outFile}`);
  console.log(`[ops-daily-report] Report length: ${report.length} chars`);
}

module.exports = { generateOpsDailyReport };
