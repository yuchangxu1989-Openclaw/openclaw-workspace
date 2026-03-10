# Dataset weighting programmatic hardening — 2026-03-08

## 结论
已把“自主性 / 纠偏 / 执行链补全 / 及时扩列”从口头要求下沉为程序约束，且不只停留在文档：本次实际落到了 **registry-manager / unified registry / standard.json / benchmark runner** 四处，其中 runner 侧已变成 fail-closed 硬门。

## 已实施的程序化加固

### 1) registry：高权重维度固化进注册结构
文件：`skills/aeo/src/core/registry-manager.cjs`

- 新增 `HIGH_WEIGHT_DIMENSION_PROFILES`
- 新增 `applyProgrammaticWeighting(dimensions)`
- 对命中的高权重维度自动注入：
  - `weight`
  - `threshold`
  - `priority: high`
- 自动生成：
  - `datasetWeighting.prioritizedDimensions`
  - `datasetWeighting.weightingProfile = execution-chain-hardening-v1`
  - `datasetWeighting.enforcementMode = programmatic-hard-gate`

这意味着以后只要通过 registry-manager 注册并携带这些维度，不再依赖人工记得“把它们权重调高”。

### 2) registry data：目标评测集已直接硬化
文件：`skills/aeo/unified-evaluation-sets/registry.json`

针对：`eval.real-conv-2026-03-07-exec-chain-remediation.001`

已将维度改为：
- `autonomy` 0.20
- `correction` 0.25
- `execution_chain_completeness` 0.30
- `timely_task_fanout` 0.25

并增加：
```json
"datasetWeighting": {
  "prioritizedDimensions": [
    "autonomy",
    "correction",
    "execution_chain_completeness",
    "timely_task_fanout"
  ],
  "weightingProfile": "execution-chain-hardening-v1",
  "enforcementMode": "programmatic-hard-gate"
}
```

### 3) standard：标准文件与 registry 对齐
文件：`skills/aeo/evaluation-sets/real-conv-2026-03-07-exec-chain-remediation/standard.json`

已同步为同一组高权重维度，并写入 `datasetWeighting` 字段，避免标准层和注册层漂移。

### 4) runner / gate：评测执行时增加 fail-closed 检查
文件：`principle-e2e-spec/scripts/benchmark_runner.py`

新增逻辑：
- 内建高权重维度集合：
  - `autonomy`
  - `correction`
  - `execution_chain_completeness`
  - `timely_task_fanout`
- 从 case 文本 / tags / 中文描述中自动推断是否应该触发这些高权重维度
- 读取 runtime 中的：
  - `dataset_weighting.prioritized_dimensions`
- 若应优先的维度未被 runtime 声明，则新增 stage：
  - `DATASET-WEIGHTING-HARDENING`
- 且该 stage 为：
  - `fail_closed: true`
  - `hard_gate: true`

结果：这四类能力没有被程序声明为高权重时，runner 直接判 FAIL，而不是“报告里写一下建议”。

### 5) runner pass fixture：正例运行时样本已补齐
文件：`principle-e2e-spec/examples/capability_runtime_pass.json`

已补：
```json
"dataset_weighting": {
  "prioritized_dimensions": [
    "autonomy",
    "correction",
    "execution_chain_completeness",
    "timely_task_fanout"
  ],
  "weighting_profile": "execution-chain-hardening-v1"
}
```

用于确保 runner 的新硬门有正向通过样本。

## 为什么这次算“直接补债”
之前的问题是：
- 知道要补“自主性 / 纠偏 / 执行链补全 / 及时扩列”
- 但很多地方只是写在说明、整改报告、人工共识里
- 程序本身并不会因为缺少这些高权重声明而 fail

这次改完后：
- **registry 生成阶段**：自动加权
- **registry/standard 数据层**：显式固化
- **runner/gate 执行层**：硬门拦截

也就是至少命中了用户要求的两处，而且实际是四处。

## 影响面
- 对 execution-chain remediation 这类评测集，评估重心被强制拉回“能不能自主推进、能不能吸收纠偏、能不能补全执行链、能不能及时扩列”。
- 对 benchmark runner，新增一层“dataset weighting 对齐”硬门，避免评测样本内容写得很像，但 runtime/registry 并没有真正把这些维度当高权重。

## 剩余建议
1. 后续可把 `datasetWeighting` 也补进 `skills/isc-core/schemas/evaluation-set-registry.schema.json`，把现在的数据约定升级成 schema 约束。
2. 可继续给 fail runtime fixture 增加缺失 `dataset_weighting` 的负例断言，形成专门回归测试。
3. 若 AEO 主执行链有独立 scorer，再把这四维直接乘到最终总分，形成端到端统一口径。

## 本次变更文件
- `skills/aeo/src/core/registry-manager.cjs`
- `skills/aeo/unified-evaluation-sets/registry.json`
- `skills/aeo/evaluation-sets/real-conv-2026-03-07-exec-chain-remediation/standard.json`
- `principle-e2e-spec/scripts/benchmark_runner.py`
- `principle-e2e-spec/examples/capability_runtime_pass.json`
