#!/usr/bin/env node
/**
 * API聚合技能 v1.0
 * 并行调用、超时控制、结果合并
 */

class APIAggregator {
  constructor(options = {}) {
    this.defaultTimeout = options.timeout || 30000;
    this.maxConcurrency = options.maxConcurrency || 5;
  }

  /**
   * 并行调用多个API
   */
  async parallel(requests, options = {}) {
    const timeout = options.timeout || this.defaultTimeout;
    const results = [];
    
    console.log(`[API聚合] 并行调用 ${requests.length} 个API，超时${timeout}ms`);

    // 分批处理，控制并发
    for (let i = 0; i < requests.length; i += this.maxConcurrency) {
      const batch = requests.slice(i, i + this.maxConcurrency);
      
      const batchPromises = batch.map((req, idx) => 
        this.callWithTimeout(req, timeout, i + idx)
      );

      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults);
    }

    // 统计结果
    const success = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    console.log(`[API聚合] 完成: ${success}成功, ${failed}失败`);

    return {
      results: results.map((r, i) => ({
        request: requests[i],
        status: r.status,
        data: r.status === 'fulfilled' ? r.value : null,
        error: r.status === 'rejected' ? r.reason?.message : null
      })),
      summary: { total: results.length, success, failed }
    };
  }

  /**
   * 带超时的API调用
   */
  async callWithTimeout(request, timeout, index) {
    const startTime = Date.now();
    
    return new Promise(async (resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`API ${index} 超时`));
      }, timeout);

      try {
        const result = await this.executeRequest(request);
        clearTimeout(timer);
        console.log(`[API聚合] API ${index} 成功 (${Date.now() - startTime}ms)`);
        resolve(result);
      } catch (err) {
        clearTimeout(timer);
        console.log(`[API聚合] API ${index} 失败: ${err.message}`);
        reject(err);
      }
    });
  }

  /**
   * 执行单个请求
   */
  async executeRequest(request) {
    if (typeof request === 'function') {
      return await request();
    }
    
    if (request.url) {
      // HTTP请求 - 使用Node.js内置fetch (v18+)
      const response = await fetch(request.url, {
        method: request.method || 'GET',
        headers: request.headers,
        body: request.body ? JSON.stringify(request.body) : undefined
      });
      return await response.json();
    }

    throw new Error('不支持的请求类型');
  }

  /**
   * 顺序调用（有依赖关系）
   */
  async sequential(requests, options = {}) {
    const results = [];
    
    console.log(`[API聚合] 顺序调用 ${requests.length} 个API`);

    for (let i = 0; i < requests.length; i++) {
      try {
        const result = await this.callWithTimeout(
          requests[i], 
          options.timeout || this.defaultTimeout,
          i
        );
        results.push({ status: 'fulfilled', value: result });
      } catch (err) {
        results.push({ status: 'rejected', reason: err });
        if (options.stopOnError) break;
      }
    }

    return {
      results: results.map((r, i) => ({
        request: requests[i],
        status: r.status,
        data: r.status === 'fulfilled' ? r.value : null,
        error: r.status === 'rejected' ? r.reason?.message : null
      })),
      summary: {
        total: results.length,
        success: results.filter(r => r.status === 'fulfilled').length,
        failed: results.filter(r => r.status === 'rejected').length
      }
    };
  }

  /**
   * 合并结果（去重、排序）
   */
  mergeResults(results, options = {}) {
    const allData = results
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value?.data || r.value || []);

    // 去重
    const uniqueKey = options.uniqueKey || 'id';
    const seen = new Set();
    const unique = allData.filter(item => {
      const key = item[uniqueKey];
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // 排序
    if (options.sortBy) {
      unique.sort((a, b) => {
        const aVal = a[options.sortBy];
        const bVal = b[options.sortBy];
        return options.sortDesc ? bVal - aVal : aVal - bVal;
      });
    }

    return unique;
  }
}

module.exports = APIAggregator;
