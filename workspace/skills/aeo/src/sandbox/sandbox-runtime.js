/**
 * Sandbox Runtime - 沙盒内执行环境
 * @description 在Docker容器内接收任务并执行，与宿主机隔离
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

// 资源限制（硬限制，防止逃逸）
const RESOURCE_LIMITS = {
  maxExecutionTime: 60000,    // 60秒超时
  maxMemoryMB: 512,           // 512MB内存
  maxOutputSize: 1024 * 1024  // 1MB输出限制
};

/**
 * 主执行函数
 */
async function executeTask(taskPath) {
  const startTime = Date.now();
  
  try {
    // 读取任务定义
    const task = JSON.parse(fs.readFileSync(taskPath, 'utf8'));
    
    console.log(`[Sandbox] Executing task: ${task.id || 'unknown'}`);
    console.log(`[Sandbox] Type: ${task.type}`);
    
    let result;
    
    switch (task.type) {
      case 'javascript':
        result = await executeJavaScript(task);
        break;
      case 'test':
        result = await executeTests(task);
        break;
      case 'lint':
        result = await executeLint(task);
        break;
      case 'benchmark':
        result = await executeBenchmark(task);
        break;
      default:
        result = { error: `Unknown task type: ${task.type}` };
    }
    
    // 写入结果
    const resultPath = taskPath.replace('.json', '-result.json');
    const output = {
      taskId: task.id,
      status: result.error ? 'failed' : 'success',
      result: result,
      executionTime: Date.now() - startTime,
      timestamp: Date.now()
    };
    
    fs.writeFileSync(resultPath, JSON.stringify(output, null, 2));
    console.log(`[Sandbox] Task completed: ${resultPath}`);
    
    return output;
    
  } catch (error) {
    console.error(`[Sandbox] Execution failed:`, error.message);
    
    const errorResult = {
      taskId: path.basename(taskPath, '.json'),
      status: 'error',
      error: error.message,
      timestamp: Date.now()
    };
    
    const resultPath = taskPath.replace('.json', '-result.json');
    fs.writeFileSync(resultPath, JSON.stringify(errorResult, null, 2));
    
    return errorResult;
  }
}

/**
 * 执行JavaScript代码
 */
async function executeJavaScript(task) {
  const { code, input } = task;
  
  // 创建临时文件
  const tempFile = path.join('/workspace', `temp-${Date.now()}.js`);
  
  // 包装代码（捕获输出、限制资源）
  const wrappedCode = `
    const startTime = Date.now();
    const consoleOutput = [];
    
    // 重定向console
    const originalLog = console.log;
    console.log = (...args) => {
      const line = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
      consoleOutput.push(line);
      if (consoleOutput.join('\\n').length > ${RESOURCE_LIMITS.maxOutputSize}) {
        throw new Error('Output size limit exceeded');
      }
    };
    
    // 执行用户代码
    const userCode = ${JSON.stringify(code)};
    const userFn = new Function('input', userCode);
    
    const result = userFn(${JSON.stringify(input)});
    
    console.log = originalLog;
    
    {
      result: result,
      consoleOutput: consoleOutput,
      executionTime: Date.now() - startTime
    }
  `;
  
  fs.writeFileSync(tempFile, wrappedCode);
  
  try {
    // 使用timeout限制执行时间
    const { stdout } = await execAsync(
      `node --max-old-space-size=${RESOURCE_LIMITS.maxMemoryMB} ${tempFile}`,
      { timeout: RESOURCE_LIMITS.maxExecutionTime }
    );
    
    // 解析结果
    const result = eval(`(${stdout})`);
    
    // 清理
    fs.unlinkSync(tempFile);
    
    return {
      output: result.consoleOutput.join('\n'),
      result: result.result,
      executionTime: result.executionTime
    };
    
  } catch (error) {
    // 清理
    try { fs.unlinkSync(tempFile); } catch (e) {}
    
    if (error.killed || error.signal === 'SIGTERM') {
      return { error: 'Execution timeout' };
    }
    if (error.message.includes('ENOMEM')) {
      return { error: 'Memory limit exceeded' };
    }
    return { error: error.message };
  }
}

