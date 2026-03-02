// 重试管理器 - 指数退避 + 熔断器
import { RetryPolicy } from '../types';

export interface RetryContext {
  attempt: number;
  error: Error;
  lastDelay: number;
}

export class RetryManager {
  private policy: RetryPolicy;

  constructor(policy: RetryPolicy) {
    this.policy = policy;
  }

  updatePolicy(policy: RetryPolicy): void {
    this.policy = policy;
  }

  shouldRetry(context: RetryContext): boolean {
    // 检查重试次数
    if (context.attempt >= this.policy.maxRetries) {
      return false;
    }

    // 检查错误是否可重试
    if (this.policy.retryableErrors) {
      const errorType = this.classifyError(context.error);
      if (!this.policy.retryableErrors.includes(errorType)) {
        return false;
      }
    }

    return true;
  }

  async waitForRetry(context: RetryContext): Promise<void> {
    const delay = this.calculateDelay(context);
    
    if (delay > 0) {
      await this.sleep(delay);
    }
  }

  calculateDelay(context: RetryContext): number {
    const { attempt } = context;
    
    let delay: number;
    
    switch (this.policy.backoff) {
      case 'fixed':
        delay = this.policy.baseDelay;
        break;
        
      case 'linear':
        delay = this.policy.baseDelay * attempt;
        break;
        
      case 'exponential':
      default:
        delay = this.policy.baseDelay * Math.pow(2, attempt - 1);
        break;
    }

    // 添加抖动（避免惊群）
    const jitter = delay * 0.1 * (Math.random() - 0.5);
    delay += jitter;

    // 限制最大延迟
    return Math.min(delay, this.policy.maxDelay);
  }

  private classifyError(error: Error): string {
    const message = error.message.toLowerCase();
    
    if (message.includes('timeout') || message.includes('etimedout')) {
      return 'timeout';
    }
    
    if (message.includes('connection') || message.includes('econn')) {
      return 'connection_error';
    }
    
    if (message.includes('429') || message.includes('rate limit') || message.includes('too many requests')) {
      return 'rate_limit';
    }
    
    if (message.includes('503') || message.includes('service unavailable')) {
      return 'service_unavailable';
    }
    
    if (message.includes('504') || message.includes('gateway timeout')) {
      return 'gateway_timeout';
    }
    
    if (message.includes('500') || message.includes('internal server error')) {
      return 'server_error';
    }
    
    if (message.includes('token') || message.includes('context length')) {
      return 'token_limit';
    }
    
    return 'unknown';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 获取重试信息
  getRetryInfo(context: RetryContext): {
    shouldRetry: boolean;
    nextDelay: number;
    attemptsLeft: number;
  } {
    return {
      shouldRetry: this.shouldRetry(context),
      nextDelay: this.calculateDelay(context),
      attemptsLeft: this.policy.maxRetries - context.attempt
    };
  }
}

// 熔断器
export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  halfOpenMaxCalls?: number;
}

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export class CircuitBreaker {
  private config: CircuitBreakerConfig;
  private state: CircuitState = 'CLOSED';
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number = 0;
  private halfOpenCalls: number = 0;

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
  }

  getState(): CircuitState {
    // 检查是否需要从OPEN切换到HALF_OPEN
    if (this.state === 'OPEN') {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      if (timeSinceLastFailure >= this.config.resetTimeout) {
        this.state = 'HALF_OPEN';
        this.halfOpenCalls = 0;
      }
    }

    return this.state;
  }

  canExecute(): boolean {
    const state = this.getState();
    
    if (state === 'CLOSED') return true;
    if (state === 'OPEN') return false;
    
    // HALF_OPEN状态限制调用数
    if (state === 'HALF_OPEN') {
      const maxCalls = this.config.halfOpenMaxCalls || 2;
      return this.halfOpenCalls < maxCalls;
    }

    return false;
  }

  recordSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      this.halfOpenCalls++;
      
      // 连续成功，关闭熔断器
      if (this.successCount >= (this.config.halfOpenMaxCalls || 2)) {
        this.reset();
      }
    } else {
      this.failureCount = 0;
    }
  }

  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      this.halfOpenCalls++;
      // 在HALF_OPEN状态失败，重新打开
      this.state = 'OPEN';
    } else if (this.state === 'CLOSED') {
      if (this.failureCount >= this.config.failureThreshold) {
        this.state = 'OPEN';
      }
    }
  }

  reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenCalls = 0;
  }

  getStats(): {
    state: CircuitState;
    failureCount: number;
    successCount: number;
  } {
    return {
      state: this.getState(),
      failureCount: this.failureCount,
      successCount: this.successCount
    };
  }
}

export default { RetryManager, CircuitBreaker };
