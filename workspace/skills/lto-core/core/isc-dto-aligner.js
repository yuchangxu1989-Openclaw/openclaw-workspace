#!/usr/bin/env node
/**
 * ISC-本地任务编排 自对齐修复器 v1.0
 * DTO扫不到规则时，自动诊断并修复
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { SKILLS_DIR, WORKSPACE } = require('../../shared/paths');

const ALIGNER_CONFIG = {
  iscStandardsPath: path.join(SKILLS_DIR, 'isc-core/standards'),
  dtoPath: path.join(SKILLS_DIR, 'lto-core'),
  expectedFormats: [
    'rule.*.json',      // DTO期望的格式
    'ISC-*.json',       // 实际创建的格式
    '*.json'            // 其他json
  ]
};

class ISCDTOAligner {
  constructor() {
    this.issues = [];
    this.fixes = [];
  }

  /**
   * 诊断ISC-DTO对齐问题
   */
  async diagnose() {
    console.log('[ISC-DTO对齐] 诊断问题...');
    
    // 检查1: standards目录是否存在
    if (!fs.existsSync(ALIGNER_CONFIG.iscStandardsPath)) {
      this.issues.push({
        type: 'missing_directory',
        severity: 'critical',
        message: 'standards目录不存在'
      });
      return;
    }
    
    // 检查2: 有哪些规则文件
    const files = fs.readdirSync(ALIGNER_CONFIG.iscStandardsPath)
      .filter(f => f.endsWith('.json'));
    
    console.log(`  发现 ${files.length} 个json文件`);
    
    // 检查3: 格式是否符合DTO期望
    for (const file of files) {
      if (!file.startsWith('rule.')) {
        this.issues.push({
          type: 'wrong_format',
          severity: 'high',
          file: file,
          message: `文件${file}不符合rule.*.json格式，DTO无法识别`
        });
      }
    }
    
    // 检查4: 规则文件内容是否完整
    for (const file of files) {
      const filePath = path.join(ALIGNER_CONFIG.iscStandardsPath, file);
      try {
        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        // 检查是否有governance配置
        if (!content.governance) {
          this.issues.push({
            type: 'missing_governance',
            severity: 'medium',
            file: file,
            message: '缺少governance配置，DTO不知道是否自动执行'
          });
        }
        
        // 检查id是否符合规范
        if (!content.id) {
          this.issues.push({
            type: 'missing_id',
            severity: 'high',
            file: file,
            message: '缺少id字段'
          });
        }
      } catch (e) {
        this.issues.push({
          type: 'invalid_json',
          severity: 'critical',
          file: file,
          message: `JSON解析失败: ${e.message}`
        });
      }
    }
    
    console.log(`  发现问题: ${this.issues.length} 个`);
  }

  /**
   * 自动修复问题
   */
  async fix() {
    console.log('[ISC-DTO对齐] 自动修复...');
    
    for (const issue of this.issues) {
      switch (issue.type) {
        case 'wrong_format':
          await this.fixFormat(issue);
          break;
        case 'missing_governance':
          await this.fixGovernance(issue);
          break;
        case 'missing_id':
          await this.fixId(issue);
          break;
      }
    }
    
    console.log(`  修复完成: ${this.fixes.length} 个`);
  }

  async fixFormat(issue) {
    const oldPath = path.join(ALIGNER_CONFIG.iscStandardsPath, issue.file);
    
    // 生成新的rule.*.json文件名
    let newName = issue.file;
    if (issue.file.startsWith('ISC-')) {
      newName = 'rule.' + issue.file.substring(4).toLowerCase();
    } else {
      newName = 'rule.' + issue.file.toLowerCase().replace('.json', '') + '.json';
    }
    
    const newPath = path.join(ALIGNER_CONFIG.iscStandardsPath, newName);
    
    // 读取内容并更新id
    const content = JSON.parse(fs.readFileSync(oldPath, 'utf8'));
    content.id = content.id || newName.replace('.json', '');
    
    // 写入新文件
    fs.writeFileSync(newPath, JSON.stringify(content, null, 2));
    
    this.fixes.push({
      type: 'format_fixed',
      from: issue.file,
      to: newName
    });
    
    console.log(`  ✅ 格式修复: ${issue.file} → ${newName}`);
  }

  async fixGovernance(issue) {
    const filePath = path.join(ALIGNER_CONFIG.iscStandardsPath, issue.file);
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // 添加governance配置
    content.governance = {
      auto_execute: true,
      councilRequired: false
    };
    
    fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
    
    this.fixes.push({
      type: 'governance_added',
      file: issue.file
    });
    
    console.log(`  ✅ 配置修复: ${issue.file} 添加governance`);
  }

  async fixId(issue) {
    const filePath = path.join(ALIGNER_CONFIG.iscStandardsPath, issue.file);
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // 从文件名生成id
    content.id = issue.file.replace('.json', '');
    
    fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
    
    this.fixes.push({
      type: 'id_added',
      file: issue.file
    });
    
    console.log(`  ✅ ID修复: ${issue.file} 添加id`);
  }

  /**
   * 验证修复结果
   */
  async verify() {
    console.log('[ISC-DTO对齐] 验证修复...');
    
    // 重新扫描
    const files = fs.readdirSync(ALIGNER_CONFIG.iscStandardsPath)
      .filter(f => f.endsWith('.json') && f.startsWith('rule.'));
    
    console.log(`  符合DTO格式的规则: ${files.length} 个`);
    
    for (const file of files) {
      const content = JSON.parse(fs.readFileSync(
        path.join(ALIGNER_CONFIG.iscStandardsPath, file), 'utf8'
      ));
      
      const hasGovernance = !!content.governance;
      const hasId = !!content.id;
      
      console.log(`    ${file}: id=${hasId ? '✓' : '✗'}, governance=${hasGovernance ? '✓' : '✗'}`);
    }
    
    return files.length;
  }

  /**
   * 主运行
   */
  async run() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║     ISC-本地任务编排 自对齐修复器 - 根治联动问题                    ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    
    // 1. 诊断
    await this.diagnose();
    
    if (this.issues.length === 0) {
      console.log('\n✅ 无问题，ISC-DTO已对齐');
      return;
    }
    
    // 2. 修复
    await this.fix();
    
    // 3. 验证
    const validCount = await this.verify();
    
    // 4. 提交
    if (this.fixes.length > 0) {
      this.commitFixes();
    }
    
    console.log('\n[ISC-DTO对齐] 完成');
    return {
      issues: this.issues.length,
      fixes: this.fixes.length,
      validRules: validCount
    };
  }

  commitFixes() {
    console.log('[ISC-DTO对齐] 提交修复...');
    
    try {
      execSync(`cd ${WORKSPACE} && git add skills/isc-core/standards/`);
      execSync(`cd ${WORKSPACE} && git commit -m "ISC-DTO自对齐: 自动修复规则格式和配置"`);
      console.log('  ✅ 已提交GitHub');
    } catch (e) {
      console.log('  ⚠️ 提交失败:', e.message);
    }
  }
}

// 运行
if (require.main === module) {
  const aligner = new ISCDTOAligner();
  aligner.run();
}

module.exports = ISCDTOAligner;
