# EvoMap发布器与SEEF+DTO集成方案

> **分析Agent**: 智谱GLM-5 (并行分析)  
> **分析时间**: 2026-03-01  
> **版本**: v1.0.0  
> **关联**: 与Claude-Opus分析(10号Agent)进行对比验证

---

## 1. 执行摘要

本方案定义了**EvoMap极简发布器(EP)**与**SEEF技能生态进化工厂**、**DTO声明式任务编排中心**的集成接口规范，实现技能从开发到EvoMap网络发布的零人工干预闭环。

### 核心目标
- 简化EP状态机：从9状态压缩至**3状态** (IDLE→PUBLISHING→PUBLISHED/FAILED)
- 标准化EP与DTO的事件驱动交互
- 定义清晰的职责边界和错误处理策略

---

## 2. 系统职责边界

```
┌─────────────────────────────────────────────────────────────────┐
│                    技能发布全链路职责划分                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    │
│   │  SEEF   │───▶│  DTO    │───▶│   EP    │───▶│ EvoMap  │    │
│   │ (开发)  │    │ (编排)  │    │ (发布)  │    │ (网络)  │    │
│   └─────────┘    └─────────┘    └─────────┘    └─────────┘    │
│        │              │              │              │          │
│        ▼              ▼              ▼              ▼          │
│   技能评估/优化   工作流调度     网络发布协议    A2A Hub        │
│   验证/创造       事件编排       Gene/Capsule   基因存储        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

| 系统 | 核心职责 | 明确不包含 |
|:-----|:---------|:-----------|
| **SEEF** | 技能评估、发现、优化、创造、验证、记录 | 网络发布、WebSocket协议 |
| **DTO** | 任务编排、事件订阅、工作流调度 | 技能开发、EvoMap协议 |
| **EP** | 网络发布、A2A协议、状态同步 | 技能开发/测试/审核 |

---

## 3. 集成接口设计

### 3.1 DTO → EP 指令接口

EP暴露给DTO的调用接口，用于触发技能发布。

```typescript
// ============================================
// 发布请求接口 (DTO → EP)
// ============================================

interface PublishRequest {
  /** 技能唯一标识 */
  skillId: string;
  
  /** 技能版本号 (semver格式) */
  version: string;
  
  /** 优先级 */
  priority: 'high' | 'normal' | 'low';
  
  /** SEEF验证结果引用 */
  seefValidation: {
    validationId: string;
    score: number;
    passed: boolean;
    timestamp: string;
    reportUrl?: string;
  };
  
  /** 重试策略 */
  retryPolicy?: {
    maxRetries: number;        // 默认: 3
    backoff: number[];         // 默认: [1000, 2000, 4000] ms
  };
  
  /** DTO任务上下文 */
  dtoContext?: {
    taskId: string;
    traceId: string;
    callbackUrl: string;
  };
}

// EP主类定义
interface EvoMapPublisher {
  /**
   * DTO调用入口 - 触发技能发布
   * @returns Promise<PublishResult> 异步返回发布结果
   */
  publish(request: PublishRequest): Promise<PublishResult>;
  
  /**
   * 批量发布接口
   */
  publishBatch(requests: PublishRequest[]): Promise<PublishResult[]>;
  
  /**
   * 查询发布状态
   */
  getStatus(skillId: string, version: string): PublishStatus;
}
```

### 3.2 EP → DTO 回调接口

EP完成后通过DTO提供的事件系统回调结果。

```typescript
// ============================================
// 发布结果回调接口 (EP → DTO)
// ============================================

interface PublishSuccessResult {
  /** 状态标识 */
  status: 'PUBLISHED';
  
  /** 技能标识 */
  skillId: string;
  version: string;
  
  /** EvoMap网络标识 */
  geneId: string;
  capsuleId: string;
  evomapUrl: string;
  
  /** 时间戳 */
  timestamp: string;
  duration: number;  // 发布耗时(ms)
  
