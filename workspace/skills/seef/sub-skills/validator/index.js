const { SKILLS_DIR, REPORTS_DIR, WORKSPACE } = require('../../../_shared/paths');
/**
 * SEEF Validator - 技能验证器
 * P1阶段实现：准入准出门禁 + ISC规则校验
 * P0修复：ISC规则动态加载（不再硬编码，从 isc-core/rules/ 实时读取）
 * @version 1.1.0
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getInstance: getISCRuleLoader } = require('./isc-rule-loader');

/**
 * 验证技能质量
 * @param {Object} input - 输入参数
 * @param {string} input.skillId - 技能ID
 * @param {string} input.skillPath - 技能路径
 * @param {string} input.skillName - 技能名称
 * @param {string} input.phase - 验证阶段 (admission/checkout)
 * @param {string} input.trigger - 触发来源
 * @returns {Promise<Object>} 验证结果
 */
async function validate(input) {
  const { skillId, skillPath, skillName, phase = 'checkout', trigger } = input;
  
  console.log(`[SEEF Validator] 开始验证: ${skillName} (${skillId})`);
  console.log(`[SEEF Validator] 验证阶段: ${phase}`);
  console.log(`[SEEF Validator] 触发来源: ${trigger}`);
  
  try {
    // 1. 加载技能包
    const skillPackage = await loadSkillPackage(skillPath);
    
    // 2. 初始化ISC规则动态加载器（首次调用时扫描，后续自动热更新）
    const ruleLoader = getISCRuleLoader();
    await ruleLoader.init();
    
    // 3. 加载静态ISC规则（向后兼容）
    const iscRules = await loadISCRules();
    
    // 4. 执行功能验证
    const functionalityResult = await validateFunctionality(skillPackage);
    
    // 5. 执行质量验证
    const qualityResult = await validateQuality(skillPackage, iscRules);
    
    // 6. 执行规范验证
    const complianceResult = await validateCompliance(skillPackage, iscRules);
    
    // 7. ★ 动态ISC规则评估（P0修复核心）
    const dynamicRuleResult = ruleLoader.evaluateRules(skillPackage, phase);
    
    // 8. 准入/准出门禁判断（整合动态规则结果）
    const gateResult = evaluateGate(phase, functionalityResult, qualityResult, complianceResult, iscRules, dynamicRuleResult);
    
    // 9. 生成验证报告
    const loaderStats = ruleLoader.getStats();
    const report = {
      skillId,
      skillName,
      skillPath,
      timestamp: Date.now(),
      phase,
      trigger,
      passed: gateResult.passed,
      score: gateResult.score,
      gates: {
        functionality: functionalityResult,
        quality: qualityResult,
        compliance: complianceResult,
        dynamicISCRules: {
          passed: dynamicRuleResult.passed,
          score: dynamicRuleResult.score,
          totalRules: dynamicRuleResult.totalRules,
          passedRules: dynamicRuleResult.passedRules,
          failedRules: dynamicRuleResult.failedRules,
          results: dynamicRuleResult.results,
          summary: `动态ISC规则: ${dynamicRuleResult.passedRules}/${dynamicRuleResult.totalRules} 通过`
        }
      },
      violations: gateResult.violations,
      recommendations: gateResult.recommendations,
      nextSteps: gateResult.nextSteps,
      metadata: {
        validatorVersion: '1.1.0',
        iscRulesVersion: iscRules.version,
        dynamicRulesLoaded: loaderStats.cachedRules,
        dynamicRulesHotReloaded: loaderStats.hotReloaded,
        phaseDistribution: loaderStats.phaseDistribution,
        validationTime: Date.now()
      }
    };
    
    // 10. 保存验证报告
    await saveReport(report);
    
    // 11. 生成准出证明（如果通过）
    if (report.passed && phase === 'checkout') {
      await generateCheckoutReceipt(report);
    }
    
    console.log(`[SEEF Validator] 验证完成: ${report.passed ? '✅ 通过' : '❌ 未通过'}`);
    console.log(`[SEEF Validator] 得分: ${report.score}/100`);
    console.log(`[SEEF Validator] 违规项: ${report.violations.length}`);
    console.log(`[SEEF Validator] 动态规则: ${loaderStats.cachedRules} 条已加载, ${loaderStats.hotReloaded} 次热更新`);
    
    return report;
    
  } catch (error) {
    console.error(`[SEEF Validator] 验证失败:`, error.message);
    
    return {
      success: false,
      passed: false,
      error: error.message,
      skillId,
      skillName,
      timestamp: Date.now()
    };
  }
}

