#!/usr/bin/env node
/**
 * 文件下载技能 v1.0
 * 断点续传、校验、进度
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class FileDownloader {
  constructor(options = {}) {
    this.chunkSize = options.chunkSize || 1024 * 1024; // 1MB分片
    this.maxRetries = options.maxRetries || 3;
    this.timeout = options.timeout || 30000;
  }

  /**
   * 下载文件 - 支持断点续传
   */
  async download(url, outputPath, options = {}) {
    const tempPath = `${outputPath}.tmp`;
    const statsPath = `${outputPath}.stats`;
    
    // 检查是否有未完成的下载
    let startByte = 0;
    if (fs.existsSync(statsPath)) {
      try {
        const stats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
        if (stats.url === url && fs.existsSync(tempPath)) {
          startByte = stats.downloaded;
          console.log(`[下载] 断点续传: ${startByte} bytes`);
        }
      } catch {}
    }

    // 获取文件信息
    const fileInfo = await this.getFileInfo(url);
    const totalSize = fileInfo.size;
    
    console.log(`[下载] 文件大小: ${this.formatBytes(totalSize)}`);

    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;
      
      const opts = {
        method: 'GET',
        headers: {
          'Range': `bytes=${startByte}-`,
          'User-Agent': 'OpenClaw-FileDownloader/1.0'
        }
      };

      const req = protocol.request(url, opts, (res) => {
        if (res.statusCode !== 200 && res.statusCode !== 206) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        const fileStream = fs.createWriteStream(tempPath, { flags: startByte > 0 ? 'a' : 'w' });
        let downloaded = startByte;
        let lastProgress = 0;

        res.on('data', (chunk) => {
          downloaded += chunk.length;
          fileStream.write(chunk);

          // 进度更新
          const progress = Math.floor((downloaded / totalSize) * 100);
          if (progress > lastProgress && progress % 10 === 0) {
            console.log(`[下载] 进度: ${progress}% (${this.formatBytes(downloaded)}/${this.formatBytes(totalSize)})`);
            lastProgress = progress;
          }

          // 保存进度
          fs.writeFileSync(statsPath, JSON.stringify({ url, downloaded, totalSize }));
        });

        res.on('end', () => {
          fileStream.end();
          
          // 重命名为最终文件
          fs.renameSync(tempPath, outputPath);
          fs.unlinkSync(statsPath);
          
          console.log(`[下载] 完成: ${outputPath}`);
          resolve({ path: outputPath, size: downloaded });
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.setTimeout(this.timeout, () => {
        req.destroy();
        reject(new Error('下载超时'));
      });

      req.end();
    });
  }

  /**
   * 获取文件信息
   */
  async getFileInfo(url) {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;
      
      const req = protocol.request(url, { method: 'HEAD' }, (res) => {
        resolve({
          size: parseInt(res.headers['content-length']) || 0,
          type: res.headers['content-type'],
          modified: res.headers['last-modified']
        });
      });

      req.on('error', reject);
      req.end();
    });
  }

  /**
   * 校验文件MD5
   */
  async verifyChecksum(filePath, expectedHash) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('md5');
      const stream = fs.createReadStream(filePath);

      stream.on('data', data => hash.update(data));
      stream.on('end', () => {
        const actualHash = hash.digest('hex');
        resolve(actualHash === expectedHash);
      });
      stream.on('error', reject);
    });
  }

  /**
   * 格式化字节大小
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

module.exports = FileDownloader;
