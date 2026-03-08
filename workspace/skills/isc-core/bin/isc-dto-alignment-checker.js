#!/usr/bin/env node
/**
 * ISC-本地任务编排 双向对齐检查器 v1.0
 * ISC主动分发，DTO主动订阅，双向对齐
 */

const fs = require('fs');
const path = require('path');
const { SKILLS_DIR, WORKSPACE } = require('../../shared/paths');

const ISC_CORE_DIR = path.join(__dirname, '..');

const ALIGNMENT_CONFIG = {
  iscPaths: [
    path.join(ISC_CORE_DIR, 'rules'),
    path.join(ISC_CORE_DIR, 'standards'),
    path.join(ISC_CORE_DIR, 'rules/decision'),
    path.join(ISC_CORE_DIR, 'rules/detection'),
    path.join(ISC_CORE_DIR, 'rules/naming'),
    path.join(ISC_CORE_DIR, 'rules/interaction')
  ],
  dtoSubsPath: path.join(SKILLS_DIR, 'lto-core/subscriptions')
};

class ISCDTOAlignmentChecker {
  constructor() {
    this.iscRules = [];
    this.dtoSubs = [];
    this.misaligned = [];
  }

  /**
   * ISC主动性：扫描所有规则
   */
  async iscProactive() {
    console.log('[ISC主动性] 扫描所有规则...');
    
    for (const p of ALIGNMENT_CONFIG.iscPaths) {
      if (!fs.existsSync(p)) continue;
      
      const files = fs.readdirSync(p).filter(f => f.endsWith('.json'));
      for (const f of files) {
        try {
          const content = JSON.parse(fs.readFileSync(path.join(p, f), 'utf8'));
          if (content.id) {
            this.iscRules.push({
              id: content.id,
              name: content.name,
              file: f,
              path: p,
              domain: content.domain,
              autoExecute: content.governance?.auto_execute
            });
          }
        } catch {}
      }
    }
    
    console.log(`  ISC规则: ${this.iscRules.length} 个`);
    return this.iscRules;
  }

  /**
   * DTO主动性：扫描所有订阅
   */
  async dtoProactive() {
    console.log('[DTO主动性] 扫描所有订阅...');
    
    if (!fs.existsSync(ALIGNMENT_CONFIG.dtoSubsPath)) {
      console.log('  DTO订阅目录不存在');
      return [];
    }
    
    const files = fs.readdirSync(ALIGNMENT_CONFIG.dtoSubsPath)
      .filter(f => f.endsWith('.json'));
    
    for (const f of files) {
      try {
        const content = JSON.parse(fs.readFileSync(
          path.join(ALIGNMENT_CONFIG.dtoSubsPath, f), 'utf8'
        ));
        if (content.rule_id) {
          this.dtoSubs.push({
            ruleId: content.rule_id,
            file: f,
            autoExecute: content.auto_execute
          });
        }
      } catch {}
    }
    
    console.log(`  DTO订阅: ${this.dtoSubs.length} 个`);
    return this.dtoSubs;
  }

  /**
   * 双向对齐检查
   */
  async checkAlignment() {
    console.log('[双向对齐] 检查ISC-DTO对齐...');
    
    const dtoRuleIds = new Set(this.dtoSubs.map(s => s.ruleId));
    
    // ISC有但DTO没有的
    for (const rule of this.iscRules) {
      if (!dtoRuleIds.has(rule.id)) {
        this.misaligned.push({
          type: 'isc_has_dto_missing',
          rule: rule,
          action: 'dto_should_subscribe'
        });
      }
    }
    
    // DTO有但ISC没有的（孤儿订阅）
    const iscRuleIds = new Set(this.iscRules.map(r => r.id));
    for (const sub of this.dtoSubs) {
      if (!iscRuleIds.has(sub.ruleId)) {
        this.misaligned.push({
          type: 'dto_has_isc_missing',
          subscription: sub,
          action: 'orphan_subscription'
        });
      }
    }
    
    console.log(`  不对齐: ${this.misaligned.length} 个`);
    return this.misaligned;
  }

  /**
   * 去重检查分析
   */
  async checkDuplicates() {
    console.log('[去重检查] 分析重复订阅...');
    
    const ruleIdToSubs = new Map();
    const duplicates = [];
    
    // 统计每个rule_id对应的订阅
    for (const sub of this.dtoSubs) {
      if (!ruleIdToSubs.has(sub.ruleId)) {
        ruleIdToSubs.set(sub.ruleId, []);
      }
      ruleIdToSubs.get(sub.ruleId).push(sub);
    }
    
    // 找出重复的
    for (const [ruleId, subs] of ruleIdToSubs) {
      if (subs.length > 1) {
        duplicates.push({
          ruleId: ruleId,
          count: subs.length,
          subscriptions: subs,
          action: 'merge_duplicates'
        });
      }
    }
    
    if (duplicates.length > 0) {
      console.log(`  发现重复: ${duplicates.length} 个`);
      for (const dup of duplicates) {
        console.log(`    ⚠️  ${dup.ruleId}: ${dup.count} 个重复订阅`);
      }
    } else {
      console.log('  无重复订阅');
    }
    
    return duplicates;
  }

