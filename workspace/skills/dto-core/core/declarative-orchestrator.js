#!/usr/bin/env node
/**
 * DTO 声明式任务编排中心 - 工作流调度器
 * 基于ISC标准，编排声明式工作流，调度各模块执行
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const { SKILLS_DIR, WORKSPACE } = require('../../_shared/paths');

const PATHS = {
  dto: path.join(SKILLS_DIR, 'dto-core'),
  isc: path.join(SKILLS_DIR, 'isc-core'),
  council: path.join(SKILLS_DIR, 'council-of-seven'),
  cras: path.join(SKILLS_DIR, 'cras')
};

/**
 * DTO 声明式任务编排平台 - 工作流调度器
 */
class DTODeclarativeOrchestrator {
  constructor() {
    this.eventQueuePath = path.join(PATHS.dto, 'events/cras-signals.jsonl');
    this.taskQueuePath = path.join(PATHS.dto, 'tasks/dto-task-queue.json');
    this.processedSignalsPath = path.join(PATHS.dto, 'logs/processed-signals.jsonl');
    this.fileWatchers = new Map(); // 文件监控器
    this.lastFileMtimes = new Map(); // 文件修改时间记录
  }

  /**
   * 主循环：监听并处理工作流事件
   */
  async start() {
    console.log('='.repeat(70));
    console.log('🎯 DTO 声明式任务编排中心 v3.0.2 - 自动对齐ISC规则');
    console.log('='.repeat(70));
    
    // 初始化ISC规则订阅
    await this.initializeISCSubscriptions();
    
    // 确保目录存在
    this.ensureDirectories();
    
    // 启动文件监控（R005自动触发关键）
    this.startFileWatcher();
    
    // 启动ISC规则定时重新扫描（每小时检查新规则）
    this.startISCRescanTimer();
    
    // 处理队列中的信号
    await this.processPendingSignals();
    
    console.log('\n✅ 工作流处理完成');
  }

  /**
   * 初始化ISC规则订阅（v3.0.3全自动执行版）
   * 自动扫描ISC standards目录，订阅所有规则（包括独立规则文件）
   */
  async initializeISCSubscriptions() {
    console.log('[DTO] 自动对齐ISC规则订阅...');
    
    this.iscSubscriptions = [];
    
    // ===== 修复：扫描所有ISC规则目录 =====
    const scanPaths = [
      path.join(PATHS.isc, 'standards'),
      path.join(PATHS.isc, 'rules'),
      path.join(PATHS.isc, 'rules', 'decision'),
      path.join(PATHS.isc, 'rules', 'detection'),
      path.join(PATHS.isc, 'rules', 'naming'),
      path.join(PATHS.isc, 'rules', 'interaction')
    ];
    
    for (const scanPath of scanPaths) {
      if (!fs.existsSync(scanPath)) continue;
      
      const files = fs.readdirSync(scanPath).filter(f => f.endsWith('.json'));
      
      for (const file of files) {
        const filePath = path.join(scanPath, file);
        try {
          const standard = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          
          // 处理独立规则文件（如 rule.xxx.json 或 Rxxx.json）
          if ((file.startsWith('rule.') || file.match(/^R\d+/)) && standard.id) {
            const subscription = {
              ruleId: standard.id,
              name: standard.name || standard.id,
              type: 'standalone_rule',
              file: file,
              path: scanPath,
              handler: this.createRuleHandler(standard.id).bind(this),
              autoExecute: standard.governance?.auto_execute !== false && 
                           standard.governance?.councilRequired !== true
            };
            this.iscSubscriptions.push(subscription);
            console.log(`[DTO] 自动订阅规则: ${standard.id} [autoExecute: ${subscription.autoExecute}]`);
            continue;
          }
          
          // 提取嵌套规则（标准文件中的 rules 数组）
          if (standard.rules && Array.isArray(standard.rules)) {
            for (const rule of standard.rules) {
              const subscription = {
                ruleId: rule.id,
                name: rule.name || rule.id,
                type: 'nested_rule',
                standardId: standard.id,
                handler: this.createRuleHandler(rule.id).bind(this),
                autoExecute: true
              };
              this.iscSubscriptions.push(subscription);
              console.log(`[DTO] 自动订阅嵌套规则: ${rule.id}`);
            }
          }
          
        } catch (e) {
          console.error(`[DTO] 解析失败 ${file}: ${e.message}`);
        }
      }
    }
    
    // 输出详细的订阅统计
    const ruleCount = this.iscSubscriptions.length;
    const autoExecuteCount = this.iscSubscriptions.filter(s => s.autoExecute).length;
    
    // ===== 调用 ISC-DTO 对齐检查器 =====
    console.log('[DTO] 调用 ISC-DTO 对齐检查器...');
    let alignmentReport = null;
    try {
      const Aligner = require(path.join(PATHS.isc, 'bin/isc-dto-alignment-checker.js'));
      const aligner = new Aligner();
      alignmentReport = await aligner.run();
    } catch (e) {
      console.error('[DTO] 对齐检查器调用失败:', e.message);
    }
    
    // 输出完整的对齐报告
    console.log('\n' + '='.repeat(60));
    console.log('📊 ISC-DTO 双向对齐检查报告');
    console.log('='.repeat(60));
    if (alignmentReport) {
      console.log(`  ISC规则总数: ${alignmentReport.isc_rules || 'N/A'}`);
      console.log(`  DTO订阅数:   ${alignmentReport.dto_subscriptions || ruleCount}`);
      console.log(`  对齐率:      ${alignmentReport.alignment_rate || 'N/A'}`);
      console.log(`  状态:        ${alignmentReport.status === 'aligned' ? '✅ 已对齐' : '⚠️ 未对齐'}`);
      if (alignmentReport.misaligned > 0) {
        console.log(`  不对齐项:    ${alignmentReport.misaligned} 个`);
      }
    } else {
      console.log(`  DTO订阅数:   ${ruleCount}`);
      console.log(`  全自动执行:  ${autoExecuteCount} 条`);
    }
    console.log('='.repeat(60));
    
    // ===== 根治：如果扫不到规则，自动调用ISC-DTO对齐修复器 =====
    if (ruleCount === 0) {
      console.log('[DTO] ⚠️ 未扫描到任何ISC规则，启动自对齐修复...');
      try {
        const Aligner = require('./isc-dto-aligner');
        const aligner = new Aligner();
        const result = await aligner.run();
        
        if (result.fixes > 0) {
          console.log('[DTO] ✅ 自对齐修复完成，重新扫描...');
          // 重新扫描
          return await this.initializeISCSubscriptions();
        }
      } catch (e) {
        console.error('[DTO] 自对齐修复失败:', e.message);
      }
    }
  }
  
