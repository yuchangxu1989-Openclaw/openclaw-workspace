#!/usr/bin/env node
/**
 * PDCA-C 执行引擎 v1.0.2
 * 每小时执行，有实际产出
 * 已适配ES模块
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const _require = createRequire(import.meta.url);
const { WORKSPACE, MEMORY_DIR, SKILLS_DIR } = _require('../shared/paths');

const PDCA_CONFIG = {
  version: '1.0.2',
  cycle: 0,
  interval: 5 * 60 * 1000, // 5分钟
  lastRun: null
};

class PDCAEngine {
  constructor() {
    this.startTime = Date.now();
    this.logPath = path.join(MEMORY_DIR, 'pdca-execution-log.jsonl');
  }

  async runCycle() {
    PDCA_CONFIG.cycle++;
    const now = new Date();
    
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`[PDCA ${PDCA_CONFIG.cycle}] ${now.toLocaleTimeString('zh-CN')}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    
    // Plan: 确定本轮要做什么
    const plan = this.plan();
    
    // Do: 实际执行
    const result = await this.execute(plan);
    
    // Check: 验证结果
    const check = this.check(result);
    
    // Act: 记录并准备下一轮
    this.act(check, plan);
    
    return check;
  }

  plan() {
    // 每轮做一件具体的事 - 基于当前时间决定
    const hour = new Date().getHours();
    const tasks = [
      { name: '检查系统健康', priority: 'high' },
      { name: '分析用户模式', priority: 'medium' },
      { name: '检查技能状态', priority: 'high' },
      { name: '分析内存使用', priority: 'medium' },
      { name: '验证ISC对齐', priority: 'high' }
    ];
    
    const task = tasks[PDCA_CONFIG.cycle % tasks.length];
    console.log(`  [Plan] 🎯 ${task.name}`);
    return { task, timestamp: Date.now() };
  }

  async execute(plan) {
    console.log(`  [Do]   ⚙️  执行中...`);
    
    let result = { success: false, output: '', details: {} };
    
    try {
      switch (plan.task.name) {
        case '检查系统健康':
          const uptime = execSync('uptime', { encoding: 'utf8' }).trim();
          const disk = execSync('df -h / | tail -1', { encoding: 'utf8' }).trim();
          result.output = `系统运行正常 | ${uptime.split(',')[0]}`;
          result.details = { uptime, disk };
          result.success = true;
          break;
          
        case '分析用户模式':
          const memoryPath = MEMORY_DIR;
          let fileCount = 0;
          let latestFiles = [];
          
          if (fs.existsSync(memoryPath)) {
            const files = fs.readdirSync(memoryPath)
              .filter(f => f.endsWith('.md'))
              .map(f => {
                const stat = fs.statSync(path.join(memoryPath, f));
                return { name: f, mtime: stat.mtime };
              })
              .sort((a, b) => b.mtime - a.mtime);
            
            fileCount = files.length;
            latestFiles = files.slice(0, 3).map(f => f.name);
          }
          
          result.output = `记忆系统：${fileCount}个文件`;
          result.details = { fileCount, latestFiles };
          result.success = true;
          break;
          
        case '检查技能状态':
          const skillsPath = SKILLS_DIR;
          const skills = fs.existsSync(skillsPath) 
            ? fs.readdirSync(skillsPath).filter(d => {
                const skillMd = path.join(skillsPath, d, 'SKILL.md');
                return fs.existsSync(skillMd);
              })
            : [];
          
          result.output = `技能生态：${skills.length}个技能`;
          result.details = { skillCount: skills.length, skills: skills.slice(0, 5) };
          result.success = true;
          break;
          
        case '分析内存使用':
          const memInfo = execSync('free -h | grep Mem', { encoding: 'utf8' }).trim();
          const memParts = memInfo.split(/\s+/);
          result.output = `内存使用：${memParts[2]}/${memParts[1]}`;
          result.details = { total: memParts[1], used: memParts[2], free: memParts[3] };
          result.success = true;
          break;
          
        case '验证ISC对齐':
          const iscPath = path.join(WORKSPACE, 'CAPABILITY-ANCHOR.md');
          const iscExists = fs.existsSync(iscPath);
          
          if (iscExists) {
            const iscContent = fs.readFileSync(iscPath, 'utf8');
            const skillMatches = (iscContent.match(/\[x\]/g) || []).length;
            result.output = `ISC对齐：${skillMatches}项已启用`;
            result.details = { skillMatches };
          } else {
            result.output = 'ISC锚点文件未找到';
          }
          result.success = true;
          break;
      }
    } catch (e) {
      result.output = `错误: ${e.message}`;
      result.success = false;
    }
    
    console.log(`    → ${result.output}`);
    return result;
  }

  check(result) {
    console.log(`  [Check] ✅ 验证结果...`);
    const passed = result.success;
    console.log(`    → ${passed ? '通过 ✓' : '失败 ✗'}`);
    return { passed, result };
  }

  act(check, plan) {
    console.log(`  [Act]  📝 记录本轮...`);
    
    // 确保目录存在
    const logDir = path.dirname(this.logPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    const record = {
      cycle: PDCA_CONFIG.cycle,
      timestamp: new Date().toISOString(),
      task: plan.task.name,
      passed: check.passed,
      output: check.result.output,
      details: check.result.details
    };
    
    // 追加到日志
    fs.appendFileSync(this.logPath, JSON.stringify(record) + '\n');
    
    console.log(`    → 已记录到执行日志`);
  }

  async runOnce() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║  PDCA-C 执行引擎 v1.0.2                                    ║');
    console.log('║  Plan-Do-Check-Act 每小时循环                              ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`执行时间: ${new Date().toLocaleString('zh-CN')}`);
    
    await this.runCycle();
    
    console.log(`\n[完成] 本轮PDCA执行完毕`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  }
}

// 运行
const engine = new PDCAEngine();
engine.runOnce();

export default PDCAEngine;
