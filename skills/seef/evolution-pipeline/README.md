# SEEF自主决策流水线

## 简介

SEEF-Evolution-Pipeline 是一个全自动化技能生命周期管理系统，实现技能从开发到EvoMap发布的零人工干预闭环。

## 快速开始

### 安装依赖

```bash
cd /root/.openclaw/workspace/skills/seef/evolution-pipeline
npm install
```

### 启动监控模式

```bash
node src/index.js watch
```

监控模式下，系统会：
1. 实时监控 `skills/` 目录变更
2. 自动触发ISC质量校验
3. 自动流转到EvoMap同步
4. 输出完整执行日志

### 执行单次流水线

```bash
# 处理所有待处理技能
node src/index.js run

# 处理指定技能
node src/index.js run isc-core
```

## 配置说明

编辑 `config/pipeline.config.json`：

```json
{
  "watch": {
    "paths": ["/root/.openclaw/workspace/skills"],
    "debounceMs": 300000,      // 防抖时间（5分钟）
    "checkIntervalMs": 300000  // 轮询间隔
  },
  "isc": {
    "minScore": 70             // ISC最低通过分数
  },
  "evomap": {
    "autoSync": true,          // 自动同步
    "maxRetries": 3,           // 最大重试次数
    "offlineMode": true        // 离线模式（开发测试）
  }
}
```

## 状态机说明

流水线通过7种状态管理技能生命周期：

```
DEVELOP ──▶ TEST ──▶ REVIEW ──▶ RELEASE ──▶ SYNC ──▶ ONLINE
              │         │                      │
              └─────────┴──────────────────────┘
                        ▼
                      FAILED
```

- **DEVELOP**: 开发中，文件变更检测触发
- **TEST**: 自动ISC质量校验
- **REVIEW**: 审核（ISC≥80分自动通过）
- **RELEASE**: 版本标记
- **SYNC**: EvoMap同步
- **ONLINE**: 已上线
- **FAILED**: 失败，支持重试

## 查看状态

```bash
node src/index.js status
```

输出示例：

```json
{
  "isRunning": true,
  "stateDistribution": {
    "total": 30,
    "byState": {
      "DEVELOP": 5,
      "TEST": 2,
      "REVIEW": 1,
      "RELEASE": 0,
      "SYNC": 1,
      "ONLINE": 20,
      "FAILED": 1
    }
  }
}
```

## 架构文档

详细架构设计请查看 `docs/ARCHITECTURE.md`

## 集成说明

### ISC文档质量校验

自动调用 `skills/isc-document-quality/index.js` 进行质量评估，包含4个维度：
- 基础完整性（40分）
- 规范符合度（30分）
- 内容准确性（20分）
- 扩展完整性（10分）

### EvoMap A2A同步

自动调用 `skills/evomap-a2a/index.js` 发布Gene，遵循EvoMap清单配置。

## 日志输出

所有执行日志输出到控制台，包含：
- 状态流转记录
- ISC评分详情
- EvoMap同步结果
- 错误堆栈（失败时）

## 故障排查

### 技能状态不更新

检查：
1. 文件变更是否在监控路径内
2. 防抖时间是否过长
3. SKILL.md是否存在且格式正确

### ISC校验失败

查看技能目录下的ISC报告，按建议修复：

```bash
node /root/.openclaw/workspace/skills/isc-document-quality/index.js \
  /path/to/skill --report
```

### EvoMap同步失败

检查：
1. 技能是否在 `evomap-upload-manifest.json` 允许列表
2. EvoMap A2A是否可连接
3. 是否处于离线模式

## 开发指南

### 添加新状态

1. 在 `src/state-manager.js` 添加状态定义
2. 在 `STATE_TRANSITIONS` 配置流转规则
3. 在 `src/engine.js` 添加状态处理函数

### 自定义校验器

继承 `ISCValidator` 类，重写 `validate` 方法：

```javascript
class CustomValidator extends ISCValidator {
  async validate(skillPath) {
    // 自定义校验逻辑
    return { passed, score, details };
  }
}
```

## 许可证

MIT