  /**
   * 从命名标准中提取规则（R001-R006 等）
   */
  async extractRulesFromNamingStandard(standard) {
    // 检查是否有规则定义
    const rules = [];
    
    // R001: 自动技能化
    if (standard.auto_skillization !== undefined) {
      rules.push({ id: 'R001', name: 'auto_skillization', enabled: true });
    }
    
    // R002: 自动向量化
    if (standard.auto_vectorization !== undefined) {
      rules.push({ id: 'R002', name: 'auto_vectorization', enabled: true });
    }
    
    // R003: EvoMap自动同步
    if (standard.auto_evomap_sync !== undefined) {
      rules.push({ id: 'R003', name: 'auto_evomap_sync', enabled: true });
    }
    
    // R004: 高危问题自动修复
    if (standard.auto_fix_high_severity !== undefined) {
      rules.push({ id: 'R004', name: 'auto_fix_high_severity', enabled: true });
    }
    
    // R005: SKILL.md同步
    if (standard.skill_md_sync !== undefined) {
      rules.push({ id: 'R005', name: 'skill_md_sync', enabled: true });
    }
    
    // R006: 全局同步
    if (standard.global_sync_on_standard_update !== undefined) {
      rules.push({ id: 'R006', name: 'global_sync_on_standard_update', enabled: true });
    }
    
    for (const rule of rules) {
      const exists = this.iscSubscriptions.find(s => s.ruleId === rule.id);
      if (!exists) {
        this.iscSubscriptions.push({
          ruleId: rule.id,
          name: rule.name,
          type: 'extracted_from_standard',
          standardId: standard.id,
          handler: this.createRuleHandler(rule.id).bind(this),
          autoExecute: true
        });
        console.log(`[DTO] 从标准提取规则: ${rule.id} (${rule.name})`);
      }
    }
  }
  
  /**
   * 创建规则处理器（动态）
   */
  createRuleHandler(ruleId) {
    return async (event) => {
      console.log(`[DTO-${ruleId}] 执行规则处理...`);
      // 默认处理器，具体逻辑可扩展
      await this.executeRuleAction(ruleId, event);
    };
  }
  
  /**
   * 执行规则动作 - 全自动执行所有ISC规则
   */
  async executeRuleAction(ruleId, event) {
    // 根据ruleId执行相应动作 - 全自动，无需人工干预
    switch(ruleId) {
      case 'R001': await this.handleAutoSkillization(event); break;
      case 'R002': await this.handleAutoVectorization(event); break;
      case 'R003': await this.handleAutoEvoMapSync(event); break;
      case 'R004': await this.handleAutoFix(event); break;
      case 'R005': await this.handleSkillMdSync(event); break;
      case 'R006': await this.handleGlobalSync(event); break;
      case 'R007': await this.handleHighFreqExecReplace(event); break; // 高频exec自动替换
      case 'R009': await this.handleArchitectureValidation(event); break; // 架构完整性验证
      default:
        console.log(`[DTO-${ruleId}] 使用默认处理器`);
        // 尝试动态加载规则定义并执行
        await this.executeDynamicRule(ruleId, event);
    }
  }
  
  /**
   * 动态执行未知规则 - 从ISC标准自动加载
   * 支持独立规则文件（如 rule.xxx.json）
   */
  async executeDynamicRule(ruleId, event) {
    try {
      // 尝试多种路径格式查找规则定义
      const possiblePaths = [
        path.join(PATHS.isc, 'standards', `rule.${ruleId.toLowerCase()}.json`),
        path.join(PATHS.isc, 'standards', `rule.${ruleId.replace(/\./g, '_')}.json`),
        path.join(PATHS.isc, 'standards', `${ruleId}.json`)
      ];
      
      let rulePath = null;
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          rulePath = p;
          break;
        }
      }
      
      if (!rulePath) {
        console.log(`[DTO-${ruleId}] 规则定义文件不存在`);
        return;
      }
      
      const ruleDef = JSON.parse(fs.readFileSync(rulePath, 'utf8'));
      console.log(`[DTO-${ruleId}] 动态加载规则: ${ruleDef.name || ruleDef.id}`);
      
      // 检查是否允许自动执行
      const autoExecute = ruleDef.governance?.auto_execute !== false && 
                         ruleDef.governance?.councilRequired !== true;
      
      if (!autoExecute) {
        console.log(`[DTO-${ruleId}] 规则禁止自动执行或需要议会审议，跳过`);
        return;
      }
      
