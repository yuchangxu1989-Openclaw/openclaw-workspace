/**
 * gate-check-trigger handler - N022 架构合规门禁触发器
 * 
 * 触发规则: N022 (架构设计ISC合规审计)
 * 职责: 架构设计文档产出后，触发合规检查门禁
 */
const fs = require('fs');
const path = require('path');

const LOG_PATH = path.join(__dirname, '..', 'logs', 'gate-check-log.jsonl');

module.exports = {
  name: 'gate-check-trigger',
  
  async execute(context = {}) {
    const { design_path, design_id, checks = [] } = context;
    const results = { passed: [], failed: [], warnings: [] };
    
    console.log(`[N022] 启动架构合规门禁: ${design_id || design_path || 'unknown'}`);
    
    // 检查必要文件存在
    const requiredFiles = ['DESIGN.md', 'ARCHITECTURE.json', 'IMPLEMENTATION.md'];
    if (design_path && fs.existsSync(design_path)) {
      for (const req of requiredFiles) {
        const fp = path.join(design_path, req);
        if (fs.existsSync(fp)) {
          results.passed.push(`✅ ${req} 存在`);
        } else {
          results.failed.push(`❌ ${req} 缺失`);
        }
      }
    }
    
    // 检查硬编码模型名
    const forbiddenPatterns = ['glm-5', 'kimi', 'claude', 'gpt-4'];
    if (design_path && fs.existsSync(design_path)) {
      const mdFiles = fs.readdirSync(design_path).filter(f => f.endsWith('.md') || f.endsWith('.json'));
      for (const file of mdFiles) {
        const content = fs.readFileSync(path.join(design_path, file), 'utf8');
        for (const pattern of forbiddenPatterns) {
          if (content.includes(pattern)) {
            results.failed.push(`❌ ${file} 中检测到硬编码模型名: ${pattern}`);
          }
        }
      }
    }
    
    const score = results.failed.length === 0 ? 100 : 
                  Math.max(0, 100 - results.failed.length * 20);
    
    const entry = {
      timestamp: new Date().toISOString(),
      design_id: design_id || 'unknown',
      score,
      passed: results.passed.length,
      failed: results.failed.length,
      gate_result: results.failed.length === 0 ? 'PASS' : 'FAIL'
    };
    
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n');
    
    console.log(`[N022] 门禁结果: ${entry.gate_result} (得分: ${score})`);
    return { ...entry, details: results };
  }
};
