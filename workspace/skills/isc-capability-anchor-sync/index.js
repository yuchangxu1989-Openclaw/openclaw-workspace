#!/usr/bin/env node
/**
 * 能力锚点自动同步器 v3
 * 全量扫描 skills/ + ISC规则 + pip + npm全局 + workspace工具 + 系统CLI
 * 动态生成 CAPABILITY-ANCHOR.md，按来源分类
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const _require = createRequire(import.meta.url);
const { WORKSPACE, SKILLS_DIR } = _require('../shared/paths');

const CONFIG = {
  rulesDir: path.join(SKILLS_DIR, 'isc-core/rules'),
  anchorFile: path.join(WORKSPACE, 'CAPABILITY-ANCHOR.md'),
  snapshotFile: path.join(WORKSPACE, '.capability-snapshot.json'),
  skillsDir: SKILLS_DIR
};

// ── pip噪声过滤：排除已知的基础依赖/系统包 ──
const PIP_BLACKLIST = new Set([
  'pip', 'setuptools', 'wheel', 'distribute',
  // 系统/Ubuntu底层
  'apt-clone', 'command-not-found', 'dbus-python', 'distro', 'distro-info',
  'launchpadlib', 'lazr.restfulclient', 'lazr.uri', 'netifaces', 'netaddr',
  'pyserial', 'python-apt', 'python-debian', 'pyOpenSSL', 'PyGObject',
  'service-identity', 'ssh-import-id', 'systemd-python', 'ufw',
  'unattended-upgrades', 'ubuntu-drivers-common', 'ubuntu-pro-client',
  'xkit', 'sos', 'wadllib',
  // 纯依赖库（被其他包拉入，本身无独立能力）
  'aiohappyeyeballs', 'aiohttp', 'aiosignal', 'annotated-types', 'anyio',
  'attrs', 'Automat', 'Babel', 'bcc', 'blinker', 'cbor2',
  'certifi', 'cfgv', 'chardet', 'charset-normalizer', 'click', 'colorama',
  'configobj', 'constantly', 'contourpy', 'cycler', 'defusedxml',
  'dill', 'distlib', 'filelock', 'fonttools', 'frozenlist', 'fsspec',
  'h11', 'hf-xet', 'hpack', 'httpcore', 'httplib2', 'hyperframe',
  'hyperlink', 'identify', 'idna', 'incremental', 'Jinja2', 'jiter',
  'jsonpatch', 'jsonpointer', 'jsonschema', 'kiwisolver',
  'markdown-it-py', 'MarkupSafe', 'mdurl', 'multidict',
  'nodeenv', 'oauthlib', 'packaging', 'platformdirs', 'propcache',
  'ptyprocess', 'pyasn1', 'pyasn1-modules', 'pydantic', 'pydantic_core',
  'Pygments', 'PyHamcrest', 'PyJWT', 'pyparsing', 'pyrsistent',
  'python-dateutil', 'python-dotenv', 'pytz', 'PyYAML',
  'shellingham', 'six', 'smmap', 'sniffio', 'soupsieve',
  'synchronicity', 'toml', 'tqdm', 'types-certifi', 'types-toml',
  'typing_extensions', 'typing-inspection', 'urllib3', 'yarl',
  'zope.interface', 'cryptography', 'bcrypt',
]);

// ── pip白名单：这些包必须出现（有实际能力价值） ──
const PIP_WHITELIST = new Set([
  'youtube-transcript-api', 'yt-dlp', 'playwright', 'anthropic',
  'pandas', 'numpy', 'matplotlib', 'pillow', 'lxml', 'beautifulsoup4',
  'requests', 'httpx', 'rich', 'typer', 'pexpect', 'protobuf',
  'PyPDF2', 'python-pptx', 'python-magic', 'xlsxwriter', 'pyarrow',
  'git-filter-repo', 'uv', 'tenacity', 'unidiff', 'xxhash',
  'python-discovery', 'annotated-doc', 'docstring_parser', 'fastcore',
  'Twisted',
]);

// ── npm全局噪声过滤 ──
const NPM_BLACKLIST = new Set([
  'corepack', 'npm',
]);

// ── 系统CLI工具检测列表 ──
const SYSTEM_CLI_TOOLS = [
  { cmd: 'yt-dlp', desc: '视频/音频下载工具' },
  { cmd: 'ffmpeg', desc: '音视频转码/处理' },
  { cmd: 'ffprobe', desc: '音视频信息探测' },
  { cmd: 'playwright', desc: '浏览器自动化' },
  { cmd: 'curl', desc: 'HTTP请求工具' },
  { cmd: 'wget', desc: '文件下载工具' },
  { cmd: 'jq', desc: 'JSON处理工具' },
  { cmd: 'git', desc: '版本控制' },
  { cmd: 'docker', desc: '容器运行时' },
  { cmd: 'python3', desc: 'Python 3 解释器' },
  { cmd: 'node', desc: 'Node.js 运行时' },
  { cmd: 'sqlite3', desc: 'SQLite数据库CLI' },
  { cmd: 'rsync', desc: '文件同步工具' },
  { cmd: 'ssh', desc: 'SSH客户端' },
  { cmd: 'pandoc', desc: '文档格式转换' },
  { cmd: 'convert', desc: 'ImageMagick图像处理' },
  { cmd: 'chromium', desc: 'Chromium浏览器' },
  { cmd: 'chromium-browser', desc: 'Chromium浏览器' },
  { cmd: 'uv', desc: 'Python包管理器(快速)' },
];

class CapabilityAnchorSync {
  constructor() {
    this.zhipuRoutes = [];
    this.allSkills = [];
    this.searchTools = [];
    this.openclawNative = [];
    this.pipPackages = [];
    this.npmGlobalPackages = [];
    this.workspaceTools = [];
    this.systemCLITools = [];
    this.previousCapabilities = null; // for diff
  }

  // ── 加载上次的能力快照用于diff ──
  loadPreviousSnapshot() {
    try {
      const data = JSON.parse(fs.readFileSync(CONFIG.snapshotFile, 'utf8'));
      this.previousCapabilities = new Set(data.capabilities || []);
    } catch {
      this.previousCapabilities = new Set();
    }
  }

  // ── ISC规则加载（保持原逻辑） ──
  loadFromISCRules() {
    if (!fs.existsSync(CONFIG.rulesDir)) return;
    const files = fs.readdirSync(CONFIG.rulesDir).filter(f => f.endsWith('.json'));
    for (const f of files) {
      try {
        const rule = JSON.parse(fs.readFileSync(path.join(CONFIG.rulesDir, f), 'utf8'));
        if (rule.type === 'auto_router' && rule.routes) {
          for (const route of rule.routes) {
            this.zhipuRoutes.push({
              name: route.skill,
              model: route.model,
              trigger: route.trigger,
              input: route.input_modal,
              output: route.output_modal,
              priority: route.priority,
              description: route.description || ''
            });
          }
        }
      } catch (e) { /* skip */ }
    }
  }

  // ── skills/目录全量扫描（保持原逻辑） ──
  scanAllSkills() {
    if (!fs.existsSync(CONFIG.skillsDir)) return;
    const findSkillDirs = (base) => {
      const results = [];
      const walk = (dir) => {
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        const hasSkillMd = entries.some(e => e.isFile() && e.name === 'SKILL.md');
        if (hasSkillMd) results.push(dir);
        for (const e of entries) {
          if (e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.') && e.name !== 'node_modules') {
            walk(path.join(dir, e.name));
          }
        }
      };
      walk(base);
      return results.sort();
    };

    for (const skillDir of findSkillDirs(CONFIG.skillsDir)) {
      const skill = path.relative(CONFIG.skillsDir, skillDir);
      const skillMd = path.join(skillDir, 'SKILL.md');
      const indexJs = path.join(skillDir, 'index.js');
      const indexCjs = path.join(skillDir, 'index.cjs');
      const info = {
        name: skill,
        path: `skills/${skill}/`,
        hasSkillMd: fs.existsSync(skillMd),
        hasIndex: fs.existsSync(indexJs) || fs.existsSync(indexCjs),
        description: '',
        category: 'core'
      };
      if (info.hasSkillMd) {
        const content = fs.readFileSync(skillMd, 'utf8');
        const descMatch = content.match(/description:\s*(.+)/);
        if (descMatch) info.description = descMatch[1].trim();
      }
      if (this.zhipuRoutes.find(r => r.name === skill)) {
        info.category = 'zhipu_skill';
      } else if (skill.includes('search') || skill.includes('fetch') || skill.includes('crawler')) {
        info.category = 'search';
      }
      this.allSkills.push(info);
    }
  }

  // ── 搜索工具检测（保持原逻辑） ──
  detectSearchTools() {
    for (const skill of this.allSkills) {
      if (skill.category === 'search') {
        const skillMd = path.join(CONFIG.skillsDir, skill.name, 'SKILL.md');
        if (fs.existsSync(skillMd)) {
          const content = fs.readFileSync(skillMd, 'utf8');
          const envMatch = content.match(/环境变量[：:]\s*(\S+)|TAVILY_API_KEY|SEARCH_API_KEY/);
          skill.envVar = envMatch ? envMatch[0] : '';
        }
        this.searchTools.push(skill);
      }
    }
    this.openclawNative = [
      { name: 'web_search', type: 'Brave Search API', note: '需配置BRAVE_API_KEY，当前未配置' },
      { name: 'web_fetch', type: 'URL内容提取', note: '抓取网页内容转markdown，已可用' }
    ];
  }

  // ══════════════════════════════════════════
  //  v3 新增扫描源
  // ══════════════════════════════════════════

  // ── pip包扫描 ──
  scanPipPackages() {
    try {
      const raw = execSync('pip list --format=json 2>/dev/null', { encoding: 'utf8', timeout: 15000 });
      const all = JSON.parse(raw);
      this.pipPackages = all.filter(p => {
        if (PIP_WHITELIST.has(p.name)) return true;
        if (PIP_BLACKLIST.has(p.name)) return false;
        // 启发式：排除纯小写单词且名字很短的（多为底层依赖）
        // 保留含连字符的（通常是独立工具包）
        return p.name.includes('-') || p.name.length > 8;
      }).sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) {
      console.warn('[CapabilitySync v3] pip扫描失败:', e.message);
    }
  }

  // ── npm全局包扫描 ──
  scanNpmGlobalPackages() {
    try {
      const raw = execSync('npm list -g --json --depth=0 2>/dev/null', { encoding: 'utf8', timeout: 15000 });
      const parsed = JSON.parse(raw);
      const deps = parsed.dependencies || {};
      this.npmGlobalPackages = Object.entries(deps)
        .filter(([name]) => !NPM_BLACKLIST.has(name))
        .map(([name, info]) => ({ name, version: info.version || '?' }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) {
      console.warn('[CapabilitySync v3] npm全局扫描失败:', e.message);
    }
  }

  // ── workspace工具扫描 ──
  scanWorkspaceTools() {
    const entryFiles = ['main.py', 'main.js', 'app.py', 'index.py', 'cli.py'];
    const scanDirs = [WORKSPACE];
    // 也扫描 apps/ 和 tools/ 子目录
    for (const sub of ['apps', 'tools']) {
      const d = path.join(WORKSPACE, sub);
      if (fs.existsSync(d)) scanDirs.push(d);
    }

    const seen = new Set();
    for (const base of scanDirs) {
      let entries;
      try { entries = fs.readdirSync(base, { withFileTypes: true }); } catch { continue; }
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'skills') continue;
        const dir = path.join(base, e.name);
        const relPath = path.relative(WORKSPACE, dir);
        if (seen.has(relPath)) continue;

        // 检查是否有入口文件
        for (const ef of entryFiles) {
          if (fs.existsSync(path.join(dir, ef))) {
            seen.add(relPath);
            // 尝试读取README或描述
            let desc = '';
            for (const readme of ['README.md', 'readme.md', 'README.txt']) {
              const rp = path.join(dir, readme);
              if (fs.existsSync(rp)) {
                const content = fs.readFileSync(rp, 'utf8');
                const firstLine = content.split('\n').find(l => l.trim() && !l.startsWith('#'));
                if (firstLine) desc = firstLine.trim().slice(0, 100);
                break;
              }
            }
            this.workspaceTools.push({
              name: e.name,
              path: relPath,
              entry: ef,
              description: desc
            });
            break;
          }
        }
      }
    }
  }

  // ── 系统CLI工具检测 ──
  scanSystemCLITools() {
    for (const tool of SYSTEM_CLI_TOOLS) {
      try {
        const whichResult = execSync(`which ${tool.cmd} 2>/dev/null`, { encoding: 'utf8', timeout: 5000 }).trim();
        if (whichResult) {
          let version = '';
          try {
            version = execSync(`${tool.cmd} --version 2>&1 | head -1`, { encoding: 'utf8', timeout: 5000 }).trim();
            // 截断过长的版本信息
            if (version.length > 80) version = version.slice(0, 80) + '...';
          } catch { /* some tools don't support --version */ }
          this.systemCLITools.push({
            cmd: tool.cmd,
            path: whichResult,
            version,
            desc: tool.desc
          });
        }
      } catch { /* not installed */ }
    }
  }

  // ── 变更检测 ──
  detectChanges(currentNames) {
    const prev = this.previousCapabilities;
    const added = [];
    const removed = [];
    for (const name of currentNames) {
      if (!prev.has(name)) added.push(name);
    }
    for (const name of prev) {
      if (!currentNames.has(name)) removed.push(name);
    }
    return { added, removed };
  }

  // ── 生成文档 ──
  generateDoc() {
    const lines = [];
    const now = new Date().toLocaleString('zh-CN');
    const zhipuRouteNames = new Set(this.zhipuRoutes.map(r => r.name));

    const totalCapabilities = this.allSkills.length + this.pipPackages.length
      + this.npmGlobalPackages.length + this.workspaceTools.length + this.systemCLITools.length;

    lines.push('# 系统能力锚点 - 根治遗忘');
    lines.push('# 自动生成 — 由 isc-capability-anchor-sync v3 全量扫描生成');
    lines.push('');
    lines.push(`> **生成时间**: ${now}`);
    lines.push(`> **技能总数**: ${this.allSkills.length} | **pip包**: ${this.pipPackages.length} | **npm全局**: ${this.npmGlobalPackages.length} | **workspace工具**: ${this.workspaceTools.length} | **系统CLI**: ${this.systemCLITools.length}`);
    lines.push(`> **ISC路由**: ${this.zhipuRoutes.length} | **能力总计**: ${totalCapabilities}`);
    lines.push('');

    // === 🟡 智谱多模态（ISC路由） ===
    if (this.zhipuRoutes.length > 0) {
      lines.push('## 🟡 智谱多模态能力矩阵（ISC 规则自动生成）');
      lines.push('');
      for (const cap of this.zhipuRoutes) {
        lines.push(`### ${cap.name}`);
        lines.push(`- **模型**: ${cap.model}`);
        if (cap.trigger) lines.push(`- **触发词**: ${Array.isArray(cap.trigger) ? cap.trigger.join(', ') : cap.trigger}`);
        if (cap.input) lines.push(`- **输入**: ${Array.isArray(cap.input) ? cap.input.join(', ') : cap.input}`);
        if (cap.output) lines.push(`- **输出**: ${Array.isArray(cap.output) ? cap.output.join(', ') : cap.output}`);
        if (cap.priority) lines.push(`- **优先级**: ${cap.priority}`);
        if (cap.description) lines.push(`- **说明**: ${cap.description}`);
        const skillEntry = this.allSkills.find(s => s.name === cap.name);
        if (skillEntry) lines.push(`- **技能路径**: ${skillEntry.path}`);
        lines.push('');
      }
    }

    // === 🟡 智谱技能（无ISC路由） ===
    const zhipuSkillsNoRoute = this.allSkills.filter(s =>
      (s.name.startsWith('glm-') || s.name.startsWith('cog') || s.name.startsWith('zhipu-'))
      && !zhipuRouteNames.has(s.name)
    );
    if (zhipuSkillsNoRoute.length > 0) {
      lines.push('### 智谱技能（无ISC路由，需手动调用）');
      lines.push('');
      for (const s of zhipuSkillsNoRoute) {
        lines.push(`- **${s.name}**: ${s.path}${s.description ? ' — ' + s.description : ''}`);
      }
      lines.push('');
    }

    // === 🔵 搜索与信息获取 ===
    lines.push('## 🔵 搜索与信息获取');
    lines.push('');
    for (const s of this.searchTools) {
      lines.push(`### ${s.name}`);
      lines.push(`- **路径**: ${s.path}`);
      if (s.description) lines.push(`- **说明**: ${s.description}`);
      if (s.envVar) lines.push(`- **环境变量**: ${s.envVar}`);
      lines.push('');
    }
    for (const n of this.openclawNative) {
      lines.push(`### ${n.name}（OpenClaw原生）`);
      lines.push(`- **类型**: ${n.type}`);
      lines.push(`- **状态**: ${n.note}`);
      lines.push('');
    }

    // === 🔴 全量技能清单 ===
    lines.push('## 🔴 全量技能清单');
    lines.push('');
    const coreSkills = this.allSkills.filter(s =>
      s.category === 'core' && !zhipuSkillsNoRoute.find(z => z.name === s.name)
    );
    for (const s of coreSkills) {
      const status = s.hasSkillMd && s.hasIndex ? '✅' : s.hasSkillMd ? '📄' : s.hasIndex ? '⚙️' : '❓';
      lines.push(`- ${status} **${s.name}**: ${s.path}${s.description ? ' — ' + s.description : ''}`);
    }
    lines.push('');
    lines.push('> 图例: ✅=完整(SKILL.md+代码) 📄=仅文档 ⚙️=仅代码 ❓=空目录');
    lines.push('');

    // === 🟠 Python Packages (pip) ===
    lines.push('## 🟠 Python Packages (pip)');
    lines.push('');
    if (this.pipPackages.length === 0) {
      lines.push('> 未检测到pip包或pip不可用');
    } else {
      for (const p of this.pipPackages) {
        lines.push(`- **${p.name}** v${p.version}`);
      }
    }
    lines.push('');

    // === 🟤 Node.js Global Packages (npm) ===
    lines.push('## 🟤 Node.js Global Packages (npm)');
    lines.push('');
    if (this.npmGlobalPackages.length === 0) {
      lines.push('> 未检测到npm全局包');
    } else {
      for (const p of this.npmGlobalPackages) {
        lines.push(`- **${p.name}** v${p.version}`);
      }
    }
    lines.push('');

    // === 🔧 Workspace Tools ===
    lines.push('## 🔧 Workspace Tools');
    lines.push('');
    if (this.workspaceTools.length === 0) {
      lines.push('> 未检测到workspace级工具');
    } else {
      for (const t of this.workspaceTools) {
        lines.push(`- **${t.name}**: \`${t.path}/${t.entry}\`${t.description ? ' — ' + t.description : ''}`);
      }
    }
    lines.push('');

    // === ⚡ System CLI Tools ===
    lines.push('## ⚡ System CLI Tools');
    lines.push('');
    if (this.systemCLITools.length === 0) {
      lines.push('> 未检测到系统CLI工具');
    } else {
      for (const t of this.systemCLITools) {
        const ver = t.version ? ` — ${t.version}` : '';
        lines.push(`- **${t.cmd}**: ${t.desc} (\`${t.path}\`)${ver}`);
      }
    }
    lines.push('');

    // === 🟣 使用原则 ===
    lines.push('## 🟣 使用原则');
    lines.push('');
    lines.push('1. **主模型**: 跟随 openclaw.json 配置（不硬编码）');
    lines.push('2. **扩展模型**: 智谱（多模态、生成），通过ISC路由自动选择');
    lines.push('3. **搜索首选**: tavily-search（AI优化），web_search为备选');
    lines.push('4. **能力来源**: 本文档由 isc-capability-anchor-sync v3 全量扫描自动生成');
    lines.push('5. **同步频率**: 每小时自动 + 技能变更时触发');
    lines.push('6. **扫描范围**: MCP规则 + skills/ + pip + npm全局 + workspace工具 + 系统CLI');
    lines.push('');

    return lines.join('\n');
  }

  sync() {
    console.log('[CapabilitySync v3] 全量扫描开始...');

    // 加载上次快照用于diff
    this.loadPreviousSnapshot();

    // 原有扫描
    this.loadFromISCRules();
    this.scanAllSkills();
    this.detectSearchTools();

    // v3新增扫描
    this.scanPipPackages();
    this.scanNpmGlobalPackages();
    this.scanWorkspaceTools();
    this.scanSystemCLITools();

    // 生成文档
    const doc = this.generateDoc();
    fs.writeFileSync(CONFIG.anchorFile, doc);

    // 收集当前所有能力名用于diff
    const currentNames = new Set();
    this.allSkills.forEach(s => currentNames.add(s.name));
    this.pipPackages.forEach(p => currentNames.add(p.name));
    this.npmGlobalPackages.forEach(p => currentNames.add(p.name));
    this.workspaceTools.forEach(t => currentNames.add(t.name));
    this.systemCLITools.forEach(t => currentNames.add(t.cmd));

    const { added, removed } = this.detectChanges(currentNames);

    // 保存快照供下次diff
    fs.writeFileSync(CONFIG.snapshotFile, JSON.stringify({
      capabilities: [...currentNames].sort(),
      timestamp: new Date().toISOString()
    }, null, 2));

    // 输出摘要
    console.log(`[CapabilitySync v3] 智谱路由: ${this.zhipuRoutes.length}`);
    console.log(`[CapabilitySync v3] 全量技能: ${this.allSkills.length}`);
    console.log(`[CapabilitySync v3] 搜索工具: ${this.searchTools.length}`);
    console.log(`[CapabilitySync v3] pip包: ${this.pipPackages.length}`);
    console.log(`[CapabilitySync v3] npm全局: ${this.npmGlobalPackages.length}`);
    console.log(`[CapabilitySync v3] workspace工具: ${this.workspaceTools.length}`);
    console.log(`[CapabilitySync v3] 系统CLI: ${this.systemCLITools.length}`);

    if (added.length > 0) {
      console.log(`[CapabilitySync v3] [NEW] 新增能力: ${added.join(', ')}`);
    }
    if (removed.length > 0) {
      console.log(`[CapabilitySync v3] [REMOVED] 移除能力: ${removed.join(', ')}`);
    }
    if (added.length === 0 && removed.length === 0) {
      console.log('[CapabilitySync v3] 无变更');
    }

    console.log(`[CapabilitySync v3] 文档已更新: ${CONFIG.anchorFile}`);
  }
}

new CapabilityAnchorSync().sync();
