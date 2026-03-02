#!/usr/bin/env node
/**
 * CRON任务模型升级脚本
 * @description 根据ISC规则批量更新CRON任务模型配置
 */

const { CronModelSelector } = require('../skills/aeo/src/core/cron-model-selector.cjs');

// 当前CRON任务列表（从cron list获取）
const CURRENT_JOBS = [
  { id: 'e9ca2582-2d73-4023-8dc2-6ec5434ff976', name: 'CRAS-B-用户洞察分析', message: '执行CRAS模块B：用户洞察分析中枢。分析最近2小时用户交互，更新意图画像，并使用飞书卡片格式推送报告。' },
  { id: 'e96b2913-bb9d-40a5-8a81-d044ad33a2aa', name: 'DTO-Declarative-Orchestrator', message: 'cd /root/.openclaw/workspace/skills/dto-core && node core/declarative-orchestrator.js' },
  { id: '581e9d68-6f52-44bf-bc9a-dc6bdbe2de74', name: 'System-Monitor-健康检查-每小时', message: '执行系统健康检查任务。命令：node /root/.openclaw/skills/system-monitor/index.js health' },
  { id: '251fde06-e983-4e76-884f-5a3cf3e99c43', name: 'ISC-技能使用审计-每周', message: '执行技能使用审计。命令：bash /root/.openclaw/workspace/skills/isc-core/bin/skill-usage-audit.sh' },
  { id: '8b6c5d56-b035-4d68-8005-923267cc1c26', name: 'ISC-DTO-定期握手-每30分钟', message: '执行ISC-DTO定期握手：双向对齐检查。命令：node /root/.openclaw/workspace/skills/isc-core/bin/isc-dto-alignment-checker.js' },
  { id: 'a0886367-e9fb-4b9f-9ba5-7cebdefd036f', name: '能力锚点自动同步-每小时', message: '执行能力锚点自动同步：node /root/.openclaw/workspace/skills/isc-capability-anchor-sync/index.js' },
  { id: 'e04427bd-3d51-4b15-ae5d-b5a5ecc2b174', name: 'System-Monitor-峰值记录-每小时', message: '执行系统资源峰值记录: /root/.openclaw/workspace/skills/system-monitor/log-peaks.sh' },
  { id: '06b17199-a2ed-4608-b8c3-18a7032a5831', name: 'Gateway内存监控增强-v2', message: '执行Gateway内存监控(增强版): /root/.openclaw/workspace/scripts/gateway-monitor-v2.sh' },
  { id: 'c85b5fbf-b3c2-44ee-88d3-0cb4feda6c9c', name: '会话文件自动清理-每小时', message: '执行会话文件自动清理: /root/.openclaw/workspace/scripts/session-cleanup.sh' },
  { id: 'c66da3a7-1b90-405a-8f4f-bbf1e14e9684', name: 'AEO-DTO闭环衔接-每15分钟', message: '执行AEO-DTO闭环衔接：监听DTO信号，触发评测，输出结果到SEEF/ISC。' },
  { id: 'b9abcc9c-0ffe-4366-91a2-094c36bc8490', name: 'N023-自动生成评测标准-每小时', message: '执行N023：自动为缺少评测集的技能生成评测标准。' },
  { id: '59bef80d-b979-46b5-b517-f1c82ffba6a9', name: 'PDCA-C执行引擎-每小时', message: '执行PDCA-C引擎：每小时计划-执行-检查-行动循环。' },
  { id: '701e4700-dc5d-4195-ac86-28c2f6048225', name: '流水线健康监控-每小时', message: '执行流水线健康监控：检查最后反馈时间，超过10分钟无反馈则自动重启流水线。' },
  { id: '00f760d7-7394-40b0-843d-d25636a9d319', name: '全局自主决策流水线-每10分钟', message: '执行全局自主决策流水线：检查所有技能变更，更新版本号，同步GitHub和EvoMap。' },
  { id: 'dd8f4da9-b5dc-4a15-afbc-73399c4c001d', name: '飞书会话实时备份-每30分钟', message: '执行飞书聊天记录实时备份' },
  { id: 'f8706288-376c-4ade-98a9-d5767b538436', name: '流水线健康监控-每小时-2', message: '执行流水线健康监控：检查最后反馈时间，超过10分钟无反馈则自动重启流水线。' },
  { id: '1c3f0f9a-78c5-44fc-90c7-9be43aed20fa', name: 'EvoMap-Evolver-自动进化', message: '执行EvoMap-Evolver自动进化：分析过去4小时运行历史，提取信号，生成GEP进化提示词，发布Gene+Capsule到EvoMap网络。' },
  { id: 'bda87046-cb5b-4fb1-968a-f7751f11e1bd', name: 'Elite-Memory-记忆整理-每日', message: '执行记忆整理任务。' },
  { id: '955a83c6-9534-45f7-bf07-ba1ecb6d53e3', name: 'CRAS-C-知识治理', message: '执行CRAS模块C：知识治理系统。构建索引、向量化、分类、去重与质量评估。' },
  { id: 'c9f8f5fb-ce34-4b6f-8160-fd6d5fce5048', name: '统一向量化服务-每6小时', message: '执行统一向量化任务' },
  { id: '52ad9e62-59dc-4708-bb42-ba657cb1aeda', name: 'CRAS-四维意图洞察仪表盘', message: '执行CRAS意图洞察仪表盘生成任务：读取过去24小时会话，生成Top10意图分布、四维趋势洞察、心智闭环更新。' },
  { id: 'd9d8123d-e14e-408d-b72c-04b273530943', name: 'CRAS-E-自主进化', message: '执行CRAS模块E：自主反思与技能进化。遍历知识库，寻找规律，生成技能优化建议并执行。' },
  { id: 'e4b2a1cb-41a3-4dbb-b6a7-4971ef2bb5d8', name: '系统维护-每日清理', message: '执行系统维护' },
  { id: 'fd0ffed0-6439-45f1-80cb-2a056abceade', name: 'OpenClaw-自动备份-每日0700', message: '执行OpenClaw自动备份任务（每日07:00）' },
  { id: 'b76c9b20-d206-4d2d-9d26-815804cd22fd', name: 'CRAS-A-主动学习引擎', message: '执行CRAS模块A：主动学习引擎 - 定时联网学习。学习目标：1) Agent最前沿学术论文 2) 本地RAG技术进展 3) 技能生态演化趋势' },
  { id: '504ace91-50f2-404c-985b-6723fafa5b44', name: 'LEP-韧性日报-每日0900', message: 'node /root/.openclaw/workspace/skills/lep-executor/src/daily-report.js' },
  { id: '5f7cc02f-3313-474e-ba20-f72bfa1846d8', name: 'ClawHub-Skills-批量安装', message: '检查 ClawHub Skills 后台安装进度' },
  { id: 'f6f0ba02-eab9-4ab1-87cb-c1a9e648b5aa', name: 'CRAS-D-战略调研', message: '执行CRAS模块D：战略行研与产品规划。先执行 kimi_search 搜索行业趋势，然后基于知识库生成洞察报告。' },
  { id: '23b6618c-6abe-42f4-abbb-6774dc935821', name: 'CRAS-洞察复盘-每周', message: '执行CRAS洞察复盘任务' },
  { id: '76e11945-b79d-431e-b8e9-10d6814300be', name: 'OpenClaw-自动备份-每日1900', message: '执行OpenClaw自动备份任务（每日19:00）' },
  { id: 'ad01bc7d-d76d-4ff8-9bac-865b472c67df', name: 'Elite-Memory-重新评估检查-每月', message: '检查记忆文件数量' }
];