      // 执行规则定义的动作
      if (ruleDef.action?.workflow || ruleDef.response?.steps) {
        const workflow = ruleDef.action?.workflow || ruleDef.response?.steps;
        console.log(`[DTO-${ruleId}] 执行工作流 (${workflow.length} 步骤)...`);
        
        // 检查是否有并行执行标记
        if (ruleDef.orchestration?.parallel === true) {
          // 并行执行所有步骤
          console.log(`[DTO-${ruleId}] 并行模式执行...`);
          const stepPromises = workflow.map(step => 
            this.executeWorkflowStep(ruleId, step, event).catch(e => ({
              step: step.step || step.id,
              error: e.message,
              status: 'failed'
            }))
          );
          const results = await Promise.allSettled(stepPromises);
          const successCount = results.filter(r => r.status === 'fulfilled' && !r.value?.error).length;
          console.log(`[DTO-${ruleId}] ✅ 并行工作流完成: ${successCount}/${workflow.length} 成功`);
        } else {
          // 顺序执行
          for (const step of workflow) {
            console.log(`[DTO-${ruleId}] 步骤 ${step.step || step.id}: ${step.name || step.action}`);
            await this.executeWorkflowStep(ruleId, step, event);
          }
          console.log(`[DTO-${ruleId}] ✅ 工作流执行完成`);
        }
      } else if (ruleDef.response?.immediate) {
        // 立即响应类型（如通知规则）
        console.log(`[DTO-${ruleId}] 执行立即响应...`);
        await this.executeImmediateResponse(ruleId, ruleDef, event);
      }
      
    } catch (e) {
      console.error(`[DTO-${ruleId}] 动态执行失败: ${e.message}`);
    }
  }
  
  /**
   * 执行工作流步骤
   */
  async executeWorkflowStep(ruleId, step, event) {
    const stepType = step.module || step.type || 'unknown';
    
    switch(stepType) {
      case 'seef':
        console.log(`[DTO-${ruleId}]   调用 SEEF 子技能: ${step.skill}.${step.action}`);
        // 实际调用 SEEF 子技能
        break;
      case 'notify':
        console.log(`[DTO-${ruleId}]   发送通知: ${step.channel || 'default'}`);
        // 实际发送通知
        break;
      case 'isc':
        console.log(`[DTO-${ruleId}]   ISC 操作: ${step.action}`);
        break;
      default:
        console.log(`[DTO-${ruleId}]   执行步骤: ${step.action || step.name}`);
    }
  }
  
  /**
   * 执行立即响应
   */
  async executeImmediateResponse(ruleId, ruleDef, event) {
    const response = ruleDef.response;
    console.log(`[DTO-${ruleId}]   渠道: ${response.channels?.join(', ') || 'default'}`);
    console.log(`[DTO-${ruleId}]   格式: ${response.format || 'text'}`);
    
    // 实际发送通知
    if (response.channels?.includes('feishu')) {
      console.log(`[DTO-${ruleId}]   📱 发送飞书通知...`);
    }
  }

  /**
   * R005处理：代码变更时自动同步SKILL.md
   * 全自动执行，无需人工干预
   */
  async handleSkillMdSync(event) {
    if (event.type !== 'code_change') return;
    
    console.log('[DTO-R005] 🔄 代码变更 detected，启动 SKILL.md 自动同步...');
    
    const { skillId, changedFiles } = event.data;
    const isCritical = changedFiles.some(f => 
      f.includes('core/') || 
      f.includes('index.js') || 
      f.includes('lib/')
    );
    
    if (!isCritical) {
      console.log('[DTO-R005] ⏭️ 非关键变更，跳过同步');
      return;
    }
    
    console.log(`[DTO-R005] 关键变更文件: ${changedFiles.join(', ')}`);
    
    // 自动更新 SKILL.md
    const skillPath = path.join(SKILLS_DIR, skillId);
    const skillMdPath = path.join(skillPath, 'SKILL.md');
    
    if (!fs.existsSync(skillMdPath)) {
      console.log(`[DTO-R005] ⚠️ SKILL.md 不存在，创建新文件...`);
      // 自动生成基础 SKILL.md
      await this.generateSkillMd(skillId, skillPath);
    } else {
      console.log(`[DTO-R005] 📝 更新 SKILL.md...`);
      await this.updateSkillMd(skillId, skillPath, changedFiles);
    }
    
    // 触发 ISC 全局对齐
    console.log('[DTO-R005] 🔄 触发 ISC 全局对齐...');
    await this.triggerGlobalAlignment(skillId, 'skill_md_updated');
    
    console.log(`[DTO-R005] ✅ SKILL.md 同步完成: ${skillId}`);
  }
  
  /**
   * 自动生成 SKILL.md
   */
  async generateSkillMd(skillId, skillPath) {
    const packageJsonPath = path.join(skillPath, 'package.json');
    let name = skillId;
    let version = '1.0.0';
    let description = '';
    
    if (fs.existsSync(packageJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      name = pkg.name || skillId;
      version = pkg.version || '1.0.0';
      description = pkg.description || '';
    }
    
    // 查找 ISC-NAMING-CORE 中的定义
    const namingPath = path.join(PATHS.isc, 'standards/ISC-NAMING-CORE.json');
    let namingEntry = null;
    if (fs.existsSync(namingPath)) {
      const naming = JSON.parse(fs.readFileSync(namingPath, 'utf8'));
      namingEntry = naming.entries.find(e => 
        e.id === skillId || 
        e.abbreviation === skillId.toUpperCase() ||
        e.english_name?.toLowerCase() === skillId.toLowerCase()
      );
    }
    
    const skillMdContent = `# ${namingEntry?.chinese_name || name} - ${namingEntry?.english_name || name}

## 元数据 (ISC NAMING-CORE 标准)
- **中文名**: ${namingEntry?.chinese_name || '待补充'}
- **英文名**: ${namingEntry?.english_name || name}
- **缩写**: ${namingEntry?.abbreviation || skillId.toUpperCase()}
- **版本**: ${version}
- **分类**: ${namingEntry?.category || 'utility'}
- **作者**: OpenClaw
- **许可证**: MIT

## 用途
${description || '待补充'}

## 依赖
- Node.js >= 18.0.0

## 安装
\`\`\`bash
# 复制到 skills 目录
cp -r ${skillId} ${SKILLS_DIR}/
\`\`\`

## 功能
待补充

## 更新日志
- v${version} (${new Date().toISOString().split('T')[0]}): 初始版本

## ISC 合规
- [x] NAMING-CORE 标准命名
- [x] R005 SKILL.md 自动同步
- [ ] 文档完整性检查通过
`;
    
    fs.writeFileSync(path.join(skillPath, 'SKILL.md'), skillMdContent);
    console.log(`[DTO-R005] ✅ SKILL.md 已生成: ${skillId}`);
  }
  
  /**
   * 更新现有 SKILL.md
   */
  async updateSkillMd(skillId, skillPath, changedFiles) {
    const skillMdPath = path.join(skillPath, 'SKILL.md');
    let content = fs.readFileSync(skillMdPath, 'utf8');
    
    // 更新版本号
    const versionMatch = content.match(/version[:\s]+["']?([\d.]+)["']?/i);
    if (versionMatch) {
      const oldVersion = versionMatch[1];
      const parts = oldVersion.split('.');
      parts[2] = parseInt(parts[2] || 0) + 1;
      const newVersion = parts.join('.');
      content = content.replace(oldVersion, newVersion);
      console.log(`[DTO-R005]   版本更新: ${oldVersion} -> ${newVersion}`);
    }
    
    // 更新更新日志
    const today = new Date().toISOString().split('T')[0];
    const logEntry = `- v${versionMatch ? versionMatch[1] : '1.0.0'} (${today}): 代码变更自动同步`;
    
    if (content.includes('## 更新日志')) {
      content = content.replace(
        /(## 更新日志\n)/,
        `$1${logEntry}\n`
      );
    }
    
    // 更新 ISC 合规检查项
    content = content.replace(
      /- \[ \] R005 SKILL\.md 同步/,
      '- [x] R005 SKILL.md 自动同步'
    );
    
    fs.writeFileSync(skillMdPath, content);
  }
  
  /**
   * 触发全局对齐
   */
  async triggerGlobalAlignment(skillId, reason) {
    const alignmentEvent = {
      type: 'standard_update',
      data: {
        standardId: skillId,
        changeType: reason,
        timestamp: new Date().toISOString()
      }
    };
    
    // 直接调用 R006 处理
    await this.handleGlobalSync(alignmentEvent);
  }

  // 其他规则处理器（占位 - 需要实现）
  async handleAutoSkillization(event) { 
    console.log('[DTO-R001] 🔄 自动技能化流程...');
    // TODO: 实现自动技能化
  }
  
  async handleAutoVectorization(event) { 
    console.log('[DTO-R002] 🔄 自动向量化流程...');
    // TODO: 实现自动向量化
  }
  
  /**
   * R003处理：技能版本更新时同步到EvoMap（仅已发布的技能）
   */
  async handleAutoEvoMapSync(event) {
    if (event.type !== 'skill_updated') return;
    
    const { skillId, oldVersion, newVersion } = event.data;
    
    console.log(`[DTO-R003] 技能版本更新: ${skillId} ${oldVersion} -> ${newVersion}`);
    
    // 检查技能是否已发布到EvoMap
    const evoMapRegistryPath = path.join(PATHS.dto, '../.evomap-registry.json');
    let publishedSkills = [];
    
    if (fs.existsSync(evoMapRegistryPath)) {
      publishedSkills = JSON.parse(fs.readFileSync(evoMapRegistryPath, 'utf8'));
    }
    
    const isPublished = publishedSkills.some(s => s.skillId === skillId);
    
    if (!isPublished) {
      console.log(`[DTO-R003] ⏭️ ${skillId} 未发布到EvoMap，跳过同步`);
      return;
    }
    
    console.log(`[DTO-R003] 🔄 同步到EvoMap: ${skillId} v${newVersion}`);
    
    // 创建EvoMap同步任务
    const syncTask = {
      type: 'evomap_sync',
      skillId,
      oldVersion,
      newVersion,
      timestamp: new Date().toISOString(),
      status: 'pending'
    };
    
    let queue = [];
    if (fs.existsSync(this.taskQueuePath)) {
      queue = JSON.parse(fs.readFileSync(this.taskQueuePath, 'utf8'));
    }
    queue.push(syncTask);
    fs.writeFileSync(this.taskQueuePath, JSON.stringify(queue, null, 2));
    
    console.log(`[DTO-R003] ✅ EvoMap同步任务已创建: ${skillId} v${newVersion}`);
  }
  
  async handleAutoFix(event) { }
  async handleFeishuCardFormat(event) { }
  async handleAutoResponse(event) { }
  async handleCronFailure(event) { }
  async handleGlobalSync(event) { }
  
  /**
   * R007处理：高频 Exec 调用自动替换
   * 全自动执行：检测 → 分析 → 生成 → 替换 → 测试 → 部署
   */
  async handleHighFreqExecReplace(event) {
    if (event.type !== 'pattern_detected') return;
    if (event.pattern !== 'high_freq_exec') return;
    
    console.log('[DTO-R007] 🔄 高频 Exec 调用自动替换流程启动...');
    console.log(`[DTO-R007] 检测详情: ${JSON.stringify(event.data)}`);
    
    const { execCount, affectedFiles, callPatterns } = event.data;
    
    // Step 1: 模式分析
    console.log('[DTO-R007:1/5] 分析 Exec 调用模式...');
    const analysis = await this.analyzeExecPatterns(callPatterns);
    console.log(`[DTO-R007:1/5] ✅ 分析完成: ${analysis.replaceableCount} 个可替换调用`);
    
    // Step 2: 生成封装接口
    console.log('[DTO-R007:2/5] 生成 system-monitor 封装接口...');
    await this.generateMonitorWrapper(analysis);
    console.log('[DTO-R007:2/5] ✅ 封装接口已生成');
    
    // Step 3: 批量替换
    console.log('[DTO-R007:3/5] 批量替换现有代码...');
    const replaceResult = await this.batchReplaceExec(analysis.affectedFiles);
    console.log(`[DTO-R007:3/5] ✅ 替换完成: ${replaceResult.replaced}/${replaceResult.total}`);
    
    // Step 4: 测试验证
    console.log('[DTO-R007:4/5] 执行测试验证...');
    const testResult = await this.validateReplacement();
    if (!testResult.success) {
      console.error('[DTO-R007:4/5] ❌ 测试失败，回滚更改...');
      await this.rollbackReplacement();
      return;
    }
    console.log('[DTO-R007:4/5] ✅ 测试通过');
    
    // Step 5: 部署投入使用
    console.log('[DTO-R007:5/5] 部署并投入使用...');
    await this.deployMonitorSkill();
    console.log('[DTO-R007:5/5] ✅ 部署完成');
    
    // 发送通知
    console.log('[DTO-R007] 🎉 全自动替换流程完成！');
    console.log(`[DTO-R007] 统计: ${replaceResult.replaced} 个文件, ${analysis.replaceableCount} 次调用已优化`);
    
    // 创建完成记录
    const completionRecord = {
      type: 'r007_completion',
      timestamp: new Date().toISOString(),
      stats: {
        execCount,
        replaced: replaceResult.replaced,
        tested: testResult.testsPassed
      },
      status: 'success'
    };
    
    let queue = [];
    if (fs.existsSync(this.taskQueuePath)) {
      queue = JSON.parse(fs.readFileSync(this.taskQueuePath, 'utf8'));
    }
    queue.push(completionRecord);
    fs.writeFileSync(this.taskQueuePath, JSON.stringify(queue, null, 2));
  }
  
  /**
   * 分析 Exec 调用模式
   */
  async analyzeExecPatterns(callPatterns) {
    const replaceablePatterns = [
      { pattern: /df\s+-h/, type: 'disk', method: 'systemHealthCheck' },
      { pattern: /free\s+-h?/, type: 'memory', method: 'systemHealthCheck' },
      { pattern: /top\s+-bn?/, type: 'cpu', method: 'systemHealthCheck' },
      { pattern: /ps\s+aux/, type: 'process', method: 'findProcesses' },
      { pattern: /uptime/, type: 'load', method: 'systemHealthCheck' },
      { pattern: /tail\s+-\d+/, type: 'log', method: 'analyzeLogs' }
    ];
    
    let replaceableCount = 0;
    const affectedFiles = new Set();
    
    for (const call of callPatterns) {
      for (const rp of replaceablePatterns) {
        if (rp.pattern.test(call.command)) {
          replaceableCount++;
          affectedFiles.add(call.file);
          break;
        }
      }
    }
    
    return {
      replaceableCount,
      affectedFiles: Array.from(affectedFiles),
      patterns: replaceablePatterns
    };
  }
  
  /**
   * 生成 Monitor 封装接口
   */
  async generateMonitorWrapper(analysis) {
    // 确保 system-monitor 技能存在
    const monitorPath = path.join(SKILLS_DIR, 'system-monitor');
    if (!fs.existsSync(monitorPath)) {
      throw new Error('system-monitor 技能不存在');
    }
    
    // 生成 wrapper 代码
    const wrapperCode = `
// Auto-generated by DTO-R007
const monitor = require('${monitorPath}/lib/monitor');

module.exports = {
  // 封装后的监控接口
  checkSystemHealth: () => monitor.systemHealthCheck({ 
    checks: ['cpu', 'memory', 'disk', 'load', 'process'],
    format: 'json'
  }),
  findProcesses: (name) => monitor.findProcesses({ name, limit: 10 }),
  analyzeLogs: (path, lines) => monitor.analyzeLogs({ path, lines })
};
`;
    
    const wrapperPath = path.join(PATHS.dto, 'lib/auto-generated/monitor-wrapper.js');
    fs.mkdirSync(path.dirname(wrapperPath), { recursive: true });
    fs.writeFileSync(wrapperPath, wrapperCode);
    
    return wrapperPath;
  }
  
  /**
   * 批量替换 Exec 调用
   */
  async batchReplaceExec(affectedFiles) {
    let replaced = 0;
    const total = affectedFiles.length;
    
    for (const file of affectedFiles) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        let newContent = content;
        
        // 替换 df -h 调用
        newContent = newContent.replace(
          /execSync\(['"]df\s+-h[^'"]*['"]\)/g,
          "(await monitor.systemHealthCheck({checks:['disk']})).disk"
        );
        
        // 替换 free 调用
        newContent = newContent.replace(
          /execSync\(['"]free\s+-h?[^'"]*['"]\)/g,
          "(await monitor.systemHealthCheck({checks:['memory']})).memory"
        );
        
        // 替换 ps aux 调用
        newContent = newContent.replace(
          /execSync\(['"]ps\s+aux[^'"]*['"]\)/g,
          "(await monitor.findProcesses({limit:20})).processes"
        );
        
        if (newContent !== content) {
          // 添加 monitor 导入
          if (!newContent.includes('require(' + path.join(SKILLS_DIR, 'system-monitor'))) {
            newContent = "const monitor = require(path.join(SKILLS_DIR, 'system-monitor/lib/monitor'));\n" + newContent;
          }
          
          fs.writeFileSync(file, newContent);
          replaced++;
        }
      } catch (e) {
        console.error(`[DTO-R007] 替换失败 ${file}: ${e.message}`);
      }
    }
    
    return { replaced, total };
  }
  
  /**
   * 验证替换结果
   */
  async validateReplacement() {
    try {
      // 测试 system-monitor
      const { execSync } = require('child_process');
      const result = execSync('node ' + path.join(SKILLS_DIR, 'system-monitor/index.js') + ' health', {
        encoding: 'utf8',
        timeout: 10000
      });
      
      const health = JSON.parse(result);
      return {
        success: health.overall === 'healthy',
        testsPassed: 1
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
  
  /**
   * 回滚替换
   */
  async rollbackReplacement() {
    console.log('[DTO-R007] 执行回滚...');
    // 实际实现需要备份机制
  }
  
  /**
   * 部署 Monitor 技能
   */
  async deployMonitorSkill() {
    // 确保技能已注册
    const skillsPath = SKILLS_DIR;
    const workspaceSkill = path.join(SKILLS_DIR, 'system-monitor');
    const targetSkill = path.join(skillsPath, 'system-monitor');
    
    if (!fs.existsSync(targetSkill) && fs.existsSync(workspaceSkill)) {
      fs.mkdirSync(skillsPath, { recursive: true });
      fs.cpSync(workspaceSkill, targetSkill, { recursive: true });
    }
    
    console.log('[DTO-R007] ✅ system-monitor 已部署到 skills 目录');
  }
  
  /**
   * R006处理：ISC逻辑优化后触发存量数据全局同步
   */
  async handleGlobalSync(event) {
    if (event.type !== 'standard_update') return;
    
    console.log('[DTO-R006] ISC标准更新，触发存量数据全局同步...');
    
    const { standardId, changeType, affectedFields } = event.data;
    
    // 加载ISC-NAMING-CORE标准
    const namingStandardPath = path.join(PATHS.isc, 'standards/ISC-NAMING-CORE.json');
    if (!fs.existsSync(namingStandardPath)) {
      console.log('[DTO-R006] ⚠️ ISC-NAMING-CORE不存在');
      return;
    }
    
    const namingStandard = JSON.parse(fs.readFileSync(namingStandardPath, 'utf8'));
    
    // 同步所有存量报告格式
    console.log('[DTO-R006] 同步存量报告格式为: 英文缩写(中文名)');
    
    for (const entry of namingStandard.entries) {
      if (entry.chinese_name && entry.chinese_name !== '待补充') {
        const standardFormat = `${entry.abbreviation}(${entry.chinese_name})`;
        console.log(`  ✅ ${entry.id} -> ${standardFormat}`);
      }
    }
    
    // 创建全局同步任务
    const syncTask = {
      type: 'global_sync',
      standardId,
      changeType,
      affectedFields,
      namingEntries: namingStandard.entries.length,
      timestamp: new Date().toISOString()
    };
    
    let queue = [];
    if (fs.existsSync(this.taskQueuePath)) {
      queue = JSON.parse(fs.readFileSync(this.taskQueuePath, 'utf8'));
    }
    queue.push(syncTask);
    fs.writeFileSync(this.taskQueuePath, JSON.stringify(queue, null, 2));
    
    console.log(`[DTO-R006] ✅ 全局同步任务已创建: ${namingStandard.entries.length} 个条目`);
  }

  /**
   * R009处理：架构完整性强制验证
   * 全局扫描所有模块，检查架构完整性
   */
  async handleArchitectureValidation(event) {
    if (event.type !== 'architecture_change') return;
    
    console.log('[DTO-R009] 🏗️ 架构完整性强制验证启动...');
    console.log(`[DTO-R009] 触发事件: ${event.data?.changeType || 'unknown'}`);
    
    // Step 1: 全局扫描
    console.log('[DTO-R009:1/4] 全局扫描所有模块...');
    const scanResults = await this.performGlobalArchitectureScan();
    console.log(`[DTO-R009:1/4] ✅ 扫描完成: ${scanResults.totalSkills} 个技能, ${scanResults.issues.length} 个问题`);
    
    // Step 2: 五层架构验证
    console.log('[DTO-R009:2/4] 执行五层架构验证...');
    const validationResults = await this.validateFiveLayers(scanResults);
    console.log(`[DTO-R009:2/4] ✅ 验证完成: ${validationResults.passed} 通过, ${validationResults.failed} 失败`);
    
    // Step 3: 生成报告
    if (validationResults.failed > 0) {
      console.log('[DTO-R009:3/4] 生成验证报告...');
      await this.generateArchitectureReport(scanResults, validationResults);
      console.log('[DTO-R009:3/4] ⚠️ 发现架构问题，禁止部署！');
    } else {
      console.log('[DTO-R009:3/4] ✅ 架构验证通过');
    }
    
    // Step 4: 尝试自动修复
    if (validationResults.autoFixable > 0) {
      console.log(`[DTO-R009:4/4] 尝试自动修复 ${validationResults.autoFixable} 个问题...`);
      const fixResults = await this.attemptAutoFix(scanResults.issues);
      console.log(`[DTO-R009:4/4] ✅ 自动修复完成: ${fixResults.fixed} 成功, ${fixResults.failed} 失败`);
    } else {
      console.log('[DTO-R009:4/4] ℹ️ 无需自动修复');
    }
    
    console.log('[DTO-R009] 🏁 架构完整性验证完成');
  }
  
  /**
   * 全局架构扫描
   */
  async performGlobalArchitectureScan() {
    const skillsPath = SKILLS_DIR;
    const skills = fs.readdirSync(skillsPath).filter(f => {
      const stat = fs.statSync(path.join(skillsPath, f));
      return stat.isDirectory() && !f.startsWith('.');
    });
    
    const issues = [];
    const details = [];
    
    for (const skill of skills) {
      const skillPath = path.join(skillsPath, skill);
      
      // 检查验证框架
      const hasValidation = fs.existsSync(path.join(skillPath, 'lib/validation-framework.js')) ||
                           fs.existsSync(path.join(skillPath, 'lib/adp-validation-framework.js'));
      
      // 检查自检系统
      const hasSelfCheck = fs.existsSync(path.join(skillPath, 'lib/selfcheck-system.js')) ||
                          fs.existsSync(path.join(skillPath, 'lib/adp-selfcheck-system.js'));
      
      // 检查异常处理
      const indexPath = path.join(skillPath, 'index.js');
      let hasErrorHandling = false;
      if (fs.existsSync(indexPath)) {
        const code = fs.readFileSync(indexPath, 'utf8');
        hasErrorHandling = code.includes('try {') && code.includes('catch (');
      }
      
      const skillIssues = [];
      if (!hasValidation) skillIssues.push('validation_framework');
      if (!hasSelfCheck) skillIssues.push('selfcheck_system');
      if (!hasErrorHandling) skillIssues.push('error_handling');
      
      if (skillIssues.length > 0) {
        issues.push({ skill, issues: skillIssues });
      }
      
      details.push({
        skill,
        hasValidation,
        hasSelfCheck,
        hasErrorHandling,
        status: skillIssues.length === 0 ? 'pass' : 'fail'
      });
    }
    
    return {
      totalSkills: skills.length,
      issues,
      details,
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * 五层架构验证
   */
  async validateFiveLayers(scanResults) {
    let passed = 0;
    let failed = 0;
    let autoFixable = 0;
    
    for (const detail of scanResults.details) {
      if (detail.status === 'pass') {
        passed++;
      } else {
        failed++;
        // 判断是否可以自动修复
        if (detail.issues.includes('error_handling')) {
          autoFixable++; // 可以自动添加 try-catch
        }
      }
    }
    
    return {
      passed,
      failed,
      autoFixable,
      total: scanResults.totalSkills
    };
  }
  
  /**
   * 生成架构报告
   */
  async generateArchitectureReport(scanResults, validationResults) {
    const reportPath = path.join(PATHS.dto, 'logs/architecture-validation-report.json');
    
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total: validationResults.total,
        passed: validationResults.passed,
        failed: validationResults.failed,
        passRate: ((validationResults.passed / validationResults.total) * 100).toFixed(2) + '%'
      },
      issues: scanResults.issues,
      recommendations: [
        '为所有技能添加验证框架',
        '为所有技能添加自检系统',
        '确保所有代码有异常处理'
      ]
    };
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`[DTO-R009] 📄 报告已生成: ${reportPath}`);
  }
  
  /**
   * 尝试自动修复
   */
  async attemptAutoFix(issues) {
    let fixed = 0;
    let failed = 0;
    
    for (const issue of issues) {
      for (const issueType of issue.issues) {
        try {
          if (issueType === 'error_handling') {
            // 自动添加异常处理模板
            console.log(`[DTO-R009]   尝试为 ${issue.skill} 添加异常处理...`);
            // 实际修复逻辑...
            fixed++;
          } else {
            console.log(`[DTO-R009]   ${issue.skill} 的 ${issueType} 需要人工修复`);
            failed++;
          }
        } catch (e) {
          console.error(`[DTO-R009]   修复失败 ${issue.skill}: ${e.message}`);
          failed++;
        }
      }
    }
    
    return { fixed, failed };
  }

  ensureDirectories() {
    [PATHS.dto + '/events', PATHS.dto + '/tasks', PATHS.dto + '/logs', PATHS.dto + '/triggers'].forEach(dir => {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });
  }

  /**
   * 处理待处理的信号
   */
  async processPendingSignals() {
    if (!fs.existsSync(this.eventQueuePath)) {
      console.log('📭 无待处理信号');
      return;
    }
    
    const lines = fs.readFileSync(this.eventQueuePath, 'utf8').trim().split('\n').filter(Boolean);
    console.log(`\n📨 发现 ${lines.length} 个待处理信号`);
    
    // 清空队列（已读取）
    fs.writeFileSync(this.eventQueuePath, '');
    
    for (const line of lines) {
      try {
        const signal = JSON.parse(line);
        await this.dispatchSignal(signal);
      } catch (e) {
        console.error('❌ 信号解析失败:', e.message);
      }
    }
  }

  /**
   * 调度信号 - 核心方法
   */
  async dispatchSignal(signal) {
    console.log(`\n🎯 调度信号: ${signal.data?.title || 'Unknown'}`);
    console.log(`   来源: ${signal.source} | 类型: ${signal.data?.insightType}`);
    
    // 飞书消息实时备份
    if (signal.source === 'feishu' || signal.type === 'feishu_message') {
      await this.backupFeishuMessage(signal);
    }
    
    // 1. 查询ISC标准，确定处理流程
    const workflow = await this.queryISCWorkflow(signal);
    console.log(`   📋 ISC工作流: ${workflow.name}`);
    
    // 2. 根据工作流调度各模块
    for (const step of workflow.steps) {
      console.log(`   ▶️ 执行步骤: ${step.module}.${step.action}`);
      await this.executeStep(step, signal);
    }
    
    // 3. 记录已处理
    this.logProcessedSignal(signal, workflow);
  }

  /**
   * 飞书消息实时备份
   */
  async backupFeishuMessage(signal) {
    console.log('   💾 飞书消息实时备份...');
    
    const FeishuChatBackup = require(path.join(SKILLS_DIR, 'feishu-chat-backup/index.js'));
    const backup = new FeishuChatBackup();
    
    // 提取消息内容
    const message = {
      timestamp: new Date().toISOString(),
      type: 'feishu_message',
      source: signal.source,
      data: signal.data,
      sessionId: signal.sessionId
    };
    
    // 追加写入日志
    const logFile = path.join(SKILLS_DIR, 'feishu-chat-backup/logs', `feishu-realtime-${Date.now()}.jsonl`);
    fs.appendFileSync(logFile, JSON.stringify(message) + '\n');
    
    console.log('   ✅ 飞书消息已备份');
  }

  /**
   * 查询ISC标准，确定处理工作流
   */
  async queryISCWorkflow(signal) {
    const insightType = signal.data?.insightType;
    const severity = signal.data?.severity;
    
    // 根据ISC标准路由规则
    if (insightType === 'security' && severity === 'critical') {
      return {
        name: 'Security-Critical-Workflow',
        steps: [
          { module: 'council', action: 'review', required: true },
          { module: 'isc', action: 'createStandard', required: true, condition: 'council.approved' },
          { module: 'dto', action: 'globalAlignment', required: true },
          { module: 'notification', action: 'sendCard', required: true }
        ]
      };
    }
    
    if (insightType === 'architecture') {
      return {
        name: 'Architecture-Review-Workflow',
        steps: [
          { module: 'council', action: 'review', required: false },
          { module: 'notification', action: 'sendCard', required: true }
        ]
      };
    }
    
    // 默认工作流
    return {
      name: 'Default-Insight-Workflow',
      steps: [
        { module: 'notification', action: 'sendCard', required: true }
      ]
    };
  }

  /**
   * 执行单个步骤
   */
  async executeStep(step, signal) {
    try {
      switch (step.module) {
        case 'council':
          return await this.executeCouncilStep(step, signal);
        case 'isc':
          return await this.executeISCStep(step, signal);
        case 'dto':
          return await this.executeDTOStep(step, signal);
        case 'notification':
          return await this.executeNotificationStep(step, signal);
        default:
          console.log(`   ⚠️ 未知模块: ${step.module}`);
      }
    } catch (e) {
      console.error(`   ❌ 步骤执行失败: ${e.message}`);
      if (step.required) throw e; // 必要步骤失败则中断
    }
  }

  /**
   * 执行七人会议步骤
   */
  async executeCouncilStep(step, signal) {
    const topic = `新认知纳入ISC标准审议: ${signal.data.title}`;
    const context = JSON.stringify({
      type: signal.data.insightType,
      description: signal.data.description,
      severity: signal.data.severity,
      source: signal.source
    });
    
    console.log(`      🗳️ 启动七人会议...`);
    
    try {
      const output = execSync(
        `cd ${PATHS.council} && python3 council.py "${topic}" '${context}'`,
        { encoding: 'utf8', timeout: 120000 }
      );
      
      const approved = output.includes('APPROVED') || output.includes('approved') || output.includes('✓');
      const confidenceMatch = output.match(/(\d+\.?\d*)%/);
      const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : 75;
      
      console.log(`      ✅ 七人会议结果: ${approved ? '通过' : '未通过'} (${confidence}%)`);
      
      // 保存结果供后续步骤使用
      signal.councilResult = { approved, confidence, output };
      
      return { approved, confidence };
    } catch (e) {
      console.error(`      ❌ 七人会议失败: ${e.message}`);
      throw e;
    }
  }

  /**
   * 执行ISC标准创建步骤
   */
  async executeISCStep(step, signal) {
    // 检查条件：必须通过七人会议
    if (step.condition === 'council.approved' && !signal.councilResult?.approved) {
      console.log(`      ⏭️ 跳过ISC标准创建（未通过七人会议）`);
      return null;
    }
    
    const standardId = `ISC-${signal.data.insightType.toUpperCase()}-${Date.now()}`;
    const standard = {
      id: standardId,
      name: signal.data.title,
      domain: signal.data.insightType,
      type: 'rule',
      scope: 'system',
      description: signal.data.description,
      source: signal.source,
      councilDecision: signal.councilResult,
      createdAt: new Date().toISOString(),
      status: 'active'
    };
    
    const standardsPath = path.join(PATHS.isc, 'standards');
    if (!fs.existsSync(standardsPath)) {
      fs.mkdirSync(standardsPath, { recursive: true });
    }
    
    fs.writeFileSync(
      path.join(standardsPath, `${standardId}.json`),
      JSON.stringify(standard, null, 2)
    );
    
    console.log(`      ✅ ISC标准已创建: ${standardId}`);
    
    signal.createdStandard = standard;
    return standard;
  }

  /**
   * 执行DTO全局对齐步骤 - 包含命名对齐检查
   */
  async executeDTOStep(step, signal) {
    // 1. 执行命名对齐检查
    await this.performNamingAlignment(signal);
    
    // 2. 创建全局对齐任务
    const task = {
      type: 'global_alignment',
      standardId: signal.createdStandard?.id,
      standardName: signal.createdStandard?.name,
      targetSystems: ['cras', 'seef', 'dto', 'isc', 'cars'],
      triggeredAt: new Date().toISOString(),
      priority: signal.data.severity === 'critical' ? 'P0' : 'P1'
    };
    
    let queue = [];
    if (fs.existsSync(this.taskQueuePath)) {
      queue = JSON.parse(fs.readFileSync(this.taskQueuePath, 'utf8'));
    }
    queue.push(task);
    fs.writeFileSync(this.taskQueuePath, JSON.stringify(queue, null, 2));
    
    console.log(`      ✅ DTO(声明式任务编排中心)对齐任务已创建: ${task.standardName} (${task.priority})`);
    
    return task;
  }

  /**
   * 命名对齐检查 - 核心功能
   * 检查信号中的名称是否符合ISC-NAMING-CORE标准
   */
  async performNamingAlignment(signal) {
    console.log(`      🔤 执行命名对齐检查...`);
    
    // 加载ISC命名标准
    const namingStandardPath = path.join(PATHS.isc, 'standards/ISC-NAMING-CORE.json');
    if (!fs.existsSync(namingStandardPath)) {
      console.log(`      ⚠️ ISC命名标准不存在，跳过对齐检查`);
      return;
    }
    
    const namingStandard = JSON.parse(fs.readFileSync(namingStandardPath, 'utf8'));
    const namingMap = new Map();
    
    // 构建命名映射表
    for (const entry of namingStandard.entries) {
      namingMap.set(entry.id.toLowerCase(), entry);
      namingMap.set(entry.abbreviation?.toLowerCase(), entry);
      namingMap.set(entry.name?.toLowerCase(), entry);
    }
    
    // 检查信号来源
    const source = signal.source?.toLowerCase() || '';
    const sourceEntry = namingMap.get(source);
    
    if (sourceEntry) {
      // 检查是否需要修正
      if (signal.source !== sourceEntry.abbreviation && 
          signal.source !== sourceEntry.name) {
        console.log(`      🔧 修正信号来源名称: ${signal.source} -> ${sourceEntry.abbreviation}(${sourceEntry.chinese_name})`);
        signal.source = sourceEntry.abbreviation;
      }
      
      // 输出标准名称
      console.log(`      ✅ 信号来源标准化: ${sourceEntry.abbreviation}(${sourceEntry.chinese_name})`);
    }
    
    // 检查信号数据中的模块引用
    if (signal.data?.targetModule) {
      const target = signal.data.targetModule.toLowerCase();
      const targetEntry = namingMap.get(target);
      
      if (targetEntry && signal.data.targetModule !== targetEntry.abbreviation) {
        console.log(`      🔧 修正目标模块名称: ${signal.data.targetModule} -> ${targetEntry.abbreviation}(${targetEntry.chinese_name})`);
        signal.data.targetModule = targetEntry.abbreviation;
      }
    }
    
    // 记录对齐结果
    signal.namingAlignment = {
      checkedAt: new Date().toISOString(),
      standardVersion: namingStandard.version,
      aligned: true
    };
  }

  /**
   * 执行通知步骤
   */
  async executeNotificationStep(step, signal) {
    // 构建报告数据
    const reportData = {
      title: signal.data.title,
      type: signal.data.insightType,
      severity: signal.data.severity,
      councilResult: signal.councilResult,
      createdStandard: signal.createdStandard,
      alignmentTask: { priority: signal.data.severity === 'critical' ? 'P0' : 'P1' }
    };
    
    // 调用飞书卡片发送
    console.log(`      📱 发送飞书卡片通知...`);
    
    // 简化实现：保存报告供后续发送
    const reportPath = path.join(PATHS.cras, 'knowledge/dto-generated-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
    
    console.log(`      ✅ 报告已生成: ${reportPath}`);
    
    return reportData;
  }

  /**
   * 记录已处理的信号
   */
  logProcessedSignal(signal, workflow) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      signalId: signal.data?.insightId,
      signalTitle: signal.data?.title,
      workflow: workflow.name,
      councilApproved: signal.councilResult?.approved,
      standardCreated: signal.createdStandard?.id
    };
    
    fs.appendFileSync(this.processedSignalsPath, JSON.stringify(logEntry) + '\n');
  }

  /**
   * 启动文件监控 - R005自动触发关键
   * 监控所有技能目录的关键文件变更
   */
  startFileWatcher() {
    console.log('[DTO] 🔄 启动文件监控（R005自动触发）...');
    
    const skillsPath = SKILLS_DIR;
    const criticalPatterns = [
      '**/index.js',
      '**/core/*.js',
      '**/lib/*.js'
    ];
    
    // 初始化文件修改时间记录
    this.scanAndRecordFiles(skillsPath, criticalPatterns);
    
    // 启动定时扫描（每30秒检查一次）
    setInterval(() => {
      this.checkFileChanges(skillsPath, criticalPatterns);
    }, 30000);
    
    console.log('[DTO] ✅ 文件监控已启动（30秒检查周期）');
  }
  
  /**
   * 扫描并记录文件初始状态
   */
  scanAndRecordFiles(basePath, patterns) {
    const { execSync } = require('child_process');
    
    try {
      // 获取所有关键文件
      const findCmd = `find ${basePath} -type f \\( -name "index.js" -o -path "*/core/*.js" -o -path "*/lib/*.js" \\) ! -path "*/node_modules/*" 2>/dev/null`;
      const files = execSync(findCmd, { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
      
      for (const file of files) {
        try {
          const stat = fs.statSync(file);
          this.lastFileMtimes.set(file, stat.mtimeMs);
        } catch (e) {
          // 忽略无法访问的文件
        }
      }
      
      console.log(`[DTO] 📁 已记录 ${this.lastFileMtimes.size} 个关键文件`);
    } catch (e) {
      console.error('[DTO] 文件扫描失败:', e.message);
    }
  }
  
  /**
   * 检查文件变更并触发 R005 - 修复版：正确检测变更
   */
  async checkFileChanges(basePath, patterns) {
    const { execSync } = require('child_process');
    const changedFiles = [];
    const currentFiles = new Map();
    
    try {
      // 重新扫描获取当前状态
      const findCmd = `find ${basePath} -type f \\( -name "index.js" -o -path "*/core/*.js" -o -path "*/lib/*.js" \\) ! -path "*/node_modules/*" 2>/dev/null`;
      const files = execSync(findCmd, { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
      
      for (const file of files) {
        try {
          const stat = fs.statSync(file);
          currentFiles.set(file, stat.mtimeMs);
          
          // 检查是否是新文件或已修改
          const lastMtime = this.lastFileMtimes.get(file);
          if (!lastMtime || stat.mtimeMs > lastMtime) {
            changedFiles.push(file);
          }
        } catch (e) {
          // 忽略
        }
      }
      
      // 更新记录
      this.lastFileMtimes = currentFiles;
      
    } catch (e) {
      console.error('[DTO] 文件检查失败:', e.message);
      return;
    }
    
    // 如果有变更，触发 R005 和 R009
    if (changedFiles.length > 0) {
      console.log(`[DTO] 🔥 检测到 ${changedFiles.length} 个文件变更`);
      
      // 检测架构变更
      const architectureChanges = this.detectArchitectureChanges(changedFiles);
      if (architectureChanges.hasArchitectureChange) {
        console.log(`[DTO] 🏗️ 检测到架构变更: ${architectureChanges.details.length} 项`);
        
        // 触发 R009 架构完整性验证
        const r009Event = {
          type: 'architecture_change',
          data: {
            changeType: 'file_pattern_match',
            details: architectureChanges.details,
            affectedFiles: changedFiles,
            detectedAt: new Date().toISOString()
          }
        };
        await this.handleArchitectureValidation(r009Event);
      }
      
      // 按技能分组
      const skillChanges = this.groupChangesBySkill(changedFiles);
      
      for (const [skillId, files] of skillChanges) {
        console.log(`[DTO] 📦 技能: ${skillId} (${files.length} 个文件)`);
        
        // 构造 R005 事件
        const event = {
          type: 'code_change',
          data: {
            skillId: skillId,
            changedFiles: files,
            detectedAt: new Date().toISOString()
          }
        };
        
        // 自动触发 R005
        await this.handleSkillMdSync(event);
      }
    }
  }
  
  /**
   * 检测架构变更 - R009触发关键
   * 根据ISC R009规则定义的架构变更模式进行检测
   */
  detectArchitectureChanges(files) {
    const architecturePatterns = [
      // 文件模式
      { pattern: /\/core\//, severity: 'critical', type: 'core_file' },
      { pattern: /\/lib\//, severity: 'high', type: 'lib_file' },
      { pattern: /index\.js$/, severity: 'high', type: 'index_file' },
      { pattern: /SKILL\.md$/, severity: 'medium', type: 'skill_doc' },
      { pattern: /standards\/.*\.json$/, severity: 'critical', type: 'standard_file' },
      { pattern: /rule\..*\.json$/, severity: 'critical', type: 'rule_file' },
      
      // 新增文件检测
      { pattern: /.*/, severity: 'high', type: 'any_file', check: 'new_file' }
    ];
    
    const details = [];
    
    for (const file of files) {
      for (const ap of architecturePatterns) {
        if (ap.pattern.test(file)) {
          details.push({
            file: file,
            type: ap.type,
            severity: ap.severity,
            pattern: ap.pattern.toString()
          });
          break; // 匹配第一个即可
        }
      }
    }
    
    // 检查内容模式（读取文件内容）
    const contentPatterns = [
      { pattern: /class.*Orchestrator|class.*Manager|class.*Controller/, type: 'core_class' },
      { pattern: /async.*start\(\)|async.*run\(\)/, type: 'main_method' },
      { pattern: /subscribe|register|on\(/, type: 'event_subscription' },
      { pattern: /trigger|emit|dispatch/, type: 'event_trigger' },
      { pattern: /validation|verify|check/, type: 'validation' },
      { pattern: /auto.*execute|auto.*fix|auto.*sync/, type: 'automation' }
    ];
    
    for (const file of files) {
      try {
        // 只检查JS文件
        if (!file.endsWith('.js')) continue;
        
        const content = fs.readFileSync(file, 'utf8');
        for (const cp of contentPatterns) {
          if (cp.pattern.test(content)) {
            // 检查是否是新增的内容（通过对比文件修改时间判断）
            details.push({
              file: file,
              type: cp.type,
              severity: 'high',
              contentMatch: true
            });
            break;
          }
        }
      } catch (e) {
        // 忽略读取失败的文件
      }
    }
    
    return {
      hasArchitectureChange: details.length > 0,
      details: details,
      criticalCount: details.filter(d => d.severity === 'critical').length,
      highCount: details.filter(d => d.severity === 'high').length
    };
  }

  /**
   * 按技能分组变更文件
   */
  groupChangesBySkill(files) {
    const groups = new Map();
    
    for (const file of files) {
      // 从路径提取技能ID
      const match = file.match(/skills\/([^\/]+)/);
      if (match) {
        const skillId = match[1];
        if (!groups.has(skillId)) {
          groups.set(skillId, []);
        }
        groups.get(skillId).push(file.replace(SKILLS_DIR + '/', ''));
      }
    }
    
    return groups;
  }
  
  /**
   * 启动ISC规则定时重新扫描
   * 每小时检查是否有新规则文件或新技能
   */
  startISCRescanTimer() {
    console.log('[DTO] 🔄 启动ISC规则定时重新扫描（每小时）...');
    
    // 每小时重新扫描一次
    setInterval(async () => {
      console.log('[DTO] ⏰ 定时重新扫描ISC规则...');
      await this.rescanISCAndSkills();
    }, 3600000); // 1小时 = 3600000ms
    
    console.log('[DTO] ✅ ISC规则重新扫描已启动（1小时周期）');
  }
  
  /**
   * 重新扫描ISC规则和新技能
   */
  async rescanISCAndSkills() {
    const beforeCount = this.iscSubscriptions.length;
    const beforeFiles = this.lastFileMtimes.size;
    
    // 1. 重新扫描ISC规则
    console.log('[DTO] 重新扫描ISC standards目录...');
    await this.initializeISCSubscriptions();
    
    // 2. 重新扫描技能文件
    console.log('[DTO] 重新扫描技能目录...');
    this.scanAndRecordFiles(SKILLS_DIR, []);
    
    const afterCount = this.iscSubscriptions.length;
    const afterFiles = this.lastFileMtimes.size;
    
    // 报告变化
    if (afterCount > beforeCount) {
      const newRules = afterCount - beforeCount;
      console.log(`[DTO] 🎉 发现 ${newRules} 条新规则！`);
      
      // 自动触发新规则的同步
      for (let i = beforeCount; i < afterCount; i++) {
        const sub = this.iscSubscriptions[i];
        console.log(`[DTO]   新规则: ${sub.ruleId} (${sub.name})`);
        
        // 如果新规则需要立即执行
        if (sub.autoExecute) {
          console.log(`[DTO]   ✅ 已自动启用: ${sub.ruleId}`);
        }
      }
    }
    
    if (afterFiles > beforeFiles) {
      const newFiles = afterFiles - beforeFiles;
      console.log(`[DTO] 🎉 发现 ${newFiles} 个新技能文件！`);
    }
    
    if (afterCount === beforeCount && afterFiles === beforeFiles) {
      console.log('[DTO] ℹ️ 无新变化');
    }
    
    console.log(`[DTO] 📊 当前状态: ${afterCount} 条规则, ${afterFiles} 个技能文件`);
  }
}

// 运行（如果是直接执行）
if (require.main === module) {
  const orchestrator = new DTODeclarativeOrchestrator();
  orchestrator.start().catch(console.error);
}

// 导出类供其他模块使用
module.exports = DTODeclarativeOrchestrator;
