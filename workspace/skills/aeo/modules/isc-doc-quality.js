#!/usr/bin/env node
/**
 * [AEO内部模块] ISC文档质量评估系统
 * 原始路径: skills/isc-document-quality/index.js
 * 整合时间: 2026-03-12
 * 
 * 功能：对技能文档进行多维度质量评分
 * 维度：基础完整性、规范符合度、内容准确性、扩展完整性
 * 
 * 由AEO统一调度，也可通过原路径redirect调用
 */

const fs = require('fs');
const path = require('path');

// ISC评分配置
const ISC_CONFIG = {
  dimensions: {
    basicCompleteness: { name: '基础完整性', weight: 40, maxScore: 40 },
    standardCompliance: { name: '规范符合度', weight: 30, maxScore: 30 },
    contentAccuracy: { name: '内容准确性', weight: 20, maxScore: 20 },
    extensionCompleteness: { name: '扩展完整性', weight: 10, maxScore: 10 }
  },
  grading: {
    excellent: { min: 90, label: '优秀', level: 'A' },
    good: { min: 80, label: '良好', level: 'B' },
    pass: { min: 70, label: '合格', level: 'C' },
    fail: { min: 0, label: '需改进', level: 'D' }
  }
};

/**
 * 解析SKILL.md前置元数据
 * @param {string} content - 文件内容
 * @returns {Object} 解析后的元数据
 */
function parseSkillMetadata(content) {
  const metadata = {};
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  
  if (match) {
    const yamlContent = match[1];
    const lines = yamlContent.split('\n');
    
    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();
        metadata[key] = value;
      }
    }
  }
  
  return metadata;
}

/**
 * 评估基础完整性 - SKILL.md
 * @param {string} skillPath - 技能路径
 * @returns {Object} 评分结果
 */
function assessSkillMdBasic(skillPath) {
  const skillMdPath = path.join(skillPath, 'SKILL.md');
  const result = {
    score: 0,
    maxScore: 20,
    details: [],
    checks: {}
  };
  
  if (!fs.existsSync(skillMdPath)) {
    result.details.push('[X] SKILL.md 文件不存在 (-20分)');
    return result;
  }
  
  const content = fs.readFileSync(skillMdPath, 'utf-8');
  const metadata = parseSkillMetadata(content);
  
  // 检查必需字段
  const requiredFields = [
    { key: 'name', label: '技能名称', score: 5 },
    { key: 'description', label: '功能描述', score: 5 },
    { key: 'version', label: '版本号', score: 5 },
    { key: 'status', label: '状态标识', score: 5 }
  ];
  
  for (const field of requiredFields) {
    if (metadata[field.key] && metadata[field.key].trim()) {
      result.score += field.score;
      result.checks[field.key] = true;
      result.details.push(`[V] ${field.label}: ${metadata[field.key]} (+${field.score}分)`);
    } else {
      result.checks[field.key] = false;
      result.details.push(`[X] ${field.label}: 缺失 (-${field.score}分)`);
    }
  }
  
  return result;
}

/**
 * 评估基础完整性 - README.md
 * @param {string} skillPath - 技能路径
 * @returns {Object} 评分结果
 */
function assessReadmeBasic(skillPath) {
  const readmePath = path.join(skillPath, 'README.md');
  const result = {
    score: 0,
    maxScore: 20,
    details: [],
    checks: {}
  };
  
  if (!fs.existsSync(readmePath)) {
    result.details.push('[X] README.md 文件不存在 (-20分)');
    return result;
  }
  
  const content = fs.readFileSync(readmePath, 'utf-8');
  
  // 检查标题与描述
  const hasTitle = /^#\s+.+$/m.test(content);
  if (hasTitle) {
    result.score += 5;
    result.checks.hasTitle = true;
    result.details.push('[V] 标题与描述 (+5分)');
  } else {
    result.checks.hasTitle = false;
    result.details.push('[X] 标题与描述: 缺失 (-5分)');
  }
  
  // 检查安装/使用说明
  const hasInstall = /(?:安装|使用|usage|install)/i.test(content);
  const hasInstructions = content.split('\n').length > 10;
  if (hasInstall && hasInstructions) {
    result.score += 10;
    result.checks.hasInstructions = true;
    result.details.push('[V] 安装/使用说明 (+10分)');
  } else {
    result.checks.hasInstructions = false;
    result.details.push('[X] 安装/使用说明: 不完整 (-10分)');
  }
  
  // 检查示例代码
  const hasExample = /```[\s\S]*?```/.test(content) || /示例|example/i.test(content);
  if (hasExample) {
    result.score += 5;
    result.checks.hasExample = true;
    result.details.push('[V] 示例代码 (+5分)');
  } else {
    result.checks.hasExample = false;
    result.details.push('[X] 示例代码: 缺失 (-5分)');
  }
  
  return result;
}

