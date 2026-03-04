#!/usr/bin/env node
/**
 * EvoMap自动同步执行器
 * ISC规则R003: skill_created OR skill_updated → sync_to_evomap_network
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { SKILLS_DIR, WORKSPACE } = require('../../_shared/paths');

const EVOMAP_CONFIG = {
  uploaderPath: path.join(SKILLS_DIR, 'evomap-uploader'),
  skillsPath: SKILLS_DIR,
  registryPath: path.join(WORKSPACE, '.evomap-registry.json')
};

class EvoMapAutoSyncExecutor {
  constructor() {
    this.ensureDirectories();
  }

  ensureDirectories() {
    if (!fs.existsSync(EVOMAP_CONFIG.uploaderPath)) {
      fs.mkdirSync(EVOMAP_CONFIG.uploaderPath, { recursive: true });
    }
  }

  /**
   * 检测技能变更
   */
  detectSkillChanges() {
    console.log('[EvoMap同步] 检测技能变更...');
    
    const changes = [];
    const skills = fs.readdirSync(EVOMAP_CONFIG.skillsPath)
      .filter(d => fs.statSync(path.join(EVOMAP_CONFIG.skillsPath, d)).isDirectory());
    
    for (const skill of skills) {
      const skillPath = path.join(EVOMAP_CONFIG.skillsPath, skill);
      
      // 检查任何文件最近是否有更新（1小时内）
      let latestMtime = 0;
      let hasChanges = false;
      
      try {
        const files = fs.readdirSync(skillPath, { recursive: true });
        for (const file of files) {
          const filePath = path.join(skillPath, file);
          try {
            const stat = fs.statSync(filePath);
            if (stat.isFile()) {
              const age = Date.now() - stat.mtime.getTime();
              if (age < 60 * 60 * 1000 && stat.mtime.getTime() > latestMtime) { // 1小时内
                latestMtime = stat.mtime.getTime();
                hasChanges = true;
              }
            }
          } catch {}
        }
      } catch {}
      
      if (hasChanges) {
        changes.push({
          skill: skill,
          path: skillPath,
          changedAt: new Date(latestMtime),
          type: 'updated'
        });
      }
    }
    
    console.log(`  检测到 ${changes.length} 个技能变更`);
    return changes;
  }

  /**
   * 同步技能到EvoMap
   */
  async syncSkill(skillInfo) {
    console.log(`[EvoMap同步] 同步: ${skillInfo.skill}`);
    
    try {
      // 读取SKILL.md
      const skillMdPath = path.join(skillInfo.path, 'SKILL.md');
      const skillContent = fs.readFileSync(skillMdPath, 'utf8');
      
      // 提取版本信息
      const versionMatch = skillContent.match(/version:\s*["']?([^"'\n]+)["']?/i);
      const version = versionMatch ? versionMatch[1] : '1.0.0';
      
      // 生成Gene
      const gene = this.generateGene(skillInfo, version);
      
      // 生成Capsule
      const capsule = this.generateCapsule(skillInfo, gene);
      
      // 保存到EvoMap目录
      const timestamp = Date.now();
      const genePath = path.join(EVOMAP_CONFIG.uploaderPath, `gene-${skillInfo.skill}-${timestamp}.json`);
      const capsulePath = path.join(EVOMAP_CONFIG.uploaderPath, `capsule-${skillInfo.skill}-${timestamp}.json`);
      
      fs.writeFileSync(genePath, JSON.stringify(gene, null, 2));
      fs.writeFileSync(capsulePath, JSON.stringify(capsule, null, 2));
      
      // 更新注册表
      this.updateRegistry(skillInfo.skill, version, gene.id, capsule.id);
      
      console.log(`  ✅ 已生成: ${skillInfo.skill} v${version}`);
      console.log(`     Gene: ${gene.id}`);
      console.log(`     Capsule: ${capsule.id}`);
      
      return { success: true, gene, capsule };
    } catch (e) {
      console.error(`  ❌ 同步失败: ${e.message}`);
      return { success: false, error: e.message };
    }
  }

  generateGene(skillInfo, version) {
    return {
      type: 'Gene',
      schema_version: '1.5.0',
      category: skillInfo.type === 'created' ? 'innovate' : 'optimize',
      signals_match: ['skill_lifecycle', 'evomap_sync'],
      summary: `技能${skillInfo.skill} ${skillInfo.type === 'created' ? '创建' : '更新'}同步`,
      strategy: [
        '检测技能变更',
        '生成Gene和Capsule',
        '更新EvoMap注册表'
      ],
      asset_id: `gene_${skillInfo.skill}_${Date.now()}`,
      created_at: new Date().toISOString()
    };
  }

  generateCapsule(skillInfo, gene) {
    return {
      type: 'Capsule',
      schema_version: '1.5.0',
      trigger: ['skill_created', 'skill_updated'],
      gene: gene.asset_id,
      summary: `${skillInfo.skill} EvoMap同步完成`,
      content: `技能${skillInfo.skill}已同步到EvoMap网络`,
      confidence: 0.9,
      blast_radius: { files: 1, lines: 10 },
      outcome: { status: 'success', score: 0.9 },
      asset_id: `capsule_${skillInfo.skill}_${Date.now()}`,
      created_at: new Date().toISOString()
    };
  }

  updateRegistry(skill, version, geneId, capsuleId) {
    let registry = [];
    if (fs.existsSync(EVOMAP_CONFIG.registryPath)) {
      registry = JSON.parse(fs.readFileSync(EVOMAP_CONFIG.registryPath, 'utf8'));
    }
    
    registry.push({
      skill: skill,
      version: version,
      geneId: geneId,
      capsuleId: capsuleId,
      syncedAt: new Date().toISOString()
    });
    
    fs.writeFileSync(EVOMAP_CONFIG.registryPath, JSON.stringify(registry, null, 2));
  }

  /**
   * 主执行
   */
  async execute() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║     EvoMap自动同步执行器 - ISC规则R003                     ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    
    const changes = this.detectSkillChanges();
    
    if (changes.length === 0) {
      console.log('无技能变更，跳过同步');
      return [];
    }
    
    const results = [];
    for (const change of changes) {
      const result = await this.syncSkill(change);
      results.push(result);
    }
    
    console.log(`\n同步完成: ${results.filter(r => r.success).length}/${results.length}`);
    return results;
  }
}

// 运行
if (require.main === module) {
  const executor = new EvoMapAutoSyncExecutor();
  executor.execute();
}

module.exports = EvoMapAutoSyncExecutor;
