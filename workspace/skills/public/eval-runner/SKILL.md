# eval-runner — V3标准意图理解质量评测技能

## 触发条件
用户要求对评测集进行意图理解质量评测、跑eval、执行评测集。

## 核心原则
**执行者 ≠ 评测者（角色分离铁律）**
- Executor：接收 input+context，输出意图分类+执行链（模拟被测Agent）
- Evaluator：接收执行结果+expected_output，按V3标准5维度判定（独立评测Agent）

## V3评测维度

| 维度 | 说明 | 判定标准 |
|------|------|----------|
| 1. 意图分类准确性 | input的意图是否被正确识别 | executor分类 vs case.category |
| 2. 执行链完整性 | 实际执行链是否覆盖expected的所有步骤 | 覆盖率 ≥ 80% Pass |
| 3. 跨模块协同 | 多模块场景是否正确调度 | 涉及≥2模块时检查调度合理性 |
| 4. 隐含意图捕获 | 是否识别surface intent之下的deep intent | expected_output中的深层目标是否被覆盖 |
| 5. 上下文利用 | 是否正确利用context中的前序对话 | context非空时检查是否被引用 |

## 综合判定
- **Pass**: 5维全过
- **Partial**: 1-2维未过
- **Badcase**: ≥3维未过或方向性错误

## 用法

```bash
# 命令行
bash index.sh <case_file> [batch_size]

# 示例
bash index.sh tests/benchmarks/intent/c2-golden/mined-r2-01.json 10
```

## 输入格式
评测集JSON文件，数组格式，每条case包含：
```json
{
  "id": "case-id",
  "input": "用户输入",
  "context": "上下文信息",
  "expected_output": "期望输出描述",
  "category": "意图分类",
  "execution_chain_steps": ["步骤1", "步骤2", ...]
}
```

## 输出
1. `eval-results-<timestamp>.json` — 结构化评测结果
2. `eval-report-<timestamp>.md` — 可读MD报告

## 配置
见 `config.json`，可调整 batch_size、executor/evaluator agent等。
