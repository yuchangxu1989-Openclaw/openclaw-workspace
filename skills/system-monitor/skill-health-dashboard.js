/**
 * Skill Health Dashboard
 * 技能健康度评估仪表盘
 * 
 * 功能：
 * 1. 完整性评估 - 检查必要文件、字段
 * 2. 活跃度评估 - 基于Git历史分析
 * 3. 依赖健康度 - 检查依赖有效性
 * 4. 生成可视化报告 - JSON + HTML
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==================== 配置 ====================
const CONFIG = {
  skillsDir: path.join(__dirname, '..'),
  outputDir: process.argv.includes('--output') 
    ? process.argv[process.argv.indexOf('--output') + 1]
    : path.join(__dirname, 'reports'),
  generateJson: process.argv.includes('--json') || process.argv.includes('--all'),
  generateHtml: process.argv.includes('--html') || process.argv.includes('--all'),
  verbose: process.argv.includes('--verbose') || process.argv.includes('-v')
};

// ==================== 指标权重配置 ====================
const WEIGHTS = {
  completeness: {
    skillMd: 25,        // SKILL.md 存在及内容
    packageJson: 20,    // package.json 存在及字段
    entryFile: 15,      // 入口文件存在
    readme: 10,         // README.md 存在
    configFiles: 10,    // 配置文件存在
    codeQuality: 20     // 代码质量基础指标
  },
  activity: {
    recentCommits: 40,  // 近期提交频率
    lastModified: 30,   // 最后修改时间
    totalCommits: 20,   // 总提交数
    fileChanges: 10     // 文件变更频率
  },
  dependency: {
    declared: 30,       // 依赖声明完整性
    valid: 40,          // 依赖有效性
    noCircular: 20,     // 无循环依赖
    security: 10        // 安全版本检查
  }
};

// ==================== 工具函数 ====================

/**
 * 安全读取JSON文件
 */
function safeReadJson(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * 安全读取文件内容
 */
function safeReadFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * 检查文件是否存在
 */
function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * 获取目录下的所有技能
 */
function getAllSkills() {
  const skills = [];
  try {
    const entries = fs.readdirSync(CONFIG.skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.') && !entry.name.startsWith('_')) {
        const skillPath = path.join(CONFIG.skillsDir, entry.name);
        skills.push({
          name: entry.name,
          path: skillPath
        });
      }
    }
  } catch (error) {
    console.error('读取技能目录失败:', error.message);
  }
  return skills;
}

/**
 * 执行Git命令获取信息
 */
function execGit(skillPath, command) {
  try {
    return execSync(command, {
      cwd: skillPath,
      encoding: 'utf8',
      timeout: 5000
    }).trim();
  } catch {
    return '';
  }
}

/**
 * 获取技能的Git活动信息
 */
function getGitActivity(skillPath) {
  // 最后修改时间
  const lastModified = execGit(skillPath, 
    'git log -1 --format=%ct -- . 2>/dev/null || echo "0"');
  
  // 近30天提交数
  const recentCommits = execGit(skillPath, 
    'git log --since="30 days ago" --oneline -- . 2>/dev/null | wc -l');
  
  // 近90天提交数
  const commits90Days = execGit(skillPath, 
    'git log --since="90 days ago" --oneline -- . 2>/dev/null | wc -l');
  
  // 总提交数
  const totalCommits = execGit(skillPath, 
    'git log --oneline -- . 2>/dev/null | wc -l');
  
  // 近30天变更文件数
  const changedFiles = execGit(skillPath, 
    'git diff --name-only --since="30 days ago" -- . 2>/dev/null | wc -l');

  return {
    lastModified: parseInt(lastModified) || 0,
    recentCommits: parseInt(recentCommits) || 0,
    commits90Days: parseInt(commits90Days) || 0,
    totalCommits: parseInt(totalCommits) || 0,
    changedFiles: parseInt(changedFiles) || 0
  };
}

/**
 * 计算活跃度分数
 */
