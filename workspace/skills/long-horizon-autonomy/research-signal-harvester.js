#!/usr/bin/env node
// research-signal-harvester.js
// 每天 07:00 运行：抓取AI/系统/产品领域的最新研究信号，存入 reports/research-signals/
// 信号源：arXiv cs.AI, HuggingFace papers, GitHub trending (通过公开RSS/JSON API)

const https = require('https');
const fs = require('fs');
const path = require('path');

const WORKSPACE = '/root/.openclaw/workspace';
const SIGNAL_DIR = path.join(WORKSPACE, 'reports/research-signals');
const KNOWLEDGE_BASE = path.join(WORKSPACE, 'reports/research-knowledge-base.jsonl');
const QUALITY_BACKLOG = path.join(WORKSPACE, 'reports/quality-issues-backlog.jsonl');
fs.mkdirSync(SIGNAL_DIR, { recursive: true });

const shanghaiDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
const dateStr = shanghaiDate.getFullYear() + '-' + String(shanghaiDate.getMonth() + 1).padStart(2, '0') + '-' + String(shanghaiDate.getDate()).padStart(2, '0');
const outFile = path.join(SIGNAL_DIR, `signals-${dateStr}.md`);
const briefFile = path.join(SIGNAL_DIR, `daily-brief-${dateStr}.md`);

// 如果今天已抓取，跳过
if (fs.existsSync(outFile)) {
  console.log(`[${dateStr}] research-signal-harvester: already harvested today, skip`);
  process.exit(0);
}

function fetchJson(url, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), timeout);
    https.get(url, { headers: { 'User-Agent': 'openclaw-harvester/1.0' } }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => { clearTimeout(timer); try { resolve(JSON.parse(data)); } catch { resolve(null); } });
    }).on('error', e => { clearTimeout(timer); reject(e); });
  });
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => {
      try { return JSON.parse(l); } catch { return null; }
    })
    .filter(Boolean);
}

function writeDailyBrief(signals, errors, qualityIssues) {
  const lines = [
    `# 研究信号简报 ${dateStr}`,
    `_生成时间: ${new Date().toISOString()}_`,
    '',
    '## 今日要点',
    `- 研究信号总数：${signals.length}`,
    `- 数据源健康：${errors.length === 0 ? '正常' : `部分异常（${errors.length}项）`}`,
    `- 质量痛点对齐：${qualityIssues.length} 条（来自 quality-issues-backlog）`,
    ''
  ];

  const topSignals = signals.slice(0, 5);
  lines.push('## Top Signals', '');
  if (topSignals.length === 0) {
    lines.push('- 今日暂无可用信号', '');
  } else {
    topSignals.forEach((s, i) => {
      lines.push(`${i + 1}. **${s.title}** (${s.source})`);
      lines.push(`   - ${s.url}`);
      if (s.summary) lines.push(`   - ${s.summary}`);
    });
    lines.push('');
  }

  lines.push('## 系统痛点对齐建议', '');
  if (qualityIssues.length === 0) {
    lines.push('- 未发现可读取的质量问题积压，建议补充 reports/quality-issues-backlog.jsonl', '');
  } else {
    qualityIssues.slice(0, 10).forEach((q, i) => {
      const title = q.title || q.issue || q.problem || q.type || `issue-${i + 1}`;
      lines.push(`- ${title}`);
    });
    lines.push('');
  }

  if (errors.length > 0) {
    lines.push('## 采集异常', '');
    errors.forEach(e => lines.push(`- ${e}`));
    lines.push('');
  }

  lines.push('---', '_由 research-signal-harvester.js 自动生成_');
  fs.writeFileSync(briefFile, lines.join('\n'));
}

function appendKnowledge(signals, qualityIssues) {
  const payload = {
    timestamp: new Date().toISOString(),
    date: dateStr,
    source: 'research-signal-harvester',
    signals_count: signals.length,
    key_signals: signals.slice(0, 5).map(s => ({
      source: s.source,
      title: s.title,
      url: s.url,
      summary: s.summary
    })),
    quality_alignment: qualityIssues.slice(0, 10).map(q => q.title || q.issue || q.problem || q.type).filter(Boolean)
  };
  fs.appendFileSync(KNOWLEDGE_BASE, JSON.stringify(payload) + '\n');
}

async function main() {
  const signals = [];
  const errors = [];
  const qualityIssues = readJsonl(QUALITY_BACKLOG);

  // 1. HuggingFace Daily Papers API
  try {
    const hf = await fetchJson('https://huggingface.co/api/daily_papers?limit=5');
    if (Array.isArray(hf)) {
      hf.slice(0, 5).forEach(p => {
        signals.push({
          source: 'HuggingFace Daily Papers',
          title: p.paper?.title || p.title || 'Unknown',
          url: `https://huggingface.co/papers/${p.paper?.id || p.id || ''}`,
          summary: (p.paper?.summary || p.summary || '').slice(0, 200)
        });
      });
    }
  } catch (e) { errors.push(`HuggingFace: ${e.message}`); }

  // 2. GitHub Trending (via GH API - top AI repos updated today)
  try {
    const gh = await fetchJson(
      'https://api.github.com/search/repositories?q=topic:artificial-intelligence+pushed:>' +
      new Date(Date.now() - 86400000).toISOString().split('T')[0] +
      '&sort=stars&order=desc&per_page=5',
      15000
    );
    if (gh?.items) {
      gh.items.slice(0, 5).forEach(r => {
        signals.push({
          source: 'GitHub Trending AI',
          title: r.full_name,
          url: r.html_url,
          summary: (r.description || '').slice(0, 200)
        });
      });
    }
  } catch (e) { errors.push(`GitHub: ${e.message}`); }

  // 写入主报告
  const lines = [
    `# 研究信号日报 ${dateStr}`,
    `_采集时间: ${new Date().toISOString()}_`,
    `_信号数量: ${signals.length}_`,
    ''
  ];

  if (signals.length > 0) {
    const bySource = {};
    signals.forEach(s => {
      if (!bySource[s.source]) bySource[s.source] = [];
      bySource[s.source].push(s);
    });

    Object.entries(bySource).forEach(([src, items]) => {
      lines.push(`## ${src}`, '');
      items.forEach(item => {
        lines.push(`### ${item.title}`);
        lines.push(`🔗 ${item.url}`);
        if (item.summary) lines.push(`> ${item.summary}`);
        lines.push('');
      });
    });
  } else {
    lines.push('_今日无新信号（网络不通或API限流）_', '');
  }

  if (errors.length > 0) {
    lines.push('## ⚠️ 采集错误', '');
    errors.forEach(e => lines.push(`- ${e}`));
    lines.push('');
  }

  lines.push('---', '_由 research-signal-harvester.js 自动生成_');
  fs.writeFileSync(outFile, lines.join('\n'));

  // 生成简报 + 知识沉淀
  writeDailyBrief(signals, errors, qualityIssues);
  appendKnowledge(signals, qualityIssues);

  console.log(`[${dateStr}] research-signal-harvester: ${signals.length} signals → ${outFile}`);
  console.log(`[${dateStr}] daily-brief generated → ${briefFile}`);
  console.log(`[${dateStr}] knowledge appended → ${KNOWLEDGE_BASE}`);
}

main().catch(e => {
  fs.writeFileSync(outFile, `# 研究信号日报 ${dateStr}\n\n_采集失败: ${e.message}_\n`);
  console.error(`[${dateStr}] research-signal-harvester ERROR:`, e.message);
  process.exit(1);
});