  /** Hub响应详情 */
  hubResponse: {
    hubId: string;
    confirmations: number;
    receiptHash: string;
  };
  
  /** 关联的DTO上下文 */
  dtoContext: {
    taskId: string;
    traceId: string;
  };
}

interface PublishFailureResult {
  /** 状态标识 */
  status: 'FAILED';
  
  /** 技能标识 */
  skillId: string;
  version: string;
  
  /** 错误详情 */
  error: {
    code: ErrorCode;
    message: string;
    stage: 'ISC_CHECK' | 'PACKAGING' | 'UPLOAD' | 'HUB_REJECT';
    retries: number;
    originalError?: any;
  };
  
  /** 时间戳 */
  timestamp: string;
  duration: number;
  
  /** 关联的DTO上下文 */
  dtoContext: {
    taskId: string;
    traceId: string;
  };
}

type PublishResult = PublishSuccessResult | PublishFailureResult;

type ErrorCode = 
  | 'ISC_EXPIRED'      // 验证结果过期(>24h)
  | 'SKILL_NOT_FOUND'  // 技能目录不存在
  | 'PACKAGING_ERROR'  // 打包失败
  | 'NETWORK_ERROR'    // 网络连接失败
  | 'HUB_REJECT'       // EvoMap Hub拒绝
  | 'TIMEOUT'          // 等待确认超时
  | 'RATE_LIMITED'     // 请求频率限制
  | 'INVALID_REQUEST'; // 请求参数无效
```

---

## 4. DTO事件订阅配置

### 4.1 基础事件订阅配置

```yaml
# ============================================
# DTO事件订阅配置 - EvoMap发布集成
# 文件位置: skills/dto-core/config/ep-subscriptions.yaml
# ============================================

version: "1.0.0"
description: "EvoMap发布器相关事件订阅配置"

# -------------------------------------------
# 事件订阅列表
# -------------------------------------------
subscriptions:
  
  # ==== 发布触发事件 ====
  - id: ep-publish-trigger
    name: "EP发布触发"
    description: "当SEEF完成技能验证后，触发EP发布"
    event:
      source: seef.validator
      type: validation.completed
      condition: |
        event.data.passed == true AND
        event.data.score >= 70 AND
        event.data.skill.status == 'candidate'
    action:
      type: publish
      target: evomap-publisher
      params:
        priority: normal
        retryPolicy:
          maxRetries: 3
          backoff: [1000, 2000, 4000]
    
  # ==== 发布完成事件 ====
  - id: ep-publish-completed
    name: "EP发布完成"
    description: "EP发布成功后，更新技能状态"
    event:
      source: evomap-publisher
      type: publish.completed
    action:
      type: update_status
      target: skill-registry
      params:
        status: 'published'
        sync_to_isc: true
    
  # ==== 发布失败事件 ====
  - id: ep-publish-failed
    name: "EP发布失败"
    description: "EP发布失败后，触发告警或重试"
    event:
      source: evomap-publisher
      type: publish.failed
    action:
      type: conditional
      conditions:
        - if: "event.data.error.retries < 3"
          then:
            type: retry
            delay: 5000
        - if: "event.data.error.retries >= 3"
          then:
            type: alert
            channels: [feishu, email]
            template: ep-publish-failed-alert
    
  # ==== 技能状态变更事件 ====
  - id: skill-status-changed
    name: "技能状态变更"
    description: "监听技能状态变化，触发相应处理"
    event:
      source: seef.state-manager
      type: status.changed
    action:
      type: route
      routes:
        - condition: "event.data.newStatus == 'RELEASE'"
          action: trigger_ep_publish
        - condition: "event.data.newStatus == 'FAILED'"
          action: trigger_alert
```

### 4.2 完整工作流定义

```yaml
# ============================================
# DTO工作流定义 - 技能发布流水线
# ============================================