function calculateActivityScore(activity) {
  const now = Math.floor(Date.now() / 1000);
  const daysSinceLastCommit = activity.lastModified 
    ? Math.floor((now - activity.lastModified) / 86400) 
    : 999;

  // 最近提交分数 (0-40)
  let recentScore = 0;
  if (activity.recentCommits >= 10) recentScore = 40;
  else if (activity.recentCommits >= 5) recentScore = 30;
  else if (activity.recentCommits >= 2) recentScore = 20;
  else if (activity.recentCommits >= 1) recentScore = 10;

  // 最后修改时间分数 (0-30)
  let lastModifiedScore = 0;
  if (daysSinceLastCommit <= 7) lastModifiedScore = 30;
  else if (daysSinceLastCommit <= 30) lastModifiedScore = 20;
  else if (daysSinceLastCommit <= 90) lastModifiedScore = 10;

  // 总提交数分数 (0-20)
  let totalScore = 0;
  if (activity.totalCommits >= 50) totalScore = 20;
  else if (activity.totalCommits >= 20) totalScore = 15;
  else if (activity.totalCommits >= 5) totalScore = 10;
  else if (activity.totalCommits >= 1) totalScore = 5;

  // 文件变更分数 (0-10)
  let changesScore = Math.min(activity.changedFiles * 2, 10);

  return {
    score: recentScore + lastModifiedScore + totalScore + changesScore,
    details: {
      recentCommits: { score: recentScore, raw: activity.recentCommits },
      lastModified: { score: lastModifiedScore, days: daysSinceLastCommit },
      totalCommits: { score: totalScore, raw: activity.totalCommits },
      fileChanges: { score: changesScore, raw: activity.changedFiles }
    }
  };
}

// ==================== 评估模块 ====================

/**
 * 评估技能完整性
 */