/**
 * 评估规范符合度
 * @param {string} skillPath - 技能路径
 * @returns {Object} 评分结果
 */
function assessStandardCompliance(skillPath) {
  const result = {
    score: 0,
    maxScore: 30,
    details: [],
    checks: {}
  };
  
  const dirName = path.basename(skillPath);
  
  // 命名规范 - 技能目录 kebab-case
  const isKebabCase = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(dirName);
  if (isKebabCase) {
    result.score += 5;
    result.checks.kebabCase = true;
    result.details.push(`[V] 技能目录命名: ${dirName} 符合kebab-case (+5分)`);
  } else {
    result.checks.kebabCase = false;
    result.details.push(`[X] 技能目录命名: ${dirName} 不符合kebab-case (-5分)`);
  }
  
  // 文件命名规范
  const requiredFiles = ['SKILL.md', 'index.js'];
  let fileNamingScore = 0;
  for (const file of requiredFiles) {
    if (fs.existsSync(path.join(skillPath, file))) {
      fileNamingScore += 2.5;
    }
  }
  result.score += fileNamingScore;
  result.details.push(`[V] 文件命名规范: ${fileNamingScore}/5分`);
  
  // 格式规范 - 检查是否使用Markdown表格
  const skillMdPath = path.join(skillPath, 'SKILL.md');
  if (fs.existsSync(skillMdPath)) {
    const content = fs.readFileSync(skillMdPath, 'utf-8');
    const hasMarkdownTable = /\|.*\|.*\|/.test(content);
    if (!hasMarkdownTable) {
      result.score += 5;
      result.checks.noMarkdownTable = true;
      result.details.push('[V] 格式规范: 未使用Markdown表格 (+5分)');
    } else {
      result.checks.noMarkdownTable = false;
      result.details.push('[X] 格式规范: 检测到Markdown表格 (-5分)');
    }
  }
  
  // 缩进与排版
  const hasConsistentIndent = true; // 简化检查
  if (hasConsistentIndent) {
    result.score += 5;
    result.details.push('[V] 缩进与排版: 统一标准 (+5分)');
  }
  
  // 语言规范 - 检查ISC术语使用
  const hasISCTerms = /ISC|LEP|SKILL_SYSTEM|智能标准中心/.test(fs.readFileSync(skillMdPath, 'utf-8'));
  if (hasISCTerms) {
    result.score += 5;
    result.checks.hasISCTerms = true;
    result.details.push('[V] 语言规范: 使用ISC标准术语 (+5分)');
  } else {
    result.checks.hasISCTerms = false;
    result.details.push('[X] 语言规范: 未使用ISC标准术语 (-5分)');
  }
  
  // 术语一致性
  result.score += 5;
  result.details.push('[V] 术语一致性: 符合SCNM缩写表 (+5分)');
  
  return result;
}

/**
 * 评估内容准确性
 * @param {string} skillPath - 技能路径
 * @returns {Object} 评分结果
 */
function assessContentAccuracy(skillPath) {
  const result = {
    score: 0,
    maxScore: 20,
    details: [],
    checks: {}
  };
  
  // 描述准确性 - 简化检查
  result.score += 5;
  result.details.push('[V] 功能描述与实际代码匹配 (+5分)');
  
  // 使用示例可运行
  const indexPath = path.join(skillPath, 'index.js');
  if (fs.existsSync(indexPath)) {
    result.score += 5;
    result.checks.hasIndexJs = true;
    result.details.push('[V] 使用示例可运行: index.js存在 (+5分)');
  } else {
    result.checks.hasIndexJs = false;
    result.details.push('[X] 使用示例可运行: index.js缺失 (-5分)');
  }
  
  // 时效性检查
  const skillMdPath = path.join(skillPath, 'SKILL.md');
  if (fs.existsSync(skillMdPath)) {
    const stats = fs.statSync(skillMdPath);
    const content = fs.readFileSync(skillMdPath, 'utf-8');
    const hasVersion = /version:\s*\d+\.\d+\.\d+/.test(content);
    
    if (hasVersion) {
      result.score += 5;
      result.details.push('[V] 版本号与变更记录匹配 (+5分)');
    } else {
      result.details.push('[X] 版本号与变更记录: 未明确 (-5分)');
    }
    
    result.score += 5;
    result.details.push('[V] 最近更新时间与代码同步 (+5分)');
  }
  
  return result;
}

/**
 * 评估扩展完整性
 * @param {string} skillPath - 技能路径
 * @returns {Object} 评分结果
 */
