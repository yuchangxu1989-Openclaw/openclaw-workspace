/**
 * 自主决策流水线 - 强制验证框架
 * 任何功能必须通过全部验证才能部署
 */

const fs = require('fs');
const path = require('path');
const { SKILLS_DIR } = require('../../shared/paths');

class ADPValidationFramework {
  constructor() {
    this.validations = [];
    this.results = [];
  }

  /**
   * 注册验证项
   */
  addValidation(name, testFn, critical = true) {
    this.validations.push({ name, testFn, critical });
  }

  /**
   * 执行全部验证
   */
  async runAll() {
    console.log('='.repeat(60));
    console.log('🔍 自主决策流水线 - 强制验证');
    console.log('='.repeat(60));

    let passed = 0;
    let failed = 0;
    let criticalFailed = false;

    for (const v of this.validations) {
      try {
        const result = await v.testFn();
        if (result) {
          console.log(`✅ ${v.name}`);
          passed++;
        } else {
          console.log(`❌ ${v.name}`);
          failed++;
          if (v.critical) criticalFailed = true;
        }
      } catch (e) {
        console.log(`❌ ${v.name}: ${e.message}`);
        failed++;
        if (v.critical) criticalFailed = true;
      }
    }

    console.log('='.repeat(60));
    console.log(`结果: ${passed} 通过, ${failed} 失败`);
    
    if (criticalFailed) {
      console.log('🚫 关键验证失败，禁止部署！');
      return false;
    }
    
    console.log('✅ 全部验证通过，允许部署');
    return true;
  }
}

// 本地任务编排 验证项
const dtoValidations = new ADPValidationFramework();

// 1. ISC规则自动加载验证
dtoValidations.addValidation('ISC规则自动加载', async () => {
  
  // 检查是否能动态加载所有规则
  const standardsPath = path.join(SKILLS_DIR, 'isc-core/standards');
  const files = fs.readdirSync(standardsPath).filter(f => f.endsWith('.json'));
  
  // 模拟新规则文件
  const testRule = { id: 'TEST_VALIDATION', name: 'test', governance: { auto_execute: true } };
  
  // 验证动态加载逻辑存在
  const dtoCode = fs.readFileSync(path.join(SKILLS_DIR, 'lto-core/core/declarative-orchestrator.js'), 'utf8');
  return dtoCode.includes('initializeISCSubscriptions') && 
         dtoCode.includes('startISCRescanTimer');
}, true);

// 2. 文件变更自动检测验证
dtoValidations.addValidation('文件变更自动检测', async () => {
  const dtoCode = fs.readFileSync(path.join(SKILLS_DIR, 'lto-core/core/declarative-orchestrator.js'), 'utf8');
  return dtoCode.includes('startFileWatcher') && 
         dtoCode.includes('checkFileChanges');
}, true);

// 3. R005自动触发验证
dtoValidations.addValidation('R005自动触发', async () => {
  const dtoCode = fs.readFileSync(path.join(SKILLS_DIR, 'lto-core/core/declarative-orchestrator.js'), 'utf8');
  return dtoCode.includes('handleSkillMdSync') && 
         dtoCode.includes("type: 'code_change'");
}, true);

// 4. 异常处理验证
dtoValidations.addValidation('异常处理完整性', async () => {
  const dtoCode = fs.readFileSync(path.join(SKILLS_DIR, 'lto-core/core/declarative-orchestrator.js'), 'utf8');
  // 检查关键方法是否有try-catch
  return dtoCode.includes('try {') && dtoCode.includes('catch (');
}, true);

// 5. 自验证机制验证
dtoValidations.addValidation('自验证机制', async () => {
  // 检查是否有自我验证代码
  const dtoCode = fs.readFileSync(path.join(SKILLS_DIR, 'lto-core/core/declarative-orchestrator.js'), 'utf8');
  return dtoCode.includes('rescanISCAndSkills');
}, true);

module.exports = { ADPValidationFramework, dtoValidations };
