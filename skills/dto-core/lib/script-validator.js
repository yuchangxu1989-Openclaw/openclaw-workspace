/**
 * DTO v2.0 - 脚本签名验证器 (P2)
 * 自定义脚本的安全验证
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class ScriptSignatureValidator {
  constructor(options = {}) {
    this.trustedKeys = options.trustedKeys || [];
    this.requireSignature = options.requireSignature !== false;
    this.allowedInterpreters = options.allowedInterpreters || ['node', 'python3', 'bash'];
    this.scriptTimeout = options.timeout || 30000;
  }

  /**
   * 验证脚本
   * @param {Object} action - 自定义脚本动作
   */
  async validate(action) {
    const { script, interpreter, signature, params } = action;
    
    console.log(`[ScriptValidator] 验证脚本: ${script}`);
    
    const result = {
      valid: false,
      checks: {}
    };
    
    // 1. 检查解释器白名单
    result.checks.interpreter = this.validateInterpreter(interpreter);
    if (!result.checks.interpreter.valid) {
      result.error = result.checks.interpreter.error;
      return result;
    }
    
    // 2. 检查脚本路径
    result.checks.path = this.validatePath(script);
    if (!result.checks.path.valid) {
      result.error = result.checks.path.error;
      return result;
    }
    
    // 3. 检查脚本存在
    if (!fs.existsSync(script)) {
      result.error = `脚本不存在: ${script}`;
      return result;
    }
    
    // 4. 读取脚本内容
    const content = fs.readFileSync(script, 'utf8');
    
    // 5. 静态分析
    result.checks.static = this.staticAnalysis(content, interpreter);
    if (!result.checks.static.safe) {
      result.error = `静态分析发现风险: ${result.checks.static.issues.join(', ')}`;
      return result;
    }
    
    // 6. 签名验证（如果需要）
    if (this.requireSignature) {
      result.checks.signature = await this.verifySignature(content, signature);
      if (!result.checks.signature.valid) {
        result.error = result.checks.signature.error;
        return result;
      }
    }
    
    // 7. 参数验证
    result.checks.params = this.validateParams(params, action.expectedParams);
    
    result.valid = true;
    result.checksum = this.calculateChecksum(content);
    
    console.log(`[ScriptValidator] ✓ 验证通过`);
    
    return result;
  }

  /**
   * 验证解释器
   */
  validateInterpreter(interpreter) {
    if (!interpreter) {
      return { valid: false, error: '未指定解释器' };
    }
    
    const baseInterpreter = interpreter.split(' ')[0];
    
    if (!this.allowedInterpreters.includes(baseInterpreter)) {
      return { 
        valid: false, 
        error: `解释器不在白名单: ${baseInterpreter}，允许: ${this.allowedInterpreters.join(', ')}` 
      };
    }
    
    return { valid: true, interpreter: baseInterpreter };
  }

  /**
   * 验证路径安全
   */
  validatePath(scriptPath) {
    // 禁止绝对路径指向系统目录
    const forbiddenPaths = [
      '/bin', '/sbin', '/usr/bin', '/usr/sbin',
      '/etc', '/root', '/home'
    ];
    
    const resolved = path.resolve(scriptPath);
    
    for (const forbidden of forbiddenPaths) {
      if (resolved.startsWith(forbidden)) {
        return { valid: false, error: `路径在禁止区域: ${forbidden}` };
      }
    }
    
    // 必须在工作区内
    const workspace = process.env.OPENCLAW_WORKSPACE || '/root/.openclaw/workspace';
    if (!resolved.startsWith(workspace)) {
      return { valid: false, error: '脚本必须在 OpenClaw 工作区内' };
    }
    
    return { valid: true, resolved };
  }

  /**
   * 静态分析
   */
  staticAnalysis(content, interpreter) {
    const issues = [];
    const dangerousPatterns = {
      'node': [
        /require\s*\(\s*['"]child_process['"]\s*\)/,
        /eval\s*\(/,
        /new\s+Function\s*\(/,
        /process\.exit\s*\(/,
        /fs\.unlinkSync\s*\(\s*['"]\//,
        /rm\s+-rf/
      ],
      'python3': [
        /import\s+os\.system/,
        /subprocess\.call\s*\(/,
        /eval\s*\(/,
        /exec\s*\(/,
        /__import__\s*\(/,
        /open\s*\(\s*['"]\//
      ],
      'bash': [
        /rm\s+-rf\s+\//,
        />\s*\/etc\/,
        /mkfs/,
        /dd\s+if=/,
        /:\(\)\{\s*:\|:&\s*\};/  // fork bomb
      ]
    };
    
    const patterns = dangerousPatterns[interpreter] || [];
    
    for (const pattern of patterns) {
      if (pattern.test(content)) {
        issues.push(`危险模式: ${pattern.source.substring(0, 30)}...`);
      }
    }
    
    return {
      safe: issues.length === 0,
      issues,
      lines: content.split('\n').length
    };
  }

  /**
   * 验证签名
   */
  async verifySignature(content, signature) {
    if (!signature) {
      return { valid: false, error: '缺少签名' };
    }
    
    if (this.trustedKeys.length === 0) {
      return { valid: false, error: '未配置可信公钥' };
    }
    
    const checksum = this.calculateChecksum(content);
    
    // 尝试所有可信密钥验证
    for (const publicKey of this.trustedKeys) {
      try {
        const verifier = crypto.createVerify('SHA256');
        verifier.update(checksum);
        
        if (verifier.verify(publicKey, signature, 'base64')) {
          return { valid: true, keyId: publicKey.substring(0, 16) };
        }
      } catch (e) {
        continue;
      }
    }
    
    return { valid: false, error: '签名验证失败' };
  }

  /**
   * 计算校验和
   */
  calculateChecksum(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * 验证参数
   */
  validateParams(params, expected) {
    if (!expected) {
      return { valid: true };
    }
    
    const issues = [];
    
    for (const [key, config] of Object.entries(expected)) {
      const value = params[key];
      
      if (config.required && (value === undefined || value === null)) {
        issues.push(`缺少必需参数: ${key}`);
      }
      
      if (value !== undefined && config.type) {
        const actualType = typeof value;
        if (actualType !== config.type) {
          issues.push(`参数类型错误 ${key}: 期望 ${config.type}, 实际 ${actualType}`);
        }
      }
      
      // 检查危险值
      if (typeof value === 'string') {
        const dangerous = /[;|&$`\n\r]/;
        if (dangerous.test(value)) {
          issues.push(`参数 ${key} 包含危险字符`);
        }
      }
    }
    
    return {
      valid: issues.length === 0,
      issues
    };
  }

  /**
   * 添加可信密钥
   */
  addTrustedKey(publicKey) {
    this.trustedKeys.push(publicKey);
  }

  /**
   * 生成签名（用于脚本发布）
   */
  static signScript(content, privateKey) {
    const checksum = crypto.createHash('sha256').update(content).digest('hex');
    
    const signer = crypto.createSign('SHA256');
    signer.update(checksum);
    
    return signer.sign(privateKey, 'base64');
  }
}

module.exports = ScriptSignatureValidator;
