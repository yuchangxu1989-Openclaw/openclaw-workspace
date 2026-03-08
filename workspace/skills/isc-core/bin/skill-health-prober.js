#!/usr/bin/env node
/**
 * 技能健康探查器 v1.0
 * DTO调度：定期扫描所有技能，发现占位符、僵尸技能
 */

const fs = require('fs');
const path = require('path');
const { SKILLS_DIR } = require('../../shared/paths');

const PROBER_CONFIG = {
  version: '1.0.0',
  skillsPath: SKILLS_DIR,
  standards: {
    minSkillMdSize: 100, // SKILL.md至少100字
    minCodeFiles: 1,     // 至少1个代码文件
    maxIdleDays: 7       // 7天无更新视为僵尸
  }
};

class SkillHealthProber {
  constructor() {
    this.issues = [];
  }

  /**
   * 探查所有技能
   */
  async probeAllSkills() {
    console.log('[技能探查] 开始扫描所有技能...');
    
    const skills = fs.readdirSync(PROBER_CONFIG.skillsPath)
      .filter(d => fs.statSync(path.join(PROBER_CONFIG.skillsPath, d)).isDirectory());
    
    console.log(`  发现 ${skills.length} 个技能目录`);
    
    for (const skill of skills) {
      await this.probeSkill(skill);
    }
    
    return this.generateReport();
  }

  /**
   * 探查单个技能
   */
  async probeSkill(skillName) {
    const skillPath = path.join(PROBER_CONFIG.skillsPath, skillName);
    const issues = [];
    
    // 检查1: SKILL.md是否存在
    const skillMdPath = path.join(skillPath, 'SKILL.md');
    if (!fs.existsSync(skillMdPath)) {
      issues.push({
        type: 'placeholder',
        severity: 'high',
        message: '缺少SKILL.md',
        standard: 'ISC-SKILL-QUALITY-001'
      });
    } else {
      // 检查SKILL.md内容
      const skillMdSize = fs.readFileSync(skillMdPath, 'utf8').length;
      if (skillMdSize < PROBER_CONFIG.standards.minSkillMdSize) {
        issues.push({
          type: 'thin_skill',
          severity: 'medium',
          message: `SKILL.md内容过少(${skillMdSize}字)`,
          standard: 'ISC-SKILL-QUALITY-001'
        });
      }
    }
    
    // 检查2: 是否有代码文件
    const codeFiles = this.findCodeFiles(skillPath);
    if (codeFiles.length === 0) {
      issues.push({
        type: 'placeholder',
        severity: 'high',
        message: '缺少可执行代码',
        standard: 'ISC-SKILL-QUALITY-001'
      });
    }
    
    // 检查3: 是否僵尸技能（长期无更新）
    const lastUpdate = this.getLastUpdate(skillPath);
    const idleDays = (Date.now() - lastUpdate) / (24 * 60 * 60 * 1000);
    if (idleDays > PROBER_CONFIG.standards.maxIdleDays) {
      issues.push({
        type: 'zombie',
        severity: 'low',
        message: `僵尸技能(${Math.floor(idleDays)}天无更新)`,
        standard: 'ISC-SKILL-MAINTENANCE-001'
      });
    }
    
    // 检查4: 代码是否实质性（不是空函数）
    for (const codeFile of codeFiles.slice(0, 3)) {
      const content = fs.readFileSync(codeFile, 'utf8');
      if (this.isEmptyImplementation(content)) {
        issues.push({
          type: 'placeholder',
          severity: 'high',
          message: `代码空实现: ${path.basename(codeFile)}`,
          standard: 'ISC-SKILL-QUALITY-001'
        });
      }
    }
    
    if (issues.length > 0) {
      this.issues.push({
        skill: skillName,
        issues: issues
      });
    }
  }

  findCodeFiles(skillPath) {
    const codeExts = ['.js', '.py', '.sh', '.ts'];
    const files = [];
    
    try {
      const allFiles = fs.readdirSync(skillPath, { recursive: true });
      for (const file of allFiles) {
        if (codeExts.some(ext => file.endsWith(ext))) {
          files.push(path.join(skillPath, file));
        }
      }
    } catch {}
    
    return files;
  }

  getLastUpdate(skillPath) {
    try {
      const stats = fs.statSync(skillPath);
      return stats.mtime.getTime();
    } catch {
      return 0;
    }
  }

  isEmptyImplementation(content) {
    // 检查是否是空函数或只有注释
    const lines = content.split('\n').filter(l => {
      const trimmed = l.trim();
      return trimmed.length > 0 && !trimmed.startsWith('//') && !trimmed.startsWith('/*') && !trimmed.startsWith('*');
    });
    
    // 如果有效代码行<5，认为是空实现
    return lines.length < 5;
  }

  /**
   * 生成探查报告
   */
  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      totalSkills: fs.readdirSync(PROBER_CONFIG.skillsPath)
        .filter(d => fs.statSync(path.join(PROBER_CONFIG.skillsPath, d)).isDirectory()).length,
      issuesFound: this.issues.length,
      issues: this.issues,
      summary: {
        placeholder: this.countByType('placeholder'),
        zombie: this.countByType('zombie'),
        thin_skill: this.countByType('thin_skill')
      }
    };
    
    console.log('\n[技能探查] 报告:');
    console.log(`  总技能: ${report.totalSkills}`);
    console.log(`  问题技能: ${report.issuesFound}`);
    console.log(`  - 占位符: ${report.summary.placeholder}`);
    console.log(`  - 僵尸: ${report.summary.zombie}`);
    console.log(`  - 内容过少: ${report.summary.thin_skill}`);
    
    return report;
  }

  countByType(type) {
    return this.issues.reduce((sum, i) => sum + i.issues.filter(ii => ii.type === type).length, 0);
  }

  /**
   * 发射信号到DTO
   */
  emitSignal(report) {
    if (report.issuesFound === 0) return;
    
    const signal = {
      source: 'skill-health-prober',
      timestamp: new Date().toISOString(),
      data: {
        type: 'skill_health_alert',
        severity: report.summary.placeholder > 0 ? 'high' : 'medium',
        title: `发现${report.issuesFound}个问题技能`,
        description: `占位符:${report.summary.placeholder}, 僵尸:${report.summary.zombie}`,
        issues: report.issues,
        recommendation: '清理占位符技能，激活僵尸技能'
      }
    };
    
    const signalPath = path.join(SKILLS_DIR, 'lto-core/events/cras-signals.jsonl');
    fs.appendFileSync(signalPath, JSON.stringify(signal) + '\n');
    
    console.log('[技能探查] 信号已发射到DTO');
  }

  /**
   * 主运行
   */
  async run() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║     技能健康探查器 v1.0 - DTO调度评估模块                  ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    
    const report = await this.probeAllSkills();
    this.emitSignal(report);
    
    return report;
  }
}

// 运行
if (require.main === module) {
  const prober = new SkillHealthProber();
  prober.run();
}

module.exports = SkillHealthProber;