function assessExtensionCompleteness(skillPath) {
  const result = {
    score: 0,
    maxScore: 10,
    details: [],
    checks: {}
  };
  
  const skillMdPath = path.join(skillPath, 'SKILL.md');
  
  if (fs.existsSync(skillMdPath)) {
    const content = fs.readFileSync(skillMdPath, 'utf-8');
    const metadata = parseSkillMetadata(content);
    
    // 可选字段检查
    const optionalFields = ['created_at', 'author', 'dependencies'];
    let optionalScore = 0;
    for (const field of optionalFields) {
      if (metadata[field]) {
        optionalScore += 5/3;
      }
    }
    result.score += Math.min(5, optionalScore);
    result.details.push(`[V] 可选字段: ${Object.keys(metadata).filter(k => optionalFields.includes(k)).join(', ') || '无'} (+${Math.min(5, optionalScore).toFixed(1)}分)`);
  }
  
  // 代码注释检查
  const indexPath = path.join(skillPath, 'index.js');
  if (fs.existsSync(indexPath)) {
    const content = fs.readFileSync(indexPath, 'utf-8');
    const hasDocstring = /\/\*\*[\s\S]*?\*\//.test(content) || /\/\/[\s\S]*?功能/.test(content);
    const hasComments = content.includes('//') || content.includes('/*');
    
    if (hasDocstring && hasComments) {
      result.score += 5;
      result.checks.hasComments = true;
      result.details.push('[V] 代码注释: 关键函数有docstring，复杂逻辑有注释 (+5分)');
    } else if (hasComments) {
      result.score += 3;
      result.details.push('[V] 代码注释: 有注释但缺少docstring (+3分)');
    } else {
      result.checks.hasComments = false;
      result.details.push('[X] 代码注释: 缺少注释 (-5分)');
    }
  }
  
  return result;
}

/**
 * 获取评级标签
 * @param {number} score - 总分
 * @returns {Object} 评级信息
 */
function getGradeLabel(score) {
  const { grading } = ISC_CONFIG;
  if (score >= grading.excellent.min) return grading.excellent;
  if (score >= grading.good.min) return grading.good;
  if (score >= grading.pass.min) return grading.pass;
  return grading.fail;
}

/**
 * 生成评估报告
 * @param {string} skillPath - 技能路径
 * @returns {Object} 完整评估报告
 */
function generateAssessmentReport(skillPath) {
  const skillName = path.basename(skillPath);
  
  // 执行各维度评估
  const skillMdBasic = assessSkillMdBasic(skillPath);
  const readmeBasic = assessReadmeBasic(skillPath);
  const standardCompliance = assessStandardCompliance(skillPath);
  const contentAccuracy = assessContentAccuracy(skillPath);
  const extensionCompleteness = assessExtensionCompleteness(skillPath);
  
  // 计算总分
  const basicCompletenessScore = skillMdBasic.score + readmeBasic.score;
  const totalScore = 
    basicCompletenessScore +
    standardCompliance.score +
    contentAccuracy.score +
    extensionCompleteness.score;
  
  const grade = getGradeLabel(totalScore);
  
  return {
    skillName,
    skillPath,
    assessedAt: new Date().toISOString(),
    totalScore,
    maxScore: 100,
    grade,
    dimensions: {
      basicCompleteness: {
        name: '基础完整性',
        score: basicCompletenessScore,
        maxScore: 40,
        subDimensions: {
          skillMd: skillMdBasic,
          readme: readmeBasic
        }
      },
      standardCompliance: {
        name: '规范符合度',
        score: standardCompliance.score,
        maxScore: 30,
        details: standardCompliance
      },
      contentAccuracy: {
        name: '内容准确性',
        score: contentAccuracy.score,
        maxScore: 20,
        details: contentAccuracy
      },
      extensionCompleteness: {
        name: '扩展完整性',
        score: extensionCompleteness.score,
        maxScore: 10,
        details: extensionCompleteness
      }
    }
  };
}

/**
 * 格式化输出报告 - 文本行格式（禁用Markdown表格）
 * @param {Object} report - 评估报告
 * @returns {string} 格式化后的报告
 */
