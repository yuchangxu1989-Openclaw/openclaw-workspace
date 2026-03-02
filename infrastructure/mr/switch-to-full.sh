#!/bin/bash
# MR切换脚本：MVP版 → 完整版（TypeScript）
# 安全切换，确保主模型和通信稳定

echo "=== MR切换方案（MVP → 完整版）==="
echo ""
echo "切换原则："
echo "1. 保持MVP版可用作为fallback"
echo "2. 完整版编译验证通过后切换"
echo "3. 主Agent通信路径完全独立"
echo "4. 随时可回滚到MVP版"
echo ""

# 步骤1: 备份MVP版
echo "步骤1: 备份MVP版..."
cp /root/.openclaw/workspace/infrastructure/mr/mr-router.js \
   /root/.openclaw/workspace/infrastructure/mr/mr-router.mvp.js
echo "✓ MVP版已备份"

# 步骤2: 检查完整版代码
echo ""
echo "步骤2: 检查完整版代码..."
if [ -f "/root/.openclaw/workspace/infrastructure/mr/src/mr-router.ts" ]; then
    echo "✓ 完整版代码存在"
    wc -l /root/.openclaw/workspace/infrastructure/mr/src/*.ts
else
    echo "✗ 完整版代码不存在"
    exit 1
fi

# 步骤3: 安装依赖
echo ""
echo "步骤3: 安装TypeScript依赖..."
cd /root/.openclaw/workspace/infrastructure/mr
npm init -y
npm install typescript @types/node --save-dev

# 步骤4: 创建tsconfig.json
echo ""
echo "步骤4: 创建tsconfig.json..."
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "__tests__"]
}
EOF
echo "✓ tsconfig.json创建完成"

# 步骤5: 编译TypeScript
echo ""
echo "步骤5: 编译TypeScript..."
npx tsc

if [ $? -eq 0 ]; then
    echo "✓ TypeScript编译成功"
else
    echo "✗ TypeScript编译失败，保持MVP版"
    exit 1
fi

# 步骤6: 创建入口文件切换
echo ""
echo "步骤6: 创建安全切换入口..."
cat > /root/.openclaw/workspace/infrastructure/mr/index.js << 'EOF'
/**
 * MR入口 - 安全切换版
 * 优先使用完整版(TypeScript编译后)，失败时自动回退到MVP版
 */

let useFullVersion = true;

// 尝试加载完整版
try {
  const { MRRouter } = await import('./dist/mr-router.js');
  console.log('[MR] 使用完整版 (TypeScript)');
  export { MRRouter };
} catch (error) {
  console.warn('[MR] 完整版加载失败，使用MVP版:', error.message);
  useFullVersion = false;
  
  // 回退到MVP版
  const { MRRouter } = await import('./mr-router.mvp.js');
  export { MRRouter };
}

export const isFullVersion = () => useFullVersion;
EOF

echo "✓ 安全切换入口创建完成"

# 步骤7: 验证测试
echo ""
echo "步骤7: 运行验证测试..."
node -e "
import('./index.js').then(({ MRRouter, isFullVersion }) => {
  console.log('MR加载成功');
  console.log('使用完整版:', isFullVersion());
  
  // 快速功能验证
  const router = new MRRouter('test-agent');
  console.log('MRRouter实例创建成功');
  console.log('✓ 切换验证通过');
}).catch(err => {
  console.error('✗ 验证失败:', err);
  process.exit(1);
});
"

echo ""
echo "=== 切换完成 ==="
echo ""
echo "使用方式:"
echo "  import { MRRouter } from './infrastructure/mr/index.js';"
echo ""
echo "安全机制:"
echo "  - 完整版编译失败自动回退MVP版"
echo "  - 主Agent通信路径独立"
echo "  - AbortController支持随时取消"
echo "  - cancel()/cancelAll()主动中断"
echo ""
echo "回滚命令:"
echo "  cp mr-router.mvp.js mr-router.js"
