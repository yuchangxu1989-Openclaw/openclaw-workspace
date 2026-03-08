# SWE-bench Lite benchmark runner

目标：
1. 可重复运行；
2. 默认闭卷；
3. 明确 LLM 主基座；
4. 明确沙盒约束；
5. 优先产出可提交资产包（preds / metadata / README / trajs / logs）；
6. 允许在缺少 Docker / 官方 harness 的机器上先做最小批量 dry-run 验证。

## 目录

- `runner/run.py`：最小可重复 runner
- `submission/`：输出资产包
- `artifacts/`：预留给后续正式评测产物

## 约束声明

### 闭卷
- solve 阶段默认 `closed_book=true`
- 默认 `network_access=disabled_during_solve`
- 不接入外部检索 / RAG / 网页搜索

### LLM 主基座
- metadata 中强制声明 `method.llm_primary=true`
- 必填：`model_name`、`provider`

### 沙盒
- 默认声明 `sandbox=docker`
- 若执行环境无 Docker，则自动退化为 `dry_run`，但仍保留约束声明与资产包格式验证

## 运行最小批量验证

```bash
python3 benchmarks/swe-bench-lite/runner/run.py \
  --submission-dir benchmarks/swe-bench-lite/submission/minimal_batch \
  --run-id smoke-20260307 \
  --instance sympy__sympy-20590 \
  --model-name claude-opus-placeholder \
  --llm-provider anthropic
```

## 输出物

- `preds.json`
- `metadata.json`
- `README.md`
- `trajs/*.traj.json`
- `logs/*.log`

## 何时切到正式评测

当以下条件满足时：
1. Docker 可用；
2. `swebench` 官方 harness 安装完成；
3. 已实现真实推理器，能输出非空 patch；
4. 已接入官方 `run_evaluation`，可产出 `evaluation_results/`。