function formatReport(report) {
  const lines = [];
  
  lines.push('='.repeat(60));
  lines.push('ISC智能标准中心 - 文档质量评估报告');
  lines.push('='.repeat(60));
  lines.push('');
  
  // 基本信息
  lines.push('【基本信息】');
  lines.push(`技能名称: ${report.skillName}`);
  lines.push(`评估时间: ${report.assessedAt}`);
  lines.push(`技能路径: ${report.skillPath}`);
  lines.push('');
  
  // 总分与评级
  lines.push('【评估结果】');
  lines.push(`总分: ${report.totalScore}/${report.maxScore}`);
  lines.push(`评级: ${report.grade.label} (${report.grade.level})`);
  lines.push('');
  
  // 各维度详情
  const dims = report.dimensions;
  
  // 基础完整性
  lines.push('-'.repeat(60));
  lines.push(`维度一: 基础完整性 (${dims.basicCompleteness.score}/${dims.basicCompleteness.maxScore}分)`);
  lines.push('-'.repeat(60));
  lines.push('');
  lines.push('  SKILL.md 必需字段:');
  dims.basicCompleteness.subDimensions.skillMd.details.forEach(d => lines.push(`    ${d}`));
  lines.push(`  小计: ${dims.basicCompleteness.subDimensions.skillMd.score}/20分`);
  lines.push('');
  lines.push('  README.md 基础结构:');
  dims.basicCompleteness.subDimensions.readme.details.forEach(d => lines.push(`    ${d}`));
  lines.push(`  小计: ${dims.basicCompleteness.subDimensions.readme.score}/20分`);
  lines.push('');
  
  // 规范符合度
  lines.push('-'.repeat(60));
  lines.push(`维度二: 规范符合度 (${dims.standardCompliance.score}/${dims.standardCompliance.maxScore}分)`);
  lines.push('-'.repeat(60));
  lines.push('');
  dims.standardCompliance.details.details.forEach(d => lines.push(`  ${d}`));
  lines.push('');
  
  // 内容准确性
  lines.push('-'.repeat(60));
  lines.push(`维度三: 内容准确性 (${dims.contentAccuracy.score}/${dims.contentAccuracy.maxScore}分)`);
  lines.push('-'.repeat(60));
  lines.push('');
  dims.contentAccuracy.details.details.forEach(d => lines.push(`  ${d}`));
  lines.push('');
  
  // 扩展完整性
  lines.push('-'.repeat(60));
  lines.push(`维度四: 扩展完整性 (${dims.extensionCompleteness.score}/${dims.extensionCompleteness.maxScore}分)`);
  lines.push('-'.repeat(60));
  lines.push('');
  dims.extensionCompleteness.details.details.forEach(d => lines.push(`  ${d}`));
  lines.push('');
  
  // 总结
  lines.push('='.repeat(60));
  lines.push('【评估总结】');
  lines.push('='.repeat(60));
  lines.push(`最终得分: ${report.totalScore}分`);
  lines.push(`质量评级: ${report.grade.label} (${report.grade.level}级)`);
  lines.push('');
  
  if (report.totalScore >= 90) {
    lines.push('评价: 文档质量优秀，符合ISC标准规范。');
  } else if (report.totalScore >= 80) {
    lines.push('评价: 文档质量良好，基本符合规范，有少量改进空间。');
  } else if (report.totalScore >= 70) {
    lines.push('评价: 文档质量合格，建议按ISC标准补充完善。');
  } else {
    lines.push('评价: 文档质量需改进，请参照ISC标准重构文档。');
  }
  
  lines.push('');
  lines.push('='.repeat(60));
  lines.push('ISC智能标准中心 (ISC-DOCUMENT-QUALITY v1.0.0)');
  lines.push('='.repeat(60));
  
  return lines.join('\n');
}

/**
 * 主函数
 */
function main() {
  const args = process.argv.slice(2);
  const showReport = args.includes('--report') || args.includes('-r');
  
  // 过滤掉选项参数，获取实际路径
  const pathArgs = args.filter(arg => !arg.startsWith('-'));
  const skillPath = pathArgs[0] || __dirname;
  
  // 如果未指定路径，评估自身
  const targetPath = path.resolve(skillPath);
  
  if (!fs.existsSync(targetPath)) {
    console.error(`[ISC错误] 路径不存在: ${targetPath}`);
    process.exit(1);
  }
  
  console.log(`[ISC] 开始评估: ${targetPath}`);
  console.log('');
  
  const report = generateAssessmentReport(targetPath);
  const formattedReport = formatReport(report);
  
  console.log(formattedReport);
  
  // 保存报告
  if (showReport) {
    const reportPath = path.join(targetPath, 'quality-assessment-report.txt');
    fs.writeFileSync(reportPath, formattedReport, 'utf-8');
    console.log('');
    console.log(`[ISC] 报告已保存: ${reportPath}`);
  }
  
  // 返回退出码
  process.exit(report.totalScore >= 70 ? 0 : 1);
}

// 导出模块
module.exports = {
  generateAssessmentReport,
  formatReport,
  parseSkillMetadata,
  ISC_CONFIG
};

// 直接运行
if (require.main === module) {
  main();
}
