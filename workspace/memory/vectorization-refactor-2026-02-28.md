# 向量化系统重构 - 修改清单

## 执行时间
2026-02-28 23:30 GMT+8

## 任务完成情况

### ✅ 任务1: 整合智谱向量化，删除TF-IDF

#### 修改文件
1. **`/root/.openclaw/workspace/infrastructure/vector-service/vectorize.sh`**
   - 重写为智谱API版本
   - 新增支持：技能、记忆、知识、AEO四类文件
   - 增量更新机制

2. **`/root/.openclaw/workspace/infrastructure/vector-service/search.sh`**
   - 更新为智谱向量语义搜索
   - 支持类型过滤参数

3. **`/root/.openclaw/workspace/infrastructure/vector-service/config/service.json`**
   - 版本升级: 1.0.0 → 2.0.0
   - 引擎配置: 智谱 embedding-3, 1024维
   - 新增AEO和知识源配置
   - 迁移说明和废弃声明

#### 新增文件
4. **`/root/.openclaw/workspace/infrastructure/vector-service/src/zhipu-vectorizer.cjs`**
   - 智谱Embedding API调用核心
   - JWT Token生成
   - 批量向量化支持
   - 余弦相似度计算

5. **`/root/.openclaw/workspace/infrastructure/vector-service/src/batch-vectorize.cjs`**
   - 批量向量化处理脚本
   - 支持skill/memory/knowledge/aeo四种类型
   - JSON内容提取和文本化处理

6. **`/root/.openclaw/workspace/infrastructure/vector-service/src/semantic-search.cjs`**
   - 基于智谱向量的语义搜索
   - 查询向量化 + 相似度计算
   - 类型过滤和结果排序

#### 删除文件
7. **TF-IDF向量文件 (34个)**
   - 位置: `/root/.openclaw/workspace/infrastructure/vector-service/vectors/`
   - 文件: skill-*.json (23个), memory-*.json (11个)
   - 备份: `vectors/backup/vectors-tfidf-20260228/`

---

### ✅ 任务2: 建立定时任务

#### 新增文件
8. **`/root/.openclaw/workspace/infrastructure/vector-service/cron-vectorize.sh`**
   - 定时任务入口脚本
   - 锁机制防止重复执行
   - 完整日志记录
   - 源文件统计和结果报告

#### Crontab配置
```bash
# 统一向量化服务 - 每6小时执行一次
0 */6 * * * /root/.openclaw/workspace/infrastructure/vector-service/cron-vectorize.sh >> /root/.openclaw/workspace/infrastructure/vector-service/logs/cron.log 2>&1
```

---

### ✅ 任务3: 建立DTO自动触发机制

#### 新增DTO订阅文件
9. **`/root/.openclaw/workspace/skills/dto-core/subscriptions/vectorization-skill-created.json`**
   - 事件: skill.created
   - 触发: SKILL.md文件创建

10. **`/root/.openclaw/workspace/skills/dto-core/subscriptions/vectorization-skill-updated.json`**
    - 事件: skill.updated
    - 触发: SKILL.md文件修改
    - 支持: 增量向量化

11. **`/root/.openclaw/workspace/skills/dto-core/subscriptions/vectorization-memory-created.json`**
    - 事件: memory.created
    - 触发: memory/*.md文件创建

12. **`/root/.openclaw/workspace/skills/dto-core/subscriptions/vectorization-knowledge-created.json`**
    - 事件: knowledge.created
    - 触发: knowledge/*.json文件创建

13. **`/root/.openclaw/workspace/skills/dto-core/subscriptions/vectorization-aeo-created.json`**
    - 事件: aeo.evaluation_set.created
    - 触发: aeo/evaluation-sets/**/*.json文件创建

---

### ✅ 任务4: 检查并补充ISC规则

#### 新增ISC规则文件
14. **`/root/.openclaw/workspace/skills/isc-core/rules/rule.vectorization.skill-auto-001.json`**
    - 规则ID: rule.vectorization.skill-auto-001
    - 名称: skill_mandatory_vectorization
    - 要求: 所有SKILL.md必须向量化
    - 维度: 1024
    - 引擎: 智谱embedding-3