id: skill-publish-pipeline
intent: "技能从验证到EvoMap发布的完整流水线"
version: "1.0.0"

triggers:
  - type: event
    source: seef.validator
    condition: "data.passed == true"
  - type: manual
    endpoint: /api/v1/publish

workflow:
  nodes:
    # Step 1: SEEF验证结果获取
    - id: fetch-validation
      name: "获取SEEF验证结果"
      action: seef.validator.getResult
      output: validationResult
      
    # Step 2: 前置检查
    - id: pre-check
      name: "发布前置检查"
      action: evomap-publisher.preCheck
      dependsOn: [fetch-validation]
      condition: "validationResult.passed == true"
      
    # Step 3: 调用EP发布
    - id: ep-publish
      name: "EvoMap发布"
      action: evomap-publisher.publish
      dependsOn: [pre-check]
      input:
        skillId: "{{trigger.skillId}}"
        version: "{{trigger.version}}"
        seefValidation: "{{validationResult}}"
        priority: "{{trigger.priority || 'normal'}}"
      retry:
        maxAttempts: 3
        backoff: exponential
        
    # Step 4: 发布后处理
    - id: post-process
      name: "发布后处理"
      action: skill-registry.update
      dependsOn: [ep-publish]
      input:
        skillId: "{{trigger.skillId}}"
        status: "published"
        evomapGeneId: "{{ep-publish.output.geneId}}"
        
  # 全局错误处理
  errorHandler:
    strategy: continue
    onError:
      - action: logger.error
      - action: feishu.notify
        template: publish-failed
        
  # 超时设置
  timeout:
    total: 300000    # 5分钟
    perNode: 60000   # 1分钟/节点
```

---

## 5. 数据流图

### 5.1 完整集成数据流

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        EvoMap发布集成数据流                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐                                                           │
│  │   SEEF       │                                                           │
│  │  (validator) │                                                           │
│  └──────┬───────┘                                                           │
│         │ ① validation.completed (skillId, score, passed)                   │
│         ▼                                                                   │
│  ┌──────────────┐     ② 匹配订阅规则     ┌──────────────┐                  │
│  │     DTO      │───────────────────────▶│  Event Bus   │                  │
│  │  (订阅系统)   │                        └──────┬───────┘                  │
│  └──────────────┘                               │                          │
│         │                                       │ ③ 触发workflow            │
│         │ ④ publish({skillId, version, ...})   ▼                          │
│         │──────────────────────────────────▶┌──────────────┐               │
│         │                                   │     EP       │               │
│         │                                   │  (发布器)     │               │
│         │                                   └──────┬───────┘               │
│         │                                          │                       │
│         │     ┌────────────────────────────────────┘                       │
│         │     │                                                            │
│         │     ▼ ⑤ ISC最终检查                                              │
│         │  ┌──────────┐                                                    │
│         │  │  ISC校验  │ (skillPath, validationResult)                      │
│         │  └────┬─────┘                                                    │
│         │       │                                                          │
│         │       ▼ ⑥ 打包                                                   │
│         │  ┌──────────┐                                                    │
│         │  │ Gene构建  │ (读取元数据, 构建Gene, 生成Capsule)                 │
│         │  └────┬─────┘                                                    │
│         │       │                                                          │
│         │       ▼ ⑦ WebSocket上传                                          │
│         │  ┌──────────┐                                                    │
│         │  │ EvoMap   │ (publishGene, publishCap)                          │
│         │  │   Hub    │                                                    │
│         │  └────┬─────┘                                                    │
│         │       │                                                          │
│         │       ▼ ⑧ Hub确认                                                │
│         │  (等待确认 receipt)                                               │
│         │                                                                  │
│         │     ┌────────────────────────────────────┐                       │
│         │     │            发布结果                │                       │
│         │     └────────────────────────────────────┘                       │
│         │                    │                                             │
│         │         ┌──────────┴──────────┐                                 │
│         │         ▼                     ▼                                 │
│         │    ┌─────────┐          ┌─────────┐                            │
│         │    │  成功   │          │  失败   │                            │
│         │    └────┬────┘          └────┬────┘                            │
│         │         │                    │                                  │
│  ┌──────┴─────────┘◄───────────────────┘                                  │
│  │ ⑨ 回调DTO (event)                                                       │
│  │    • publish.completed 或 publish.failed                                │
│  │    • geneId, capsuleId, errorInfo                                       │
│  │                                                                         │
│  ▼                                                                         │
│ ┌──────────────┐                                                           │
│ │     DTO      │ ⑩ 更新技能状态 / 触发告警                                 │
│ │ (状态更新)    │                                                           │
│ └──────────────┘                                                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 EP内部状态流转

```
┌─────────────────────────────────────────────────────────────────┐
│                  EvoMap发布器状态机 (3状态)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                         ┌─────────┐                            │
│     ┌───────────────────│  IDLE   │◄───────────────────┐       │
│     │                   │ (空闲)  │                    │       │
│     │                   └────┬────┘                    │       │
│     │                        │                         │       │
│     │   DTO.publish()        │    新任务入队            │       │
│     │   or Event触发         │                         │       │
│     │                        ▼                         │       │
│     │                   ┌─────────┐     重试           │       │
│     │                   │PUBLISHING◄───────────────────┘       │
│     │                   │(发布中)  │                            │
│     │                   └────┬────┘                            │
│     │                        │                                 │
│     │         ┌──────────────┼──────────────┐                  │
│     │         │              │              │                  │
│     │         ▼              │              ▼                  │
│     │    ┌─────────┐         │         ┌─────────┐            │
│     │    │PUBLISHED│◄────────┘         │ FAILED  │──────┐     │
│     │    │(已发布)  │  成功              │ (失败)  │      │     │
│     │    └────┬────┘                   └─────────┘      │     │
│     │         │                               ▲         │     │
│     └─────────┴───────────────────────────────┴─────────┘     │
│                   回调DTO，返回结果                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. 代码示例

