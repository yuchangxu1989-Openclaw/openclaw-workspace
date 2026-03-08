# LEP 与现有系统集成方案

**文档版本**: v1.0.0  
**日期**: 2026-02-26  
**状态**: 设计完成

---

## 1. 集成总览

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           现有系统集成关系图                                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│                              ┌─────────────────┐                                │
│                              │   LEP Executor  │                                │
│                              │   韧性执行中心   │                                │
│                              └────────┬────────┘                                │
│                                       │                                          │
│           ┌───────────────────────────┼───────────────────────────┐              │
│           │                           │                           │              │
│           ▼                           ▼                           ▼              │
│  ┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐        │
│  │ parallel-       │       │ 全局自主决策     │       │   CRAS-B        │        │
│  │ subagent        │◄─────►│ 流水线          │◄─────►│   洞察          │        │
│  │ (复用韧性核心)   │       │ (触发修复)       │       │ (触发N017)      │        │
│  └─────────────────┘       └─────────────────┘       └─────────────────┘        │
│           │                           │                           │              │
│           │                           ▼                           │              │
│           │                  ┌─────────────────┐                  │              │
│           │                  │   ISC-本地任务编排       │                  │              │
│           │                  │   握手          │◄─────────────────┘              │
│           │                  │ (触发N018)      │                                 │
│           │                  └─────────────────┘                                 │
│           │                           │                                          │
│           │                           ▼                                          │
│           │                  ┌─────────────────┐                                 │
│           │                  │   N016/N017/    │                                 │
│           └─────────────────►│   N018 规则     │◄────────────────┘              │
│                              │   (LEP执行)     │                                │
│                              └─────────────────┘                                │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 与 parallel-subagent 集成

### 2.1 集成目标
- 复用 parallel-subagent v3.0.1 的成熟韧性实现
- LEP作为统一入口，parallel-subagent内部使用LEP执行

### 2.2 集成方案

**改造前** (parallel-subagent 内部自己管理韧性):
```javascript
// parallel-subagent/index.js (改造前)
class ParallelSubagent {
  constructor(options) {
    this.retry = new RetryHandler(options.retry);
    this.circuitBreaker = new CircuitBreaker(options.circuitBreaker);
  }

  async spawnSubagent(task) {
    // 自己管理重试
    return await this.retry.execute(() => this._spawn(task));
  }
}
```

**改造后** (使用LEP执行):
```javascript
// parallel-subagent/index.js (改造后)
const { LEPExecutor } = require('../lep-executor');

class ParallelSubagent {
  constructor(options) {
    // 使用LEP
    this.lep = new LEPExecutor({
      retryPolicy: options.retry,
      circuitBreaker: options.circuitBreaker
    });
  }

  async spawnSubagent(task) {
    // 通过LEP执行，获得统一韧性保障
    return await this.lep.execute({
      type: 'function',
      fn: () => this._spawn(task),
      retryPolicy: { maxRetries: 3 }
    });
  }
}
```

### 2.3 复用的组件

| 组件 | 来源 | LEP封装 |
|:---|:---|:---|
| RetryHandler | parallel-subagent/src/resilience/RetryHandler.js | ResilienceCore.retry |
| CircuitBreaker | parallel-subagent/src/resilience/CircuitBreaker.js | ResilienceCore.circuitBreaker |
| TimeoutManager | parallel-subagent/src/resilience/TimeoutManager.js | ResilienceCore.timeout |
| ConnectionPool | parallel-subagent/src/resilience/ConnectionPool.js | ResilienceCore.pool |

---

## 3. 与全局自主决策流水线集成

### 3.1 集成目标
- 流水线发现问题后，通过LEP触发N016修复循环
- LEP执行修复任务，反馈结果给流水线

### 3.2 集成方案

```javascript
// dto-core/global-auto-decision-pipeline.js
const { executeRule } = require('../lep-executor');

class GlobalAutoDecisionPipeline {
  async run() {
    // 1. 发现问题
    const findings = await this.discoverIssues();
    
    // 2. 通过LEP执行N016修复循环
    if (findings.fixableIssues.length > 0) {
      console.log(`[Pipeline] Triggering N016 repair loop for ${findings.fixableIssues.length} issues`);
      
      const repairResult = await executeRule('N016', {
        fixableIssues: findings.fixableIssues,
        source: 'global_auto_decision_pipeline'
      });
      
      // 3. 记录修复结果
      await this.recordRepairResult(repairResult);
    }
    
    return findings;
  }

  // LEP调用的入口 - 执行修复
  async executeFix(context) {
    // 实际执行修复逻辑
    const { taskType, error, executionId } = context;
    
    // ... 修复实现
    
    return { success: true, fixed: [...] };
  }
}
```

### 3.3 触发流程

```
流水线运行
    │
    ▼
发现问题 ──► 可修复? ──否──► 记录问题
    │          │
    │          是
    │          ▼
    │    调用LEP.executeRule('N016')
    │          │
    │          ▼
    │    N016执行器启动修复循环
    │          │
    │          ▼
    │    执行修复步骤
    │          │
    │          ▼
    └──── 记录结果
```

---

## 4. 与CRAS-B洞察集成

### 4.1 集成目标
- CRAS-B发现重复问题模式后，自动触发N017执行
- N017执行结果反馈给CRAS-B进行学习

### 4.2 集成方案

