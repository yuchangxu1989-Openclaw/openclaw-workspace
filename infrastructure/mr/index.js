/**
 * MR入口 - 安全切换版
 * 完整版(TypeScript)优先，失败自动回退MVP版
 */

import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 检查完整版是否存在
const fullVersionPath = join(__dirname, 'dist', 'mr-router.js');
const mvpVersionPath = join(__dirname, 'mr-router.mvp.js');

let MRRouter;
let useFullVersion = false;

// 尝试加载完整版
if (existsSync(fullVersionPath)) {
  try {
    const fullModule = await import(fullVersionPath);
    MRRouter = fullModule.MRRouter;
    useFullVersion = true;
    console.log('[MR] 使用完整版 (TypeScript编译)');
  } catch (err) {
    console.warn('[MR] 完整版加载失败:', err.message);
  }
}

// 回退到MVP版
if (!MRRouter) {
  try {
    const mvpModule = await import(mvpVersionPath);
    MRRouter = mvpModule.MRRouter;
    console.log('[MR] 使用MVP版 (JavaScript)');
  } catch (err) {
    console.error('[MR] MVP版也加载失败:', err.message);
    throw new Error('MR无法加载');
  }
}

export { MRRouter };
export const isFullVersion = () => useFullVersion;
