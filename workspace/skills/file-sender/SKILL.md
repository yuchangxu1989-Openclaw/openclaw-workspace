---
name: file-sender
description: 通用文件发送器 - 自动适配通道能力，支持直接传输或内容输出
version: "1.0.5"
status: active
tags: [file, delivery, interaction, utility]
---

# file-sender - 文件发送技能

## 功能

自动检测通道文件传输能力，选择最优方式发送文件给用户：
1. **首选**: 直接文件传输（message工具）
2. **备选**: 完整内容输出（exec cat）

## 使用方式

### 直接调用

```javascript
const { sendSourceFile } = require('./skills/file-sender');

// 发送文件
await sendSourceFile({
  filePath: '/path/to/file.md',
  filename: 'report.md'
});
```

### 通过ISC规则自动触发

当用户说"发我源文件"时，自动调用此技能。

## 核心代码

```javascript
// skills/file-sender/index.js
const { message } = require('../../../../.openclaw/extensions/openclaw-message');
const { exec } = require('../../../../.openclaw/extensions/openclaw-exec');

class FileSender {
  constructor(options = {}) {
    this.channel = options.channel || 'feishu';
    this.fallbackOnFailure = options.fallbackOnFailure !== false;
  }

  /**
   * 发送源文件 - 主入口
   */
  async sendSourceFile({ filePath, filename }) {
    // 1. 检查文件存在
    const checkResult = await exec({
      command: `test -f "${filePath}" && echo "EXISTS" || echo "NOT_FOUND"`
    });
    
    if (checkResult.stdout.trim() !== 'EXISTS') {
      throw new Error(`文件不存在: ${filePath}`);
    }

    // 2. 尝试直接发送文件
    try {
      await message({
        action: 'send',
        filePath: filePath,
        filename: filename || path.basename(filePath)
      });
      
      console.log(`[FileSender] 文件发送成功: ${filename}`);
      return { success: true, method: 'direct' };
      
    } catch (error) {
      console.log(`[FileSender] 直接发送失败，使用备选方案: ${error.message}`);
      
      // 3. 备选：输出完整内容
      if (this.fallbackOnFailure) {
        return await this.sendAsContent(filePath, filename);
      }
      
      throw error;
    }
  }

  /**
   * 以内容形式发送
   */
  async sendAsContent(filePath, filename) {
    const content = await exec({
      command: `cat "${filePath}"`
    });
    
    const output = `=== 文件: ${filename} ===
路径: ${filePath}
大小: $(du -h "${filePath}" | cut -f1)
========================

${content.stdout}

========================
[文件结束] 请复制保存为 ${filename}`;

    console.log(output);
    
    return { 
      success: true, 
      method: 'content',
      note: '用户需手动复制保存'
    };
  }
}

module.exports = { FileSender };
```

## 配置

```json
{
  "channel": "feishu",
  "fallbackOnFailure": true
}
```

## 使用场景

| 场景 | 自动选择方式 |
|:---|:---|
| 飞书支持文件类型 | 直接传输 |
| 飞书不支持.md/.json | 内容输出 |
| 传输失败 | 自动降级到内容输出 |
| 大文件(>1MB) | 建议压缩后发送 |

## 集成到ISC

已在ISC规则 `N007-v2` 中定义标准交互流程。
