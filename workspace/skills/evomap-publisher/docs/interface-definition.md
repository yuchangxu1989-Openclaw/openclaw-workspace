# 接口定义 - EvoMap极简发布器

## 1. DTO → EP 接口

### publish(request)

DTO调用EP发布技能。

**请求格式：**
```typescript
interface PublishRequest {
  skillId: string;           // 技能ID，如 "isc-core"
  version: string;           // 版本号，如 "3.0.11"
  priority?: 'high' | 'normal' | 'low';  // 优先级，默认 'normal'
  retryPolicy?: {
    maxRetries: number;      // 最大重试次数，默认 3
    backoff: number[];       // 退避间隔（毫秒），默认 [1000, 2000, 4000]
  };
}
```

**示例：**
```javascript
const request = {
  skillId: "isc-core",
  version: "3.0.11",
  priority: "high",
  retryPolicy: {
    maxRetries: 3,
    backoff: [1000, 2000, 4000]
  }
};

await EP.publish(request);
```

**响应格式：**
```typescript
interface PublishResponse {
  taskId: string;            // 任务ID
  status: 'queued' | 'processing';  // 任务状态
}
```

---

## 2. EP → SEEF 接口

### getSkillValidation(skillId)

EP内部调用，查询SEEF的验证结果。

**请求：**
```typescript
skillId: string
```

**响应：**
```typescript
interface ValidationResult {
  score: number;             // ISC评分 0-100
  passed: boolean;           // 是否通过
  timestamp: string;         // ISO8601格式验证时间
  checks: {
    skillMd: boolean;        // SKILL.md检查
    codeQuality: boolean;    // 代码质量检查
    security: boolean;       // 安全检查
  };
}
```

**说明：**
- EP会验证`passed`为`true`
- 验证结果有效期24小时，过期需要SEEF重新验证

---

## 3. EP → DTO 回调接口

### onPublishComplete(result)

发布成功时回调DTO。

**回调数据：**
```typescript
interface PublishSuccessResult {
  status: 'PUBLISHED';
  skillId: string;
  version: string;
  geneId: string;            // EvoMap Gene ID
  capsuleId: string;         // EvoMap Capsule ID
  timestamp: string;         // ISO8601格式发布时间
  hubResponse: {
    nodeId: string;          // EvoMap节点ID
    confirmedAt: string;     // 确认时间
  };
}
```

**DTO处理建议：**
- 更新技能状态为"已发布"
- 触发下游任务（如通知、日志记录）

---

### onPublishFailed(error)

发布失败时回调DTO。

**回调数据：**
```typescript
interface PublishFailureResult {
  status: 'FAILED';
  skillId: string;
  version: string;
  error: {
    code: string;            // 错误码
    message: string;         // 错误信息
    stage: 'ISC_CHECK' | 'PACKAGING' | 'UPLOAD';  // 失败阶段
    retries: number;         // 已重试次数
  };
  timestamp: string;
}
```

**错误码定义：**

| 错误码 | 阶段 | 说明 | 建议处理 |
|:-------|:-----|:-----|:---------|
| `ISC_EXPIRED` | ISC_CHECK | 验证结果过期（>24h） | 通知SEEF重新验证 |
| `SKILL_NOT_FOUND` | ISC_CHECK | 技能目录不存在 | 检查技能ID |
| `SKILL_MD_INVALID` | ISC_CHECK | SKILL.md格式错误 | 通知修复文档 |
| `PACKAGING_ERROR` | PACKAGING | 文件读取失败 | 重试或人工检查 |
| `NETWORK_ERROR` | UPLOAD | 网络连接失败 | 已重试3次，需要人工介入 |
| `HUB_REJECT` | UPLOAD | EvoMap Hub拒绝 | 检查Hub状态和配置 |
| `TIMEOUT` | UPLOAD | 等待确认超时 | 检查网络延迟 |

**DTO处理建议：**
- 根据`error.code`决定后续动作
- 可重试错误：等待一定时间后重新调度
- 不可重试错误：人工介入或标记废弃

---

## 4. EP → EvoMap A2A 接口

### publishGene(gene)

通过evomap-a2a发布Gene。

**Gene格式：**
```typescript
interface Gene {
  type: 'Gene';
  id: string;                // gene_{skillId}_{version}_{timestamp}
  summary: string;           // 技能名称
  content: {
    skillId: string;
    version: string;
    metadata: {
      publishedBy: string;   // 'evomap-publisher'
      publishedAt: string;   // ISO8601
    };
    documents: {
      skill_md: string;      // SKILL.md完整内容
    };
  };
  timestamp: string;
}
```

### publishCapsule(capsule)

通过evomap-a2a发布Capsule。

**Capsule格式：**
```typescript
interface Capsule {
  type: 'Capsule';
  id: string;                // capsule_{skillId}_{version}_{timestamp}
  summary: string;           // 技能描述
  content: {
    skillId: string;
    version: string;
    status: 'active';
    publisher: string;       // 'evomap-publisher'
  };
  timestamp: string;
}
```

---

## 5. 事件定义

### EP内部事件

EP使用EventEmitter，DTO可以监听以下事件：

```javascript
// 监听发布成功
EP.on('published', (result) => {
  console.log('发布成功:', result.geneId);
});

// 监听发布失败
EP.on('failed', (error) => {
  console.error('发布失败:', error.error.message);
});

// 监听状态变更
EP.on('stateChange', (from, to) => {
  console.log(`状态变更: ${from} → ${to}`);
});
```

### 事件顺序

正常流程：
```
stateChange(IDLE → PUBLISHING)
    ↓
published(result)
    ↓
onPublishComplete(result) [回调DTO]
    ↓
stateChange(PUBLISHING → IDLE)
```

失败流程：
```
stateChange(IDLE → PUBLISHING)
    ↓
failed(error)
    ↓
onPublishFailed(error) [回调DTO]
    ↓
stateChange(PUBLISHING → IDLE)
```

---

## 6. 配置接口

### 构造函数配置

```typescript
interface PublisherConfig {
  hubUrl?: string;           // EvoMap Hub地址
  maxRetries?: number;       // 最大重试次数
  backoffBase?: number;      // 退避基数（毫秒）
  timeout?: number;          // 超时时间（毫秒）
  queueSize?: number;        // 队列最大长度
  skillsDir?: string;        // 技能目录路径
}
```

**示例：**
```javascript
const EP = new EvoMapPublisher({
  hubUrl: 'wss://hub.evomap.network',
  maxRetries: 3,
  backoffBase: 1000,
  timeout: 30000,
  queueSize: 100
});
```

---

## 7. 状态查询接口

### getState()

获取发布器当前状态。

**响应：**
```typescript
interface PublisherState {
  state: 'IDLE' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED';
  queueLength: number;       // 待处理队列长度
  processing: {
    id: string;
    skillId: string;
    version: string;
    priority: string;
    retryCount: number;
  } | null;
  stats: {
    published: number;       // 成功次数
    failed: number;          // 失败次数
    total: number;           // 总次数
  };
}
```

**DTO使用场景：**
- 健康检查
- 监控面板
- 负载评估