function assessCompleteness(skillName, skillPath) {
  const result = {
    score: 0,
    maxScore: 100,
    checks: {},
    issues: [],
    warnings: []
  };

  // 1. SKILL.md 检查 (25分)
  const skillMdPath = path.join(skillPath, 'SKILL.md');
  const skillMdExists = fileExists(skillMdPath);
  let skillMdScore = 0;
  
  if (skillMdExists) {
    const content = safeReadFile(skillMdPath) || '';
    const hasName = content.includes('name:');
    const hasDescription = content.includes('description:');
    const hasVersion = content.includes('version:');
    const hasStatus = content.includes('status:');
    
    skillMdScore = (hasName ? 8 : 0) + (hasDescription ? 7 : 0) + 
                   (hasVersion ? 5 : 0) + (hasStatus ? 5 : 0);
    
    if (!hasName) result.issues.push('SKILL.md 缺少 name 字段');
    if (!hasDescription) result.issues.push('SKILL.md 缺少 description 字段');
    if (!hasVersion) result.warnings.push('SKILL.md 缺少 version 字段');
    if (!hasStatus) result.warnings.push('SKILL.md 缺少 status 字段');
  } else {
    result.issues.push('缺少 SKILL.md');
  }
  
  result.checks.skillMd = { score: skillMdScore, max: 25, exists: skillMdExists };

  // 2. package.json 检查 (20分)
  const pkgPath = path.join(skillPath, 'package.json');
  const pkgExists = fileExists(pkgPath);
  let pkgScore = 0;
  
  if (pkgExists) {
    const pkg = safeReadJson(pkgPath);
    if (pkg) {
      const hasName = !!pkg.name;
      const hasVersion = !!pkg.version;
      const hasDescription = !!pkg.description;
      const hasMain = !!pkg.main;
      
      pkgScore = (hasName ? 6 : 0) + (hasVersion ? 5 : 0) + 
                 (hasDescription ? 5 : 0) + (hasMain ? 4 : 0);
      
      if (!hasName) result.warnings.push('package.json 缺少 name');
      if (!hasVersion) result.warnings.push('package.json 缺少 version');
      if (!hasDescription) result.warnings.push('package.json 缺少 description');
      if (!hasMain) result.warnings.push('package.json 缺少 main');
    } else {
      result.warnings.push('package.json 格式错误');
      pkgScore = 5;
    }
  } else {
    result.warnings.push('缺少 package.json（建议添加）');
  }
  
  result.checks.packageJson = { score: pkgScore, max: 20, exists: pkgExists };

  // 3. 入口文件检查 (15分)
  const pkg = pkgExists ? safeReadJson(path.join(skillPath, 'package.json')) : null;
  const mainFile = pkg?.main || 'index.js';
  const mainPath = path.join(skillPath, mainFile);
  const mainExists = fileExists(mainPath);
  let mainScore = mainExists ? 15 : 0;
  
  if (!mainExists) {
    result.issues.push(`入口文件不存在: ${mainFile}`);
  }
  
  result.checks.entryFile = { score: mainScore, max: 15, path: mainFile, exists: mainExists };

  // 4. README.md 检查 (10分)
  const readmePath = path.join(skillPath, 'README.md');
  const readmeExists = fileExists(readmePath);
  let readmeScore = readmeExists ? 10 : 0;
  
  if (!readmeExists) {
    result.warnings.push('缺少 README.md（建议添加）');
  }
  
  result.checks.readme = { score: readmeScore, max: 10, exists: readmeExists };

  // 5. 配置文件检查 (10分)
  const configFiles = ['.gitignore', '.npmignore'];
  let configScore = 0;
  let foundConfigs = 0;
  
  for (const config of configFiles) {
    if (fileExists(path.join(skillPath, config))) {
      foundConfigs++;
    }
  }
  configScore = Math.min(foundConfigs * 5, 10);
  
  result.checks.configFiles = { score: configScore, max: 10, found: foundConfigs };

  // 6. 代码质量基础 (20分)
  let qualityScore = 20;
  if (mainExists) {
    const code = safeReadFile(mainPath) || '';
    const lines = code.split('\n').length;
    
    // 文件过大扣分
    if (lines > 1000) {
      qualityScore -= 5;
      result.warnings.push(`入口文件过大(${lines}行)，建议拆分`);
    }
    
    // 无注释扣分
    const hasComments = code.includes('//') || code.includes('/*');
    if (!hasComments && lines > 50) {
      qualityScore -= 5;
      result.warnings.push('建议添加代码注释');
    }
    
    // 错误处理检查
    const hasErrorHandling = code.includes('try') || code.includes('catch');
    if (!hasErrorHandling && lines > 30) {
      qualityScore -= 5;
      result.warnings.push('建议添加错误处理');
    }
  }
  
  result.checks.codeQuality = { score: Math.max(0, qualityScore), max: 20 };

  // 计算总分
  result.score = skillMdScore + pkgScore + mainScore + readmeScore + configScore + Math.max(0, qualityScore);
  
  // 健康等级
  if (result.score >= 90) result.grade = 'A';
  else if (result.score >= 75) result.grade = 'B';
  else if (result.score >= 60) result.grade = 'C';
  else if (result.score >= 40) result.grade = 'D';
  else result.grade = 'F';

  return result;
}

/**
 * 评估技能活跃度
 */
function assessActivity(skillName, skillPath) {
  const gitActivity = getGitActivity(skillPath);
  const scoreResult = calculateActivityScore(gitActivity);
  
  return {
    score: scoreResult.score,
    maxScore: 100,
    grade: scoreResult.score >= 70 ? 'A' : scoreResult.score >= 50 ? 'B' : 
           scoreResult.score >= 30 ? 'C' : scoreResult.score >= 10 ? 'D' : 'F',
    details: scoreResult.details,
    raw: gitActivity
  };
}

/**
 * 评估依赖健康度
 */