/**
 * 加载技能包
 */
async function loadSkillPackage(skillPath) {
  const fullPath = path.resolve(WORKSPACE, skillPath);
  
  if (!fs.existsSync(fullPath)) {
    throw new Error(`技能路径不存在: ${fullPath}`);
  }
  
  // 检查关键文件
  const skillMdPath = path.join(fullPath, 'SKILL.md');
  const packageJsonPath = path.join(fullPath, 'package.json');
  const indexJsPath = path.join(fullPath, 'index.js');
  const indexCjsPath = path.join(fullPath, 'index.cjs');
  
  const hasSkillMd = fs.existsSync(skillMdPath);
  const hasPackageJson = fs.existsSync(packageJsonPath);
  const hasIndexJs = fs.existsSync(indexJsPath);
  const hasIndexCjs = fs.existsSync(indexCjsPath);
  
  // 读取文件内容
  let skillMdContent = null;
  let packageJson = null;
  let entryContent = null;
  
  if (hasSkillMd) {
    skillMdContent = fs.readFileSync(skillMdPath, 'utf-8');
  }
  
  if (hasPackageJson) {
    try {
      packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    } catch (error) {
      console.warn(`[SEEF Validator] package.json解析失败: ${error.message}`);
    }
  }
  
  if (hasIndexJs) {
    entryContent = fs.readFileSync(indexJsPath, 'utf-8');
  } else if (hasIndexCjs) {
    entryContent = fs.readFileSync(indexCjsPath, 'utf-8');
  }
  
  // 统计文件信息
  const files = fs.readdirSync(fullPath, { recursive: true });
  let fileCount = 0;
  let totalSize = 0;
  
  files.forEach(file => {
    const filePath = path.join(fullPath, file);
    if (fs.statSync(filePath).isFile()) {
      fileCount++;
      totalSize += fs.statSync(filePath).size;
    }
  });
  
  return {
    path: fullPath,
    hasSkillMd,
    hasPackageJson,
    hasIndexJs,
    hasIndexCjs,
    hasEntry: hasIndexJs || hasIndexCjs,
    fileCount,
    totalSize,
    skillMdContent,
    packageJson,
    entryContent,
    files: files.filter(f => fs.statSync(path.join(fullPath, f)).isFile())
  };
}

/**
 * 加载ISC规则
 */
async function loadISCRules() {
  const iscConfigPath = path.join(SKILLS_DIR, 'isc-core/config');
  
  // 默认规则
  const defaultRules = {
    version: '1.0.0',
    admission: {
      mandatory: [
        'has_skill_md',
        'has_entry_point',
        'has_description',
        'has_usage_section'
      ],
      optional: [
        'has_package_json',
        'has_examples',
        'has_error_handling',
        'has_tests'
      ],
      thresholds: {
        mandatory_pass_rate: 100,
        optional_pass_rate: 75
      }
    },
    checkout: {
      mandatory: [
        'functionality_works',
        'no_critical_issues',
        'isc_compliant',
        'documentation_complete'
      ],
      optional: [
        'performance_acceptable',
        'security_checked',
        'test_coverage_adequate'
      ],
      thresholds: {
        mandatory_pass_rate: 100,
        optional_pass_rate: 95,
        min_score: 80
      }
    },
    quality: {
      min_documentation_lines: 20,
      min_code_lines: 10,
      max_file_size: 1048576, // 1MB
      required_sections: ['Description', 'Usage', 'Examples']
    }
  };
  
  // 尝试加载自定义规则
  const customRulesPath = path.join(iscConfigPath, 'validation-rules.json');
  if (fs.existsSync(customRulesPath)) {
    try {
      const customRules = JSON.parse(fs.readFileSync(customRulesPath, 'utf-8'));
      return { ...defaultRules, ...customRules };
    } catch (error) {
      console.warn(`[SEEF Validator] 自定义规则加载失败，使用默认规则: ${error.message}`);
    }
  }
  
  return defaultRules;
}

