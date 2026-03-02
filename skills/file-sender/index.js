#!/usr/bin/env node
/**
 * 文件发送器 - 自动适配通道能力
 * 优先直接传输，失败则输出内容
 */

const { exec } = require('child_process');
const util = require('util');
const path = require('path');

const execPromise = util.promisify(exec);

class FileSender {
  constructor(options = {}) {
    this.channel = options.channel || 'feishu';
    this.fallbackOnFailure = options.fallbackOnFailure !== false;
  }

  /**
   * 发送源文件 - 主入口
   * @param {Object} params - 参数
   * @param {string} params.filePath - 文件绝对路径
   * @param {string} params.filename - 显示文件名（可选）
   */
  async sendSourceFile({ filePath, filename }) {
    try {
      // 1. 检查文件存在
      await this.checkFileExists(filePath);
      
      const displayName = filename || path.basename(filePath);
      
      // 2. 输出文件信息
      const stats = await this.getFileStats(filePath);
      
      console.log(`=== 文件发送 ===`);
      console.log(`文件名: ${displayName}`);
      console.log(`路径: ${filePath}`);
      console.log(`大小: ${stats.size}`);
      console.log(`================`);
      console.log();
      
      // 3. 尝试输出完整内容（飞书通道最可靠的方式）
      await this.outputFileContent(filePath, displayName);
      
      return { 
        success: true, 
        method: 'content_output',
        filePath,
        filename: displayName
      };
      
    } catch (error) {
      console.error(`[FileSender] 错误: ${error.message}`);
      throw error;
    }
  }

  /**
   * 检查文件是否存在
   */
  async checkFileExists(filePath) {
    try {
      await execPromise(`test -f "${filePath}"`);
    } catch (error) {
      throw new Error(`文件不存在: ${filePath}`);
    }
  }

  /**
   * 获取文件信息
   */
  async getFileStats(filePath) {
    try {
      const { stdout } = await execPromise(`du -h "${filePath}" | cut -f1`);
      return { size: stdout.trim() };
    } catch (error) {
      return { size: 'unknown' };
    }
  }

  /**
   * 输出文件内容
   */
  async outputFileContent(filePath, filename) {
    try {
      const { stdout } = await execPromise(`cat "${filePath}"`);
      
      console.log(`=== 文件内容开始: ${filename} ===`);
      console.log();
      console.log(stdout);
      console.log();
      console.log(`=== 文件内容结束 ===`);
      console.log();
      console.log(`[提示] 请复制以上内容，保存为 "${filename}"`);
      
    } catch (error) {
      throw new Error(`读取文件失败: ${error.message}`);
    }
  }
}

// CLI 入口
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('用法: node index.js <文件路径> [显示文件名]');
    console.log('示例: node index.js /path/to/report.md my-report.md');
    process.exit(1);
  }
  
  const filePath = args[0];
  const filename = args[1];
  
  const sender = new FileSender();
  
  try {
    const result = await sender.sendSourceFile({ filePath, filename });
    process.exit(0);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

// 如果是直接运行
if (require.main === module) {
  main();
}

module.exports = { FileSender };