### 6.1 EP实现示例

```javascript
// skills/evomap-publisher/src/publisher.js

const EventEmitter = require('events');
const WebSocket = require('ws');

class EvoMapPublisher extends EventEmitter {
  constructor(config = {}) {
    super();
    this.hubUrl = config.hubUrl || process.env.EVOMAP_HUB_URL;
    this.maxRetries = config.maxRetries || 3;
    this.backoff = config.backoff || [1000, 2000, 4000];
    this.timeout = config.timeout || 30000;
    
    // 状态管理
    this.state = 'IDLE';
    this.queue = [];
    this.currentTask = null;
  }

  /**
   * DTO调用入口 - 发布技能
   */
  async publish(request) {
    const { skillId, version, priority = 'normal', seefValidation, dtoContext } = request;
    
    console.log(`[EP] 接收发布请求: ${skillId}@${version}`);
    
    // 加入队列
    const task = {
      id: `${skillId}@${version}`,
      skillId,
      version,
      priority,
      seefValidation,
      dtoContext,
      retries: 0,
      createdAt: Date.now()
    };
    
    this.queue.push(task);
    this.queue.sort((a, b) => this.priorityWeight(b.priority) - this.priorityWeight(a.priority));
    
    // 触发处理
    if (this.state === 'IDLE') {
      this.processQueue();
    }
    
    return { accepted: true, taskId: task.id };
  }

  /**
   * 处理队列
   */
  async processQueue() {
    if (this.queue.length === 0) {
      this.state = 'IDLE';
      return;
    }
    
    this.currentTask = this.queue.shift();
    this.state = 'PUBLISHING';
    
    try {
      const result = await this.executePublish(this.currentTask);
      await this.handleSuccess(result);
    } catch (error) {
      await this.handleError(error);
    }
  }

  /**
   * 执行发布流程
   */
  async executePublish(task) {
    const { skillId, version, seefValidation } = task;
    
    // Step 1: ISC最终检查
    console.log(`[EP] Step 1: ISC最终检查 ${skillId}`);
    const checkResult = await this.iscFinalCheck(seefValidation);
    if (!checkResult.passed) {
      throw new Error(`ISC_CHECK_FAILED: ${checkResult.reason}`);
    }
    
    // Step 2: 打包
    console.log(`[EP] Step 2: 打包 ${skillId}`);
    const packageResult = await this.packaging(skillId, version);
    
    // Step 3: WebSocket上传
    console.log(`[EP] Step 3: 上传至EvoMap ${skillId}`);
    const uploadResult = await this.uploadToEvoMap(packageResult);
    
    return {
      skillId,
      version,
      geneId: uploadResult.geneId,
      capsuleId: uploadResult.capsuleId,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * ISC最终检查
   */
  async iscFinalCheck(validation) {
    // 检查验证结果是否过期(>24h)
    const validationTime = new Date(validation.timestamp).getTime();
    const now = Date.now();
    const hoursSinceValidation = (now - validationTime) / (1000 * 60 * 60);
    
    if (hoursSinceValidation > 24) {
      return { passed: false, reason: 'ISC_EXPIRED', code: 'ISC_EXPIRED' };
    }
    
    // 检查分数
    if (validation.score < 70) {
      return { passed: false, reason: 'SCORE_TOO_LOW', code: 'VALIDATION_FAILED' };
    }
    
    return { passed: true };
  }

  /**
   * 打包技能
   */
  async packaging(skillId, version) {
    const skillPath = `/root/.openclaw/workspace/skills/${skillId}`;
    
    // 读取SKILL.md
    const skillMd = await fs.readFile(`${skillPath}/SKILL.md`, 'utf8');
    
    // 构建Gene
    const gene = {
      id: `${skillId}-${version}`,
      name: skillId,
      version: version,
      content: skillMd,
      metadata: {
        createdAt: new Date().toISOString(),
        source: 'seef'
      }
    };
    
    // 构建Capsule
    const capsule = {
      geneId: gene.id,
      payload: gene,
      signature: await this.sign(gene)
    };
    
    return { gene, capsule };
  }

  /**
   * 上传至EvoMap Hub
   */
  async uploadToEvoMap(packageData) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.hubUrl);
      
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('UPLOAD_TIMEOUT'));
      }, this.timeout);
      
      ws.on('open', () => {
        // 发送publishGene请求
        ws.send(JSON.stringify({
          type: 'publishGene',
          data: packageData.gene
        }));
      });
      
      ws.on('message', (data) => {
        const response = JSON.parse(data);
        
        if (response.type === 'genePublished') {
          // 继续发布Capsule
          ws.send(JSON.stringify({
            type: 'publishCap',
            data: packageData.capsule
          }));
        } else if (response.type === 'capPublished') {
          clearTimeout(timeout);
          ws.close();
          resolve({
            geneId: packageData.gene.id,
            capsuleId: response.capsuleId
          });
        } else if (response.type === 'error') {
          clearTimeout(timeout);
          ws.close();
          reject(new Error(`HUB_REJECT: ${response.message}`));
        }
      });
      
      ws.on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`NETWORK_ERROR: ${err.message}`));
      });
    });
  }

  /**
   * 处理发布成功
   */
  async handleSuccess(result) {
    const { dtoContext } = this.currentTask;
    
    const successResult = {
      status: 'PUBLISHED',
      skillId: result.skillId,
      version: result.version,
      geneId: result.geneId,
      capsuleId: result.capsuleId,
      timestamp: result.timestamp,
      dtoContext
    };
    
    // 回调DTO
    await this.callbackDTO('publish.completed', successResult);
    
    // 触发事件
    this.emit('published', successResult);
    
    // 继续处理队列
    this.state = 'IDLE';
    this.processQueue();
  }

  /**
   * 处理发布失败
   */
  async handleError(error) {
    const { retries, dtoContext } = this.currentTask;
    
    // 检查是否可重试
    if (retries < this.maxRetries && this.isRetryableError(error)) {
      console.log(`[EP] 第${retries + 1}次重试...`);
      this.currentTask.retries++;
      
      // 指数退避
      const delay = this.backoff[retries] || this.backoff[this.backoff.length - 1];
      await this.sleep(delay);
      
      // 重新入队
      this.queue.unshift(this.currentTask);
      this.state = 'IDLE';
      this.processQueue();
      return;
    }
    
    // 最终失败
    const failureResult = {
      status: 'FAILED',
      skillId: this.currentTask.skillId,
      version: this.currentTask.version,
      error: {
        code: this.extractErrorCode(error),
        message: error.message,
        stage: this.extractErrorStage(error),
        retries: retries
      },
      timestamp: new Date().toISOString(),
      dtoContext
    };
    
    // 回调DTO
    await this.callbackDTO('publish.failed', failureResult);
    
    // 触发事件
    this.emit('failed', failureResult);
    
    // 继续处理队列
    this.state = 'IDLE';
    this.processQueue();
  }

  /**
   * 回调DTO
   */
  async callbackDTO(eventType, data) {
    const { callbackUrl } = data.dtoContext || {};
    if (!callbackUrl) {
      console.warn('[EP] 无回调URL，跳过回调');
      return;
    }
    
    try {
      await fetch(callbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: eventType,
          timestamp: new Date().toISOString(),
          data
        })
      });
    } catch (err) {
      console.error('[EP] 回调DTO失败:', err.message);
    }
  }

  // 辅助方法
  priorityWeight(priority) {
    const weights = { high: 3, normal: 2, low: 1 };
    return weights[priority] || 1;
  }
  
  isRetryableError(error) {
    const retryableCodes = ['NETWORK_ERROR', 'TIMEOUT', 'PACKAGING_ERROR'];
    return retryableCodes.some(code => error.message.includes(code));
  }
  
  extractErrorCode(error) {
    const match = error.message.match(/^(\w+):/);
    return match ? match[1] : 'UNKNOWN_ERROR';
  }
  
  extractErrorStage(error) {
    if (error.message.includes('ISC')) return 'ISC_CHECK';
    if (error.message.includes('pack')) return 'PACKAGING';
    if (error.message.includes('upload') || error.message.includes('Hub')) return 'UPLOAD';
    return 'UNKNOWN';
  }
  
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  async sign(data) {
    // 签名实现
    return 'signature-placeholder';
  }
}

module.exports = EvoMapPublisher;
```