/**
 * 功能验证
 */
async function validateFunctionality(skillPackage) {
  const checks = [];
  
  // 检查1: 入口文件存在且可解析
  if (skillPackage.hasEntry) {
    try {
      // 尝试语法检查
      if (skillPackage.entryContent) {
        // 简单的语法检查（检查是否有明显的语法错误）
        const hasSyntaxError = skillPackage.entryContent.includes('SyntaxError');
        checks.push({
          name: 'entry_point_parseable',
          passed: !hasSyntaxError,
          message: hasSyntaxError ? '入口文件包含语法错误' : '入口文件可解析'
        });
      }
    } catch (error) {
      checks.push({
        name: 'entry_point_parseable',
        passed: false,
        message: `入口文件解析失败: ${error.message}`
      });
    }
  } else {
    checks.push({
      name: 'entry_point_exists',
      passed: false,
      message: '缺少入口文件 (index.js 或 index.cjs)'
    });
  }
  
  // 检查2: 导出函数存在
  if (skillPackage.entryContent) {
    const hasExports = skillPackage.entryContent.includes('module.exports') || 
                       skillPackage.entryContent.includes('export ');
    checks.push({
      name: 'has_exports',
      passed: hasExports,
      message: hasExports ? '存在导出函数' : '缺少导出函数'
    });
  }
  
  // 检查3: 错误处理
  if (skillPackage.entryContent) {
    const hasErrorHandling = skillPackage.entryContent.includes('try') && 
                             skillPackage.entryContent.includes('catch');
    checks.push({
      name: 'has_error_handling',
      passed: hasErrorHandling,
      message: hasErrorHandling ? '包含错误处理' : '缺少错误处理'
    });
  }
  
  const passedCount = checks.filter(c => c.passed).length;
  const totalCount = checks.length;
  const score = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 0;
  
  return {
    passed: passedCount === totalCount,
    score,
    checks,
    summary: `功能验证: ${passedCount}/${totalCount} 通过`
  };
}

/**
 * 质量验证
 */
async function validateQuality(skillPackage, iscRules) {
  const checks = [];
  const qualityRules = iscRules.quality;
  
  // 检查1: SKILL.md存在且内容充足
  if (skillPackage.hasSkillMd && skillPackage.skillMdContent) {
    const lines = skillPackage.skillMdContent.split('\n').length;
    const meetsMinLines = lines >= qualityRules.min_documentation_lines;
    checks.push({
      name: 'documentation_sufficient',
      passed: meetsMinLines,
      message: `文档行数: ${lines} (最低要求: ${qualityRules.min_documentation_lines})`
    });
    
    // 检查必需章节
    qualityRules.required_sections.forEach(section => {
      const hasSection = skillPackage.skillMdContent.includes(`## ${section}`) ||
                         skillPackage.skillMdContent.includes(`# ${section}`);
      checks.push({
        name: `has_section_${section.toLowerCase()}`,
        passed: hasSection,
        message: hasSection ? `包含 ${section} 章节` : `缺少 ${section} 章节`
      });
    });
  } else {
    checks.push({
      name: 'skill_md_exists',
      passed: false,
      message: 'SKILL.md 文件缺失'
    });
  }
  
  // 检查2: 代码量合理
  if (skillPackage.entryContent) {
    const codeLines = skillPackage.entryContent.split('\n').filter(line => 
      line.trim() && !line.trim().startsWith('//')
    ).length;
    const meetsMinCode = codeLines >= qualityRules.min_code_lines;
    checks.push({
      name: 'code_sufficient',
      passed: meetsMinCode,
      message: `代码行数: ${codeLines} (最低要求: ${qualityRules.min_code_lines})`
    });
  }
  
  // 检查3: 文件大小合理
  const withinSizeLimit = skillPackage.totalSize <= qualityRules.max_file_size;
  checks.push({
    name: 'file_size_reasonable',
    passed: withinSizeLimit,
    message: `总大小: ${Math.round(skillPackage.totalSize / 1024)}KB (上限: ${Math.round(qualityRules.max_file_size / 1024)}KB)`
  });
  
  // 检查4: package.json规范
  if (skillPackage.hasPackageJson && skillPackage.packageJson) {
    const hasName = !!skillPackage.packageJson.name;
    const hasVersion = !!skillPackage.packageJson.version;
    const hasDescription = !!skillPackage.packageJson.description;
    
    checks.push({
      name: 'package_json_complete',
      passed: hasName && hasVersion && hasDescription,
      message: `package.json 完整性: name=${hasName}, version=${hasVersion}, description=${hasDescription}`
    });
  }
  
  const passedCount = checks.filter(c => c.passed).length;
  const totalCount = checks.length;
  const score = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 0;
  
  return {
    passed: score >= 70,
    score,
    checks,
    summary: `质量验证: ${passedCount}/${totalCount} 通过`
  };
}

