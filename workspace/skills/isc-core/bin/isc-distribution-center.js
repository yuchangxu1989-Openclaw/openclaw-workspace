#!/usr/bin/env node
/**
 * ISC标准分发中心 v1.0
 * ISC不只是制定标准，还要主动分发到全系统
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { SKILLS_DIR } = require('../../shared/paths');

const DISTRIBUTION_CONFIG = {
  standardsPath: path.join(__dirname, '..', 'standards'),
  distributionTargets: [
    { name: 'DTO', path: path.join(SKILLS_DIR, 'dto-core'), type: 'orchestrator' },
    { name: 'CRAS', path: path.join(SKILLS_DIR, 'cras'), type: 'cognition' },
    { name: 'SEEF', path: path.join(SKILLS_DIR, 'seef'), type: 'evolution' }
  ],
  logPath: path.join(__dirname, '..', 'logs/distribution-log.jsonl')
};

class ISCStandardDistributionCenter {
  constructor() {
    this.distributions = [];
  }

  /**
   * 扫描所有标准
   */
  scanStandards() {
    console.log('[ISC分发中心] 扫描标准...');
    
    const standards = [];
    const files = fs.readdirSync(DISTRIBUTION_CONFIG.standardsPath)
      .filter(f => f.endsWith('.json'));
    
    for (const file of files) {
      try {
        const content = JSON.parse(fs.readFileSync(
          path.join(DISTRIBUTION_CONFIG.standardsPath, file), 'utf8'
        ));
        standards.push({
          file: file,
          id: content.id,
          name: content.name,
          domain: content.domain,
          scope: content.scope,
          content: content
        });
      } catch (e) {
        console.error(`  解析失败: ${file}`);
      }
    }
    
    console.log(`  发现 ${standards.length} 个标准`);
    return standards;
  }

  /**
   * 分发标准到目标系统
   */
  async distribute(standard) {
    console.log(`\n[ISC分发] 分发标准: ${standard.id}`);
    
    for (const target of DISTRIBUTION_CONFIG.distributionTargets) {
      // 判断标准是否适用于该目标
      if (this.isApplicable(standard, target)) {
        await this.distributeToTarget(standard, target);
      }
    }
  }

  isApplicable(standard, target) {
    // 根据scope和domain判断是否适用
    const scope = standard.scope || standard.content?.scope;
    const domain = standard.domain || standard.content?.domain;
    
    // 全局标准适用于所有系统
    if (scope === 'global') return true;
    
    // 根据目标类型匹配
    const targetMapping = {
      'orchestrator': ['process', 'workflow'],
      'cognition': ['learning', 'insight'],
      'evolution': ['quality', 'optimization']
    };
    
    const applicableDomains = targetMapping[target.type] || [];
    return applicableDomains.includes(domain);
  }

  async distributeToTarget(standard, target) {
    console.log(`  → ${target.name}`);
    
    // 创建分发记录
    const distribution = {
      standard_id: standard.id,
      standard_name: standard.name,
      target: target.name,
      target_type: target.type,
      distributed_at: new Date().toISOString(),
      method: 'push'
    };
    
    // 写入目标系统的ISC配置目录
    const targetIscPath = path.join(target.path, '.isc-config');
    if (!fs.existsSync(targetIscPath)) {
      fs.mkdirSync(targetIscPath, { recursive: true });
    }
    
    const targetFile = path.join(targetIscPath, `${standard.id}.json`);
    fs.writeFileSync(targetFile, JSON.stringify(standard.content, null, 2));
    
    // 通知目标系统
    this.notifyTarget(target, standard);
    
    this.distributions.push(distribution);
    console.log(`    ✅ 已分发到 ${target.name}`);
  }

  /**
   * 通知目标系统新标准
   */
  notifyTarget(target, standard) {
    const notification = {
      source: 'isc-distribution-center',
      timestamp: new Date().toISOString(),
      event: 'standard_distributed',
      target: target.name,
      data: {
        standard_id: standard.id,
        standard_name: standard.name,
        domain: standard.domain,
        scope: standard.scope,
        location: path.join(target.path, '.isc-config', `${standard.id}.json`)
      }
    };
    
    // 写入目标系统的事件队列
    const eventPath = path.join(target.path, 'events', 'isc-standard-events.jsonl');
    if (!fs.existsSync(path.dirname(eventPath))) {
      fs.mkdirSync(path.dirname(eventPath), { recursive: true });
    }
    
    fs.appendFileSync(eventPath, JSON.stringify(notification) + '\n');
  }

  /**
   * 生成分发报告
   */
  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      total_distributions: this.distributions.length,
      by_target: {},
      by_domain: {}
    };
    
    for (const dist of this.distributions) {
      report.by_target[dist.target] = (report.by_target[dist.target] || 0) + 1;
      report.by_domain[dist.standard_id] = dist.standard_name;
    }
    
    console.log('\n[ISC分发中心] 分发报告:');
    console.log(`  总分发: ${report.total_distributions}`);
    console.log('  按目标:');
    for (const [target, count] of Object.entries(report.by_target)) {
      console.log(`    - ${target}: ${count}`);
    }
    
    return report;
  }

  /**
   * 记录分发日志
   */
  logDistribution(report) {
    fs.appendFileSync(DISTRIBUTION_CONFIG.logPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      report: report
    }) + '\n');
  }

  /**
   * 主运行
   */
  async run() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║     ISC标准分发中心 - 不只是制定，还要分发！               ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    
    // 1. 扫描标准
    const standards = this.scanStandards();
    
    // 2. 分发每个标准
    for (const standard of standards) {
      await this.distribute(standard);
    }
    
    // 3. 生成报告
    const report = this.generateReport();
    
    // 4. 记录日志
    this.logDistribution(report);
    
    console.log('\n[ISC分发中心] 完成');
    return report;
  }
}

// 运行
if (require.main === module) {
  const distributor = new ISCStandardDistributionCenter();
  distributor.run();
}

module.exports = ISCStandardDistributionCenter;
