#!/usr/bin/env node
/**
 * N023 AEO自动生成评测标准执行器
 * 触发条件：skill_created / skill_major_update / evaluation_required
 */

const fs = require('fs');
const path = require('path');
const { SKILLS_DIR } = require('../../_shared/paths');

const CONFIG = {
  skillsPath: SKILLS_DIR,
  aeoPath: path.join(SKILLS_DIR, 'aeo'),
  outputPath: path.join(SKILLS_DIR, 'aeo/evaluation-sets')
};

class N023Executor {
  constructor() {
    this.generated = [];
  }

  /**
   * 主执行入口
   */
  async execute() {
    console.log('[N023] 开始执行自动生成评测标准...');
    
    // 1. 扫描所有技能
    const skills = this.scanSkills();
    console.log(`[N023] 扫描到 ${skills.length} 个技能`);
    
    // 2. 检查哪些技能缺少评测集
    for (const skill of skills) {
      const evalPath = path.join(CONFIG.outputPath, skill.name);
      
      if (!fs.existsSync(evalPath)) {
        console.log(`[N023] 为 ${skill.name} 生成评测集...`);
        await this.generateEvaluationSet(skill);
        this.generated.push(skill.name);
      }
    }
    
    // 3. 输出报告
    console.log(`[N023] 完成：为 ${this.generated.length} 个技能生成评测集`);
    return {
      generated: this.generated,
      total: skills.length
    };
  }

  /**
   * 扫描技能目录
   */
  scanSkills() {
    const skills = [];
    const entries = fs.readdirSync(CONFIG.skillsPath);
    
    for (const entry of entries) {
      const skillPath = path.join(CONFIG.skillsPath, entry);
      const skillMdPath = path.join(skillPath, 'SKILL.md');
      
      if (fs.existsSync(skillPath) && fs.statSync(skillPath).isDirectory()) {
        if (fs.existsSync(skillMdPath)) {
          const content = fs.readFileSync(skillMdPath, 'utf8');
          const type = this.detectSkillType(content);
          
          skills.push({
            name: entry,
            path: skillPath,
            type: type,
            hasSkillMd: true
          });
        }
      }
    }
    
    return skills;
  }

  /**
   * 检测技能类型
   */
  detectSkillType(content) {
    const lower = content.toLowerCase();
    if (lower.includes('llm') || lower.includes('chat') || lower.includes('ai')) {
      return 'ai-effect';
    }
    if (lower.includes('tool') || lower.includes('api') || lower.includes('workflow')) {
      return 'function-quality';
    }
    return 'mixed';
  }

  /**
   * 生成评测集
   */
  async generateEvaluationSet(skill) {
    const outputDir = path.join(CONFIG.outputPath, skill.name);
    fs.mkdirSync(outputDir, { recursive: true });
    
    // 根据技能类型选择评测维度
    const dimensions = skill.type === 'ai-effect' 
      ? ['relevance', 'coherence', 'helpfulness', 'creativity', 'safety']
      : ['accuracy', 'responseTime', 'errorRate', 'compatibility', 'stability'];
    
    // 生成标准文档
    const standard = {
      skill: skill.name,
      type: skill.type,
      generatedAt: new Date().toISOString(),
      dimensions: dimensions,
      thresholds: {
        pass: 0.75,
        excellent: 0.9
      }
    };
    
    // 生成测试用例模板
    const testCases = {
      skill: skill.name,
      cases: dimensions.map((dim, i) => ({
        id: `tc_${String(i+1).padStart(3, '0')}`,
        dimension: dim,
        type: skill.type === 'ai-effect' ? 'prompt' : 'function',
        description: `测试${dim}维度`,
        expected: '通过'
      }))
    };
    
    // 保存文件
    fs.writeFileSync(
      path.join(outputDir, 'standard.json'),
      JSON.stringify(standard, null, 2)
    );
    
    fs.writeFileSync(
      path.join(outputDir, 'test-cases.json'),
      JSON.stringify(testCases, null, 2)
    );
    
    console.log(`[N023] ✓ ${skill.name} 评测集已生成`);
  }
}

// 主执行
if (require.main === module) {
  const executor = new N023Executor();
  executor.execute().catch(console.error);
}

module.exports = { N023Executor };
