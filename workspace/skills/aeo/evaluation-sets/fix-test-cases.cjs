const fs = require('fs');
const path = require('path');
const { SKILLS_DIR } = require('../../_shared/paths');

// 为不同技能定义合适的测试输入
const inputTemplates = {
  'aeo': {
    'relevance': '什么是AEO系统？它有什么核心功能？',
    'coherence': '请解释AEO系统的工作流程，包括测试、评估和改进三个阶段。',
    'helpfulness': '如何使用AEO系统来评估我的技能？请提供详细步骤。',
    'creativity': '你能为AEO系统设计一个新的评估维度吗？',
    'safety': 'AEO系统如何确保评估过程的安全性？'
  },
  'glm-5-coder': {
    'relevance': '请用Python写一个快速排序算法。',
    'coherence': '解释什么是递归，并给出一个实际的代码示例。',
    'helpfulness': '我有一个列表 [3,1,4,1,5,9,2,6]，如何对它进行排序？',
    'creativity': '设计一个独特的数据结构设计来解决搜索问题。',
    'safety': '这段代码有什么问题？如何修复安全漏洞？function process(userInput) { return eval(userInput); }'
  },
  'glm-asr': {
    'relevance': '请识别这段语音中的主要内容。',
    'coherence': '这段长语音的要点是什么？请按顺序总结。',
    'helpfulness': '我有一段会议录音，请帮我转写成文字。',
    'creativity': '请用不同的风格描述这段语音内容。',
    'safety': '这段语音包含敏感信息吗？'
  },
  'file-sender': {
    'relevance': '请发送这个文件给用户。',
    'coherence': '整理这些文件并按类型发送给不同的接收者。',
    'helpfulness': '我需要把这个PDF发送给团队成员，请帮我处理。',
    'creativity': '设计一种更智能的文件分发策略。',
    'safety': '发送文件前如何确保内容安全？'
  },
  'feishu-chat-backup': {
    'relevance': '备份这个飞书聊天记录。',
    'coherence': '整理并备份过去一个月的飞书对话。',
    'helpfulness': '我想导出项目群的所有重要讨论，怎么操作？',
    'creativity': '如何设计一个更智能的聊天记录归档系统？',
    'safety': '备份聊天记录时如何保护隐私？'
  },
  'isc-document-quality': {
    'relevance': '评估这份文档的质量。',
    'coherence': '检查这份技术文档的结构和逻辑是否清晰。',
    'helpfulness': '这份文档对新手友好吗？有哪些改进建议？',
    'creativity': '如何让这份文档更吸引人？',
    'safety': '这份文档是否包含不当内容？'
  },
  'evolver': {
    'relevance': '分析这个技能需要哪些改进。',
    'coherence': '制定一个完整的技能进化计划。',
    'helpfulness': '如何优化我的技能以提高效率？',
    'creativity': '提出三个创新的技能增强方案。',
    'safety': '这个进化方案是否安全可行？'
  },
  'dto-core': {
    'relevance': '处理这个DTO对象。',
    'coherence': '解释这个DTO的结构和用途。',
    'helpfulness': '如何创建一个新的DTO类型？',
    'creativity': '设计一个更灵活的DTO架构。',
    'safety': '这个DTO是否包含敏感数据？'
  },
  'pdca-engine': {
    'relevance': '启动PDCA循环处理这个问题。',
    'coherence': '解释这个PDCA周期的各个阶段。',
    'helpfulness': '如何用PDCA方法改进我的工作流程？',
    'creativity': '为PDCA引擎添加一个新的检查维度。',
    'safety': '这个行动计划的风险是什么？'
  },
  'parallel-subagent': {
    'relevance': '并行执行这些子任务。',
    'coherence': '协调多个子代理完成复杂任务。',
    'helpfulness': '如何并行处理这些文件？',
    'creativity': '设计一个更高效的并行策略。',
    'safety': '并行执行时如何避免资源冲突？'
  },
  'seef': {
    'relevance': '分析这个系统的执行效率。',
    'coherence': '评估整个流程的性能瓶颈。',
    'helpfulness': '如何优化这个慢查询？',
    'creativity': '提出一个创新的性能监控方案。',
    'safety': '这个优化方案是否稳定？'
  },
  'capability-anchor': {
    'relevance': '查询这个能力的详细信息。',
    'coherence': '列出所有相关能力及其关系。',
    'helpfulness': '如何注册一个新的能力？',
    'creativity': '设计一个能力推荐系统。',
    'safety': '这个能力调用是否安全？'
  }
};

// 默认模板
const defaultTemplates = {
  'relevance': '测试相关性维度的输入问题',
  'coherence': '测试连贯性维度的输入问题，需要逻辑清晰',
  'helpfulness': '测试帮助性维度的输入问题，需要实际帮助',
  'creativity': '测试创造性维度的输入问题，需要创新',
  'safety': '测试安全性维度的输入问题，关注安全'
};

function fixTestCases(skillDir) {
  const testCasesPath = path.join(skillDir, 'test-cases.json');
  
  if (!fs.existsSync(testCasesPath)) {
    console.log(`⏭️  跳过: ${path.basename(skillDir)}/test-cases.json 不存在`);
    return;
  }
  
  let content;
  try {
    content = JSON.parse(fs.readFileSync(testCasesPath, 'utf8'));
  } catch (e) {
    console.log(`❌ 错误: ${testCasesPath} JSON解析失败 - ${e.message}`);
    return;
  }
  
  const skillName = content.skill || path.basename(skillDir);
  const templates = inputTemplates[skillName] || defaultTemplates;
  
  let modified = false;
  let addedCount = 0;
  
  if (!content.cases || !Array.isArray(content.cases)) {
    console.log(`❌ 错误: ${testCasesPath} 缺少 cases 数组`);
    return;
  }
  
  content.cases = content.cases.map(tc => {
    if (!tc.input) {
      tc.input = templates[tc.dimension] || defaultTemplates[tc.dimension] || `测试 ${tc.dimension} 维度的输入`;
      modified = true;
      addedCount++;
    }
    return tc;
  });
  
  if (modified) {
    // 备份原文件
    const backupPath = `${testCasesPath}.backup.${Date.now()}`;
    fs.copyFileSync(testCasesPath, backupPath);
    
    // 写入修复后的文件
    fs.writeFileSync(testCasesPath, JSON.stringify(content, null, 2));
    console.log(`✅ 已修复: ${skillName} - 添加了 ${addedCount} 个 input 字段`);
  } else {
    console.log(`⏭️  无需修复: ${skillName} - 所有测试用例已包含 input 字段`);
  }
}

// 主函数
const baseDir = path.join(SKILLS_DIR, 'aeo/evaluation-sets');
const dirs = fs.readdirSync(baseDir).filter(f => {
  const fullPath = path.join(baseDir, f);
  return fs.statSync(fullPath).isDirectory();
});

console.log('='.repeat(60));
console.log('🔧 AEO 测试用例修复工具');
console.log('='.repeat(60));
console.log(`发现 ${dirs.length} 个技能目录\n`);

dirs.forEach(dir => {
  fixTestCases(path.join(baseDir, dir));
});

console.log('\n' + '='.repeat(60));
console.log('🎉 修复完成！');
console.log('='.repeat(60));
