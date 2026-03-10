import fs from 'fs';
import { chromium } from 'playwright';

const input = '/root/.openclaw/workspace/reports/diagrams/global-closed-loop-redo.mmd';
const output = '/root/.openclaw/workspace/reports/diagrams/global-closed-loop-redo.png';
const def = fs.readFileSync(input, 'utf8');

const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { margin: 0; background: white; font-family: Arial, sans-serif; }
    #container { padding: 24px; width: max-content; }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
</head>
<body>
  <div id="container">
    <pre class="mermaid">${def.replace(/</g,'&lt;')}</pre>
  </div>
  <script>
    mermaid.initialize({ startOnLoad: true, theme: 'default', flowchart: { useMaxWidth: false, htmlLabels: true } });
  </script>
</body>
</html>`;

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 2200, height: 1600 }, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
const el = await page.locator('#container').first();
await el.screenshot({ path: output });
await browser.close();
console.log(output);
