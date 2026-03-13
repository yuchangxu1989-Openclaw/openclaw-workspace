const fs = require('fs');
const path = require('path');

const ANCHOR_PATH = '/root/.openclaw/workspace/CAPABILITY-ANCHOR.md';

const plugin = {
  id: "capability-injection",
  name: "Capability Injection",
  description: "每轮注入Agent能力锚点到system prompt",
  register(api) {
    let cache = null;
    let cacheMtime = 0;

    function loadContent() {
      try {
        const stat = fs.statSync(ANCHOR_PATH);
        if (cache && stat.mtimeMs === cacheMtime) return cache;
        const raw = fs.readFileSync(ANCHOR_PATH, 'utf-8');
        // 压缩：去掉markdown表格边框线、多余空行，保留核心内容
        cache = raw
          .replace(/\|[-:]+\|[-:|\s]+\|/g, '')  // 去表格分隔线
          .replace(/\n{3,}/g, '\n\n')            // 多余空行
          .trim();
        cacheMtime = stat.mtimeMs;
        return cache;
      } catch (e) {
        api.logger.warn('capability-injection: failed to read CAPABILITY-ANCHOR.md: ' + e.message);
        return null;
      }
    }

    api.on("before_agent_start", async (event) => {
      const content = loadContent();
      if (!content) return {};
      return {
        systemPrompt: '\n\n## Agent能力锚点（自动注入）\n' + content
      };
    });
  }
};
module.exports = plugin;
