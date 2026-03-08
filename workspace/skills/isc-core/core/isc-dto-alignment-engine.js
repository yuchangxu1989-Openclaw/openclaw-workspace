#!/usr/bin/env node
/**
 * ISC-本地任务编排 自动对齐引擎
 * 核心机制：ISC 任何新增规则，本地任务编排 立即订阅并调度
 * 第一性原理：全局对齐的关键中枢
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { SKILLS_DIR } = require('../../shared/paths');

class ISC_DTO_AlignmentEngine {
    constructor() {
        this.iscRulesDir = path.join(__dirname, '..', 'rules/decision');
        this.dtoSubscriptionsDir = path.join(SKILLS_DIR, 'dto-core/subscriptions');
        this.alignmentLog = path.join(SKILLS_DIR, '.isc-dto-alignment.log');
        this.subscribedRules = this.loadSubscribedRules();
    }

    loadSubscribedRules() {
        const rules = new Set();
        if (fs.existsSync(this.alignmentLog)) {
            const log = fs.readFileSync(this.alignmentLog, 'utf8');
            log.split('\n').forEach(line => {
                const match = line.match(/R\d+/);
                if (match) rules.add(match[0]);
            });
        }
        return rules;
    }

    /**
     * 扫描 ISC 所有规则
     */
    scanISCRules() {
        const rules = [];
        if (!fs.existsSync(this.iscRulesDir)) return rules;
        
        const files = fs.readdirSync(this.iscRulesDir);
        for (const file of files) {
            if (file.endsWith('.json')) {
                const rulePath = path.join(this.iscRulesDir, file);
                try {
                    const rule = JSON.parse(fs.readFileSync(rulePath, 'utf8'));
                    rules.push(rule);
                } catch (e) {
                    console.error(`[AlignmentEngine] 读取规则失败: ${file}`);
                }
            }
        }
        return rules;
    }

    /**
     * 检查是否需要订阅
     */
    needsSubscription(rule) {
        // 已订阅的规则不需要重复订阅
        if (this.subscribedRules.has(rule.id)) return false;
        
        // 只订阅 active 状态的规则
        if (rule.status !== 'active') return false;
        
        return true;
    }

    /**
     * 生成 本地任务编排 订阅配置
     */
    generateSubscription(rule) {
        const workflowMap = {
            'auto_skillization': 'Auto-Skillization-Pipeline',
            'auto_vectorization': 'Auto-Vectorization-Pipeline',
            'auto_evomap_sync': 'EvoMap-Sync-Pipeline',
            'auto_fix_high_severity': 'Auto-Fix-Emergency',
            'auto_readme_generation': 'README-Generation-Pipeline',
            'signal_deduplication': 'Signal-Deduplication-Handler',
            'capability_anchor_auto_identification': 'Capability-Anchor-Identification',
            'proactive_skillization_execution': 'Proactive-Skillization-Execution'
        };

        const workflow = workflowMap[rule.name] || `ISC-Rule-${rule.id}-Workflow`;
        
        return {
            subscription_id: `sub_isc_${rule.id}`,
            subscriber: '本地任务编排-Declarative-Orchestrator',
            rule_id: rule.id,
            rule_name: rule.name,
            trigger_conditions: {
                on_trigger: true,
                condition: rule.condition
            },
            workflow: {
                workflow_id: workflow,
                engine: rule.priority >= 8 ? 'dag' : 'linear',
                timeout_minutes: 30,
                auto_execute: rule.action?.includes('auto') || false
            },
            notification: {
                on_start: true,
                on_complete: true,
                on_failure: true,
                channel: 'feishu'
            },
            created_at: new Date().toISOString(),
            isc_version: rule.version
        };
    }

    /**
     * 保存订阅配置
     */
    saveSubscription(subscription) {
        fs.mkdirSync(this.dtoSubscriptionsDir, { recursive: true });
        
        const fileName = `isc-${subscription.rule_id}.json`;
        const filePath = path.join(this.dtoSubscriptionsDir, fileName);
        
        fs.writeFileSync(filePath, JSON.stringify(subscription, null, 2));
        
        // 记录到对齐日志
        const logEntry = `[${new Date().toISOString()}] 已订阅 ${subscription.rule_id}: ${subscription.rule_name}\n`;
        fs.appendFileSync(this.alignmentLog, logEntry);
        
        return filePath;
    }

    /**
     * 执行对齐
     */
    align() {
        console.log('[ISC-本地任务编排-Alignment] 执行全局对齐...');
        
        const iscRules = this.scanISCRules();
        console.log(`  发现 ${iscRules.length} 个 ISC 规则`);
        
        let newSubscriptions = 0;
        
        for (const rule of iscRules) {
            if (this.needsSubscription(rule)) {
                console.log(`  🆕 新规则: ${rule.id} (${rule.name})`);
                
                const subscription = this.generateSubscription(rule);
                const filePath = this.saveSubscription(subscription);
                
                console.log(`     ✅ 已订阅: ${filePath}`);
                this.subscribedRules.add(rule.id);
                newSubscriptions++;
                
                // 立即触发 本地任务编排 调度器重新加载
                this.notifyDTO(subscription);
            }
        }
        
        if (newSubscriptions === 0) {
            console.log('  所有规则已对齐，无新订阅');
        } else {
            console.log(`  完成: ${newSubscriptions} 个新订阅`);
        }
        
        return newSubscriptions;
    }

    /**
     * 通知 本地任务编排 重新加载订阅
     */
    notifyDTO(subscription) {
        // 写入事件队列，本地任务编排 定时读取
        const eventQueue = path.join(SKILLS_DIR, 'dto-core/events/isc-rule-subscriptions.jsonl');
        fs.mkdirSync(path.dirname(eventQueue), { recursive: true });
        
        const event = {
            type: 'isc_rule_subscribed',
            rule_id: subscription.rule_id,
            timestamp: new Date().toISOString()
        };
        
        fs.appendFileSync(eventQueue, JSON.stringify(event) + '\n');
    }

    /**
     * 持续监控（文件监听）
     */
    watch() {
        console.log('[ISC-本地任务编排-Alignment] 启动文件监听...');
        
        // 使用 inotifywait 或轮询
        setInterval(() => {
            this.align();
        }, 60000); // 每分钟检查一次
        
        // 立即执行一次
        this.align();
    }
}

// CLI
if (require.main === module) {
    const engine = new ISC_DTO_AlignmentEngine();
    
    const command = process.argv[2];
    if (command === 'watch') {
        engine.watch();
    } else {
        engine.align();
    }
}

module.exports = { ISC_DTO_AlignmentEngine };
