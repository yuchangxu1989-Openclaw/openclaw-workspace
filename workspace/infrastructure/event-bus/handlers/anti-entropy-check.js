const path = require('path');

module.exports = async function(event, rule, context) {
  const root = (context && (context.workspaceRoot || context.cwd || context.rootDir)) || process.cwd();
  const checkerPath = path.join(root, 'skills', 'anti-entropy-checker', 'index.js');
  const checker = require(checkerPath);

  if (typeof checker === 'function') {
    return await checker(event, rule, context);
  }
  if (checker && typeof checker.run === 'function') {
    return await checker.run(event, rule, context);
  }

  return {
    ok: false,
    reason: 'anti-entropy-checker导出不支持（需要function或run方法）'
  };
};