/**
 * 规范验证
 */
async function validateCompliance(skillPackage, iscRules) {
  const checks = [];
  
  // 检查1: 文件命名规范
  const hasValidNaming = skillPackage.files.every(file => {
    // 允许的文件名模式
    return /^[a-z0-9\-_.\/]+$/i.test(file);
  });
  checks.push({
    name: 'file_naming_compliant',
    passed: hasValidNaming,
    message: hasValidNaming ? '文件命名符合规范' : '存在不规范的文件名'
  });
  
  // 检查2: 必需文件存在
  const requiredFiles = ['SKILL.md'];
  requiredFiles.forEach(file => {
    const exists = skillPackage.files.includes(file);
    checks.push({
      name: `required_file_${file}`,
      passed: exists,
      message: exists ? `${file} 存在` : `${file} 缺失`
    });
  });
  
  // 检查3: ISC标准术语使用
  if (skillPackage.skillMdContent) {
    // 检查是否使用了标准术语
    const hasStandardTerms = skillPackage.skillMdContent.includes('Usage') ||
                             skillPackage.skillMdContent.includes('Examples') ||
                             skillPackage.skillMdContent.includes('Description');
    checks.push({
      name: 'uses_standard_terminology',
      passed: hasStandardTerms,
      message: hasStandardTerms ? '使用标准术语' : '缺少标准术语'
    });
  }
  
  // 检查4: 版本信息
  if (skillPackage.packageJson) {
    const hasValidVersion = /^\d+\.\d+\.\d+/.test(skillPackage.packageJson.version || '');
    checks.push({
      name: 'version_format_valid',
      passed: hasValidVersion,
      message: hasValidVersion ? '版本格式正确' : '版本格式不正确'
    });
  }
  
  const passedCount = checks.filter(c => c.passed).length;
  const totalCount = checks.length;
  const score = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 0;
  
  return {
    passed: score >= 80,
    score,
    checks,
    summary: `规范验证: ${passedCount}/${totalCount} 通过`
  };
}

/**
 * 门禁评估（整合动态规则结果）
 */