function assessDependencies(skillName, skillPath) {
  const result = {
    score: 0,
    maxScore: 100,
    checks: {},
    issues: [],
    warnings: [],
    dependencies: {
      internal: [],
      external: [],
      missing: []
    }
  };

  const pkgPath = path.join(skillPath, 'package.json');
  const pkg = fileExists(pkgPath) ? safeReadJson(pkgPath) : null;
  
  if (!pkg) {
    result.issues.push('无法评估依赖：package.json不存在');
    result.score = 0;
    return result;
  }

  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const depNames = Object.keys(deps);
  
  // 1. 依赖声明完整性 (30分)
  let declaredScore = 0;
  if (depNames.length === 0) {
    declaredScore = 25; // 无依赖也是好的
  } else {
    let validDeps = 0;
    for (const [name, version] of Object.entries(deps)) {
      if (version && typeof version === 'string') {
        validDeps++;
        if (version.startsWith('file:')) {
          result.dependencies.internal.push({ name, path: version });
        } else {
          result.dependencies.external.push({ name, version });
        }
      }
    }
    declaredScore = Math.min(30, Math.floor((validDeps / depNames.length) * 30));
  }
  result.checks.declared = { score: declaredScore, max: 30 };

  // 2. 依赖有效性检查 (40分)
  let validScore = 40;
  for (const dep of result.dependencies.internal) {
    const targetPath = dep.path.replace('file:', '');
    const resolvedPath = path.resolve(skillPath, targetPath);
    if (!fs.existsSync(resolvedPath)) {
      validScore -= 10;
      result.dependencies.missing.push(dep.name);
      result.issues.push(`本地依赖不存在: ${dep.name} -> ${targetPath}`);
    }
  }
  result.checks.valid = { score: Math.max(0, validScore), max: 40 };

  // 3. 循环依赖检查 (20分)
  // 简化的循环检测：检查是否依赖自身或反向依赖
  let circularScore = 20;
  for (const dep of result.dependencies.internal) {
    if (dep.name === skillName) {
      circularScore -= 20;
      result.issues.push('检测到循环依赖：依赖自身');
    }
  }
  result.checks.noCircular = { score: circularScore, max: 20 };

  // 4. 安全版本检查 (10分)
  let securityScore = 10;
  for (const dep of result.dependencies.external) {
    if (dep.version === '*' || dep.version === 'latest') {
      securityScore -= 2;
      result.warnings.push(`不建议使用浮动版本: ${dep.name}@${dep.version}`);
    }
  }
  result.checks.security = { score: Math.max(0, securityScore), max: 10 };

  result.score = declaredScore + Math.max(0, validScore) + circularScore + Math.max(0, securityScore);
  result.grade = result.score >= 90 ? 'A' : result.score >= 75 ? 'B' : 
                 result.score >= 60 ? 'C' : result.score >= 40 ? 'D' : 'F';

  return result;
}

/**
 * 综合评估单个技能
 */
function assessSkill(skill) {
  const completeness = assessCompleteness(skill.name, skill.path);
  const activity = assessActivity(skill.name, skill.path);
  const dependency = assessDependencies(skill.name, skill.path);

  // 计算综合健康分数（加权平均）
  const totalWeight = 40 + 35 + 25; // 完整性:活跃度:依赖 = 40:35:25
  const overallScore = Math.round(
    (completeness.score * 40 + activity.score * 35 + dependency.score * 25) / totalWeight
  );

  let health;
  if (overallScore >= 90) health = 'excellent';
  else if (overallScore >= 75) health = 'good';
  else if (overallScore >= 60) health = 'fair';
  else if (overallScore >= 40) health = 'poor';
  else health = 'critical';

  return {
    name: skill.name,
    path: skill.path,
    timestamp: new Date().toISOString(),
    overall: {
      score: overallScore,
      health,
      grade: overallScore >= 90 ? 'A' : overallScore >= 75 ? 'B' : 
             overallScore >= 60 ? 'C' : overallScore >= 40 ? 'D' : 'F'
    },
    dimensions: {
      completeness,
      activity,
      dependency
    },
    summary: {
      issues: completeness.issues.length + dependency.issues.length,
      warnings: completeness.warnings.length + dependency.warnings.length,
      suggestions: []
    }
  };
}

// ==================== 报告生成 ====================

/**
 * 生成JSON报告
 */
