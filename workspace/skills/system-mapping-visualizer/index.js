const fs = require('fs');
const path = require('path');

function wrapMermaid(body, title = '系统图') {
  return `---\ntitle: ${title}\n---\n%%{init: {"theme": "base", "themeVariables": {
    "background": "#ffffff",
    "primaryColor": "#DCEBFF",
    "primaryTextColor": "#1F2937",
    "primaryBorderColor": "#5B8FF9",
    "lineColor": "#6B7280",
    "secondaryColor": "#E8F5E9",
    "tertiaryColor": "#FFF3D6",
    "fontFamily": "Arial, PingFang SC, Microsoft YaHei, sans-serif",
    "fontSize": "16px",
    "clusterBkg": "#F8FAFC",
    "clusterBorder": "#CBD5E1"
}} }%%\n${body}\n`;
}

function saveMermaid(outPath, mermaid, title) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, wrapMermaid(mermaid, title), 'utf8');
}

module.exports = { wrapMermaid, saveMermaid };
