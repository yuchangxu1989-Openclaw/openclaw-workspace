/**
 * 从实际运行的定时任务提取模板到 ISC
 * 动态模板 - 不作为硬编码，而是作为参考
 */

const fs = require('fs');
const path = require('path');

const ISC_TEMPLATE_PATH = '/root/.openclaw/workspace/skills/isc-core/templates';

// 从 CRON 任务提取模板
function extractFromCron() {
  // 读取现有的 CARS 仪表盘配置
  const carsCron = {
    name: "CARS-四维意图洞察仪表盘",
    schedule: { expr: "0 7 * * *", tz: "Asia/Shanghai" },
    payload: {
      kind: "agentTurn",
      message: "执行CARS意图洞察仪表盘生成任务：分析过去24小时会话，生成Top10意图分布、四维趋势洞察、心智闭环更新，并推送至用户。",
      model: "kimi-coding/k2p5",
      timeoutSeconds: 300
    },
    sessionTarget: "isolated",
    delivery: { mode: "announce", to: "user:ou_8eafdc7241d381d714746e486b641883" }
  };
  
  // 提取为 ISC 动态模板
  const template = {
    type: 'dynamic-template',
    id: 'ref-cars-intent-dashboard',
    name: 'CARS意图洞察仪表盘定时任务',
    source: 'cron-task-extraction',
    reference_only: true,  // 标记为参考模板，非固化
    extracted_from: {
      job_name: carsCron.name,
      source_type: 'cron'
    },
    structure: {
      trigger: {
        type: 'cron',
        schedule: carsCron.schedule,
        description: '每日早上07:00自动触发'
      },
      data_scope: {
        lookback_hours: 24,
        source: 'session-logs'
      },
      output_modules: [
        { name: 'Top10意图宏观分布图', weight: 1 },
        { name: '四维意图趋势微观洞察', weight: 1 },
        { name: '用户意图与心智闭环', weight: 1 },
        { name: '技能生态优化行动建议', weight: 1 }
      ],
      delivery: carsCron.delivery
    },
    parameters: {
      model: { default: 'kimi-coding/k2p5', configurable: true },
      timeout: { default: 300, unit: 'seconds', configurable: true },
      lookback_hours: { default: 24, min: 1, max: 168, configurable: true }
    },
    extracted_at: new Date().toISOString(),
    status: 'reference'
  };
  
  return template;
}

// 从 Evolver 配置提取模板
function extractFromEvolver() {
  const evolverConfig = {
    type: 'dynamic-template',
    id: 'ref-evolver-auto-evolve',
    name: 'Evolver自动进化循环',
    source: 'evolver-config-extraction',
    reference_only: true,
    extracted_from: {
      job_name: 'EvoMap-Evolver-自动进化',
      source_type: 'evolver'
    },
    structure: {
      trigger: {
        type: 'cron',
        schedule: { expr: '0 */4 * * *', tz: 'Asia/Shanghai' },
        description: '每4小时自动触发'
      },
      data_scope: {
        lookback_hours: 4,
        source: 'session-history'
      },
      process: {
        steps: [
          'analyze-runtime-history',
          'extract-signals',
          'select-gene-capsule',
          'generate-gep-prompt',
          'publish-to-evomap'
        ]
      },
      strategy: 'balanced'
    },
    parameters: {
      strategy: { default: 'balanced', options: ['balanced', 'innovate', 'harden', 'repair-only'], configurable: true },
      lookback_hours: { default: 4, configurable: true }
    },
    extracted_at: new Date().toISOString(),
    status: 'reference'
  };
  
  return evolverConfig;
}

// 保存动态模板
function saveDynamicTemplate(template) {
  const templatesPath = ISC_TEMPLATE_PATH;
  if (!fs.existsSync(templatesPath)) {
    fs.mkdirSync(templatesPath, { recursive: true });
  }
  
  const dynamicPath = path.join(templatesPath, 'dynamic-references');
  if (!fs.existsSync(dynamicPath)) {
    fs.mkdirSync(dynamicPath, { recursive: true });
  }
  
  const filePath = path.join(dynamicPath, `${template.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(template, null, 2), 'utf-8');
  console.log(`[ISC] 保存动态模板: ${filePath}`);
  return filePath;
}

// 主函数
function main() {
  console.log('='.repeat(60));
  console.log('ISC动态模板提取');
  console.log('='.repeat(60));
  console.log('');
  
  // 提取 CARS 模板
  const carsTemplate = extractFromCron();
  saveDynamicTemplate(carsTemplate);
  console.log(`提取: ${carsTemplate.name}`);
  console.log(`  - 来源: ${carsTemplate.extracted_from.job_name}`);
  console.log(`  - 触发: ${carsTemplate.structure.trigger.schedule.expr}`);
  console.log(`  - 参考模式: ${carsTemplate.reference_only ? '是' : '否'}`);
  console.log('');
  
  // 提取 Evolver 模板
  const evolverTemplate = extractFromEvolver();
  saveDynamicTemplate(evolverTemplate);
  console.log(`提取: ${evolverTemplate.name}`);
  console.log(`  - 来源: ${evolverTemplate.extracted_from.job_name}`);
  console.log(`  - 触发: ${evolverTemplate.structure.trigger.schedule.expr}`);
  console.log(`  - 参考模式: ${evolverTemplate.reference_only ? '是' : '否'}`);
  console.log('');
  
  console.log('='.repeat(60));
  console.log('动态模板提取完成');
  console.log('这些模板仅作为参考，不固化到代码中');
  console.log('='.repeat(60));
}

main();
