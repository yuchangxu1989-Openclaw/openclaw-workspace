/**
 * @fileoverview 错误处理模块单元测试
 * @module __tests__/error-handler.test
 */

'use strict';

// 模拟测试框架
let passCount = 0;
let failCount = 0;

function describe(name, fn) {
  console.log(`\n📦 ${name}`);
  fn();
}

function it(name, fn) {
  try {
    fn();
    passCount++;
    console.log(`  ✅ ${name}`);
  } catch (error) {
    failCount++;
    console.log(`  ❌ ${name}: ${error.message}`);
  }
}

function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(`期望 ${expected}，实际 ${actual}`);
      }
    },
    toBeTruthy() {
      if (!actual) {
        throw new Error(`期望为真`);
      }
    },
    toBeFalsy() {
      if (actual) {
        throw new Error(`期望为假`);
      }
    }
  };
}

// 异步运行测试
async function runTests() {
  const { ErrorHandler, ErrorCategory, ErrorSeverity, RecoverableError, RetryExhaustedError } = await import('../error-handler.js');

  describe('RecoverableError', () => {
    it('应该正确创建错误对象', () => {
      const error = new RecoverableError('测试错误', '尝试重新连接');
      
      expect(error.message).toBe('测试错误');
      expect(error.name).toBe('RecoverableError');
      expect(error.recoveryHint).toBe('尝试重新连接');
      expect(error.category).toBe(ErrorCategory.RECOVERABLE);
    });

    it('应该是可恢复的错误类型', () => {
      const error = new RecoverableError('网络错误');
      // RecoverableError 的名称就是 'RecoverableError'，表示它是可恢复的
      expect(error.name).toBe('RecoverableError');
      expect(error.category).toBe(ErrorCategory.RECOVERABLE);
    });
  });

  describe('ErrorHandler', () => {
    it('应该正确创建处理器', () => {
      const handler = new ErrorHandler();
      expect(handler).toBeTruthy();
    });

    it('应该正确处理错误', async () => {
      const handler = new ErrorHandler();
      const error = new Error('测试错误');
      
      const result = await handler.handleError(error);
      expect(result).toBeTruthy();
    });

    it('应该正确回滚', async () => {
      const handler = new ErrorHandler();
      // 先注册回滚处理器
      handler.registerRollbackHandler('test_op', async () => ({ success: true }));
      
      const result = await handler.rollback('test_op');
      expect(result.success).toBeTruthy();
    });

    it('应该获取错误报告', () => {
      const handler = new ErrorHandler();
      const report = handler.getErrorReport();
      expect(typeof report).toBe('object');
    });
  });

  describe('ErrorCategory & ErrorSeverity', () => {
    it('应该有正确的错误类别', () => {
      expect(ErrorCategory.NETWORK).toBe('network');
      expect(ErrorCategory.RESOURCE).toBe('resource');
      expect(ErrorCategory.TIMEOUT).toBe('timeout');
      expect(ErrorCategory.VALIDATION).toBe('validation');
      expect(ErrorCategory.RECOVERABLE).toBe('recoverable');
    });

    it('应该有正确的严重级别', () => {
      expect(ErrorSeverity.DEBUG).toBe('debug');
      expect(ErrorSeverity.INFO).toBe('info');
      expect(ErrorSeverity.WARNING).toBe('warning');
      expect(ErrorSeverity.ERROR).toBe('error');
    });
  });
}

// 运行测试
console.log('🧪 运行 ErrorHandler 单元测试...');

runTests().then(() => {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`测试结果: 通过 ${passCount}, 失败 ${failCount}`);
  console.log('═══════════════════════════════════════════════════════════');
  process.exit(failCount > 0 ? 1 : 0);
}).catch(err => {
  console.error('测试运行失败:', err);
  process.exit(1);
});
