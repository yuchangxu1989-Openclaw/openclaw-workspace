#!/usr/bin/env node
/**
 * 架构图生成器 - 标准化Mermaid图输出
 * 
 * 输出规范：
 * - 编号：图 X.Y 格式
 * - 标题居中
 * - 高清PNG (1200px宽)
 * - 统一配色主题
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const THEME_CONFIG = {
  theme: 'base',
  themeVariables: {
    primaryColor: '#4A90D9',
    primaryTextColor: '#fff',
    primaryBorderColor: '#2C5F8A',
    lineColor: '#5C7A99',
    secondaryColor: '#F5F5F5',
    tertiaryColor: '#E8F4FD',
    fontSize: '14px'
  }
};

function generateDiagram(mermaidCode, outputPath, options = {}) {
  const { width = 1200, height = 800, label = '', format = 'png' } = options;
  
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'diagram-'));
  const mmdFile = path.join(tmpDir, 'input.mmd');
  const configFile = path.join(tmpDir, 'config.json');
  
  try {
    fs.writeFileSync(mmdFile, mermaidCode);
    fs.writeFileSync(configFile, JSON.stringify(THEME_CONFIG));
    
    const puppeteerConfig = path.join(tmpDir, 'puppeteer.json');
    fs.writeFileSync(puppeteerConfig, JSON.stringify({ args: ['--no-sandbox', '--disable-setuid-sandbox'] }));
    
    execSync(
      `mmdc -i "${mmdFile}" -o "${outputPath}" -w ${width} -H ${height} -c "${configFile}" -p "${puppeteerConfig}" --backgroundColor white`,
      { timeout: 30000, stdio: 'pipe' }
    );
    
    const stat = fs.statSync(outputPath);
    console.log(`✅ ${label || path.basename(outputPath)} (${(stat.size/1024).toFixed(0)}KB)`);
    return outputPath;
    
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true }); } catch(e) {}
  }
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log('用法: node diagram.js <input.mmd> <output.png> [--label "图 1.1：xxx"]');
    process.exit(1);
  }
  
  const code = fs.readFileSync(args[0], 'utf-8');
  const labelIdx = args.indexOf('--label');
  const label = labelIdx >= 0 ? args[labelIdx + 1] : '';
  
  generateDiagram(code, args[1], { label });
}

module.exports = { generateDiagram, THEME_CONFIG };