### 6.2 DTO工作流调用示例

```javascript
// skills/dto-core/workflows/ep-integration.js

const { WorkflowEngine } = require('../core/engine');

/**
 * 注册EvoMap发布工作流
 */
function registerEPWorkflows(dto) {
  
  // 工作流1: SEEF验证后自动发布
  dto.registerTask({
    id: 'auto-publish-after-validation',
    intent: 'SEEF验证通过后自动发布到EvoMap',
    
    triggers: [{
      type: 'event',
      source: 'seef.validator',
      condition: (event) => event.data.passed && event.data.score >= 70
    }],
    
    workflow: {
      nodes: [
        {
          id: 'check-existing',
          action: async (ctx) => {
            const { skillId, version } = ctx.trigger.data;
            const existing = await ctx.services.skillRegistry.get(skillId, version);
            return { shouldSkip: existing && existing.status === 'published' };
          }
        },
        {
          id: 'ep-publish',
          action: async (ctx) => {
            if (ctx.results['check-existing'].shouldSkip) {
              return { skipped: true };
            }
            
            const publisher = ctx.services.evomapPublisher;
            return await publisher.publish({
              skillId: ctx.trigger.data.skillId,
              version: ctx.trigger.data.version,
              seefValidation: ctx.trigger.data,
              dtoContext: {
                taskId: ctx.taskId,
                traceId: ctx.traceId,
                callbackUrl: ctx.callbackUrl
              }
            });
          }
        },
        {
          id: 'update-registry',
          action: async (ctx) => {
            if (ctx.results['ep-publish'].skipped) {
              return { skipped: true };
            }
            
            await ctx.services.skillRegistry.update({
              skillId: ctx.trigger.data.skillId,
              version: ctx.trigger.data.version,
              status: 'publishing',
              publishTaskId: ctx.taskId
            });
          },
          dependsOn: ['ep-publish']
        }
      ]
    },
    
    // 事件处理器
    onEvent: {
      'evomap-publisher.publish.completed': async (event, ctx) => {
        await ctx.services.skillRegistry.update({
          skillId: event.data.skillId,
          version: event.data.version,
          status: 'published',
          evomapGeneId: event.data.geneId,
          publishedAt: event.data.timestamp
        });
        
        ctx.logger.info(`技能 ${event.data.skillId}@${event.data.version} 发布成功`);
      },
      
      'evomap-publisher.publish.failed': async (event, ctx) => {
        await ctx.services.skillRegistry.update({
          skillId: event.data.skillId,
          version: event.data.version,
          status: 'publish-failed',
          error: event.data.error
        });
        
        // 触发告警
        await ctx.services.alert.send({
          channel: 'feishu',
          template: 'ep-publish-failed',
          data: event.data
        });
      }
    }
  });
  
  // 工作流2: 手动触发发布
  dto.registerTask({
    id: 'manual-publish',
    intent: '手动触发技能发布',
    
    triggers: [{
      type: 'api',
      endpoint: '/api/v1/publish',
      method: 'POST'
    }],
    
    workflow: {
      nodes: [
        {
          id: 'validate-request',
          action: async (ctx) => {
            const { skillId, version } = ctx.trigger.body;
            if (!skillId || !version) {
              throw new Error('MISSING_PARAMS: skillId and version are required');
            }
            return { skillId, version };
          }
        },
        {
          id: 'fetch-validation',
          action: async (ctx) => {
            const { skillId } = ctx.results['validate-request'];
            const validation = await ctx.services.seefValidator.getLatestResult(skillId);
            if (!validation || !validation.passed) {
              throw new Error('VALIDATION_REQUIRED: Skill must pass SEEF validation first');
            }
            return validation;
          },
          dependsOn: ['validate-request']
        },
        {
          id: 'ep-publish',
          action: async (ctx) => {
            const publisher = ctx.services.evomapPublisher;
            return await publisher.publish({
              skillId: ctx.results['validate-request'].skillId,
              version: ctx.results['validate-request'].version,
              seefValidation: ctx.results['fetch-validation'],
              priority: ctx.trigger.body.priority || 'normal',
              dtoContext: {
                taskId: ctx.taskId,
                traceId: ctx.traceId
              }
            });
          },
          dependsOn: ['fetch-validation']
        }
      ]
    }
  });
}

module.exports = { registerEPWorkflows };
```

