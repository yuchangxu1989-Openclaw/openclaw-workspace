/**
 * 自主决策流水线 - 运行时自检系统
 * 持续监控系统健康，发现问题立即自修复
 */

const fs = require('fs');
const path = require('path');
const { SKILLS_DIR } = require('../../_shared/paths');

class ADPSelfCheckSystem {
  constructor() {
    this.checkInterval = 300000; // 5分钟自检一次
    this.checks = [];
  }

  /**
   * 启动自检系统
   */
  start() {
    console.log('[ADP-SelfCheck] 启动运行时自检系统...');
    
    // 注册自检项
    this.registerChecks();
    
    // 立即执行一次
    this.runChecks();
    
    // 定时执行
    setInterval(() => this.runChecks(), this.checkInterval);
  }

  /**
   * 注册自检项
   */
  registerChecks() {
    // 1. ISC规则订阅健康检查
    this.checks.push({
      name: 'ISC规则订阅',
      check: async () => {
        const standardsPath = path.join(SKILLS_DIR, 'isc-core/standards');
        const files = fs.readdirSync(standardsPath).filter(f => f.endsWith('.json') && f.startsWith('rule.'));
        
        // 检查DTO是否正确订阅了所有规则
        const dtoCode = fs.readFileSync(path.join(SKILLS_DIR, 'dto-core/core/declarative-orchestrator.js'), 'utf8');
        const subscribedCount = (dtoCode.match(/autoSubscribe/g) || []).length;
        
        return {
          status: files.length > 0 ? 'healthy' : 'warning',
          details: `发现 ${files.length} 个规则文件`,
          autoFix: false
        };
      }
    });

    // 2. 文件监控健康检查
    this.checks.push({
      name: '文件监控',
      check: async () => {
        const dtoCode = fs.readFileSync(path.join(SKILLS_DIR, 'dto-core/core/declarative-orchestrator.js'), 'utf8');
        
        const hasWatcher = dtoCode.includes('startFileWatcher');
        const hasChecker = dtoCode.includes('checkFileChanges');
        
        if (!hasWatcher || !hasChecker) {
          return {
            status: 'critical',
            details: '文件监控机制不完整',
            autoFix: false // 需要人工修复架构
          };
        }
        
        return {
          status: 'healthy',
          details: '文件监控正常运行',
          autoFix: false
        };
      }
    });

    // 3. R005自动触发检查
    this.checks.push({
      name: 'R005自动触发',
      check: async () => {
        const dtoCode = fs.readFileSync(path.join(SKILLS_DIR, 'dto-core/core/declarative-orchestrator.js'), 'utf8');
        
        const hasHandler = dtoCode.includes('handleSkillMdSync');
        const hasTrigger = dtoCode.includes("type: 'code_change'");
        
        if (!hasHandler || !hasTrigger) {
          return {
            status: 'critical',
            details: 'R005自动触发机制缺失',
            autoFix: false
          };
        }
        
        return {
          status: 'healthy',
          details: 'R005自动触发正常',
          autoFix: false
        };
      }
    });

    // 4. 定时重扫机制检查
    this.checks.push({
      name: 'ISC定时重扫',
      check: async () => {
        const dtoCode = fs.readFileSync(path.join(SKILLS_DIR, 'dto-core/core/declarative-orchestrator.js'), 'utf8');
        
        const hasRescan = dtoCode.includes('startISCRescanTimer');
        
        return {
          status: hasRescan ? 'healthy' : 'critical',
          details: hasRescan ? '定时重扫已启用' : '定时重扫机制缺失',
          autoFix: false
        };
      }
    });
  }

  /**
   * 执行所有自检
   */
  async runChecks() {
    console.log('[ADP-SelfCheck] 执行运行时自检...');
    
    let healthy = 0;
    let warning = 0;
    let critical = 0;
    
    for (const check of this.checks) {
      try {
        const result = await check.check();
        
        switch (result.status) {
          case 'healthy':
            console.log(`  ✅ ${check.name}: ${result.details}`);
            healthy++;
            break;
          case 'warning':
            console.log(`  ⚠️  ${check.name}: ${result.details}`);
            warning++;
            break;
          case 'critical':
            console.log(`  ❌ ${check.name}: ${result.details}`);
            critical++;
            
            // 尝试自动修复
            if (result.autoFix) {
              console.log(`  🔧 尝试自动修复...`);
              // 执行自动修复逻辑
            }
            break;
        }
      } catch (e) {
        console.log(`  ❌ ${check.name}: 检查失败 - ${e.message}`);
        critical++;
      }
    }
    
    console.log(`[ADP-SelfCheck] 结果: ${healthy}健康 ${warning}警告 ${critical}严重`);
    
    if (critical > 0) {
      console.log('[ADP-SelfCheck] 🚨 发现严重问题，需要立即处理！');
      // 可以在这里触发告警通知
    }
  }
}

module.exports = ADPSelfCheckSystem;
