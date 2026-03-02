/**
 * MR入口 - 完整版安全切换
 * 使用TypeScript完整版，支持AbortController取消
 * 确保主模型通信稳定不被入侵
 */

// 直接导出完整版（假设已编译）
export { MRRouter } from './src/mr-router.ts';

// 安全提示
console.log('[MR] 使用完整版 (TypeScript)');
console.log('[MR] 安全特性:');
console.log('  - AbortController: 主Agent可随时取消子Agent');
console.log('  - 非阻塞执行: 主Agent通信路径独立');
console.log('  - LEP委托: 100%复用韧性，零复刻');
console.log('  - 零硬编码: 使用{{MODEL_XXX}}占位符');
