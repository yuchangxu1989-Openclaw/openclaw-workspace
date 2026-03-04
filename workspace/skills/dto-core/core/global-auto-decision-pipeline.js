#!/usr/bin/env node
/**
 * 全局自主决策流水线 v2.0 - 语义化版本 + 变更分类
 * 
 * 变更记录:
 * v2.0 (2026-03-05):
 * - 新增classifyChange()方法：分析变更文件类型，分类为minor/patch/skip
 * - minor: 代码文件(.js/.py/.sh)、核心文档(SKILL.md/README)变更 → 递增版本
 * - patch: 配置文件、普通.md变更 → 递增版本
 * - skip: 运行时数据(report/log/dashboard/state) → 不递增版本，不提交
 * - commit message区分：[AUTO-MINOR] vs [AUTO-PATCH]（不再使用通用[AUTO]）
 * - 新增excludePatterns: shadow-test-report, test-report, progress-report
 * - 新增excludeSubPaths: infrastructure/mr/shadow-test-report
 * - 根治infrastructure空转：shadow-test-report.json不再触发版本bump
 * 
 * v1.5 (2026-03-04):
 * - 移除分批限流（每次只处理3个的限制）
 * - 改为一次性处理所有检测到的变更
 * 
 * v1.4 (2026-02-28):
 * - 扩展Git跟踪范围，覆盖所有代码和配置文件
 * - 新增支持的文件类型: .ts, .jsx, .tsx, .sh, .py, .rb, .html, .css 等
 * - 新增跟踪目录: scripts/, config/, prompts/, filters/, infrastructure/ 等
 * - 新增根目录配置文件跟踪
 * - 新增.gitignore支持，排除日志、临时文件、媒体文件等
 * - 改进Git add逻辑，根据变更类型精确添加文件
 * - 添加文件去重机制，避免重复处理
 * 
 * v1.3: 扩展检测范围版
 * v1.2: 性能优化版
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const { SKILLS_DIR, WORKSPACE } = require('../../_shared/paths');

const CONFIG = {
  skillsPath: SKILLS_DIR,
  workspacePath: WORKSPACE,
  
  // Git跟踪配置 - 定义要跟踪的文件类型和目录
  gitTracking: {
    // 要跟踪的文件扩展名
    includeExtensions: [
      '.js', '.ts', '.jsx', '.tsx', '.cjs', '.mjs',
      '.json', '.yaml', '.yml', '.toml',
      '.md', '.mdx',
      '.sh', '.bash', '.zsh', '.fish',
      '.py', '.rb', '.pl', '.php',
      '.html', '.css', '.scss', '.less',
      '.sql', '.graphql', '.proto',
      '.txt', '.conf', '.cfg', '.ini',
      '.dockerfile', '.dockerignore',
      '.gitignore', '.editorconfig', '.npmrc'
    ],
    // 完整文件名匹配（无扩展名或特殊文件）
    includeFiles: [
      'Makefile', 'Dockerfile', 'docker-compose.yml',
      'LICENSE', 'README', 'CHANGELOG',
      'SKILL', 'CAPABILITY-ANCHOR', 'AGENTS', 'SOUL', 'USER', 'MEMORY',
      'BOOTSTRAP', 'HEARTBEAT', 'TOOLS'
    ],
    // 要跟踪的关键目录
    includeDirs: [
      'skills', 'config', 'scripts',
      'prompts', 'filters', 'infrastructure',
      'cras',
      'agent-tools', 'src', 'tools',
      'lep-subagent', 'skill-creator', 'skill-sandbox',
      'evolver', 'monitoring', 'cron',
      'council-inputs', 'designs'
    ],
    // 要排除的目录（优先级高于includeDirs）
    excludeDirs: [
      'node_modules', '.git', '.clawhub',
      'logs', 'output',
      'feishu_send_queue', 'feishu_sent_cards', 'feishu_sent_reports',
      '.dto-signals', '.isc',
      'root-cause-analysis', 'using-superpowers', 'wal',
      'aeo-vector-system',  // 向量化系统生成的数据
      'knowledge',          // cras/knowledge/ — cron自动采集的数据
      'reports',            // cras/reports/ 和 reports/ — cron自动生成的报告
      'seef-discoveries', 'seef-evaluations', 'seef-evolution-history',
      'seef-optimization-plans', 'seef-validations', 'seef'  // SEEF运行时产物
    ],
    // 要整体排除的顶层目录（从includeDirs中移除，不再扫描）
    // memory/ 和 reports/ 产生大量运行时数据，不应触发版本bump
    excludeTopDirs: [
      'memory',   // 记忆文件是运行时产物，不应触发版本bump
      'reports'   // cron生成的报告，不应触发版本bump
    ],
    // 排除特定子目录（路径包含这些片段的文件不触发bump）
    excludeSubPaths: [
      'infrastructure/dispatcher/dispatched',  // 调度记录，运行时产物
      'infrastructure/dispatcher/processed',
      'infrastructure/event-bus',              // 事件队列，运行时产物
      'infrastructure/mr/shadow-test-report',  // MR影子测试报告
    ],
    // 要排除的文件模式
    excludePatterns: [
      /^\./,           // 隐藏文件（以.开头）
      /\.tmp$/i,       // 临时文件
      /\.temp$/i,
      /\.bak$/i,       // 备份文件
      /\.log$/i,       // 日志文件
      /~$/,            // 编辑器备份
      /\.swp$/,        // vim交换文件
      /\.pid$/,        // PID文件
      /-state\.json$/, // 状态文件
      /-feedback\.jsonl$/, // 反馈日志
      /heartbeats\.json$/, // 运行时心跳（高频噪音）
      /pdca-execution-log\.jsonl$/, // PDCA执行日志（高频噪音）
      /cras_insight_dashboard\.json$/, // CRAS仪表盘（高频噪音）
      /\.workspace-versions\.json$/, // 版本文件自身（避免循环）
      /runs\.json$/, // 子Agent运行记录（高频噪音）
      /dedup.*\.json$/, // 去重缓存（高频噪音）
      /cursor\.json$/,  // event-bus游标（高频噪音）
      /\.bundle$/, // git bundle备份
      /\.mp4$/, /\.mp3$/, /\.avi$/, /\.mov$/, // 媒体文件
      /\.zip$/, /\.tar\.gz$/, /\.tar\.bz2$/, /\.rar$/, /\.7z$/, // 压缩文件
      // === 新增：根治空转版本bump ===
      /user-profile\.json$/,      // cras/config/user-profile.json — 运行时用户画像
      /\.pipeline-states\.json$/,  // pipeline自身状态文件
      /\.pipeline-feedback\.jsonl$/, // pipeline自身反馈日志
      /insight_.*\.md$/,           // cras/reports/insight_*.md — cron自动生成
      /research-.*\.md$/,          // cras/reports/research-*.md — cron自动生成
      /report_.*\.json$/,          // cras/knowledge/report_*.json — cron自动采集
      /lep-daily-report-.*\.(json|txt)$/, // LEP每日报告
      /\.probe-state\.json$/,            // API探针运行时状态
      /\.bak-pre-/,                      // 备份文件（带时间戳前缀）
      /cras-learning-.*\.json$/,   // CRAS学习数据
      /cras-dashboard-.*\.md$/,    // CRAS仪表盘报告
      /cron-health-check-.*\.md$/, // cron健康检查报告
      /\.elite-memory\.json$/,     // 精英记忆运行时数据
      /\.evomap-registry\.json$/,  // EvoMap注册表运行时数据
      /update-check\.json$/,       // 更新检查状态
      /shadow-test-report.*\.json$/,  // MR影子测试报告（高频运行时产物）
      /test-report.*\.json$/,        // 测试报告（运行时产物）
      /progress-report.*\.md$/       // 进度报告（运行时产物）
    ]
  },
  
  statePath: path.join(WORKSPACE, '.pipeline-states.json'),
  feedbackPath: path.join(WORKSPACE, '.pipeline-feedback.jsonl')
};

class Pipeline {
  constructor() {
    this.states = this.loadStates();
  }

  loadStates() {
    if (fs.existsSync(CONFIG.statePath)) {
      return new Map(Object.entries(JSON.parse(fs.readFileSync(CONFIG.statePath, 'utf8'))));
    }
    return new Map();
  }

  saveStates() {
    fs.writeFileSync(CONFIG.statePath, JSON.stringify(Object.fromEntries(this.states), null, 2));
  }

  // 步骤1: 监听整个OpenClaw工作区（完整版，跟踪所有代码和配置文件）
  listen() {
    console.log('[1/4] 监听OpenClaw工作区...');
    const changes = [];
    const gitConfig = CONFIG.gitTracking;
    
    // 1. 扫描所有配置的跟踪目录
    for (const dirName of gitConfig.includeDirs) {
      const dirPath = path.join(CONFIG.workspacePath, dirName);
      if (!fs.existsSync(dirPath)) {
        continue;
      }
      
      const dirChanges = this.checkDirectory(dirPath, dirName);
      changes.push(...dirChanges);
    }
    
    // 2. 扫描工作区根目录下的代码和配置文件
    const rootChanges = this.checkRootDirectory();
    changes.push(...rootChanges);
    
    // 3. 扫描skills目录下的所有子技能
    if (fs.existsSync(CONFIG.skillsPath)) {
      const skillChanges = this.checkSkillsDirectory();
      changes.push(...skillChanges);
    }
    
    // 去重 - 按路径合并同一文件的多个变更
    const uniqueChanges = this.deduplicateChanges(changes);
    
    console.log(`  共检测到 ${uniqueChanges.length} 个变更`);
    return uniqueChanges;
  }
  
  // 变更去重
  deduplicateChanges(changes) {
    const seen = new Map();
    for (const change of changes) {
      const key = change.changedFile || change.skill;
      if (!seen.has(key) || change.mtime > seen.get(key).mtime) {
        seen.set(key, change);
      }
    }
    return Array.from(seen.values());
  }
  
  // 扫描skills目录下的所有子技能
  checkSkillsDirectory() {
    const changes = [];
    const skillsPath = CONFIG.skillsPath;
    
    try {
      const items = fs.readdirSync(skillsPath, { withFileTypes: true });
      
      for (const item of items) {
        if (!item.isDirectory()) continue;
        if (item.name === 'node_modules') continue;
        if (item.name.startsWith('.')) continue;
        
        const skillPath = path.join(skillsPath, item.name);
        const skillChanges = this.checkDirectory(skillPath, `skill:${item.name}`, 'skill');
        changes.push(...skillChanges);
      }
    } catch (e) {
      // 忽略错误
    }
    
    return changes;
  }
  
  // 检查文件是否应该被跟踪（基于文件名）
  shouldTrackFile(fileName) {
    const gitConfig = CONFIG.gitTracking;
    
    // 检查排除模式
    for (const pattern of gitConfig.excludePatterns) {
      if (pattern.test(fileName)) {
        return false;
      }
    }
    
    // 检查扩展名
    const ext = path.extname(fileName).toLowerCase();
    if (gitConfig.includeExtensions.includes(ext)) {
      return true;
    }
    
    // 检查文件名（无扩展名）
    const baseName = path.basename(fileName, ext);
    for (const includeFile of gitConfig.includeFiles) {
      if (baseName.toLowerCase() === includeFile.toLowerCase()) {
        return true;
      }
    }
    
    return false;
  }
  
  // 检查完整路径是否应该被跟踪（基于路径中的目录层级）
  shouldTrackPath(fullPath) {
    const gitConfig = CONFIG.gitTracking;
    const fileName = path.basename(fullPath);
    
    // 先检查文件名级别的排除
    if (!this.shouldTrackFile(fileName)) {
      return false;
    }
    
    // 检查路径中是否包含需要排除的目录
    const relativePath = path.relative(CONFIG.workspacePath, fullPath);
    const pathParts = relativePath.split(path.sep);
    
    for (const part of pathParts) {
      if (gitConfig.excludeDirs.includes(part)) {
        return false;
      }
    }
    
    // 检查是否在被排除的顶层目录下
    if (gitConfig.excludeTopDirs && pathParts.length > 0) {
      if (gitConfig.excludeTopDirs.includes(pathParts[0])) {
        return false;
      }
    }
    
    // 检查是否在被排除的子路径下（运行时产物目录）
    if (gitConfig.excludeSubPaths) {
      const normalizedRelative = relativePath.replace(/\\/g, '/');
      for (const subPath of gitConfig.excludeSubPaths) {
        if (normalizedRelative.startsWith(subPath)) {
          return false;
        }
      }
    }
    
    return true;
  }
  
  // 检查目录是否应该被扫描
  shouldScanDirectory(dirName) {
    const gitConfig = CONFIG.gitTracking;
    
    // 检查排除目录
    if (gitConfig.excludeDirs.includes(dirName)) {
      return false;
    }
    
    // 排除隐藏目录
    if (dirName.startsWith('.')) {
      return false;
    }
    
    return true;
  }
  
  // 扫描根目录下的文件
  checkRootDirectory() {
    const changes = [];
    const knownMtime = this.states.get('__root__') || 0;
    let latestMtime = 0;
    let latestFile = null;
    
    try {
      const items = fs.readdirSync(CONFIG.workspacePath, { withFileTypes: true });
      
      for (const item of items) {
        if (!item.isFile()) continue;
        
        if (!this.shouldTrackFile(item.name)) {
          continue;
        }
        
        const filePath = path.join(CONFIG.workspacePath, item.name);
        try {
          const stat = fs.statSync(filePath);
          if (stat.mtime.getTime() > knownMtime && stat.mtime.getTime() > latestMtime) {
            latestMtime = stat.mtime.getTime();
            latestFile = filePath;
          }
        } catch {}
      }
    } catch {}
    
    if (latestMtime > 0) {
      console.log(`  [root] 检测到变更: ${path.basename(latestFile)}`);
      changes.push({ 
        skill: 'root-config', 
        path: CONFIG.workspacePath, 
        mtime: latestMtime,
        type: 'root',
        changedFile: latestFile
      });
      this.states.set('__root__', latestMtime);
    }
    
    return changes;
  }
  
  // 检测单个目录的变更
  checkDirectory(dirPath, dirName, type = 'config') {
    const changes = [];
    const knownMtime = this.states.get(dirName) || 0;
    let latestMtime = 0;
    let latestFile = null;
    
    // 递归获取目录下所有文件
    const getAllFiles = (currentPath, files = []) => {
      try {
        const items = fs.readdirSync(currentPath, { withFileTypes: true });
        for (const item of items) {
          const fullPath = path.join(currentPath, item.name);
          if (item.isDirectory()) {
            // 使用统一的目录过滤逻辑
            if (!this.shouldScanDirectory(item.name)) {
              continue;
            }
            getAllFiles(fullPath, files);
          } else {
            // 使用完整路径过滤逻辑（包含目录和文件名两级检查）
            if (this.shouldTrackPath(fullPath)) {
              files.push(fullPath);
            }
          }
        }
      } catch {}
      return files;
    };
    
    const filesToCheck = getAllFiles(dirPath);
    
    // 限制检查文件数量，避免性能问题
    const limitedFiles = filesToCheck.slice(0, 100);
    
    for (const file of limitedFiles) {
      try {
        const stat = fs.statSync(file);
        if (stat.mtime.getTime() > knownMtime && stat.mtime.getTime() > latestMtime) {
          latestMtime = stat.mtime.getTime();
          latestFile = file;
        }
      } catch {}
    }
    
    if (latestMtime > 0) {
      console.log(`  [${dirName}] 检测到变更: ${path.relative(dirPath, latestFile)}`);
      changes.push({ 
        skill: dirName, 
        path: dirPath, 
        mtime: latestMtime,
        type: type,
        changedFile: latestFile
      });
    }
    
    return changes;
  }
  
  // 变更分类：判断变更是否实质性
  classifyChange(itemInfo) {
    try {
      // 使用 git diff 检查实际变更内容
      const diffCmd = `cd ${CONFIG.workspacePath} && git diff --cached --stat 2>/dev/null || git diff --stat 2>/dev/null`;
      const diffStat = execSync(diffCmd, { encoding: 'utf8', timeout: 5000 }).trim();
      
      if (!diffStat) return 'skip'; // 无实际diff
      
      // 检查变更的文件
      const changedFile = itemInfo.changedFile ? path.basename(itemInfo.changedFile) : '';
      const changedExt = path.extname(changedFile).toLowerCase();
      
      // 纯运行时数据文件 → skip（不提交）
      const runtimePatterns = [
        /report/i, /log/i, /dashboard/i, /state\.json$/,
        /heartbeat/i, /insight/i, /research-/i
      ];
      for (const p of runtimePatterns) {
        if (p.test(changedFile)) return 'skip';
      }
      
      // 代码文件变更 → minor
      const codeExts = ['.js', '.ts', '.jsx', '.tsx', '.py', '.sh', '.cjs', '.mjs'];
      if (codeExts.includes(changedExt)) return 'minor';
      
      // SKILL.md, package.json, 架构文档 → minor
      if (/^(SKILL|README|CAPABILITY-ANCHOR|AGENTS|SOUL)\.md$/i.test(changedFile)) return 'minor';
      if (changedFile === 'package.json') return 'minor';
      
      // 配置文件 → patch
      const configExts = ['.json', '.yaml', '.yml', '.toml', '.conf', '.ini'];
      if (configExts.includes(changedExt)) return 'patch';
      
      // .md 文件（非核心文档）→ patch
      if (changedExt === '.md') return 'patch';
      
      // 默认 patch
      return 'patch';
    } catch {
      return 'patch';
    }
  }

  // 步骤2: 更新版本
  updateVersion(itemInfo) {
    console.log(`[2/4] ${itemInfo.skill} 版本...`);
    
    // 解析技能名称（处理 'skill:name' 格式）
    const skillName = itemInfo.skill.replace(/^skill:/, '');
    
    // 技能类型使用SKILL.md版本管理
    if (itemInfo.type === 'skill') {
      const skillMd = path.join(itemInfo.path, 'SKILL.md');
      let version = '1.0.0';
      
      if (fs.existsSync(skillMd)) {
        const content = fs.readFileSync(skillMd, 'utf8');
        const match = content.match(/version[:\s]+["']?([^"'\n]+)["']?/i);
        if (match) version = match[1];
      }
      
      const parts = version.split('.');
      parts[2] = parseInt(parts[2] || 0) + 1;
      const newVersion = parts.join('.');
      
      // 更新SKILL.md
      if (fs.existsSync(skillMd)) {
        let content = fs.readFileSync(skillMd, 'utf8');
        content = content.replace(/version[:\s]+["']?[^"'\n]+["']?/i, `version: "${newVersion}"`);
        fs.writeFileSync(skillMd, content);
      }
      
      // 更新package.json
      const pkgPath = path.join(itemInfo.path, 'package.json');
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
          pkg.version = newVersion;
          fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
        } catch {}
      }
      
      console.log(`  ${version} → ${newVersion}`);
      return { ...itemInfo, version: newVersion, skillName };
    }
    
    // 其他类型使用全局版本管理
    return this.updateGlobalVersion({ ...itemInfo, skillName });
  }
  
  // 更新全局配置/数据目录的版本
  updateGlobalVersion(itemInfo) {
    // 使用统一的版本文件来跟踪非skills目录的版本
    const versionFile = path.join(CONFIG.workspacePath, '.workspace-versions.json');
    let versions = {};
    
    if (fs.existsSync(versionFile)) {
      try {
        versions = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
      } catch {}
    }
    
    const currentVersion = versions[itemInfo.skill] || '1.0.0';
    const parts = currentVersion.split('.');
    parts[2] = parseInt(parts[2] || 0) + 1;
    const newVersion = parts.join('.');
    
    versions[itemInfo.skill] = newVersion;
    fs.writeFileSync(versionFile, JSON.stringify(versions, null, 2));
    
    console.log(`  ${currentVersion} → ${newVersion} (全局版本)`);
    return { ...itemInfo, version: newVersion };
  }

  // 步骤3: 同步 - 改进的Git同步逻辑，跟踪所有代码和文件变更
  sync(itemInfo) {
    console.log(`[3/4] ${itemInfo.skill} 同步...`);
    
    const results = { github: null, evomap: null };
    const displayName = itemInfo.skillName || itemInfo.skill;
    
    // GitHub - 同步所有类型的变更，使用改进的添加逻辑
    try {
      // 根据变更类型确定要添加的路径
      let addPaths = [];
      
      if (itemInfo.type === 'skill') {
        // 技能变更 - 添加整个技能目录
        const skillDirName = itemInfo.skill.replace(/^skill:/, '');
        addPaths.push(`skills/${skillDirName}/`);
      } else if (itemInfo.type === 'root') {
        // 根目录配置变更 - 添加变更的文件
        if (itemInfo.changedFile) {
          addPaths.push(path.basename(itemInfo.changedFile));
        } else {
          addPaths.push('.');
        }
      } else {
        // 其他目录变更 (config/, scripts/, prompts/等)
        const dirName = itemInfo.skill.replace(/^skill:/, '');
        addPaths.push(`${dirName}/`);
      }
      
      // 添加 .gitignore 如果存在
      if (fs.existsSync(path.join(CONFIG.workspacePath, '.gitignore'))) {
        addPaths.push('.gitignore');
      }
      
      // 执行 git add
      for (const addPath of [...new Set(addPaths)]) {
        try {
          execSync(`cd ${CONFIG.workspacePath} && git add "${addPath}" 2>/dev/null`, { 
            encoding: 'utf8', 
            timeout: 30000 
          });
        } catch (e) {
          // 单个文件添加失败不阻断流程
          console.log(`  警告: 添加 ${addPath} 失败`);
        }
      }
      
      // 提交变更 - 使用语义化commit message
      const commitPrefix = itemInfo.changeType === 'minor' ? '[AUTO-MINOR]' : '[AUTO-PATCH]';
      const commitResult = execSync(
        `cd ${CONFIG.workspacePath} && git commit -m "${commitPrefix} ${displayName} v${itemInfo.version}" 2>&1 || echo "nothing to commit"`, 
        { encoding: 'utf8', timeout: 10000 }
      );
      
      if (!commitResult.includes('nothing to commit')) {
        // 推送变更
        execSync(
          `cd ${CONFIG.workspacePath} && timeout 10 git push 2>&1 || echo "push skipped"`, 
          { encoding: 'utf8', timeout: 15000 }
        );
        console.log(`  GitHub: 已推送 ${displayName} v${itemInfo.version}`);
      } else {
        console.log(`  GitHub: 无变更需要提交`);
      }
      
      results.github = { success: true, message: `GitHub: ${displayName} v${itemInfo.version}` };
    } catch (e) {
      results.github = { success: false, message: `GitHub失败: ${e.message}` };
    }
    
    // EvoMap - 只同步skills目录和核心目录的变更
    try {
      // 读取EvoMap上传清单
      const manifestPath = path.join(SKILLS_DIR, 'isc-core/config/evomap-upload-manifest.json');
      let allowedSkills = ['dto-core', 'isc-core']; // 默认
      
      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        allowedSkills = manifest.allowed_skills || allowedSkills;
      }
      
      // 同步到EvoMap的条件：skill类型 或 isc-core规则变更
      const isISCRuleChange = itemInfo.skill === 'isc-core' || itemInfo.skill.includes('isc-');
      const isSkill = itemInfo.type === 'skill';
      
      if (!isSkill && !isISCRuleChange) {
        results.evomap = { success: true, message: `EvoMap跳过: ${displayName} 非skill类型`, skipped: true };
      } else if (!allowedSkills.includes(displayName) && !isISCRuleChange) {
        results.evomap = { success: true, message: `EvoMap未同步: ${displayName} 不在上传清单`, skipped: true };
      } else {
        // ISC规则变更强制同步
        if (isISCRuleChange) {
          console.log(`  [ISC规则同步] ${displayName} 规则变更，强制同步到EvoMap`);
        }
        const evomapPath = path.join(SKILLS_DIR, 'evomap-uploader');
        if (!fs.existsSync(evomapPath)) {
          fs.mkdirSync(evomapPath, { recursive: true });
        }
        const ts = Date.now();
        const gene = {
          type: 'Gene', schema_version: '1.5.0', category: 'optimize',
          summary: `${displayName} v${itemInfo.version}`,
          asset_id: `gene_${displayName}_${ts}`, created_at: new Date().toISOString()
        };
        const capsule = {
          type: 'Capsule', schema_version: '1.5.0', gene: gene.asset_id,
          summary: `${displayName}同步`, outcome: { status: 'success' },
          asset_id: `capsule_${displayName}_${ts}`, created_at: new Date().toISOString()
        };
        fs.writeFileSync(path.join(evomapPath, `gene-${displayName}-${ts}.json`), JSON.stringify(gene, null, 2));
        fs.writeFileSync(path.join(evomapPath, `capsule-${displayName}-${ts}.json`), JSON.stringify(capsule, null, 2));
        results.evomap = { success: true, message: `EvoMap: ${displayName} v${itemInfo.version}` };
      }
    } catch (e) {
      results.evomap = { success: false, message: `EvoMap失败: ${e.message}` };
    }
    
    return results;
  }

  // 步骤4: 反馈
  feedback(itemInfo, results) {
    console.log(`[4/4] 反馈...`);

    const msg = {
      time: new Date().toISOString(),
      item: itemInfo.skill,
      type: itemInfo.type || 'skill',
      version: itemInfo.version,
      github: results.github.success ? '✅' : '❌',
      evomap: results.evomap.skipped ? '⏸️' : (results.evomap.success ? '✅' : '❌')
    };

    fs.appendFileSync(CONFIG.feedbackPath, JSON.stringify(msg) + '\n');
    console.log(`  GitHub${msg.github} EvoMap${msg.evomap}`);
    return msg;
  }

  // 主执行
  run() {
    console.log('╔════════════════════════════════════════╗');
    console.log('║     全局自主决策流水线 v2.0            ║');
    console.log('║     (语义化版本 + 变更分类)            ║');
    console.log('╚════════════════════════════════════════╝');
    
    const start = Date.now();
    const changes = this.listen();
    
    if (changes.length === 0) {
      console.log('无变更');
      return;
    }
    
    // 一次性处理所有变更
    const toProcess = changes;
    console.log(`处理 ${toProcess.length}/${changes.length} 个`);
    
    for (const change of toProcess) {
      const changeType = this.classifyChange(change);
      
      if (changeType === 'skip') {
        console.log(`  ⏭️ 跳过 ${change.skill}: 纯运行时数据，不递增版本`);
        // 更新状态时间戳防止重复检测，但不bump版本
        this.states.set(change.skill, Date.now());
        continue;
      }
      
      const itemV = this.updateVersion(change);
      itemV.changeType = changeType; // minor or patch
      const results = this.sync(itemV);
      this.feedback(itemV, results);
      // 修复：使用当前时间戳保存状态，避免文件mtime导致的循环检测
      this.states.set(change.skill, Date.now());
    }
    
    this.saveStates();
    console.log(`\n完成 ${toProcess.length} 个，耗时 ${(Date.now()-start)/1000}s`);
  }
}

new Pipeline().run();
