# EvoMap进化流水线 - 核心模块 (阶段2)

> **实现日期**: 2026-03-01  
> **实现方式**: 智谱GLM-5 (API_KEY_3)  
> **模块系统**: ESM (ES Modules)  
> **Node.js版本**: >= 18.0.0

## 核心组件

### 1. PipelineEngine (流水线引擎)

**文件**: `pipeline-engine.js` (629行)

**功能**: 执行技能生命周期状态流转，调度ISC校验和EvoMap上传

**特性**:
- 完整7状态生命周期管理 (DEVELOP → TEST → REVIEW → RELEASE → SYNC → ONLINE/FAILED)
- 状态自动流转与超时处理
- 事件驱动架构 (beforeProcess, afterProcess, stateTransition等)
- 自动版本号递增
- 重试机制

**使用**:
```javascript
import { createPipelineEngine } from './core/index.js';

const engine = createPipelineEngine({
  isc: { minScore: 70 },
  evomap: { autoSync: true }
});

await engine.initialize();
await engine.run('target-skill');
```

---

### 2. StateManager (状态管理器)

**文件**: `state-manager.js` (541行)

**功能**: 管理技能生命周期状态的CRUD操作、状态流转、历史记录

**特性**:
- 状态CRUD操作
- 严格的状态流转规则校验
- 状态历史记录（保留最近100条）
- 文件持久化存储
- 内存缓存机制
- 重启自恢复（ISC规则N036）
- 超时状态检测

**状态定义**:
```javascript
DEVELOP: 'DEVELOP'      // 开发中
TEST: 'TEST'            // 测试中 (ISC校验)
REVIEW: 'REVIEW'        // 审核中 (ISC>=80自动通过)
RELEASE: 'RELEASE'      // 已发布
SYNC: 'SYNC'            // 同步中 (EvoMap上传)
ONLINE: 'ONLINE'        // 已上线
FAILED: 'FAILED'        // 失败
```

**使用**:
```javascript
import { createStateManager, STATES } from './core/index.js';

const manager = createStateManager({ statePath: './state' });
const state = manager.getOrCreateState('/path/to/skill');
manager.transitionState('skill-id', STATES.TEST, '触发原因', 'triggered_by');
```

---

### 3. Watcher (文件监控)

**文件**: `watcher.js` (487行)

**功能**: 监控skills/目录变更，触发流水线执行

**特性**:
- chokidar实时监控（首选）
- 轮询模式降级（chokidar不可用时）
- 防抖处理（默认300秒）
- 变更去重
- 深度可配置
- 忽略模式支持

**使用**:
```javascript
import { createWatcher } from './core/index.js';

const watcher = createWatcher({
  watchPaths: ['/path/to/skills'],
  debounceMs: 300000
});

watcher.on('change', ({ skillId, skillPath, type }) => {
  console.log(`变更: ${skillId} (${type})`);
});

await watcher.start();
```

---

### 4. ISCValidator (ISC校验器)

**文件**: `isc-validator.js` (491行)

**功能**: 集成ISC规则，对技能进行质量评估和标准检查

**评分维度**:
| 维度 | 权重 | 说明 |
|------|------|------|
| 基础完整性 | 40分 | SKILL.md字段、README.md结构 |
| 规范符合度 | 30分 | 命名规范、YAML格式、版本号 |
| 内容准确性 | 20分 | index.js存在与内容 |
| 扩展完整性 | 10分 | 依赖声明、代码注释 |

**评级标准**:
- A级 (>=90): 优秀
- B级 (>=80): 良好
- C级 (>=70): 合格
- D级 (>=60): 待改进
- F级 (<60): 不合格

**使用**:
```javascript
import { createISCValidator } from './core/index.js';

const validator = createISCValidator({ minScore: 70 });
const result = await validator.validate('/path/to/skill');

if (result.passed) {
  console.log(`通过! 得分: ${result.score}, 等级: ${result.grade.level}`);
}
```

---

## 测试覆盖

**测试文件**: `src/__tests__/core.test.js` (220+行)

**测试结果**:
```
Test Suites: 1 passed, 1 total
Tests:       23 passed, 23 total
```

**测试范围**:
- StateManager: 6个测试用例
- ISCValidator: 4个测试用例
- Watcher: 5个测试用例
- PipelineEngine: 4个测试用例
- Constants: 4个测试用例

---

## 模块导出

**统一入口**: `src/core/index.js`

```javascript
// 导入所有核心组件
import {
  PipelineEngine,
  createPipelineEngine,
  StateManager,
  createStateManager,
  Watcher,
  createWatcher,
  ISCValidator,
  createISCValidator,
  PIPELINE_STATES,
  ChangeType,
  Dimension
} from './core/index.js';
```

---

## 技术规格

| 项目 | 规格 |
|------|------|
| 模块系统 | ESM (import/export) |
| Node.js版本 | >= 18.0.0 |
| 依赖 | chokidar, node-cron |
| 测试框架 | Jest |
| 代码规范 | JSDoc完整注释 |
| 错误处理 | try-catch + 事件通知 |
| 日志记录 | console + 可注入logger |

---

## 下一步

阶段3将集成这些核心组件到完整的流水线系统中，实现：
- 自动触发执行
- 完整的事件总线集成
- EvoMap A2A连接器对接
- 状态机持久化优化

---

**归属**: SEEF (技能生态进化工厂)  
**关联**: ISC | EvoMap A2A | DTO | LEP