function analyzeUpgrades() {
  const selector = new CronModelSelector();
  
  console.log('========================================');
  console.log('CRON任务模型升级分析');
  console.log('ISC标准: rule.cron-task-model-selection-002');
  console.log('========================================\n');
  
  const upgrades = [];
  const byModel = {
    'glm-5-coder': [],
    'glm-thinking': [],
    'kimi-coding/k2p5': []
  };
  
  for (const job of CURRENT_JOBS) {
    const selection = selector.selectModel(job.message);
    
    if (selection.model !== 'kimi-coding/k2p5') {
      upgrades.push({
        name: job.name,
        current: 'kimi-coding/k2p5',
        proposed: selection.model,
        reason: selection.reason,
        message: job.message.substring(0, 50) + '...'
      });
      
      byModel[selection.model].push(job.name);
    }
  }
  
  console.log(`分析完成: ${upgrades.length} 个任务需要升级\n`);
  
  // 按模型分组输出
  for (const [model, jobs] of Object.entries(byModel)) {
    if (jobs.length === 0) continue;
    
    console.log(`\n🎯 ${model} (${jobs.length}个任务)`);
    console.log('─'.repeat(60));
    
    jobs.forEach(name => {
      const upgrade = upgrades.find(u => u.name === name);
      console.log(`  • ${name}`);
      console.log(`    原因: ${upgrade.reason}`);
    });
  }
  
  console.log('\n\n========================================');
  console.log('升级建议');
  console.log('========================================');
  console.log(`
1. 高优先级（编码任务 → GLM-5）: ${byModel['glm-5-coder'].length}个
   - N023自动生成评测标准
   - 能力锚点同步
   - EvoMap-Evolver自动进化

2. 中优先级（分析任务 → GLM-Thinking）: ${byModel['glm-thinking'].length}个
   - CRAS用户洞察分析
   - CRAS战略调研
   - CRAS自主进化
   - CRAS意图洞察仪表盘

3. 保持现状（例行任务 → kimi-coding）: ${CURRENT_JOBS.length - upgrades.length}个
   - 备份、清理、监控等例行任务
`);
  
  return upgrades;
}

// 生成具体升级命令
function generateUpgradeCommands() {
  const selector = new CronModelSelector();
  
  console.log('\n========================================');
  console.log('批量升级命令');
  console.log('========================================\n');
  
  for (const job of CURRENT_JOBS) {
    const selection = selector.selectModel(job.message);
    
    if (selection.model !== 'kimi-coding/k2p5') {
      console.log(`# ${job.name}`);
      console.log(`openclaw cron update ${job.id} --model ${selection.model}`);
      console.log();
    }
  }
}

// 执行分析
const upgrades = analyzeUpgrades();
generateUpgradeCommands();