---

## 7. 错误处理策略

### 7.1 错误分类与处理

| 错误码 | 阶段 | 说明 | 重试策略 | DTO处理 |
|:-------|:-----|:-----|:---------|:--------|
| `ISC_EXPIRED` | ISC检查 | 验证结果过期(>24h) | **不重试** | 通知SEEF重新验证 |
| `SKILL_NOT_FOUND` | ISC检查 | 技能目录不存在 | **不重试** | 立即失败，告警 |
| `VALIDATION_FAILED` | ISC检查 | 验证分数<70 | **不重试** | 通知SEEF优化 |
| `PACKAGING_ERROR` | 打包 | 文件读取失败 | 重试3次 | 失败告警 |
| `NETWORK_ERROR` | 上传 | WebSocket连接失败 | 重试3次 | 失败告警 |
| `HUB_REJECT` | 上传 | EvoMap Hub拒绝 | **不重试** | 立即失败，人工介入 |
| `TIMEOUT` | 上传 | 等待确认超时 | 重试3次 | 失败告警 |
| `RATE_LIMITED` | 上传 | 请求频率限制 | 指数退避 | 延迟重试 |

### 7.2 重试策略配置

```yaml
# EP重试策略配置
retryPolicy:
  default:
    maxRetries: 3
    backoff: [1000, 2000, 4000]  # 指数退避(ms)
    
  # 特定错误码配置
  perErrorCode:
    NETWORK_ERROR:
      maxRetries: 5
      backoff: [1000, 2000, 4000, 8000, 16000]
    TIMEOUT:
      maxRetries: 3
      backoff: [2000, 5000, 10000]
      
  # 不可重试错误
  nonRetryable:
    - ISC_EXPIRED
    - SKILL_NOT_FOUND
    - VALIDATION_FAILED
    - HUB_REJECT
```