15. **`/root/.openclaw/workspace/skills/isc-core/rules/rule.vectorization.memory-auto-001.json`**
    - 规则ID: rule.vectorization.memory-auto-001
    - 名称: memory_mandatory_vectorization
    - 要求: 所有记忆文件必须向量化

16. **`/root/.openclaw/workspace/skills/isc-core/rules/rule.vectorization.unified-standard-001.json`**
    - 规则ID: rule.vectorization.unified-standard-001
    - 名称: unified_zhipu_vectorization_standard
    - 标准: 统一使用智谱向量化
    - 废弃: TF-IDF, bge-m3, local embedding

17. **`/root/.openclaw/workspace/skills/isc-core/rules/rule.vectorization.knowledge-auto-001.json`**
    - 规则ID: rule.vectorization.knowledge-auto-001
    - 名称: knowledge_mandatory_vectorization
    - 要求: 所有知识文件必须向量化

18. **`/root/.openclaw/workspace/skills/isc-core/rules/rule.vectorization.aeo-auto-001.json`**
    - 规则ID: rule.vectorization.aeo-auto-001
    - 名称: aeo_evaluation_set_vectorization
    - 要求: 所有AEO评测用例必须向量化
    - 声明: AEO独立系统已废弃

---

### ✅ 任务5: 清理AEO的独立向量化系统

#### 备份文件
19. **`/root/.openclaw/workspace/aeo-vector-system-backup-20260228.tar.gz`**
    - 完整备份AEO独立向量化系统

#### 修改文件
20. **`/root/.openclaw/workspace/aeo-vector-system/README.md`**
    - 重写为整合版说明
    - 添加废弃声明
    - 提供迁移指南

21. **`/root/.openclaw/workspace/aeo-vector-system/DEPRECATED.md`**
    - 详细废弃说明
    - 替代方案
    - 迁移步骤

#### 新增文件
22. **`/root/.openclaw/workspace/aeo-vector-system/unified-adapter.cjs`**
    - AEO向统一服务迁移的适配器
    - 支持评测用例批量向量化
    - 提取用例文本内容

---

## 文件变更汇总

| 类型 | 数量 | 说明 |
|------|------|------|
| 新增文件 | 16个 | 核心服务、DTO订阅、ISC规则、适配器 |
| 修改文件 | 5个 | 脚本、配置、文档 |
| 删除文件 | 34个 | TF-IDF向量文件 |
| 备份文件 | 2个 | AEO系统备份、向量备份 |

---

## 配置详情

### 定时任务
```cron
0 */6 * * * /root/.openclaw/workspace/infrastructure/vector-service/cron-vectorize.sh
```

### DTO订阅配置
```
skills/dto-core/subscriptions/
├── vectorization-skill-created.json
├── vectorization-skill-updated.json
├── vectorization-memory-created.json
├── vectorization-knowledge-created.json
└── vectorization-aeo-created.json
```

### ISC规则配置
```
skills/isc-core/rules/
├── rule.vectorization.skill-auto-001.json
├── rule.vectorization.memory-auto-001.json
├── rule.vectorization.knowledge-auto-001.json
├── rule.vectorization.aeo-auto-001.json
└── rule.vectorization.unified-standard-001.json
```

### 向量化服务配置
```json
{
  "version": "2.0.0",
  "engine": {
    "type": "zhipu",
    "model": "embedding-3",
    "dimension": 1024
  },
  "schedule": {
    "cron": "0 */6 * * *"
  }
}
```

---

## 验证步骤

1. 执行向量化
   ```bash
   cd /root/.openclaw/workspace/infrastructure/vector-service
   ./vectorize.sh
   ```

2. 验证语义搜索
   ```bash
   ./search.sh "测试查询" 5
   ```

3. 检查定时任务
   ```bash
   crontab -l | grep vectorize
   ```

4. 检查ISC规则
   ```bash
   ls -la /root/.openclaw/workspace/skills/isc-core/rules/rule.vectorization.*
   ```