function generateJsonReport(assessments) {
  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      total: assessments.length,
      excellent: assessments.filter(a => a.overall?.health === 'excellent').length,
      good: assessments.filter(a => a.overall?.health === 'good').length,
      fair: assessments.filter(a => a.overall?.health === 'fair').length,
      poor: assessments.filter(a => a.overall?.health === 'poor').length,
      critical: assessments.filter(a => a.overall?.health === 'critical').length,
      averageScore: Math.round(assessments.reduce((sum, a) => sum + (a.overall?.score || 0), 0) / assessments.length)
    },
    metrics: {
      weights: WEIGHTS
    },
    skills: assessments.sort((a, b) => (b.overall?.score || 0) - (a.overall?.score || 0))
  };

  return JSON.stringify(report, null, 2);
}

/**
 * 生成HTML报告
 */
function generateHtmlReport(assessments) {
  const summary = {
    total: assessments.length,
    excellent: assessments.filter(a => a.overall?.health === 'excellent').length,
    good: assessments.filter(a => a.overall?.health === 'good').length,
    fair: assessments.filter(a => a.overall?.health === 'fair').length,
    poor: assessments.filter(a => a.overall?.health === 'poor').length,
    critical: assessments.filter(a => a.overall?.health === 'critical').length,
    averageScore: Math.round(assessments.reduce((sum, a) => sum + (a.overall?.score || 0), 0) / assessments.length)
  };

  const healthColor = {
    excellent: '#4CAF50',
    good: '#8BC34A',
    fair: '#FFC107',
    poor: '#FF9800',
    critical: '#F44336'
  };

  const gradeColor = {
    A: '#4CAF50',
    B: '#8BC34A',
    C: '#FFC107',
    D: '#FF9800',
    F: '#F44336'
  };

  const validAssessments = assessments.filter(a => a.overall);

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>技能健康度评估仪表盘</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      min-height: 100vh;
      color: #e0e0e0;
      padding: 20px;
    }
    .container {
      max-width: 1400px;
      margin: 0 auto;
    }
    header {
      text-align: center;
      padding: 40px 20px;
      margin-bottom: 30px;
    }
    header h1 {
      font-size: 2.5rem;
      background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 10px;
    }
    header p {
      color: #888;
      font-size: 1rem;
    }
    .dashboard-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .stat-card {
      background: rgba(255,255,255,0.05);
      border-radius: 16px;
      padding: 24px;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255,255,255,0.1);
      transition: transform 0.3s ease;
    }
    .stat-card:hover {
      transform: translateY(-5px);
    }
    .stat-card h3 {
      font-size: 0.875rem;
      color: #888;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .stat-value {
      font-size: 2.5rem;
      font-weight: bold;
      margin-bottom: 4px;
    }
    .stat-card.excellent .stat-value { color: #4CAF50; }
    .stat-card.good .stat-value { color: #8BC34A; }
    .stat-card.fair .stat-value { color: #FFC107; }
    .stat-card.poor .stat-value { color: #FF9800; }
    .stat-card.critical .stat-value { color: #F44336; }
    .stat-card.average .stat-value { color: #667eea; }
    
    .chart-container {
      background: rgba(255,255,255,0.05);
      border-radius: 16px;
      padding: 24px;
      margin-bottom: 30px;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .chart-container h2 {
      font-size: 1.25rem;
      margin-bottom: 20px;
      color: #fff;
    }
    
    .distribution-bar {
      display: flex;
      height: 40px;
      border-radius: 8px;
      overflow: hidden;
      margin-bottom: 20px;
    }
    .distribution-segment {
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
      font-size: 0.875rem;
      transition: flex-grow 0.3s ease;
    }
    
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 20px;
      justify-content: center;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.875rem;
    }
    .legend-color {
      width: 16px;
      height: 16px;
      border-radius: 4px;
    }
    
    .skills-table-container {
      background: rgba(255,255,255,0.05);
      border-radius: 16px;
      padding: 24px;
      border: 1px solid rgba(255,255,255,0.1);
      overflow-x: auto;
    }
    .skills-table-container h2 {
      font-size: 1.25rem;
      margin-bottom: 20px;
      color: #fff;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      padding: 12px 16px;
      text-align: left;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    th {
      font-weight: 600;
      color: #888;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    tr:hover {
      background: rgba(255,255,255,0.03);
    }
    .skill-name {
      font-weight: 600;
      color: #fff;
    }
    .score-bar {
      width: 100px;
      height: 8px;
      background: rgba(255,255,255,0.1);
      border-radius: 4px;
      overflow: hidden;
    }
    .score-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.5s ease;
    }
    .grade-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-weight: bold;
      font-size: 0.75rem;
    }
    .health-indicator {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .health-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }
    
    .metrics-breakdown {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .metric-card {
      background: rgba(255,255,255,0.05);
      border-radius: 16px;
      padding: 20px;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .metric-card h3 {
      font-size: 1rem;
      margin-bottom: 16px;
      color: #fff;
    }
    .metric-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0;
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    .metric-item:last-child {
      border-bottom: none;
    }
    .metric-label {
      font-size: 0.875rem;
      color: #888;
    }
    .metric-value {
      font-weight: 600;
      color: #fff;
    }
    
    footer {
      text-align: center;
      padding: 40px 20px;
      color: #666;
      font-size: 0.875rem;
    }
    
    @media (max-width: 768px) {
      header h1 { font-size: 1.75rem; }
      .dashboard-grid { grid-template-columns: 1fr; }
      .metrics-breakdown { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🩺 技能健康度评估仪表盘</h1>
      <p>生成时间: ${new Date().toLocaleString('zh-CN')}</p>
    </header>
    
    <div class="dashboard-grid">
      <div class="stat-card average">
        <h3>平均健康分数</h3>
        <div class="stat-value">${summary.averageScore}</div>
        <div style="color: #888; font-size: 0.875rem;">满分 100</div>
      </div>
      <div class="stat-card excellent">
        <h3>优秀技能</h3>
        <div class="stat-value">${summary.excellent}</div>
        <div style="color: #888; font-size: 0.875rem;">≥90分</div>
      </div>
      <div class="stat-card good">
        <h3>良好技能</h3>
        <div class="stat-value">${summary.good}</div>
        <div style="color: #888; font-size: 0.875rem;">75-89分</div>
      </div>
      <div class="stat-card fair">
        <h3>一般技能</h3>
        <div class="stat-value">${summary.fair}</div>
        <div style="color: #888; font-size: 0.875rem;">60-74分</div>
      </div>
      <div class="stat-card poor">
        <h3>较差技能</h3>
        <div class="stat-value">${summary.poor}</div>
        <div style="color: #888; font-size: 0.875rem;">40-59分</div>
      </div>
      <div class="stat-card critical">
        <h3>需关注技能</h3>
        <div class="stat-value">${summary.critical}</div>
        <div style="color: #888; font-size: 0.875rem;"><40分</div>
      </div>
    </div>
    
    <div class="chart-container">
      <h2>健康度分布</h2>
      <div class="distribution-bar">
        ${summary.excellent > 0 ? `<div class="distribution-segment" style="background: #4CAF50; flex: ${summary.excellent}">${summary.excellent > 2 ? summary.excellent : ''}</div>` : ''}
        ${summary.good > 0 ? `<div class="distribution-segment" style="background: #8BC34A; flex: ${summary.good}">${summary.good > 2 ? summary.good : ''}</div>` : ''}
        ${summary.fair > 0 ? `<div class="distribution-segment" style="background: #FFC107; flex: ${summary.fair}">${summary.fair > 2 ? summary.fair : ''}</div>` : ''}
        ${summary.poor > 0 ? `<div class="distribution-segment" style="background: #FF9800; flex: ${summary.poor}">${summary.poor > 2 ? summary.poor : ''}</div>` : ''}
        ${summary.critical > 0 ? `<div class="distribution-segment" style="background: #F44336; flex: ${summary.critical}">${summary.critical > 2 ? summary.critical : ''}</div>` : ''}
      </div>
      <div class="legend">
        <div class="legend-item"><div class="legend-color" style="background: #4CAF50;"></div>优秀 (${summary.excellent})</div>
        <div class="legend-item"><div class="legend-color" style="background: #8BC34A;"></div>良好 (${summary.good})</div>
        <div class="legend-item"><div class="legend-color" style="background: #FFC107;"></div>一般 (${summary.fair})</div>
        <div class="legend-item"><div class="legend-color" style="background: #FF9800;"></div>较差 (${summary.poor})</div>
        <div class="legend-item"><div class="legend-color" style="background: #F44336;"></div>需关注 (${summary.critical})</div>
      </div>
    </div>
    
    <div class="metrics-breakdown">
      <div class="metric-card">
        <h3>📊 评估维度权重</h3>
        <div class="metric-item">
          <span class="metric-label">完整性 (Completeness)</span>
          <span class="metric-value">40%</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">活跃度 (Activity)</span>
          <span class="metric-value">35%</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">依赖健康度 (Dependency)</span>
          <span class="metric-value">25%</span>
        </div>
      </div>
      
      <div class="metric-card">
        <h3>📈 评估标准</h3>
        <div class="metric-item">
          <span class="metric-label">A级 (优秀)</span>
          <span class="metric-value">90-100分</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">B级 (良好)</span>
          <span class="metric-value">75-89分</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">C级 (一般)</span>
          <span class="metric-value">60-74分</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">D级 (较差)</span>
          <span class="metric-value">40-59分</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">F级 (需关注)</span>
          <span class="metric-value"><40分</span>
        </div>
      </div>
    </div>
    
    <div class="skills-table-container">
      <h2>📋 技能详细评估</h2>
      <table>
        <thead>
          <tr>
            <th>排名</th>
            <th>技能名称</th>
            <th>综合分数</th>
            <th>等级</th>
            <th>完整性</th>
            <th>活跃度</th>
            <th>依赖</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          ${validAssessments.map((a, i) => `
          <tr>
            <td>#${i + 1}</td>
            <td class="skill-name">${a.name}</td>
            <td>
              <div style="display: flex; align-items: center; gap: 10px;">
                <div class="score-bar">
                  <div class="score-fill" style="width: ${a.overall.score}%; background: ${gradeColor[a.overall.grade]}"></div>
                </div>
                <span style="font-weight: 600;">${a.overall.score}</span>
              </div>
            </td>
            <td><span class="grade-badge" style="background: ${gradeColor[a.overall.grade]}20; color: ${gradeColor[a.overall.grade]}">${a.overall.grade}</span></td>
            <td><span class="grade-badge" style="background: ${gradeColor[a.dimensions.completeness.grade]}20; color: ${gradeColor[a.dimensions.completeness.grade]}">${a.dimensions.completeness.grade}</span></td>
            <td><span class="grade-badge" style="background: ${gradeColor[a.dimensions.activity.grade]}20; color: ${gradeColor[a.dimensions.activity.grade]}">${a.dimensions.activity.grade}</span></td>
            <td><span class="grade-badge" style="background: ${gradeColor[a.dimensions.dependency.grade]}20; color: ${gradeColor[a.dimensions.dependency.grade]}">${a.dimensions.dependency.grade}</span></td>
            <td>
              <span class="health-indicator">
                <span class="health-dot" style="background: ${healthColor[a.overall.health]}"></span>
                <span style="font-size: 0.875rem; color: ${healthColor[a.overall.health]}">
                  ${a.overall.health === 'excellent' ? '优秀' : 
                    a.overall.health === 'good' ? '良好' : 
                    a.overall.health === 'fair' ? '一般' : 
                    a.overall.health === 'poor' ? '较差' : '需关注'}
                </span>
              </span>
            </td>
          </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    
    <footer>
      <p>技能健康度评估仪表盘 v1.0.0 | OpenClaw System Monitor</p>
      <p style="margin-top: 8px; color: #444;">由 system-monitor/skill-health-dashboard.js 自动生成</p>
    </footer>
  </div>
  
  <script>
    // 添加简单的交互动画
    document.querySelectorAll('.score-fill').forEach(bar => {
      const width = bar.style.width;
      bar.style.width = '0';
      setTimeout(() => {
        bar.style.width = width;
      }, 100);
    });
  </script>
</body>
</html>`;

  return html;
}

// ==================== 主程序 ====================

function main() {
  console.log('🔍 开始技能健康度评估...\n');

  // 获取所有技能
  const skills = getAllSkills();
  console.log(`📦 发现 ${skills.length} 个技能\n`);

  // 评估每个技能
  const assessments = [];
  for (const skill of skills) {
    if (CONFIG.verbose) {
      console.log(`  评估中: ${skill.name}...`);
    }
    try {
      const assessment = assessSkill(skill);
      assessments.push(assessment);
    } catch (error) {
      console.error(`  ❌ 评估失败 ${skill.name}:`, error.message);
      assessments.push({
        name: skill.name,
        path: skill.path,
        overall: { score: 0, health: 'critical', grade: 'F' },
        error: error.message
      });
    }
  }

  console.log('\n✅ 评估完成!\n');

  // 创建输出目录
  if (!fs.existsSync(CONFIG.outputDir)) {
    fs.mkdirSync(CONFIG.outputDir, { recursive: true });
  }

  // 生成JSON报告
  if (CONFIG.generateJson || (!CONFIG.generateHtml && !process.argv.includes('--no-json'))) {
    const jsonPath = path.join(CONFIG.outputDir, 'skill-health-report.json');
    fs.writeFileSync(jsonPath, generateJsonReport(assessments));
    console.log(`📄 JSON报告: ${jsonPath}`);
  }

  // 生成HTML报告
  if (CONFIG.generateHtml || (!CONFIG.generateJson && !process.argv.includes('--no-html'))) {
    const htmlPath = path.join(CONFIG.outputDir, 'skill-health-dashboard.html');
    fs.writeFileSync(htmlPath, generateHtmlReport(assessments));
    console.log(`🌐 HTML报告: ${htmlPath}`);
  }

  // 控制台摘要
  console.log('\n📊 评估摘要:');
  console.log('─'.repeat(50));
  const summary = {
    excellent: assessments.filter(a => a.overall?.health === 'excellent').length,
    good: assessments.filter(a => a.overall?.health === 'good').length,
    fair: assessments.filter(a => a.overall?.health === 'fair').length,
    poor: assessments.filter(a => a.overall?.health === 'poor').length,
    critical: assessments.filter(a => a.overall?.health === 'critical').length,
    avg: Math.round(assessments.reduce((sum, a) => sum + (a.overall?.score || 0), 0) / assessments.length)
  };
  console.log(`  平均分数: ${summary.avg}/100`);
  console.log(`  优秀(A):  ${summary.excellent} 个`);
  console.log(`  良好(B):  ${summary.good} 个`);
  console.log(`  一般(C):  ${summary.fair} 个`);
  console.log(`  较差(D):  ${summary.poor} 个`);
  console.log(`  需关注(F): ${summary.critical} 个`);
  console.log('─'.repeat(50));

  // 显示Top 5和Bottom 5
  console.log('\n🏆 Top 5 健康技能:');
  assessments
    .filter(a => a.overall)
    .sort((a, b) => b.overall.score - a.overall.score)
    .slice(0, 5)
    .forEach((a, i) => console.log(`  ${i+1}. ${a.name} - ${a.overall.score}分 (${a.overall.grade})`));

  console.log('\n⚠️  Bottom 5 需要关注:');
  assessments
    .filter(a => a.overall)
    .sort((a, b) => a.overall.score - b.overall.score)
    .slice(0, 5)
    .forEach((a, i) => console.log(`  ${i+1}. ${a.name} - ${a.overall.score}分 (${a.overall.grade})`));

  console.log('\n✨ 完成!\n');
}

// 运行主程序
main();

// 导出模块接口
export {
  assessSkill,
  assessCompleteness,
  assessActivity,
  assessDependencies,
  generateJsonReport,
  generateHtmlReport,
  getAllSkills,
  CONFIG,
  WEIGHTS
};
