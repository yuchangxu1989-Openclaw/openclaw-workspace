#!/usr/bin/env node
/**
 * API连通性测试脚本 - 测试自定义API端点
 * 配置来源：用户提供的 penguinsaichat.dpdns.org
 */

const https = require('https');

// 测试配置
const CONFIG = {
  baseUrl: 'api.penguinsaichat.dpdns.org',
  apiKey: 'sk-O3vd9mcS45b0dYbmFfHchsnWZewuyVPm2eufvcHQn6zFNTzZ',
  model: 'claude-opus-4-5-20251101',
  timeout: 30000 // 30秒超时
};

// 发送HTTP请求
const request = (options, data) => {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({ statusCode: res.statusCode, data: json });
        } catch (e) {
          resolve({ statusCode: res.statusCode, data: body });
        }
      });
    });
    
    req.on('error', (err) => {
      console.error('请求错误详情:', err);
      reject(err);
    });
    
    req.setTimeout(CONFIG.timeout, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    if (data) req.write(data);
    req.end();
  });
};

// 测试API连通性
const testAPI = async () => {
  console.log('=== API连通性测试 ===\n');
  console.log(`测试端点: https://${CONFIG.baseUrl}`);
  console.log(`测试模型: ${CONFIG.model}`);
  console.log(`API Key: ${CONFIG.apiKey.substring(0, 15)}...\n`);
  
  try {
    // 构建请求（anthropic-messages格式）
    const requestData = JSON.stringify({
      model: CONFIG.model,
      messages: [
        { role: 'user', content: 'Hello, this is a connectivity test. Please respond with "API test successful".' }
      ],
      max_tokens: 100
    });
    
    const options = {
      hostname: CONFIG.baseUrl,
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.apiKey}`,
        'User-Agent': 'OpenClaw-API-Test/1.0'
      }
    };
    
    console.log('发送测试请求...');
    console.log('请求路径:', options.path);
    console.log('请求方法:', options.method);
    console.log('请求头:', JSON.stringify(options.headers, null, 2));
    console.log('请求体:', requestData);
    console.log('');
    
    const startTime = Date.now();
    const result = await request(options, requestData);
    const duration = Date.now() - startTime;
    
    console.log(`\n=== 测试结果 ===`);
    console.log(`状态码: ${result.statusCode}`);
    console.log(`响应时间: ${duration}ms`);
    
    if (result.statusCode >= 200 && result.statusCode < 300) {
      console.log('\n✅ API连通性测试通过！');
      console.log('响应内容:', JSON.stringify(result.data, null, 2));
    } else {
      console.log('\n❌ API返回错误状态码');
      console.log('响应内容:', JSON.stringify(result.data, null, 2));
    }
    
  } catch (error) {
    console.log('\n❌ API测试失败');
    console.log('错误类型:', error.constructor.name);
    console.log('错误代码:', error.code || 'N/A');
    console.log('错误信息:', error.message);
    console.log('错误堆栈:', error.stack);
    
    if (error.message.includes('timeout')) {
      console.log('\n提示: 请求超时，可能是网络问题或API端点不可用');
    } else if (error.code === 'ENOTFOUND') {
      console.log('\n提示: 域名解析失败，请检查baseUrl是否正确');
    } else if (error.code === 'ECONNREFUSED') {
      console.log('\n提示: 连接被拒绝，API端点可能未运行');
    } else if (error.code === 'ECONNRESET') {
      console.log('\n提示: 连接被重置，可能是SSL/TLS问题或服务器拒绝连接');
    }
  }
};

testAPI();