  /**
   * 合并重复订阅
   */
  async mergeDuplicates(duplicates) {
    console.log('[合并重复] 清理重复订阅...');
    
    let merged = 0;
    
    for (const dup of duplicates) {
      // 保留最新的订阅，删除其他
      const sorted = dup.subscriptions.sort((a, b) => {
        const aTime = a.created_at ? new Date(a.created_at) : new Date(0);
        const bTime = b.created_at ? new Date(b.created_at) : new Date(0);
        return bTime - aTime;
      });
      
      // 删除除第一个外的所有
      for (let i = 1; i < sorted.length; i++) {
        await this.dtoUnsubscribe(sorted[i]);
        merged++;
      }
    }
    
    console.log(`  合并: ${merged} 个重复`);
    return merged;
  }

  /**
   * 自动对齐
   */
  async autoAlign() {
    console.log('[自动对齐] 修复不对齐...');
    
    let fixed = 0;
    
    for (const item of this.misaligned) {
      if (item.type === 'isc_has_dto_missing') {
        // DTO主动订阅
        await this.dtoSubscribe(item.rule);
        fixed++;
      } else if (item.type === 'dto_has_isc_missing') {
        // 清理孤儿订阅
        await this.dtoUnsubscribe(item.subscription);
        fixed++;
      }
    }
    
    console.log(`  修复: ${fixed} 个`);
    return fixed;
  }

  async dtoUnsubscribe(subscription) {
    const subFile = path.join(
      ALIGNMENT_CONFIG.dtoSubsPath,
      subscription.file
    );
    
    if (fs.existsSync(subFile)) {
      fs.unlinkSync(subFile);
      console.log(`    🗑️  清理孤儿订阅: ${subscription.ruleId}`);
    }
  }

  async dtoSubscribe(rule) {
    const subFile = path.join(
      ALIGNMENT_CONFIG.dtoSubsPath,
      `isc-${rule.id.replace(/\./g, '-')}.json`
    );
    
    const subscription = {
      subscription_id: `sub_isc_${rule.id.replace(/\./g, '_')}`,
      subscriber: '本地任务编排-Declarative-Orchestrator',
      rule_id: rule.id,
      rule_name: rule.name,
      domain: rule.domain,
      auto_execute: rule.autoExecute !== false,
      created_at: new Date().toISOString(),
      source: 'auto_alignment'
    };
    
    fs.writeFileSync(subFile, JSON.stringify(subscription, null, 2));
    console.log(`    ✅ DTO订阅: ${rule.id}`);
  }

  /**
   * 生成对齐报告
   */
  generateReport() {
    const alignment = {
      timestamp: new Date().toISOString(),
      isc_rules: this.iscRules.length,
      dto_subscriptions: this.dtoSubs.length,
      misaligned: this.misaligned.length,
      alignment_rate: ((this.dtoSubs.length / Math.max(this.iscRules.length, 1)) * 100).toFixed(1) + '%',
      status: this.misaligned.length === 0 ? 'aligned' : 'misaligned'
    };
    
    console.log('\n[对齐报告]');
    console.log(`  ISC规则: ${alignment.isc_rules}`);
    console.log(`  DTO订阅: ${alignment.dto_subscriptions}`);
    console.log(`  对齐率: ${alignment.alignment_rate}`);
    console.log(`  状态: ${alignment.status}`);
    
    // 保存报告到文件
    const reportPath = path.join(WORKSPACE, '.isc/alignment-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(alignment, null, 2));
    console.log(`  报告已保存: ${reportPath}`);
    
    return alignment;
  }

  /**
   * 主运行
   */
  async run() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║     ISC-本地任务编排 双向对齐检查器 - 各自主动，双向对齐            ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    
    // ISC主动性
    await this.iscProactive();
    
    // DTO主动性
    await this.dtoProactive();
    
    // 去重检查
    const duplicates = await this.checkDuplicates();
    if (duplicates.length > 0) {
      await this.mergeDuplicates(duplicates);
      // 重新加载DTO订阅
      this.dtoSubs = [];
      await this.dtoProactive();
    }
    
    // 双向对齐检查
    await this.checkAlignment();
    
    // 自动对齐
    await this.autoAlign();
    
    // 报告
    const report = this.generateReport();
    
    return report;
  }
}

// 运行
if (require.main === module) {
  const checker = new ISCDTOAlignmentChecker();
  checker.run();
}

module.exports = ISCDTOAlignmentChecker;
