#!/usr/bin/env node
// research-signal-harvester.js
// 每天 07:00 运行：抓取AI/系统/产品领域的最新研究信号，存入 reports/research-signals/
// 信号源：arXiv cs.AI, HuggingFace papers, GitHub trending (通过公开RSS/JSON API)

const https = require('https');
const fs = require('fs');
const path = require('path');

const WORKSPACE = '/root/.openclaw/workspace';
const SIGNAL_DIR = path.join(WORKSPACE, 'reports/research-signals');
fs.mkdirSync(SIGNAL_DIR, { recursive: true });

const dateStr = new Date().toISOString().split('T')[0];
const outFile = path.join(SIGNAL_DIR, `signals-${dateStr}.md`);

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

function fetchText(url, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), timeout);
    https.get(url, { headers: { 'User-Agent': 'openclaw-harvester/1.0' } }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => { clearTimeout(timer); resolve(data); });
    }).on('error', e => { clearTimeout(timer); reject(e); });
  });
}

async function main() {
  const signals = [];
  const errors = [];

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

  // 写入报告
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
  console.log(`[${dateStr}] research-signal-harvester: ${signals.length} signals → ${outFile}`);
}

main().catch(e => {
  fs.writeFileSync(outFile, `# 研究信号日报 ${dateStr}\n\n_采集失败: ${e.message}_\n`);
  console.error(`[${dateStr}] research-signal-harvester ERROR:`, e.message);
  process.exit(1);
});
