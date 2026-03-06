/**
 * DTO - 执行器
 * 调用模块 API，捕获结果
 */

const { spawn } = require('child_process');
const path = require('path');
const { SKILLS_DIR } = require('../../shared/paths');

class Executor {
  constructor(options = {}) {
    // CRAS-C 知识治理任务需要更长的超时时间（向量化大量文档）
    this.timeout = options.timeout || 600000; // 默认10分钟（原为5分钟）
    this.retries = options.retries || 3;
    this.logs = [];
  }

  /**
   * 执行动作
   * @param {Object} action - 动作定义
   * @param {Object} context - 执行上下文
   * @returns {Object} 执行结果
   */
  async execute(action, context = {}) {
    console.log(`[DTO-Execute] 执行动作: ${action.type}`);

    const startTime = Date.now();

    try {
      let result;

      switch (action.type) {
        case 'module':
          result = await this.executeModule(action, context);
          break;
        case 'custom':
          result = await this.executeCustom(action, context);
          break;
        case 'notify':
          result = await this.executeNotify(action, context);
          break;
        default:
          throw new Error(`未知的动作类型: ${action.type}`);
      }

      const duration = Date.now() - startTime;

      // 记录日志
      this.logs.push({
        action: action.type,
        status: 'success',
        duration,
        timestamp: new Date().toISOString()
      });

      return {
        status: 'success',
        duration,
        ...result
      };

    } catch (e) {
      const duration = Date.now() - startTime;

      this.logs.push({
        action: action.type,
        status: 'failed',
        error: e.message,
        duration,
        timestamp: new Date().toISOString()
      });

      return {
        status: 'failed',
        error: e.message,
        duration
      };
    }
  }

  /**
   * 执行模块调用
   */
  async executeModule(action, context) {
    const { module, skill, action: skillAction, params } = action;

    console.log(`  调用模块: ${module}.${skill}.${skillAction}`);

    // 构建命令
    let cmd;
    switch (module) {
      case 'cras':
        cmd = `cd ${path.join(SKILLS_DIR, 'cras')} && node index.js --${skillAction}`;
        break;
      case 'isc':
        cmd = `cd ${path.join(SKILLS_DIR, 'isc-core')} && node index.js --${skillAction}`;
        break;
      case 'seef':
        // DTO直接调度SEEF子技能，SEEF仅作为子技能库
        cmd = `cd ${path.join(SKILLS_DIR, 'seef/subskills')} && python3 ${skill}.py`;
        break;
      case 'parallel-subagent':
        // 并行子Agent执行器
        return this.executeParallelSubagent(action, context);
      case 'github':
        return this.executeGitHubAPI(action, context);
      case 'evomap':
        return this.executeEvoMapA2A(action, context);
      case 'downloader':
        return this.executeFileDownloader(action, context);
      case 'aggregator':
        return this.executeAPIAggregator(action, context);
      default:
        throw new Error(`未知的模块: ${module}`);
    }

    // 执行命令
    return this.runCommand(cmd, params);
  }

  /**
   * 执行自定义脚本
   */
  async executeCustom(action, context) {
    const { script, interpreter, params } = action;

    console.log(`  执行脚本: ${script}`);

    const cmd = `${interpreter} ${script}`;
    return this.runCommand(cmd, params);
  }

  /**
   * 执行通知
   */
  async executeNotify(action, context) {
    const { channel, message } = action;

    console.log(`  发送通知: ${channel}`);

    // 简化实现，实际应调用消息工具
    return {
      channel,
      message,
      sent: true
    };
  }

