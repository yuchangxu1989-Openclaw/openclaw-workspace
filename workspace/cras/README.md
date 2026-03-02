# CRAS-A 主动学习引擎 - 使用手册

## 📋 任务信息

- **任务名称**: CRAS-A-主动学习引擎-每日04:00
- **Cron表达式**: `0 4 * * *`
- **执行时间**: 每天凌晨4:00
- **执行方式**: GLM-5 代理自动执行

---

## 📚 学习内容

### 1. 论文学习（3条核心洞察）

**搜索目标**: OpenAI、DeepMind、Anthropic、Google Research、Meta AI

**输出格式**:
```json
{
  "rank": 1,
  "institution": "OpenAI",
  "paper_title": "论文标题",
  "paper_url": "链接",
  "core_innovation": "核心创新点",
  "technical_breakthrough": "技术突破",
  "impact_analysis": "影响分析",
  "actionable_insight": "可执行建议"
}
```

**存储位置**: `knowledge/papers/YYYY-MM-DD.json`

### 2. 工程实践学习（3条优化策略）

**搜索目标**: AI Agent架构、LLM工程、AI产品设计、RAG系统、多Agent协作

**输出格式**:
```json
{
  "rank": 1,
  "category": "Agent架构",
  "practice_name": "实践名称",
  "source": "来源",
  "core_strategy": "核心策略",
  "technical_details": "技术细节",
  "problem_solved": "解决问题",
  "local_application": "本地应用建议",
  "implementation_priority": "high/medium/low",
  "estimated_effort": "工作量"
}
```

**存储位置**: `knowledge/practices/YYYY-MM-DD.json`

---

## 🛠️ 系统架构

```
CRAS-A 主动学习引擎
├── 主执行器 (CRASLearningEngine)
│   ├── 论文学习模块 (PaperLearningModule)
│   │   └── GLM-5 论文搜索与分析
│   ├── 工程实践学习模块 (PracticeLearningModule)
│   │   └── GLM-5 工程实践搜索与分析
│   ├── 报告生成器 (ReportGenerator)
│   │   ├── JSON报告
│   │   └── Markdown报告
│   └── 知识持久化 (KnowledgePersistence)
│       ├── papers/ 目录
│       └── practices/ 目录
└── GLM-5 API (8个Key轮询)
```

---

## 🚀 使用命令

### 执行每日学习（手动触发）
```bash
cd /root/.openclaw/workspace/cras
node cras-learning-engine.cjs --daily
```

### 测试配置
```bash
cd /root/.openclaw/workspace/cras
node cras-learning-engine.cjs --test
```

### 查看帮助
```bash
node cras-learning-engine.cjs
```

---

## 📁 输出文件

每日学习完成后，会在以下位置生成文件：

| 类型 | 文件路径 | 格式 |
|------|----------|------|
| 论文洞察 | `knowledge/papers/YYYY-MM-DD.json` | JSON |
| 实践策略 | `knowledge/practices/YYYY-MM-DD.json` | JSON |
| 学习报告 | `reports/cras-learning-YYYY-MM-DD.md` | Markdown |
| 学习报告 | `reports/cras-learning-YYYY-MM-DD.json` | JSON |
| 执行日志 | `logs/cras-learning-YYYY-MM-DD.log` | Text |
| Cron日志 | `/tmp/cras-learning-cron.log` | Text |

---

## 🔧 维护操作

### 查看今日学习结果
```bash
cat /root/.openclaw/workspace/knowledge/papers/$(date +%Y-%m-%d).json
cat /root/.openclaw/workspace/knowledge/practices/$(date +%Y-%m-%d).json
```

### 查看最新报告
```bash
ls -lt /root/.openclaw/workspace/reports/cras-learning-*.md | head -1
```

### 查看执行日志
```bash
tail -f /tmp/cras-learning-cron.log
```

### 检查Cron任务
```bash
crontab -l | grep cras-learning
```

---

## ⚙️ 配置信息

- **工作目录**: `/root/.openclaw/workspace`
- **程序路径**: `/root/.openclaw/workspace/cras/cras-learning-engine.cjs`
- **Cron配置**: `/root/.openclaw/workspace/cron/cras-learning-engine.cron`
- **API Keys**: 8个GLM-5 API Key（自动轮询）
- **超时设置**: 5分钟/请求
- **重试次数**: 3次

---

## 📊 预期输出

每天04:00执行后，系统会产出：

1. **3条论文核心洞察** - 来自顶尖AI机构的最新研究
2. **3条工程优化策略** - 结合本地系统的可落地方案
3. **1份完整学习报告** - Markdown格式，包含综合分析

总计每天6条核心洞察，持续积累AI领域前沿认知。

---

*CRAS-A 主动学习引擎 v1.0.0 - 自动生成*