```javascript
// cras/index.js
const { executeRule } = require('../lep-executor');

class CRASInsight {
  async runInsightCycle() {
    // 1. 分析用户洞察
    const patterns = await this.analyzeRecurringPatterns();
    
    if (patterns.length > 0) {
      console.log(`[CRAS-B] Found ${patterns.length} recurring patterns`);
      
      // 2. 通过LEP执行N017自动解决
      const resolveResult = await executeRule('N017', {
        recurringPatterns: patterns,
        source: 'cras_insight'
      });
      
      // 3. 记录解决结果用于学习
      await this.recordResolution(patterns, resolveResult);
    }
    
    return patterns;
  }

  async markPatternResolved(patternId) {
    // 标记模式已解决
    await this.db.patterns.update(patternId, {
      status: 'resolved',
      resolvedAt: Date.now()
    });
  }
}
```

### 4.3 定时触发配置

```javascript
// .openclaw/cron/jobs.json
{
  "jobs": [
    {
      "id": "cras-insight",
      "schedule": "0 */2 * * *",  // 每2小时
      "command": "cd skills/cras && node index.js --insight"
    },
    {
      "id": "n017-trigger",
      "schedule": "30 */2 * * *",  // 每2小时（在CRAS之后）
      "command": "cd skills/lep-executor && node index.js execute-rule N017"
    }
  ]
}
```

---

## 5. 与ISC-DTO握手集成

### 5.1 集成目标
- ISC-DTO发现对齐问题时，通过LEP触发N018修复
- N018执行全局引用对齐

### 5.2 集成方案

```javascript
// isc-core/handshake.js
const { executeRule } = require('../lep-executor');

class ISCDTOHandshake {
  async performCheck() {
    // 1. 检查对齐
    const misalignments = await this.checkAlignments();
    
    // 2. 识别需要全局对齐的问题
    const alignmentIssues = misalignments.filter(m => 
      m.type === 'skill_rename' || m.type === 'module_refactor'
    );
    
    for (const issue of alignmentIssues) {
      console.log(`[ISC-本地任务编排] Alignment issue: ${issue.oldName} → ${issue.newName}`);
      
      // 3. 通过LEP执行N018全局对齐
      const alignResult = await executeRule('N018', {
        oldName: issue.oldName,
        newName: issue.newName,
        source: 'isc_dto_handshake'
      });
      
      // 4. 记录结果
      await this.recordAlignmentResult(issue, alignResult);
    }
    
    return { success: alignmentIssues.length === 0 };
  }
}
```

---

## 6. 集成测试方案

### 6.1 单元测试

```javascript
// test/integration.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { executeRule, execute } = require('../index');

describe('LEP Integration Tests', () => {
  it('should execute N016 repair loop', async () => {
    const result = await executeRule('N016', {
      fixableIssues: [
        { id: 1, type: 'file_not_found', path: '/tmp/test.txt' }
      ]
    });
    
    assert.strictEqual(result.status, 'completed');
  });

  it('should execute N017 recurring pattern', async () => {
    const result = await executeRule('N017', {});
    
    assert.ok(result.status === 'completed' || result.status === 'skipped');
  });

  it('should execute N018 global alignment', async () => {
    const result = await executeRule('N018', {
      oldName: 'test-old',
      newName: 'test-new'
    });
    
    assert.ok(result.status === 'completed' || result.status === 'failed');
  });
});
```

### 6.2 端到端测试

```bash
#!/bin/bash
# scripts/e2e-test.sh

echo "=== LEP Integration E2E Tests ==="

# 测试N016
echo "Testing N016..."
cd skills/lep-executor
node index.js execute-rule N016 '{"fixableIssues": []}'

# 测试N017
echo "Testing N017..."
node index.js execute-rule N017

# 测试N018
echo "Testing N018..."
node index.js execute-rule N018 '{"oldName": "foo", "newName": "bar"}'

echo "=== All tests completed ==="
```

---

## 7. 迁移计划

### 7.1 阶段1: LEP独立运行 (Week 1)
- LEP执行器开发完成
- 单元测试通过
- 不影响现有系统

### 7.2 阶段2: 渐进式集成 (Week 2-3)
- 选择低风险场景试用LEP
- parallel-subagent部分任务使用LEP
- 监控运行情况

### 7.3 阶段3: 全面切换 (Week 4)
- parallel-subagent完全切换至LEP
- N016/N017/N018正式启用
- 旧代码标记为废弃

### 7.4 阶段4: 清理 (Week 5)
- 移除parallel-subagent中的冗余代码
- 更新文档
- 归档旧实现

---

## 8. 回滚方案

### 8.1 回滚触发条件
- LEP导致系统不稳定
- 性能下降超过20%
- 数据丢失或损坏

### 8.2 回滚步骤
```bash
# 1. 禁用LEP触发
export LEP_ENABLED=false

# 2. 恢复parallel-subagent旧实现
git checkout parallel-subagent/index.js

# 3. 重启相关服务
pm2 restart all

# 4. 验证恢复
node scripts/verify-integration.js
```

### 8.3 数据恢复
- WAL日志保留7天，支持故障排查
- N018自动创建备份，支持回滚
- 关键配置定期备份到Git

---

## 9. 监控与告警

### 9.1 关键指标

| 指标 | 阈值 | 告警级别 |
|:---|:---|:---:|
| LEP执行失败率 | > 10% | P1 |
| 平均执行耗时 | > 5s | P2 |
| 熔断器打开次数 | > 5/小时 | P1 |
| N规则执行异常 | 任何 | P2 |

### 9.2 告警配置

```yaml
# monitoring/alerts.yml
alerts:
  - name: lep_high_failure_rate
    condition: lep_failure_rate > 0.1
    severity: critical
    channels: [feishu, email]
    
  - name: lep_circuit_breaker_open
    condition: lep_circuit_breaker_state == 'open'
    severity: critical
    channels: [feishu]
    
  - name: n_rule_execution_error
    condition: n_rule_error_count > 0
    severity: warning
    channels: [feishu]
```

---

**文档完成日期**: 2026-02-26  
**下次评审**: 2026-03-05
