#!/usr/bin/env node
/**
 * screenshot-dashboard.js
 *
 * Uses Puppeteer to render dashboard/snapshot.html → dashboard/screenshot.png
 *
 * Usage:
 *   node dashboard/screenshot-dashboard.js
 *   node dashboard/screenshot-dashboard.js --width 1400 --height 900
 */

'use strict';

const path = require('path');

const WORKSPACE = process.env.OPENCLAW_WORKSPACE || path.resolve(__dirname, '..');
const SNAPSHOT = path.join(WORKSPACE, 'dashboard', 'snapshot.html');
const OUTPUT = path.join(WORKSPACE, 'dashboard', 'screenshot.png');

function parseFlags(argv) {
  const f = { width: 1200, height: 900 };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--width' && argv[i+1])  f.width  = parseInt(argv[++i], 10);
    if (argv[i] === '--height' && argv[i+1]) f.height = parseInt(argv[++i], 10);
    if (argv[i] === '--output' && argv[i+1]) f.output = argv[++i];
  }
  return f;
}

(async () => {
  const flags = parseFlags(process.argv);
  const outputPath = flags.output || OUTPUT;

  let puppeteer;
  try { puppeteer = require('puppeteer'); }
  catch { puppeteer = require('/usr/lib/node_modules/puppeteer'); }
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: flags.width, height: flags.height, deviceScaleFactor: 2 });
  await page.goto(`file://${SNAPSHOT}`, { waitUntil: 'networkidle0', timeout: 15000 });

  // Wait a moment for rendering
  await new Promise(r => setTimeout(r, 500));

  // Get actual body height for full page capture
  const bodyHeight = await page.evaluate(() => document.body.scrollHeight);

  await page.screenshot({
    path: outputPath,
    fullPage: true,
    type: 'png',
  });

  await browser.close();
  console.log(`✅ Screenshot: ${path.relative(WORKSPACE, outputPath)}`);
  console.log(`   ${flags.width}x${bodyHeight}@2x`);
})();
