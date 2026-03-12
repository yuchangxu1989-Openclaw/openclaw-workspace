#!/usr/bin/env node
/**
 * [REDIRECT] 此技能已整合入AEO内部模块
 * 实际代码位置: skills/aeo/modules/isc-doc-quality.js
 * 整合时间: 2026-03-12
 * 
 * 本文件保留为redirect，确保其他地方引用不断裂。
 * 所有功能由AEO统一调度。
 */

const actualModule = require('../aeo/modules/isc-doc-quality');

// 透传所有导出
module.exports = actualModule;

// CLI兼容：直接运行时转发到实际模块
if (require.main === module) {
  // 重写 require.main 使实际模块认为自己是入口
  const actualPath = require.resolve('../aeo/modules/isc-doc-quality');
  require(actualPath);
  // 如果实际模块有 main() 函数
  if (typeof actualModule.main === 'function') {
    actualModule.main();
  }
}
