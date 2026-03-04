#!/usr/bin/env node
/**
 * ISC规则验证器
 * 确保所有规则符合统一格式标准
 */

const fs = require('fs');
const path = require('path');

const VALIDATOR_CONFIG = {
  standardsPath: path.join(__dirname, '..', 'standards')
};

class ISCValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  validateAll() {
    console.log('[ISC验证器] 验证所有规则文件...');
    
    const files = fs.readdirSync(VALIDATOR_CONFIG.standardsPath)
      .filter(f => f.endsWith('.json'));
    
    for (const file of files) {
      this.validateFile(file);
    }
    
    this.printReport();
  }

  validateFile(filename) {
    const filePath = path.join(VALIDATOR_CONFIG.standardsPath, filename);
    
    try {
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      // 验证1: 文件名格式
      if (!filename.startsWith('rule.')) {
        this.warnings.push({
          file: filename,
          type: 'naming',
          message: '文件名应以rule.开头',
          fix: `重命名为 rule.${filename.toLowerCase()}`
        });
      }
      
      // 验证2: 必需字段
      const required = ['id', 'name', 'domain', 'type', 'scope', 'description', 'governance'];
      for (const field of required) {
        if (!content[field]) {
          this.errors.push({
            file: filename,
            type: 'missing_field',
            field: field,
            message: `缺少必需字段: ${field}`
          });
        }
      }
      
      // 验证3: id与文件名匹配
      if (content.id) {
        const expectedFile = content.id + '.json';
        if (filename !== expectedFile) {
          this.warnings.push({
            file: filename,
            type: 'id_mismatch',
            message: `id(${content.id})与文件名(${filename})不匹配`,
            fix: `重命名为 ${expectedFile}`
          });
        }
      }
      
      // 验证4: governance配置
      if (content.governance) {
        if (typeof content.governance.auto_execute !== 'boolean') {
          this.errors.push({
            file: filename,
            type: 'invalid_governance',
            message: 'governance.auto_execute必须是boolean'
          });
        }
      }
      
    } catch (e) {
      this.errors.push({
        file: filename,
        type: 'parse_error',
        message: e.message
      });
    }
  }

  printReport() {
    console.log('\n[ISC验证器] 报告:');
    console.log(`  错误: ${this.errors.length}`);
    console.log(`  警告: ${this.warnings.length}`);
    
    if (this.errors.length > 0) {
      console.log('\n  ❌ 错误:');
      this.errors.forEach(e => console.log(`    - ${e.file}: ${e.message}`));
    }
    
    if (this.warnings.length > 0) {
      console.log('\n  ⚠️ 警告:');
      this.warnings.forEach(w => console.log(`    - ${w.file}: ${w.message}`));
    }
    
    if (this.errors.length === 0 && this.warnings.length === 0) {
      console.log('  ✅ 所有规则格式正确');
    }
  }
}

// 运行
if (require.main === module) {
  const validator = new ISCValidator();
  validator.validateAll();
}

module.exports = ISCValidator;
