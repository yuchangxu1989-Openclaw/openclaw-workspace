#!/usr/bin/env node
/**
 * ISC智能创建助手 v1.0
 * 创建规则时主动智能验证，拒绝风险后置
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { SKILLS_DIR, WORKSPACE } = require('../../shared/paths');

const ISC_CORE_DIR = path.join(__dirname, '..');

const CREATION_CONFIG = {
  standardsPath: path.join(ISC_CORE_DIR, 'standards'),
  template: {
    id: 'rule.{domain}-{name}-{version}',
    name: '{snake_case_description}',
    domain: '{quality|naming|process|interaction|security}',
    type: 'rule',
    scope: '{skill|system|interaction|global}',
    description: '{至少20字描述}',
    rationale: '{为什么需要这个规则}',
    governance: {
      auto_execute: '{true|false}',
      councilRequired: '{true|false}'
    },
    created_at: '{ISO8601}',
    version: '1.0.0'
  }
};

class ISCSmartCreator {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  /**
   * 智能引导创建
   */
  async create() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║     ISC智能创建助手 - 风险前置，主动智能验证               ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    
    const rule = {};
    
    // 1. 引导输入domain
    rule.domain = await this.ask('规则领域 (quality/naming/process/interaction/security): ', 
      val => ['quality', 'naming', 'process', 'interaction', 'security'].includes(val));
    
    // 2. 引导输入name
    rule.name = await this.ask('规则名称 (snake_case): ',
      val => /^[a-z][a-z0-9_]*$/.test(val) && val.length >= 3);
    
    // 3. 自动生成id和文件名
    const version = '001';
    rule.id = `rule.${rule.domain}-${rule.name}-${version}`;
    const filename = `${rule.id}.json`;
    
    console.log(`\n✅ 自动生成的ID: ${rule.id}`);
    console.log(`✅ 自动生成的文件名: ${filename}`);
    
    // 4. 检查文件名是否已存在
    if (this.fileExists(filename)) {
      console.log(`❌ 错误: ${filename} 已存在`);
      return;
    }
    
    // 5. 引导输入其他字段
    rule.type = 'rule';
    rule.scope = await this.ask('适用范围 (skill/system/interaction/global): ',
      val => ['skill', 'system', 'interaction', 'global'].includes(val));
    
    rule.description = await this.ask('规则描述 (至少20字): ',
      val => val.length >= 20);
    
    rule.rationale = await this.ask('规则原理 (为什么需要): ',
      val => val.length >= 10);
    
    // 6. 引导governance配置
    const autoExecute = await this.ask('是否自动执行 (true/false): ',
      val => val === 'true' || val === 'false');
    
    const councilRequired = await this.ask('是否需要议会审议 (true/false): ',
      val => val === 'true' || val === 'false');
    
    rule.governance = {
      auto_execute: autoExecute === 'true',
      councilRequired: councilRequired === 'true'
    };
    
    rule.created_at = new Date().toISOString();
    rule.version = '1.0.0';
    
    // 7. 智能验证
    const validation = this.smartValidate(rule, filename);
    
    if (!validation.passed) {
      console.log('\n❌ 验证失败:');
      validation.errors.forEach(e => console.log(`  - ${e}`));
      return;
    }
    
    // 8. 预览并确认
    console.log('\n📋 规则预览:');
    console.log(JSON.stringify(rule, null, 2));
    
    const confirm = await this.ask('\n确认创建? (yes/no): ',
      val => val === 'yes' || val === 'no');
    
    if (confirm === 'yes') {
      this.saveRule(rule, filename);
    } else {
      console.log('已取消');
    }
    
    this.rl.close();
  }

  ask(question, validator) {
    return new Promise((resolve) => {
      const askLoop = () => {
        this.rl.question(question, (answer) => {
          if (validator(answer)) {
            resolve(answer);
          } else {
            console.log('  ⚠️ 输入无效，请重试');
            askLoop();
          }
        });
      };
      askLoop();
    });
  }

  fileExists(filename) {
    return fs.existsSync(path.join(CREATION_CONFIG.standardsPath, filename));
  }

  /**
   * 智能验证
   */
  smartValidate(rule, filename) {
    const errors = [];
    
    // 验证1: ID格式
    if (!rule.id.match(/^rule\.[a-z]+-[a-z0-9_]+-\d+$/)) {
      errors.push('ID格式错误: 必须是 rule.{domain}-{name}-{version}');
    }
    
    // 验证2: ID与文件名匹配
    if (rule.id + '.json' !== filename) {
      errors.push('ID与文件名不匹配');
    }
    
    // 验证3: 必需字段
    const required = ['id', 'name', 'domain', 'type', 'scope', 'description', 'governance'];
    for (const field of required) {
      if (!rule[field]) {
        errors.push(`缺少必需字段: ${field}`);
      }
    }
    
    // 验证4: governance完整性
    if (rule.governance) {
      if (typeof rule.governance.auto_execute !== 'boolean') {
        errors.push('governance.auto_execute必须是boolean');
      }
      if (typeof rule.governance.councilRequired !== 'boolean') {
        errors.push('governance.councilRequired必须是boolean');
      }
    }
    
    // 验证5: 描述长度
    if (rule.description && rule.description.length < 20) {
      errors.push('描述至少20字');
    }
    
    return {
      passed: errors.length === 0,
      errors
    };
  }

  saveRule(rule, filename) {
    const filePath = path.join(CREATION_CONFIG.standardsPath, filename);
    fs.writeFileSync(filePath, JSON.stringify(rule, null, 2));
    console.log(`\n✅ 规则已创建: ${filePath}`);
    
    // ===== 新增：通知DTO新规则位置 =====
    this.notifyDTO(filePath, rule);
    
    // 自动提交
    try {
      const { execSync } = require('child_process');
      execSync(`cd ${WORKSPACE} && git add ${filePath}`);
      execSync(`cd ${WORKSPACE} && git commit -m "ISC: 创建规则 ${rule.id}"`);
      console.log('✅ 已提交GitHub');
    } catch (e) {
      console.log('⚠️ 提交失败:', e.message);
    }
  }
  
  /**
   * 通知DTO新规则位置
   */
  notifyDTO(filePath, rule) {
    console.log('[ISC→本地任务编排] 通知DTO新规则...');
    
    const notification = {
      source: 'isc-core',
      timestamp: new Date().toISOString(),
      event: 'rule_created',
      data: {
        ruleId: rule.id,
        ruleName: rule.name,
        filePath: filePath,
        relativePath: filePath.replace(ISC_CORE_DIR + '/', ''),
        domain: rule.domain,
        autoExecute: rule.governance?.auto_execute,
        councilRequired: rule.governance?.councilRequired
      }
    };
    
    // 写入DTO事件队列
    const dtoEventPath = path.join(SKILLS_DIR, 'dto-core/events/isc-rule-created.jsonl');
    fs.appendFileSync(dtoEventPath, JSON.stringify(notification) + '\n');
    
    console.log(`  ✅ DTO已通知: ${rule.id}`);
    console.log(`  📍 位置: ${notification.data.relativePath}`);
  }

  /**
   * 主运行
   */
  async run() {
    await this.create();
  }
}

// 运行
if (require.main === module) {
  const creator = new ISCSmartCreator();
  creator.run();
}

module.exports = ISCSmartCreator;
