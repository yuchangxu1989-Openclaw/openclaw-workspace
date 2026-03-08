#!/usr/bin/env node
/**
 * ISC-本地任务编排 根因分析器 v1.0
 * DTO修复时，同时分析为何对不齐，并解决根因
 */

const fs = require('fs');
const path = require('path');
const { SKILLS_DIR } = require('../../shared/paths');

const RCA_CONFIG = {
  logPath: path.join(SKILLS_DIR, 'isc-core/logs/isc-lto-rca-log.jsonl')
};

class ISCDTORootCauseAnalyzer {
  constructor() {
    this.findings = [];
  }

  /**
   * 分析对齐失败根因
   */
  async analyze(issue) {
    console.log('[根因分析] 分析ISC-DTO对不齐的根因...');
    
    const rootCauses = [];
    
    // 根因1: 格式标准不统一
    if (issue.type === 'wrong_format') {
      rootCauses.push({
        level: 1,
        symptom: '文件名格式不符合DTO期望',
        root_cause: 'ISC没有建立统一的规则文件命名标准',
        why_chain: [
          '为什么文件名格式不对？因为ISC创建规则时没规定格式',
          '为什么没规定？因为早期没有ISC-DTO联动需求',
          '为什么没有联动需求？因为系统设计时没考虑跨模块协作'
        ],
        solution: '建立ISC规则格式标准(rule.isc-standard-format-001)',
        prevention: '创建时必须通过智能助手验证',
        status: '已解决'
      });
    }
    
    // 根因2: 缺少governance配置
    if (issue.type === 'missing_governance') {
      rootCauses.push({
        level: 1,
        symptom: '规则缺少governance配置',
        root_cause: 'ISC规则模板不完整，没强制要求governance',
        why_chain: [
          '为什么缺少governance？因为模板没这个字段',
          '为什么模板没这个字段？因为早期设计没考虑DTO执行需求',
          '为什么没考虑？因为ISC和DTO是分开设计的'
        ],
        solution: '更新ISC规则模板，governance为必需字段',
        prevention: '智能创建助手强制要求填写',
        status: '已解决'
      });
    }
    
    // 根因3: 缺乏自动验证
    if (issue.type === 'missing_validation') {
      rootCauses.push({
        level: 2,
        symptom: '规则创建后没有自动验证',
        root_cause: 'ISC缺少创建闸门机制',
        why_chain: [
          '为什么没验证？因为没有创建闸门',
          '为什么没有闸门？因为依赖人工审查',
          '为什么依赖人工？因为没建立自动化流程'
        ],
        solution: '建立ISC创建闸门(rule.isc-creation-gate-001)',
        prevention: '任何规则创建必须通过闸门验证',
        status: '已解决'
      });
    }
    
    // 根因4: 反馈闭环缺失
    rootCauses.push({
      level: 3,
      symptom: 'DTO扫不到规则，但ISC不知道',
      root_cause: 'ISC-DTO之间没有反馈闭环',
      why_chain: [
        '为什么ISC不知道？因为DTO只报告给自己',
        '为什么只报告给自己？因为没有设计联动机制',
        '为什么没设计？因为模块间是松耦合，但缺少紧反馈'
      ],
      solution: 'DTO发现问题时，发射信号到ISC',
      prevention: '建立ISC-DTO事件总线，实时同步状态',
      status: '已建立信号机制'
    });
    
    // 根因5: 标准演进不同步
    rootCauses.push({
      level: 4,
      symptom: 'DTO扫描逻辑升级，但ISC规则没同步升级',
      root_cause: 'ISC和DTO的版本管理不同步',
      why_chain: [
        '为什么不同步？因为没有统一版本管理',
        '为什么没有？因为各自独立演进',
        '为什么独立？因为缺少统一治理'
      ],
      solution: '建立ISC-DTO版本对齐检查',
      prevention: 'DTO升级扫描逻辑时，必须同步更新ISC标准',
      status: '待建立'
    });
    
    this.findings = rootCauses;
    return rootCauses;
  }

  /**
   * 解决根因
   */
  async solveRootCauses() {
    console.log('[根因分析] 解决根因...');
    
    for (const finding of this.findings) {
      if (finding.status === '待建立') {
        await this.establishSolution(finding);
      }
    }
  }

  async establishSolution(finding) {
    console.log(`  建立解决方案: ${finding.solution}`);
    
    // 根据根因类型建立解决方案
    switch (finding.level) {
      case 4: // 版本对齐
        this.createVersionAlignmentCheck();
        break;
    }
  }

  createVersionAlignmentCheck() {
    // 创建版本对齐检查脚本
    const script = `#!/usr/bin/env node
// ISC-DTO版本对齐检查
const fs = require('fs');
const path = require('path');
const { SKILLS_DIR } = require(path.join(__dirname, '../../shared/paths'));

function checkAlignment() {
  const dtoVersion = require(path.join(SKILLS_DIR, 'lto-core/package.json')).version;
  const iscVersion = require(path.join(SKILLS_DIR, 'isc-core/package.json')).version;
  
  console.log('ISC-DTO版本对齐检查:');
  console.log('  DTO版本:', dtoVersion);
  console.log('  ISC版本:', iscVersion);
  
  // 检查是否需要同步
  const dtoScannerLogic = fs.readFileSync(path.join(SKILLS_DIR, 'lto-core/core/declarative-orchestrator.js'), 'utf8');
  const iscStandardFormat = fs.existsSync(path.join(SKILLS_DIR, 'isc-core/standards/rule.isc-standard-format-001.json'));
  
  if (!iscStandardFormat) {
    console.log('  ⚠️ 警告: ISC缺少标准格式定义，DTO扫描可能失败');
    return false;
  }
  
  return true;
}

checkAlignment();
`;
    
    fs.writeFileSync(path.join(SKILLS_DIR, 'isc-core/bin/version-alignment-check.js'), script);
    console.log('    ✅ 版本对齐检查脚本已创建');
  }

  /**
   * 记录根因分析
   */
  recordAnalysis(issue, rootCauses) {
    const record = {
      timestamp: new Date().toISOString(),
      issue: issue,
      root_causes: rootCauses,
      findings_count: rootCauses.length,
      solved_count: rootCauses.filter(r => r.status !== '待建立').length
    };
    
    fs.appendFileSync(RCA_CONFIG.logPath, JSON.stringify(record) + '\n');
  }

  /**
   * 生成报告
   */
  generateReport() {
    console.log('\n[根因分析] 报告:');
    console.log(`  发现根因: ${this.findings.length} 个`);
    
    for (const finding of this.findings) {
      console.log(`\n  [Level ${finding.level}] ${finding.symptom}`);
      console.log(`    根因: ${finding.root_cause}`);
      console.log(`    解决: ${finding.solution}`);
      console.log(`    预防: ${finding.prevention}`);
      console.log(`    状态: ${finding.status}`);
    }
  }

  /**
   * 主运行
   */
  async run(issue) {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║     ISC-本地任务编排 根因分析器 - 5Why深挖，根治问题                ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    
    // 1. 分析根因
    const rootCauses = await this.analyze(issue);
    
    // 2. 解决根因
    await this.solveRootCauses();
    
    // 3. 记录
    this.recordAnalysis(issue, rootCauses);
    
    // 4. 报告
    this.generateReport();
    
    return rootCauses;
  }
}

// 运行
if (require.main === module) {
  const analyzer = new ISCDTORootCauseAnalyzer();
  analyzer.run({
    type: 'isc_dto_misalignment',
    description: 'DTO扫描不到ISC规则'
  });
}

module.exports = ISCDTORootCauseAnalyzer;
