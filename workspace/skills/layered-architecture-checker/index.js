#!/usr/bin/env node
/**
 * [REDIRECT] 此技能已整合入AEO内部模块
 * 实际代码位置: skills/aeo/modules/layered-arch-check.js
 * 整合时间: 2026-03-12
 * 
 * 本文件保留为redirect，确保其他地方引用不断裂。
 * 所有功能由AEO统一调度。
 */

// CLI兼容：直接运行时转发到实际模块
if (require.main === module) {
  // 直接 fork 实际模块，传递所有CLI参数
  const { execSync } = require('child_process');
  const path = require('path');
  const actualPath = path.join(__dirname, '..', 'aeo', 'modules', 'layered-arch-check.js');
  const args = process.argv.slice(2).map(a => `"${a}"`).join(' ');
  try {
    execSync(`node "${actualPath}" ${args}`, { stdio: 'inherit' });
  } catch (err) {
    process.exit(err.status || 1);
  }
}
