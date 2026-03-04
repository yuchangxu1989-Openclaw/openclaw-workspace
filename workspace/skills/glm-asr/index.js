#!/usr/bin/env node
/**
 * GLM-ASR 语音转文本技能 v1.0
 * 使用智谱 GLM-ASR-2512 模型
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

class GLMASR {
  constructor() {
    this.apiKey = process.env.ZHIPU_API_KEY || 'REDACTED_ZHIPU_API_KEY';
    this.baseURL = 'open.bigmodel.cn';
    this.model = 'glm-asr-2512';
  }

  /**
   * 语音转文本
   * @param {string} audioPath - 音频文件路径 (支持 mp3, wav, m4a, ogg)
   * @param {object} options - 选项
   * @returns {Promise<string>} 转录文本
   */
  async transcribe(audioPath, options = {}) {
    // 检查文件
    if (!fs.existsSync(audioPath)) {
      throw new Error(`音频文件不存在: ${audioPath}`);
    }

    const stats = fs.statSync(audioPath);
    const ext = path.extname(audioPath).toLowerCase();
    
    // 支持格式
    const supportedFormats = ['.mp3', '.wav', '.m4a', '.ogg', '.webm'];
    if (!supportedFormats.includes(ext)) {
      throw new Error(`不支持的音频格式: ${ext}, 请使用: ${supportedFormats.join(', ')}`);
    }

    // 文件大小限制 (200MB)
    if (stats.size > 200 * 1024 * 1024) {
      throw new Error('音频文件超过200MB限制');
    }

    console.log(`[GLM-ASR] 开始转录: ${audioPath} (${(stats.size/1024).toFixed(1)}KB)`);

    // 读取音频文件
    const audioBuffer = fs.readFileSync(audioPath);
    
    // 构建 multipart/form-data
    const boundary = `----FormBoundary${Date.now()}`;
    const formData = this.buildFormData(boundary, audioBuffer, ext, options);

    // 发送请求
    return this.request(boundary, formData, options.stream);
  }

  /**
   * 构建 multipart/form-data
   */
  buildFormData(boundary, audioBuffer, ext, options) {
    const mimeTypes = {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.m4a': 'audio/mp4',
      '.ogg': 'audio/ogg',
      '.webm': 'audio/webm'
    };

    const chunks = [];

    // model 字段
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    chunks.push(Buffer.from(`Content-Disposition: form-data; name="model"\r\n\r\n`));
    chunks.push(Buffer.from(`${this.model}\r\n`));

    // stream 字段
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    chunks.push(Buffer.from(`Content-Disposition: form-data; name="stream"\r\n\r\n`));
    chunks.push(Buffer.from(`${options.stream ? 'true' : 'false'}\r\n`));

    // language 字段 (可选)
    if (options.language) {
      chunks.push(Buffer.from(`--${boundary}\r\n`));
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="language"\r\n\r\n`));
      chunks.push(Buffer.from(`${options.language}\r\n`));
    }

    // 音频文件
    const mimeType = mimeTypes[ext] || 'audio/mpeg';
    const filename = `audio${ext}`;
    
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    chunks.push(Buffer.from(`Content-Disposition: form-data; name="file"; filename="${filename}"\r\n`));
    chunks.push(Buffer.from(`Content-Type: ${mimeType}\r\n\r\n`));
    chunks.push(audioBuffer);
    chunks.push(Buffer.from(`\r\n`));

    // 结束 boundary
    chunks.push(Buffer.from(`--${boundary}--\r\n`));

    return Buffer.concat(chunks);
  }

  /**
   * 发送请求
   */
  request(boundary, formData, streamMode = false) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.baseURL,
        path: '/api/coding/paas/v4/audio/transcriptions',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': formData.length
        },
        timeout: 120000 // 2分钟超时（大文件转录需要时间）
      };

      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
          
          // 流式模式下，实时输出
          if (streamMode) {
            try {
              const lines = data.split('\n');
              for (const line of lines) {
                if (line.trim().startsWith('data:')) {
                  const json = JSON.parse(line.slice(5));
                  if (json.text) {
                    process.stdout.write(json.text);
                  }
                }
              }
            } catch {}
          }
        });
        
        res.on('end', () => {
          try {
            if (streamMode) {
              resolve(data); // 流式模式下返回原始数据
            } else {
              const json = JSON.parse(data);
              if (json.text) {
                resolve(json.text);
              } else if (json.error) {
                reject(new Error(json.error.message));
              } else {
                resolve(data);
              }
            }
          } catch (e) {
            resolve(data);
          }
        });
      });

      req.on('error', (e) => reject(new Error(`请求失败: ${e.message}`)));
      req.on('timeout', () => reject(new Error('请求超时')));
      
      req.write(formData);
      req.end();
    });
  }
}

// CLI入口
async function main() {
  const args = process.argv.slice(2);
  const asr = new GLMASR();
  
  if (args.length === 0) {
    console.log('GLM-ASR 语音转文本');
    console.log('用法: node index.js <音频文件路径> [--stream] [--language=zh]');
    console.log('示例: node index.js ./audio.mp3');
    return;
  }

  const audioPath = args[0];
  const streamMode = args.includes('--stream');
  const langArg = args.find(a => a.startsWith('--language='));
  const language = langArg ? langArg.split('=')[1] : 'zh';

  try {
    const result = await asr.transcribe(audioPath, { 
      stream: streamMode,
      language
    });
    
    if (!streamMode) {
      console.log('\n转录结果:');
      console.log(result);
    }
  } catch (e) {
    console.error('错误:', e.message);
    process.exit(1);
  }
}

module.exports = GLMASR;

if (require.main === module) {
  main();
}
