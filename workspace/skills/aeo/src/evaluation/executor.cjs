/**
 * AEO 评测执行器 (Evaluation Executor)
 * LEP集成 - 批量执行评测用例
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { evaluateIntentCase, ARCHITECTURE_VERSION } = require('./intent-alignment.cjs');

/**
 * 评测执行器 - 集成LEP执行测试用例
 */
class EvaluationExecutor extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      lepPath: options.lepPath || path.join(__dirname, '../../../lep-executor'),
      batchSize: options.batchSize || 5,
      timeout: options.timeout || 60000,
      retryAttempts: options.retryAttempts || 2,
      ...options
    };
    
    // LEP实例
    this.lep = null;
    
    // 初始化LEP
    this._initLEP();
  }
  
  /**
   * 初始化LEP执行器
   */
  _initLEP() {
    try {
      const lepModule = require(path.join(this.options.lepPath, 'src/core/LEPExecutor.js'));
      this.LEPExecutor = lepModule.LEPExecutor || lepModule;
      this.lep = new this.LEPExecutor({
        retryPolicy: {
          maxRetries: this.options.retryAttempts,
          baseDelay: 1000
        },
        timeout: {
          default: this.options.timeout
        }
      });
      console.log('[EvaluationExecutor] LEP initialized');
    } catch (error) {
      console.warn(`[EvaluationExecutor] LEP not available, using fallback: ${error.message}`);
      this.lep = null;
    }
  }
  
  /**
   * 批量执行测试用例
   * @param {Array} testCases - 测试用例列表
   * @param {Object} context - 执行上下文
   * @returns {Promise<Array>} 执行结果
   */
  async executeBatch(testCases, context = {}) {
    const results = [];
    const batchSize = context.batchSize || this.options.batchSize;
    
    console.log(`[EvaluationExecutor] Executing ${testCases.length} test cases in batches of ${batchSize}`);
    
    // 分批处理
    for (let i = 0; i < testCases.length; i += batchSize) {
      const batch = testCases.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(testCases.length / batchSize);
      
      console.log(`[EvaluationExecutor] Processing batch ${batchNumber}/${totalBatches}`);
      
      // 并行执行批次
      const batchPromises = batch.map((testCase, index) => 
        this._executeTestCase(testCase, {
          ...context,
          index: i + index,
          batchNumber,
          totalBatches
        })
      );
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      // 处理结果
      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        const testCase = batch[j];
        
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            testCaseId: testCase.id,
            status: 'error',
            error: result.reason?.message || 'Unknown error',
            duration: 0,
            timestamp: new Date().toISOString()
          });
        }
      }
      
      // 触发批次完成事件
      this.emit('batch:completed', {
        batchNumber,
        totalBatches,
        results: batchResults
      });
    }
    
    return results;
  }
  
  /**
   * 执行单个测试用例
   * @param {Object} testCase - 测试用例
   * @param {Object} context - 执行上下文
   * @returns {Promise<Object>} 执行结果
   */
  async _executeTestCase(testCase, context) {
    const startTime = Date.now();
    const testCaseId = testCase.id || `tc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      this.emit('test:started', { testCaseId, testCase, context });
      
      // 构建执行配置
      const executionConfig = this._buildExecutionConfig(testCase, context);
      
      let result;
      
      if (this.lep) {
        // 使用LEP执行
        result = await this._executeWithLEP(executionConfig);
      } else {
        // 使用fallback执行
        result = await this._executeFallback(executionConfig);
      }
      
      const duration = Date.now() - startTime;
      
      // 评估结果
      const evaluation = this._evaluateResult(testCase, result);
      
      const finalResult = {
        testCaseId,
        status: evaluation.passed ? 'passed' : 'failed',
        testCase,
        actualOutput: result.output || result,
        expectedOutput: testCase.expected,
        evaluation,
        duration,
        timestamp: new Date().toISOString(),
        metadata: {
          batchNumber: context.batchNumber,
          totalBatches: context.totalBatches,
          ...result.metadata
        }
      };
      
      this.emit('test:completed', { testCaseId, result: finalResult });
      
      return finalResult;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      const errorResult = {
        testCaseId,
        status: 'error',
        testCase,
        error: error.message,
        duration,
        timestamp: new Date().toISOString()
      };
      
      this.emit('test:error', { testCaseId, error, result: errorResult });
      
      return errorResult;
    }
  }
  
  /**
   * 使用LEP执行
   * @param {Object} config - 执行配置
   * @returns {Promise<Object>} 执行结果
   */
  async _executeWithLEP(config) {
    const task = {
      type: config.type || 'evaluation',
      payload: config,
      retryPolicy: {
        maxRetries: this.options.retryAttempts
      },
      timeout: config.timeout || this.options.timeout
    };
    
    try {
      const result = await this.lep.execute(task);
      return result.result || result;
    } catch (error) {
      // 如果LEP执行失败，尝试fallback
      console.warn(`[EvaluationExecutor] LEP execution failed, using fallback: ${error.message}`);
      return this._executeFallback(config);
    }
  }
  
  /**
   * Fallback执行（当LEP不可用时）
   * @param {Object} config - 执行配置
   * @returns {Promise<Object>} 执行结果
   */
  async _executeFallback(config) {
    const { testCase, context } = config;
    
    // 根据测试类型执行
    switch (testCase.type) {
      case 'function':
        return this._executeFunctionTest(testCase, context);
      case 'skill':
        return this._executeSkillTest(testCase, context);
      case 'api':
        return this._executeApiTest(testCase, context);
      case 'prompt':
        return this._executePromptTest(testCase, context);
      default:
        return this._executeGenericTest(testCase, context);
    }
  }
  
  /**
   * 执行函数测试
   */
  async _executeFunctionTest(testCase, context) {
    try {
      const fn = testCase.function || (() => null);
      const args = testCase.args || [];
      const output = await fn(...args);
      
      return {
        output,
        metadata: { type: 'function' }
      };
    } catch (error) {
      throw new Error(`Function execution failed: ${error.message}`);
    }
  }
  
  /**
   * 执行技能测试
   */
  async _executeSkillTest(testCase, context) {
    try {
      const skillPath = testCase.skillPath || context.skillPath;
      if (!skillPath) {
        throw new Error('Skill path not specified');
      }
      
      const skill = require(path.resolve(skillPath));
      const method = testCase.method || 'default';
      const args = testCase.args || [];
      
      let output;
      if (typeof skill[method] === 'function') {
        output = await skill[method](...args);
      } else if (typeof skill === 'function') {
        output = await skill(...args);
      } else {
        output = skill;
      }
      
      return {
        output,
        metadata: { type: 'skill', path: skillPath, method }
      };
    } catch (error) {
      throw new Error(`Skill execution failed: ${error.message}`);
    }
  }
  
  /**
   * 执行API测试
   */
  async _executeApiTest(testCase, context) {
    // 模拟API调用
    const { endpoint, method = 'GET', body, headers = {} } = testCase;
    
    // 这里可以集成实际的HTTP客户端
    console.log(`[EvaluationExecutor] API Test: ${method} ${endpoint}`);
    
    return {
      output: { status: 200, data: { simulated: true } },
      metadata: { type: 'api', endpoint, method }
    };
  }
  
  /**
   * 执行Prompt测试
   */
  async _executePromptTest(testCase, context) {
    const { prompt, systemPrompt, context: promptContext = {} } = testCase;

    if (testCase.intentEvaluation && typeof testCase.intentExtractor === 'function') {
      const predictedIntents = await Promise.resolve(
        testCase.intentExtractor({
          prompt,
          systemPrompt,
          promptContext,
          testCase,
          context
        })
      );

      const judgment = evaluateIntentCase({
        chunk: testCase.chunk || prompt || '',
        expected: testCase.expected || [],
        predicted: predictedIntents || [],
        requireTargetAlignment: !!testCase.requireTargetAlignment,
      });

      return {
        output: {
          predictedIntents: predictedIntents || [],
          judgment,
        },
        metadata: {
          type: 'prompt',
          promptLength: prompt?.length,
          evaluationPolicy: 'llm_primary_keyword_regex_auxiliary',
          architectureVersion: ARCHITECTURE_VERSION,
          sandboxSafe: true,
        }
      };
    }
    
    // 模拟LLM调用
    console.log(`[EvaluationExecutor] Prompt Test: ${prompt.slice(0, 50)}...`);
    
    return {
      output: `Simulated response for: ${prompt.slice(0, 30)}...`,
      metadata: { type: 'prompt', promptLength: prompt?.length }
    };
  }
  
  /**
   * 通用测试执行
   */
  async _executeGenericTest(testCase, context) {
    // 延迟模拟
    await new Promise(r => setTimeout(r, 50));
    
    return {
      output: testCase.mockOutput || { simulated: true },
      metadata: { type: 'generic' }
    };
  }
  
  /**
   * 评估测试结果
   * @param {Object} testCase - 测试用例
   * @param {Object} result - 实际结果
   * @returns {Object} 评估结果
   */
  _evaluateResult(testCase, result) {
    if (testCase.intentEvaluation) {
      const judgment = result?.output?.judgment || { passed: false, score: 0, reason: 'Missing LLM intent judgment' };
      return {
        passed: !!judgment.passed,
        score: typeof judgment.score === 'number' ? judgment.score : 0,
        dimension: 'accuracy',
        policy: 'llm_primary_keyword_regex_auxiliary',
        architectureVersion: ARCHITECTURE_VERSION,
        llmPrimary: judgment.llmPrimary,
        auxiliaryCrossCheck: judgment.auxiliaryCrossCheck,
      };
    }

    const expected = testCase.expected;
    const actual = result.output;
    
    if (!expected) {
      return { passed: true, score: 1.0, reason: 'No expectation defined' };
    }
    
    // 根据评估类型进行匹配
    switch (testCase.evalType || 'exact') {
      case 'exact':
        return this._evaluateExact(expected, actual);
      case 'contains':
        return this._evaluateContains(expected, actual);
      case 'similarity':
        return this._evaluateSimilarity(expected, actual);
      case 'function':
        return this._evaluateWithFunction(testCase.evaluator, expected, actual);
      case 'regex':
        return this._evaluateRegex(expected, actual);
      default:
        return { passed: true, score: 1.0 };
    }
  }
  
  _evaluateExact(expected, actual) {
    const passed = JSON.stringify(expected) === JSON.stringify(actual);
    return {
      passed,
      score: passed ? 1.0 : 0.0,
      expected,
      actual
    };
  }
  
  _evaluateContains(expected, actual) {
    const actualStr = typeof actual === 'string' ? actual : JSON.stringify(actual);
    const expectedStr = typeof expected === 'string' ? expected : JSON.stringify(expected);
    const passed = actualStr.includes(expectedStr);
    
    return {
      passed,
      score: passed ? 1.0 : 0.0,
      contains: expectedStr,
      actual: actualStr
    };
  }
  
  _evaluateSimilarity(expected, actual) {
    // 简化的相似度计算
    const expectedStr = typeof expected === 'string' ? expected : JSON.stringify(expected);
    const actualStr = typeof actual === 'string' ? actual : JSON.stringify(actual);
    
    // 使用简单Jaccard相似度
    const set1 = new Set(expectedStr.toLowerCase().split(/\s+/));
    const set2 = new Set(actualStr.toLowerCase().split(/\s+/));
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    const score = intersection.size / union.size;
    
    return {
      passed: score >= 0.7,
      score,
      threshold: 0.7
    };
  }
  
  _evaluateWithFunction(evaluatorFn, expected, actual) {
    try {
      if (typeof evaluatorFn === 'function') {
        const result = evaluatorFn(expected, actual);
        return {
          passed: result.passed || result === true,
          score: result.score || (result ? 1.0 : 0.0),
          details: result
        };
      }
      return { passed: true, score: 1.0 };
    } catch (error) {
      return { passed: false, score: 0.0, error: error.message };
    }
  }
  
  _evaluateRegex(pattern, actual) {
    const actualStr = typeof actual === 'string' ? actual : JSON.stringify(actual);
    const regex = new RegExp(pattern);
    const passed = regex.test(actualStr);
    
    return {
      passed,
      score: passed ? 1.0 : 0.0,
      pattern
    };
  }
  
  /**
   * 构建执行配置
   */
  _buildExecutionConfig(testCase, context) {
    return {
      testCase,
      context,
      timeout: testCase.timeout || this.options.timeout,
      type: testCase.type || 'generic'
    };
  }
  
  /**
   * 获取执行统计
   */
  getStats() {
    return {
      lepAvailable: this.lep !== null,
      options: this.options
    };
  }
}

module.exports = { EvaluationExecutor };