---

## 8. 注意事项与最佳实践

### 8.1 集成注意事项

1. **幂等性设计**
   - EP发布操作需保证幂等，相同skillId+version重复调用应返回相同结果
   - DTO需记录发布状态，避免重复触发

2. **状态同步时序**
   - EP回调DTO是异步的，DTO需处理延迟和乱序消息
   - 建议使用taskId+traceId进行消息去重

3. **SEEF验证结果缓存**
   - EP只接受24小时内的验证结果
   - 过期验证需由SEEF重新生成

4. **WebSocket连接管理**
   - EP应维护WebSocket连接池
   - 支持连接复用和断线重连

### 8.2 监控指标

```yaml
# 建议监控指标
metrics:
  - name: ep_publish_total
    type: counter
    labels: [status, error_code]
    
  - name: ep_publish_duration_seconds
    type: histogram
    labels: [skill_id]
    buckets: [1, 5, 10, 30, 60]
    
  - name: ep_queue_length
    type: gauge
    
  - name: ep_retry_total
    type: counter
    labels: [error_code, retry_count]
```

### 8.3 配置清单

```yaml
# 完整配置示例
evomap-publisher:
  hub:
    url: "wss://hub.evomap.network"
    timeout: 30000
    reconnectInterval: 5000
    
  publish:
    maxRetries: 3
    backoff: [1000, 2000, 4000]
    queueSize: 100
    
  isc:
    validationTTL: 86400  # 24小时(秒)
    minScore: 70
    
  dto:
    callbackTimeout: 10000
    eventBufferSize: 1000
    
  logging:
    level: info
    format: json
```

---

## 9. 与Claude-Opus分析对比

### 主要异同点

| 维度 | GLM-5分析(本方案) | Claude-Opus分析(10号Agent) |
|:-----|:------------------|:---------------------------|
| 状态机设计 | 3状态 (IDLE→PUBLISHING→PUBLISHED/FAILED) | 待对比 |
| 接口风格 | TypeScript + JavaScript | 待对比 |
| 事件订阅 | YAML配置 + 代码注册混合 | 待对比 |
| 错误处理 | 7类错误码 + 分级重试 | 待对比 |
| 数据流图 | ASCII艺术图 | 待对比 |

### 建议后续动作
1. 对比两份分析结果，合并最佳实践
2. 确定最终接口规范
3. 制定实施路线图

---

**文档生成**: 智谱GLM-5 (API_KEY_7)  
**分析时间**: 2026-03-01  
**关联文档**: 
- `/root/.openclaw/workspace/skills/evomap-publisher/SKILL.md`
- `/root/.openclaw/workspace/skills/seef/SKILL.md`
- `/root/.openclaw/workspace/skills/dto-core/SKILL.md`
- `/root/.openclaw/workspace/skills/seef/evolution-pipeline/SKILL.md`