function evaluateGate(phase, functionalityResult, qualityResult, complianceResult, iscRules, dynamicRuleResult) {
  const phaseRules = iscRules[phase] || iscRules.checkout;
  const violations = [];
  const recommendations = [];
  
  // 收集所有未通过的静态检查
  [functionalityResult, qualityResult, complianceResult].forEach(result => {
    result.checks.forEach(check => {
      if (!check.passed) {
        violations.push({
          category: result.summary.split(':')[0],
          check: check.name,
          message: check.message,
          severity: phaseRules.mandatory.includes(check.name) ? 'critical' : 'warning',
          source: 'static'
        });
      }
    });
  });
  
  // ★ 收集动态ISC规则违规
  if (dynamicRuleResult && dynamicRuleResult.results) {
    dynamicRuleResult.results.forEach(ruleResult => {
      if (!ruleResult.passed) {
        ruleResult.violations.forEach(v => {
          violations.push({
            category: '动态ISC规则',
            check: ruleResult.ruleId,
            message: v.detail || v.message || `违反规则: ${ruleResult.ruleName}`,
            severity: v.severity || ruleResult.severity || 'warning',
            source: 'dynamic_isc',
            ruleId: ruleResult.ruleId
          });
        });
      }
    });
  }
  
  // 计算综合得分（加入动态规则权重）
  const staticAvg = Math.round(
    (functionalityResult.score + qualityResult.score + complianceResult.score) / 3
  );
  const dynamicScore = dynamicRuleResult ? dynamicRuleResult.score : 100;
  // 动态规则占30%权重
  const avgScore = Math.round(staticAvg * 0.7 + dynamicScore * 0.3);
  
  // 判断是否通过
  const criticalViolations = violations.filter(v => v.severity === 'critical');
  const meetsMinScore = avgScore >= (phaseRules.thresholds.min_score || 80);
  const dynamicPassed = dynamicRuleResult ? dynamicRuleResult.passed : true;
  const passed = criticalViolations.length === 0 && meetsMinScore && dynamicPassed;
  
  // 生成建议
  if (!passed) {
    if (criticalViolations.length > 0) {
      recommendations.push({
        priority: 'high',
        action: 'fix_critical_issues',
        description: `修复 ${criticalViolations.length} 个关键问题`
      });
    }
    
    if (!meetsMinScore) {
      recommendations.push({
        priority: 'medium',
        action: 'improve_quality',
        description: `提升质量得分至 ${phaseRules.thresholds.min_score} 分以上（当前: ${avgScore}）`
      });
    }
    
    if (qualityResult.score < 70) {
      recommendations.push({
        priority: 'medium',
        action: 'enhance_documentation',
        description: '完善文档内容'
      });
    }
  }
  
  // 决定下一步
  const nextSteps = [];
  if (passed) {
    if (phase === 'admission') {
      nextSteps.push('proceed_to_integration');
    } else {
      nextSteps.push('recorder', 'publish');
    }
  } else {
    nextSteps.push('optimizer', 'validator');
  }
  
  return {
    passed,
    score: avgScore,
    violations,
    recommendations,
    nextSteps,
    gateDecision: passed ? 'APPROVED' : 'REJECTED',
    reason: passed ? '所有检查通过' : `${violations.length} 项检查未通过`
  };
}

/**
 * 保存验证报告
 */
async function saveReport(report) {
  const reportsDir = path.join(REPORTS_DIR, 'seef-validations');
  
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${report.skillId}-${report.phase}-${timestamp}.json`;
  const filepath = path.join(reportsDir, filename);
  
  fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
  
  console.log(`[SEEF Validator] 报告已保存: ${filepath}`);
  
  return filepath;
}

/**
 * 生成准出证明
 */
async function generateCheckoutReceipt(report) {
  const receiptsDir = path.join(SKILLS_DIR, 'seef/.signals/checkout-receipts');
  
  if (!fs.existsSync(receiptsDir)) {
    fs.mkdirSync(receiptsDir, { recursive: true });
  }
  
  const receipt = {
    skillId: report.skillId,
    skillName: report.skillName,
    checkoutTime: report.timestamp,
    validatorVersion: report.metadata.validatorVersion,
    score: report.score,
    gateDecision: 'APPROVED',
    signature: generateSignature(report),
    validUntil: report.timestamp + (30 * 24 * 60 * 60 * 1000) // 30天有效期
  };
  
  const filename = `${report.skillId}-checkout-receipt.json`;
  const filepath = path.join(receiptsDir, filename);
  
  fs.writeFileSync(filepath, JSON.stringify(receipt, null, 2));
  
  console.log(`[SEEF Validator] 准出证明已生成: ${filepath}`);
  
  return receipt;
}

/**
 * 生成签名
 */
function generateSignature(report) {
  const crypto = require('crypto');
  const data = `${report.skillId}:${report.timestamp}:${report.score}`;
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
}

// CLI支持
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: node index.js <input-json>');
    console.error('Example: node index.js \'{"skillId":"test-skill","skillPath":"skills/test-skill","skillName":"Test Skill","phase":"checkout"}\'');
    process.exit(1);
  }
  
  const inputJson = args[0];
  
  try {
    const input = JSON.parse(inputJson);
    
    validate(input)
      .then(result => {
        console.log('\n=== 验证结果 ===');
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.passed ? 0 : 1);
      })
      .catch(error => {
        console.error('Validation failed:', error);
        process.exit(1);
      });
  } catch (error) {
    console.error('Invalid input JSON:', error.message);
    process.exit(1);
  }
}

module.exports = {
  validate
};
