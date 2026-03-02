#!/usr/bin/env node
/**
 * GLM-5 代理脚本 - 绕过Gateway直接调用智谱API
 * 用途：供Cron任务直接调用GLM-5，无需Gateway配置
 * 路径: /root/.openclaw/workspace/scripts/glm5-proxy.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// 配置
const CONFIG = {
  apiBase: 'https://open.bigmodel.cn/api/coding/paas/v4',
  model: 'glm-5',
  timeout: 300000, // 5分钟超时
  maxRetries: 3,
  retryDelay: 2000, // 2秒初始退避
  logDir: '/root/.openclaw/workspace/logs'
};

// 确保日志目录存在
if (!fs.existsSync(CONFIG.logDir)) {
  fs.mkdirSync(CONFIG.logDir, { recursive: true });
}

// 日志记录
const log = (level, message, data = null) => {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${level}] ${message}${data ? ' ' + JSON.stringify(data) : ''}\n`;
  
  // 写入文件
  const logFile = path.join(CONFIG.logDir, 'glm5-proxy.log');
  fs.appendFileSync(logFile, logEntry);
  
  // 控制台输出（仅错误）
  if (level === 'ERROR') {
    console.error(logEntry.trim());
  }
};

// HTTP请求封装
const request = (url, options, data) => {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${json.error?.message || body}`));
          }
        } catch (e) {
          reject(new Error(`Parse error: ${e.message}`));
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(CONFIG.timeout, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    if (data) req.write(data);
    req.end();
  });
};

// 调用GLM-5
const callGLM5 = async (messages, retryCount = 0) => {
  const apiKey = process.env.ZHIPU_API_KEY;
  if (!apiKey) {
    throw new Error('ZHIPU_API_KEY not found in environment');
  }
  
  const url = `${CONFIG.apiBase}/chat/completions`;
  const data = JSON.stringify({
    model: CONFIG.model,
    messages: messages,
    reasoning: true,
    max_tokens: 8192
  });
  
  const options = {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    }
  };
  
  try {
    log('INFO', `Calling GLM-5, attempt ${retryCount + 1}`);
    const startTime = Date.now();
    const result = await request(url, options, data);
    const duration = Date.now() - startTime;
    
    log('INFO', `GLM-5 call successful`, { duration, tokens: result.usage });
    return result;
    
  } catch (error) {
    log('WARN', `GLM-5 call failed`, { error: error.message, attempt: retryCount + 1 });
    
    // 重试逻辑
    if (retryCount < CONFIG.maxRetries) {
      const delay = CONFIG.retryDelay * Math.pow(2, retryCount);
      log('INFO', `Retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
      return callGLM5(messages, retryCount + 1);
    }
    
    throw error;
  }
};

// 主函数
const main = async () => {
  try {
    // 从命令行或stdin获取输入
    let prompt = process.argv.slice(2).join(' ');
    
    if (!prompt) {
      // 尝试从stdin读取
      const chunks = [];
      for await (const chunk of process.stdin) chunks.push(chunk);
      prompt = Buffer.concat(chunks).toString().trim();
    }
    
    if (!prompt) {
      console.error('Usage: node glm5-proxy.js "你的问题"');
      process.exit(1);
    }
    
    log('INFO', 'Starting GLM-5 proxy call', { promptLength: prompt.length });
    
    const result = await callGLM5([
      { role: 'system', content: '你是一个专业的AI助手，用于执行定时任务中的复杂分析工作。' },
      { role: 'user', content: prompt }
    ]);
    
    // 输出结果
    const content = result.choices?.[0]?.message?.content || '';
    console.log(content);
    
    log('INFO', 'Completed successfully');
    process.exit(0);
    
  } catch (error) {
    log('ERROR', 'Fatal error', { error: error.message });
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

main();
