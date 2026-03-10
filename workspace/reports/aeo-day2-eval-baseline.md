# AEO 意图分类评测基线报告

> 生成时间: 2026/3/8 13:03:02
> 模型: claude-opus-4-6-thinking
> 数据集: all
> 耗时: 1516.0s

## 总体指标

| 指标 | 数值 |
|------|------|
| 总样本数 | 163 |
| 正确数 | 126 |
| 错误数 | 37 |
| 调用失败 | 0 |
| **准确率** | **77.3%** |
| 覆盖率 | 100.0% |

## 按意图分类 (IC) 准确率

| IC类别 | 样本数 | 正确数 | 准确率 |
|--------|--------|--------|--------|
| IC1 | 21 | 20 | 95.2% |
| IC2 | 15 | 11 | 73.3% |
| IC3 | 17 | 13 | 76.5% |
| IC4 | 40 | 23 | 57.5% |
| IC5 | 70 | 59 | 84.3% |

## 按数据来源准确率

| 来源 | 样本数 | 正确数 | 准确率 |
|------|--------|--------|--------|
| benchmark | 80 | 58 | 72.5% |
| real-conversation | 41 | 31 | 75.6% |
| multi-turn | 42 | 37 | 88.1% |

## Badcase 详情 (37 例)

| ID | 来源 | 期望 | 预测 | 输入摘要 |
|----|------|------|------|----------|
| IB-006 | benchmark | IC1 | IC5 | 太差了，重做吧 |
| IB-011 | benchmark | IC4 | IC1 | 好吧，就这样吧 |
| IB-017 | benchmark | IC2 | IC4 | 以后我会自动检查这个，不需要你提醒 |
| IB-018 | benchmark | IC2 | IC4 | 这是我的问题，不该跳过验证步骤 |
| IB-019 | benchmark | IC2 | IC3 | 我们把消息队列从Redis换成Kafka |
| IB-020 | benchmark | IC2 | IC4 | 这个模块需要重构，拆成微服务 |
| IB-043 | benchmark | IC3 | IC2 | 帮我查一下竞品的定价策略 |
| IB-044 | benchmark | IC3 | IC2 | 这个功能什么时候上线 |
| IB-047 | benchmark | IC4 | IC1 | 行，然后呢 |
| IB-048 | benchmark | IC4 | IC2 | 嗯，接下来做什么 |
| IB-049 | benchmark | IC4 | IC2 | 可以，继续 |
| IB-050 | benchmark | IC4 | IC1 | 嗯...先说别的吧 |
| IB-054 | benchmark | IC4 | IC1 | 怎么还没好 |
| IB-056 | benchmark | IC4 | IC1 | 哦 |
| IB-057 | benchmark | IC4 | IC1 | 随便 |
| IB-061 | benchmark | IC4 | IC1 | 知道了 |
| IB-062 | benchmark | IC4 | IC1 | 你说的对，但是... |
| IB-064 | benchmark | IC5 | IC4 | 做的不错但方向错了，应该先解决用户留存再考虑拉新 |
| IB-070 | benchmark | IC3 | IC2 | 我们换个方向试试 |
| IB-071 | benchmark | IC4 | IC2 | 好的，继续 |
| IB-078 | benchmark | IC4 | IC1 | 嗯嗯 |
| IB-080 | benchmark | IC5 | IC4 | 先不管安全扫描了，赶紧上线 |
| RC-001 | real-conversation | IC5 | IC4 | 你必须做任何事情的时候，都能独立做这种批判性思维、可扩展、可泛化、可生长的设计，一定是反熵增的。你的一切设计和进化都是以 |
| RC-003 | real-conversation | IC5 | IC4 | 实际上都是要分层解耦的。我们不可能一步到位端到端，Agent一定是分层端到端。这也是你未来做架构优化的核心原则和检查点。 |
| RC-004 | real-conversation | IC3 | IC5 | 颜色轻一些，不要纯英文，白色或浅灰背景，中文标注，颜色柔和不刺眼 |
| RC-005 | real-conversation | IC4 | IC5 | 对，现在的评测集是我坐在这里"想象"用户会怎么用，不是从真实数据里提取的。造出来的case天然缺乏真实场景的复杂度——多 |
| RC-013 | real-conversation | IC5 | IC4 | 事件不只是"发生了什么"，更是"在哪里放探针去捕捉状态变化"。任何对象的生命周期动作天然就是事件，可量化的条件达到阈值也 |
| RC-014 | real-conversation | IC5 | UNKNOWN | 反复强调的东西就是意图信号，不耐烦也是意图信号，根因分析请求也是意图信号。这些不可量化但可监听的语义意图，也是事件。事件 |
| RC-017 | real-conversation | IC5 | IC4 | AEO是意图系统的准出门禁：黄金评测集加自动化评测报告加Badcase主动根因分析加主动解决，这四个环节必须连在一起形成 |
| RC-025 | real-conversation | IC4 | IC5 | 新会话醒来后先git status检查，不要盲目git add -A。git history不等于memory，comm |
| RC-028 | real-conversation | IC4 | IC5 | 核心模块的编码，开发工程师必须开thinking高质量推理模式。以后只要出架构图，除了文本MD格式外必须额外给出一份直观 |
| RC-030 | real-conversation | IC5 | IC4 | ISC规则、任务、技能都必须分三层解耦：感知层谁负责探测捕获信号、认知层谁负责理解决策、执行层谁负责行动。三层之间通过事 |
| conv-008 | multi-turn | IC5 | IC4 | 反复强调的东西就是意图信号，不耐烦也是意图信号，根因分析请求也是意图信号。这些不可量化但可监听的语义意图，也是事件。事件 |
| conv-020 | multi-turn | IC5 | UNKNOWN | ISC规则、任务、技能都必须分三层解耦：感知层谁负责探测捕获信号、认知层谁负责理解决策、执行层谁负责行动。三层之间通过事 |
| conv-024 | multi-turn | IC4 | IC5 | 新会话醒来后先git status检查，不要盲目git add -A。git history不等于memory，comm |
| conv-025 | multi-turn | IC5 | UNKNOWN | 每次会话中用户的复杂发言自动收录为评测样本，必须用原话原样不缩写不改写，必须带完整上下文，不需要用户提醒自动执行 |
| conv-030 | multi-turn | IC4 | IC5 | 核心模块的编码，开发工程师必须开thinking高质量推理模式。以后只要出架构图，除了文本MD格式外必须额外给出一份直观 |

## 混淆矩阵

| 期望\预测 | IC1 | IC2 | IC3 | IC4 | IC5 | ERROR |
|------|------|------|------|------|------|------|
| IC1 | 20 | 0 | 0 | 0 | 1 | 0 |
| IC2 | 0 | 11 | 1 | 3 | 0 | 0 |
| IC3 | 0 | 3 | 13 | 0 | 1 | 0 |
| IC4 | 9 | 3 | 0 | 23 | 5 | 0 |
| IC5 | 0 | 0 | 0 | 8 | 59 | 0 |


## 评测方法说明

- **评测方式**: LLM-as-judge，使用 claude-opus-4-6-thinking 作为意图分类主基座
- **Prompt**: 使用 `intent-classification-prompt.txt` 中定义的分类体系
- **数据集**: 合并 benchmark(80) + real-conversation(41) + multi-turn(42)
- **评测脚本**: `tests/benchmarks/intent/run-e2e-eval.js`
