/**
 * gateway-config-protection handler - N033 Gateway配置保护处理器
 * 
 * 触发规则: N033 (禁止自动修改Gateway/飞书/Agent配置)
 * 职责: 拦截敏感配置修改，要求人工确认
 */
const fs = require('fs');
const path = require('path');

const SENSITIVE_PATTERNS = [
  /openclaw\.json$/,
  /gateway.*\.json$/,
  /agents\/.*\/models\.json$/,
  /agents\/.*\/agent\.json$/,
  /cron\/jobs\.json$/,
  /identity\//,
  /feishu\//
];

const LOG_PATH = path.join(__dirname, '..', 'logs', 'config-protection-log.jsonl');

module.exports = {
  name: 'gateway-config-protection',
  
  /**
   * 检查是否为敏感配置操作
   * @param {Object} context - 操作上下文
   * @param {string} context.file_path - 目标文件路径
   * @param {string} context.operation - 操作类型 (modify|delete|create)
   * @param {boolean} context.user_confirmed - 用户是否已确认
   */
  async execute(context = {}) {
    const { file_path = '', operation = 'modify', user_confirmed = false } = context;
    
    const isSensitive = this.isSensitivePath(file_path);
    
    if (!isSensitive) {
      return { allowed: true, reason: 'not a sensitive config path' };
    }
    
    // 记录操作
    const entry = {
      timestamp: new Date().toISOString(),
      file_path,
      operation,
      user_confirmed,
      result: user_confirmed ? 'allowed_with_confirmation' : 'blocked'
    };
    
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n');
    
    if (!user_confirmed) {
      console.log(`[N033] 🚨 阻止敏感配置修改: ${file_path} (${operation})`);
      return {
        allowed: false,
        reason: 'sensitive config modification requires user confirmation',
        file_path,
        operation,
        message: `🚨 检测到敏感配置修改操作: ${operation} ${file_path}\n请用户确认后方可执行。`
      };
    }
    
    // 用户已确认 - 创建备份
    if (fs.existsSync(file_path)) {
      const backupPath = `${file_path}.backup.${Date.now()}`;
      fs.copyFileSync(file_path, backupPath);
      console.log(`[N033] 已创建备份: ${backupPath}`);
      entry.backup_path = backupPath;
    }
    
    return { allowed: true, reason: 'user confirmed', backup_created: true };
  },
  
  isSensitivePath(filePath) {
    return SENSITIVE_PATTERNS.some(pattern => pattern.test(filePath));
  }
};