/**
 * 执行测试
 */
async function executeTests(task) {
  const { testFiles, coverage } = task;
  
  const args = ['npx'];
  
  if (coverage) {
    args.push('nyc', '--reporter=json', '--reporter=text');
  }
  
  args.push('mocha', '--reporter=json');
  
  if (testFiles && testFiles.length > 0) {
    args.push(...testFiles);
  } else {
    args.push('__tests__/**/*.test.js');
  }
  
  try {
    const { stdout, stderr } = await execAsync(
      args.join(' '),
      { 
        timeout: RESOURCE_LIMITS.maxExecutionTime,
        cwd: '/workspace'
      }
    );
    
    // 解析Mocha JSON输出
    let testResults;
    try {
      testResults = JSON.parse(stdout);
    } catch {
      testResults = { raw: stdout };
    }
    
    // 读取覆盖率报告
    let coverageReport = null;
    if (coverage && fs.existsSync('/workspace/coverage/coverage-final.json')) {
      coverageReport = JSON.parse(fs.readFileSync('/workspace/coverage/coverage-final.json', 'utf8'));
    }
    
    return {
      tests: testResults,
      coverage: coverageReport,
      stderr: stderr
    };
    
  } catch (error) {
    return {
      error: error.message,
      stderr: error.stderr,
      stdout: error.stdout
    };
  }
}

/**
 * 执行代码检查
 */
async function executeLint(task) {
  const { files, fix = false } = task;
  
  const args = ['npx', 'eslint', '--format', 'json'];
  
  if (fix) {
    args.push('--fix');
  }
  
  if (files && files.length > 0) {
    args.push(...files);
  } else {
    args.push('.');
  }
  
  try {
    const { stdout } = await execAsync(
      args.join(' '),
      { 
        timeout: 30000,
        cwd: '/workspace'
      }
    );
    
    return {
      results: JSON.parse(stdout),
      fixed: fix
    };
    
  } catch (error) {
    // ESLint返回非0退出码但输出仍然有效
    return {
      results: error.stdout ? JSON.parse(error.stdout) : null,
      error: error.message,
      exitCode: error.code
    };
  }
}

/**
 * 执行性能基准测试
 */
async function executeBenchmark(task) {
  const { code, iterations = 100 } = task;
  
  const benchmarkCode = `
    const Benchmark = require('benchmark');
    const suite = new Benchmark.Suite();
    
    const userFn = ${code};
    
    suite.add('User Function', userFn);
    
    suite.on('complete', function() {
      const result = {
        name: this[0].name,
        hz: this[0].hz,
        mean: this[0].stats.mean,
        deviation: this[0].stats.deviation,
        samples: this[0].stats.sample.length
      };
      console.log(JSON.stringify(result));
    });
    
    suite.run({ async: false });
  `;
  
  const tempFile = path.join('/workspace', `benchmark-${Date.now()}.js`);
  fs.writeFileSync(tempFile, benchmarkCode);
  
  try {
    const { stdout } = await execAsync(
      `node ${tempFile}`,
      { timeout: 60000 }
    );
    
    fs.unlinkSync(tempFile);
    
    return {
      benchmark: JSON.parse(stdout)
    };
    
  } catch (error) {
    try { fs.unlinkSync(tempFile); } catch (e) {}
    return { error: error.message };
  }
}

// ============================================================================
// 主入口
// ============================================================================

const taskPath = process.argv[2];

if (!taskPath) {
  console.error('Usage: node sandbox-runtime.js <task-path>');
  process.exit(1);
}

if (!fs.existsSync(taskPath)) {
  console.error(`Task file not found: ${taskPath}`);
  process.exit(1);
}

executeTask(taskPath).then(result => {
  process.exit(result.status === 'success' ? 0 : 1);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
