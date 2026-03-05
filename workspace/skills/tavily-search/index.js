const https = require('https');
const { SECRETS_DIR } = require('../_shared/paths.js');

const API_KEY = process.env.TAVILY_API_KEY || (() => {
  try {
    const content = require('fs').readFileSync(require('path').join(SECRETS_DIR, 'tavily.env'), 'utf8');
    const m = content.match(/^TAVILY_API_KEY=(.+)$/m);
    return m ? m[1].trim() : null;
  } catch (_) { return null; }
})();

async function search(query, options = {}) {
  const body = JSON.stringify({
    api_key: API_KEY,
    query,
    max_results: options.maxResults || 5,
    search_depth: options.depth || 'basic',
    include_answer: options.includeAnswer !== false,
    include_raw_content: false,
    topic: options.topic || 'general'
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.tavily.com',
      path: '/search',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.results) {
            resolve({
              answer: json.answer || '',
              results: json.results.map(r => ({
                title: r.title,
                url: r.url,
                content: r.content,
                score: r.score
              }))
            });
          } else {
            reject(new Error(json.message || JSON.stringify(json).substring(0, 200)));
          }
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

if (require.main === module) {
  const query = process.argv[2];
  if (!query) { console.log('用法: node index.js "搜索内容"'); process.exit(0); }
  search(query, { maxResults: 3 })
    .then(r => {
      if (r.answer) console.log('📋 摘要:', r.answer, '\n');
      r.results.forEach((x, i) => console.log(`${i+1}. ${x.title}\n   ${x.url}\n   ${x.content.substring(0,150)}...\n`));
    })
    .catch(e => console.error('错误:', e.message));
}

module.exports = { search };
