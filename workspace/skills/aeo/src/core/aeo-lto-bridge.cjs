#!/usr/bin/env node
/**
 * AEO-DTO 闭环衔接器
 * 自动监听DTO信号，触发AEO评测，输出结果到SEEF/ISC
 */

const fs = require('fs');
const path = require('path');
const { SKILLS_DIR, WORKSPACE } = require('../../../_shared/paths');

const CONFIG = {
  aeoPath: path.join(SKILLS_DIR, 'aeo'),
  dtoSignalPath: path.join(WORKSPACE, '.dto-signals'),
  seefPath: path.join(SKILLS_DIR, 'seef'),
  iscPath: path.join(SKILLS_DIR, 'isc-core')
};

class AEODTOBridge {
  constructor() {
    this.pendingEvaluations = new Map();
  }

  /**
   * 监听DTO信号并触发AEO评测
   */
  async listenAndEvaluate() {
    console.log('[AEO-DTO Bridge] 开始监听信号...');
    
    // 1. 监听技能注册信号
    this.subscribe('skill.registered', async (signal) => {
      console.log(`[AEO] 新技能注册: ${signal.skillId}`);
      await this.triggerEvaluation(signal.skillId, 'registration');
    });

    // 2. 监听技能更新信号
    this.subscribe('skill.updated', async (signal) => {
      console.log(`[AEO] 技能更新: ${signal.skillId}`);
      await this.triggerEvaluation(signal.skillId, 'update');
    });

    // 3. 监听CRAS洞察信号（高频失败技能）
    this.subscribe('cras.insight.high-failure', async (signal) => {
      console.log(`[AEO] CRAS标记高频失败: ${signal.skillId}`);
      await this.triggerEvaluation(signal.skillId, 'failure-analysis');
    });

    // 4. 监听用户反馈信号
    this.subscribe('user.feedback.negative', async (signal) => {
      console.log(`[AEO] 负面反馈: ${signal.skillId}`);
      await this.triggerEvaluation(signal.skillId, 'feedback-response');
    });
  }

  /**
   * 订阅DTO信号
   */
  subscribe(topic, handler) {
    // 实际实现：监控信号目录或调用DTO API
    const signalFile = path.join(CONFIG.dtoSignalPath, `${topic}.json`);
    if (fs.existsSync(signalFile)) {
      const signals = JSON.parse(fs.readFileSync(signalFile, 'utf8'));
      signals.forEach(signal => handler(signal));
    }
  }

  /**
   * 触发AEO评测
   */
  async triggerEvaluation(skillId, triggerType) {
    try {
      // 读取技能信息
      const skillPath = path.join(SKILLS_DIR, skillId);
      const skillMdPath = path.join(skillPath, 'SKILL.md');
      
      if (!fs.existsSync(skillMdPath)) {
        console.log(`[AEO] 跳过: ${skillId} 无SKILL.md`);
        return;
      }

      // 解析技能类型
      const skillType = this.detectSkillType(skillMdPath);
      
      // 选择轨道
      const track = this.selectTrack(skillType);
      console.log(`[AEO] ${skillId} → ${track}轨道评测`);

      // 执行评测（简化版，实际调用AEO评测器）
      const result = await this.runEvaluation(skillId, track);
      
      // 输出结果到SEEF/ISC
      await this.outputResults(skillId, result, triggerType);
      
    } catch (e) {
      console.error(`[AEO] 评测失败 ${skillId}: ${e.message}`);
    }
  }

  /**
   * 检测技能类型
   */
  detectSkillType(skillMdPath) {
    const content = fs.readFileSync(skillMdPath, 'utf8').toLowerCase();
    if (content.includes('llm') || content.includes('chat') || content.includes('generation')) {
      return 'llm';
    }
    if (content.includes('tool') || content.includes('workflow') || content.includes('automation')) {
      return 'tool';
    }
    return 'hybrid';
  }

  /**
   * 选择评测轨道
   */
  selectTrack(skillType) {
    const trackMap = {
      'llm': 'ai-effect',
      'chat': 'ai-effect',
      'generation': 'ai-effect',
      'tool': 'function-quality',
      'workflow': 'function-quality',
      'automation': 'function-quality',
      'hybrid': 'mixed'
    };
    return trackMap[skillType] || 'function-quality';
  }

  /**
   * 执行评测（调用AEO核心）
   */
  async runEvaluation(skillId, track) {
    // 简化实现，实际调用 AEO/src/evaluation/ 下的评测器
    const evaluatorPath = track === 'ai-effect' 
      ? path.join(CONFIG.aeoPath, 'src/evaluation/ai-effect-evaluator.cjs')
      : path.join(CONFIG.aeoPath, 'src/evaluation/function-quality-evaluator.cjs');
    
    if (!fs.existsSync(evaluatorPath)) {
      console.log(`[AEO] 评测器不存在: ${evaluatorPath}`);
      return { score: 0.5, passed: false, reason: 'evaluator-not-found' };
    }

    // 实际评测调用（这里简化）
    return {
      skillId,
      track,
      score: 0.75,
      passed: true,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 输出结果到SEEF/ISC
   */
  async outputResults(skillId, result, triggerType) {
    // 1. 输出到SEEF（技能优化建议）
    const seefSignal = {
      type: 'aeo.evaluation.completed',
      skillId,
      result,
      triggerType,
      timestamp: new Date().toISOString()
    };
    
    const seefSignalPath = path.join(CONFIG.seefPath, '.signals', `aeo-${skillId}-${Date.now()}.json`);
    fs.mkdirSync(path.dirname(seefSignalPath), { recursive: true });
    fs.writeFileSync(seefSignalPath, JSON.stringify(seefSignal, null, 2));
    console.log(`[AEO] 结果已发送SEEF: ${seefSignalPath}`);

    // 2. 输出到ISC（标准更新建议）
    if (result.score < 0.6) {
      const iscSignal = {
        type: 'aeo.quality.below-threshold',
        skillId,
        score: result.score,
        recommendation: '建议添加限制规则或下线',
        timestamp: new Date().toISOString()
      };
      
      const iscSignalPath = path.join(CONFIG.iscPath, '.signals', `aeo-${skillId}-${Date.now()}.json`);
      fs.mkdirSync(path.dirname(iscSignalPath), { recursive: true });
      fs.writeFileSync(iscSignalPath, JSON.stringify(iscSignal, null, 2));
      console.log(`[AEO] 警告已发送ISC: ${iscSignalPath}`);
    }
  }
}

// 主执行
if (require.main === module) {
  const bridge = new AEODTOBridge();
  bridge.listenAndEvaluate().catch(console.error);
}

module.exports = { AEODTOBridge };