  /**
   * 运行命令
   */
  runCommand(cmd, params = {}) {
    return new Promise((resolve, reject) => {
      // 添加参数
      const paramStr = Object.entries(params)
        .map(([k, v]) => `--${k} "${v}"`)
        .join(' ');

      const fullCmd = `${cmd} ${paramStr}`;

      const child = spawn('sh', ['-c', fullCmd], {
        timeout: this.timeout
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve({
            exitCode: code,
            stdout: stdout.trim(),
            stderr: stderr.trim()
          });
        } else {
          reject(new Error(`命令退出码 ${code}: ${stderr}`));
        }
      });

      child.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * 执行动作序列
   */
  async executeSequence(actions, context = {}) {
    const results = [];

    for (const action of actions) {
      const result = await this.execute(action, context);
      results.push(result);

      // 如果失败且不是最后一个动作，停止执行
      if (result.status === 'failed' && action !== actions[actions.length - 1]) {
        console.log('[DTO-Execute] 动作失败，停止序列');
        break;
      }
    }

    return results;
  }

  /**
   * 执行并行子Agent
   */
  async executeParallelSubagent(action, context) {
    const { workflow, params } = action;

    console.log(`  [并行子Agent] 执行工作流: ${workflow.name}`);

    const ParallelSubagentSpawner = require(path.join(SKILLS_DIR, 'parallel-subagent/index.js'));
    const spawner = new ParallelSubagentSpawner({
      label: workflow.name,
      model: params.model || process.env.OPENCLAW_DEFAULT_MODEL || 'default',
      timeout: params.timeout || 300
    });

    // 转换workflow为spawner格式
    const tasks = [];
    for (const stage of workflow.stages) {
      if (stage.type === 'parallel') {
        for (const agent of stage.agents) {
          tasks.push({
            name: `${stage.name}-${agent.role}`,
            prompt: agent.task,
            timeout: agent.timeout
          });
        }
      }
    }

    const results = await spawner.spawnBatch(tasks);

    return {
      status: 'completed',
      workflow: workflow.name,
      results: results,
      summary: {
        total: results.length,
        success: results.filter(r => r.status === 'fulfilled').length,
        failed: results.filter(r => r.status === 'rejected').length
      }
    };
  }

  /**
   * 执行GitHub API
   */
  async executeGitHubAPI(action, context) {
    const GitHubAPI = require(path.join(SKILLS_DIR, 'github-api/index.js'));
    const github = new GitHubAPI(action.token);

    switch (action.skillAction) {
      case 'getFile':
        return github.getFile(action.owner, action.repo, action.path, action.ref);
      case 'commitFile':
        return github.commitFile(action.owner, action.repo, action.path, action.content, action.message, action.branch);
      case 'paginate':
        return github.paginate(action.path, action.options);
      default:
        return github.request(action.path, action.options);
    }
  }

  /**
   * 执行EvoMap A2A
   */
  async executeEvoMapA2A(action, context) {
    const EvoMapA2A = require(path.join(SKILLS_DIR, 'evomap-a2a/index.js'));
    const evomap = new EvoMapA2A(action.config);

    if (action.skillAction === 'connect') {
      return evomap.connect();
    } else if (action.skillAction === 'publishGene') {
      evomap.publishGene(action.gene);
      return { status: 'published' };
    } else if (action.skillAction === 'publishCapsule') {
      evomap.publishCapsule(action.capsule);
      return { status: 'published' };
    }
  }

  /**
   * 执行文件下载
   */
  async executeFileDownloader(action, context) {
    const FileDownloader = require(path.join(SKILLS_DIR, 'file-downloader/index.js'));
    const downloader = new FileDownloader(action.options);

    if (action.skillAction === 'download') {
      return downloader.download(action.url, action.outputPath, action.options);
    } else if (action.skillAction === 'verify') {
      return downloader.verifyChecksum(action.filePath, action.expectedHash);
    }
  }

  /**
   * 执行API聚合
   */
  async executeAPIAggregator(action, context) {
    const APIAggregator = require(path.join(SKILLS_DIR, 'api-aggregator/index.js'));
    const aggregator = new APIAggregator(action.options);

    if (action.skillAction === 'parallel') {
      return aggregator.parallel(action.requests, action.options);
    } else if (action.skillAction === 'sequential') {
      return aggregator.sequential(action.requests, action.options);
    } else if (action.skillAction === 'merge') {
      return aggregator.mergeResults(action.results, action.options);
    }
  }

  /**
   * 获取执行日志
   */
  getLogs() {
    return this.logs;
  }
}

module.exports = Executor;
